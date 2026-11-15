# 03: Server-Sent Events (SSE) Streaming for Structured JSON Coaching Output

**What to build:** Reduziere die gefühlte Wartezeit (Time-to-First-Text) beim AI-Coach von 25–45 Sekunden auf ca. 1,5–2,5 Sekunden, indem `/ai-coach` den strukturierten JSON-Output (`responseJsonSchema` mit explizitem `propertyOrdering`) per Server-Sent Events (SSE) streamt, `coachMessage` als allererstes Feld generiert wird und das Chat-UI über eine einfache `extractCoachMessageSoFar`-Vorschau (`event: preview`) den Coaching-Text live darstellt, während `scratchpad`, `recommendedWorkout` und `trainingPlan` im selben Stream im Hintergrund vollständig und kohärent übertragen werden.

**Blocked by:** TICKET-001, TICKET-002

**Status:** ready-for-agent

---

## Problem Statement

Selbst nach Bereinigung von Prompt-Overhead und unnötigen Plan-Updates dauert ein vollständiger Coaching- oder 2-Wochen-Planungs-Request 10–25 Sekunden, weil das Frontend aktuell auf das letzte Token des gesamten JSON-Payloads warten muss, bevor der User das erste Wort sieht. Zwei getrennte LLM-Calls (erst Chat-Text, dann Plan-JSON) wären jedoch keine Alternative, da sie fast doppelte Input-Token-Kosten verursachen und das Risiko von Widersprüchen zwischen Chat-Aussage und Trainingsplan erzeugen.

## Solution

**Schlankes Single-Call SSE-JSON-Streaming mit `propertyOrdering` & Whole-Field-Preview:**

1. In `schemas.ts` wird `propertyOrdering` explizit auf `["coachMessage", "scratchpad", "startDeload", "suggestedFollowUps", "recommendedWorkout", "trainingPlan"]` (gefiltert auf vorhandene Properties) gesetzt, sodass Gemini im Constrained Decoding garantiert mit `coachMessage` beginnt und `scratchpad` („Coach's Rationale“) dahinter generiert, ohne das erste sichtbare Wort zu verzögern.
2. Die Edge Function ruft Geminis `:streamGenerateContent?alt=sse` auf, akkumuliert serverseitig den bisher gestreamten JSON-String (`accumulatedJson`) und extrahiert mit einer kompakten ~20-Zeilen-Funktion (`extractCoachMessageSoFar`) den bisherigen decoded `coachMessage`-Text am Stück.
3. Über einen `ReadableStream` (`text/event-stream`) emittiert der Server nur die zwei Haupt-Events `preview` (`{ text }` → Frontend setzt direkt `streamingCoachMessage.value = text`, keinerlei Chunk-Boundary-Escape-Bugs!) und `complete` (vollständig Zod-validiertes & `postProcess`-normalisiertes `CoachingAdvice` + `quota`), plus `error` im Fehlerfall.
4. **Disconnect-Survival per `EdgeRuntime.waitUntil()`:** Reißt beim Smartphone-Screen-Lock die Client-SSE-Verbindung ab, ist das Upstream-Gemini-`AbortSignal` vom Client-Socket entkoppelt; der Deno-Isolate konsumiert den Gemini-Stream über `EdgeRuntime.waitUntil(...)` zu Ende und persistiert das fertige Ergebnis in `public.ai_request_results` für das `TICKET-002`-Recovery.

## User Stories

1. As an **athlete**, I want to see the AI coach start typing its feedback within ~2 seconds of sending a message, so that the app feels snappy, responsive, and premium rather than frozen behind a spinner for 20+ seconds.
2. As an **athlete**, I want `recommendedWorkout`, `scratchpad` ("Coach's Rationale"), and `trainingPlan` to remain 100 % consistent with what `coachMessage` promises, so that the coaching text never contradicts the prescribed exercises or weights.
3. As an **app owner**, I want streaming to reuse the single Gemini call (via `:streamGenerateContent?alt=sse`) rather than splitting into two separate prompts, so that input-token costs do not double.
4. As an **athlete**, I want the app to cleanly handle upstream failures before the first preview chunk (automatic model fallback) as well as mid-stream errors (quota refund + clear retry state), so that I am never left with half-broken plans or lost quota.
5. As an **athlete locking my phone mid-stream**, I want the server to finish persisting the completed JSON response into `ai_request_results`, so that my workout plan is immediately ready when I unlock my phone.
6. As a **security-conscious engineer**, I want live-streamed `coachMessage` previews sanitized against XSS and `text/event-stream` responses marked non-cacheable, so that injected markup or proxy caches can never expose personal coaching data.
7. As an **athlete**, I want domain state (`TrainingPlan`, `recommendedWorkout`, `startDeload`) mutated only after the complete stream is Zod-validated and post-processed on the server, so that truncated or tampered chunks never corrupt my training state.

## Architectural & Implementation Decisions

### 1. Explizites `propertyOrdering` im Gemini-Schema (`ai-coach/schemas.ts`)

- In `createCoachingAdviceJsonSchema` wird das Gemini-Attribut `propertyOrdering` explizit gesetzt:
  `["coachMessage", "scratchpad", "startDeload", "suggestedFollowUps", "recommendedWorkout", "trainingPlan"]` (gefiltert auf die je nach Modus/`allowPlanUpdate` tatsächlich in `properties` vorhandenen Keys).
- Damit garantiert Gemini beim Constrained Decoding, dass `coachMessage` als allererstes Feld gestreamt wird und `scratchpad` („Coach's Rationale“) sowie die großen Workout-/Plan-Arrays erst danach folgen.

### 2. Schlanker Whole-Field-Preview-Extractor (`extractCoachMessageSoFar`)

- Statt einer komplexen zustandsbehafteten Delta-State-Machine über Chunk-Grenzen hinweg nutzt der Server eine ~20-Zeilen-Funktion `extractCoachMessageSoFar(accumulatedJson: string): string | null`:
  - Findet den Start von `"coachMessage": "` im bisher akkumulierten JSON, liest bis zum unescapten schließenden `"` (oder String-Ende) und dekodiert JSON-Escapes (`\n`, `\"`, `\\`, `\uXXXX`) sauber; bei einer noch unvollständigen Escape-Sequenz ganz am String-Ende wird einfach bis vor den Backslash ausgegeben.
  - Emittiert nur bei neuem Textzuwachs ein SSE-Event `event: preview` mit `{ text }` (dem gesamten bisherigen `coachMessage`-Text).
  - Das Frontend setzt einfach `streamingCoachMessage.value = text` — immun gegen Chunk-Splitting-Fehler über `\uXXXX`- oder `\n`-Grenzen.

### 3. Backend-Streaming-Pipeline & `EdgeRuntime.waitUntil()` (`_shared/gemini.ts` & `ai-coach/index.ts`)

- `streamWithFallback` in `_shared/gemini.ts` nutzt `${GEMINI_BASE_URL}/${model}:streamGenerateContent?alt=sse`.
- **Fallback vor Stream-Commitment:** Tritt ein retryable Fehler (`404`/`429`/`5xx`/Timeout/Empty) auf, _bevor_ das erste `preview`-Event an den Client gesendet wurde, schaltet `streamWithFallback` transparent auf das nächste Modell in `COACHING_MODELS` um.
- **Abschluss & Integrität:** Nach Ende des Upstream-Streams prüft die Edge Function `finishReason === "STOP"`, parst und validiert das vollständige JSON per Zod-ACL (`schemas.ts`), wendet `postProcessAdvice` an, speichert das Ergebnis in `public.ai_request_results` (`status = 'completed'`) und sendet `event: complete` (mit vollständigem `CoachingAdvice` + `quota`). Bei Validierungsfehler oder vorzeitigem Abbruch wird `refund_ai_quota` ausgelöst, `ai_request_results` auf `'failed'` gesetzt und `event: error` gesendet.
- **Entkoppeltes `AbortSignal` & `EdgeRuntime.waitUntil()` für Disconnect-Survival:**
  - Das Upstream-Gemini-`fetch`-`AbortController`-Signal erzwingt ausschließlich das serverseitige 55s/40s-Timeout und ist strikt vom Client-HTTP-`req.signal` / `ReadableStream.cancel()` entkoppelt.
  - Das vollständige Konsumieren des Upstream-Streams sowie das finale DB-Update in `public.ai_request_results` werden in `EdgeRuntime.waitUntil(...)` registriert (mit sicherem Fallback, falls `EdgeRuntime` in Unit-Tests `undefined` ist). Schließt das mobile OS den SSE-Socket bei Screen Lock, läuft der Stream im Deno-Isolate sauber bis `'completed'` weiter.
- **Abwärtskompatibilität:** `classify` nutzt weiterhin klassisches `application/json`; `coach` streamt `text/event-stream`.

### 4. Deep-Module-Seam & Reaktive Chat-UI (`aiCoach` Infrastructure & Presentation)

- **Deep-Module-Streaming-Seam (`ResultAsync` + `onStreamPreview`):**
  - Die bestehende Signatur `AiCoachService.ask(options): ResultAsync<CoachingAdviceResult, CoachingAdviceError>` bleibt unverändert; ergänzt wird ausschließlich ein optionaler `onStreamPreview?: (textSoFar: string) => void`-Callback in `CoachingAdviceRequest`.
  - Sämtliche `neverthrow`-Ketten (`.andThen()` / `.orElse()`), 401-Token-Refresh-Retries (vor Stream-Beginn) und `handleCoachingSuccess` bleiben zu 100 % intakt.
- **SSE-Reader & UI:** `aiEdgeClient` liest den `ReadableStream` über `fetch` + `response.body.getReader()` + `TextDecoder`, aktualisiert `coachChatStore.streamingCoachMessage` bei jedem `event: preview` (Plan-Vorschau zeigt währenddessen `<UiTelemetryLoader>` gemäß Design-Tokens) und setzt `streamingCoachMessage` im `finally` zurück. Bei `event: complete` übernimmt `handleCoachingSuccess` den finalen Zustand und bereinigt `ai-coach:pending-request`.
- `docs/api/endpoints.md` dokumentiert das SSE-Event-Format (`preview`, `complete`, `error`).

### 5. IT-Security & Datenschutz (DSGVO / Privacy-by-Design) Guardrails

- **XSS-Prävention bei live gestreamten `coachMessage`-Previews:**
  - Gestreamte `coachMessage`-Texte werden im Chat-UI entweder als reiner Plain-Text interpoliert oder bei jedem UI-Update durch `DOMPurify.sanitize()` mit strenger Tag-Allowlist ohne externe Ressourcen (`javascript:`, `data:`, `<iframe>`, `<script>`) bereinigt.
- **Keine vorzeitige Domain-Mutation durch unvalidierte Stream-Chunks:**
  - Während des Streams emittiert der Server ausschließlich `event: preview` (`coachMessage`-Text). Partielle `recommendedWorkout`-, `trainingPlan`- oder `startDeload`-Fragmente mutieren niemals den Domain-State vor `finishReason === "STOP"` + serverseitiger Zod-ACL + `postProcessAdvice` in `event: complete`.
- **Anti-Caching- & Stream-Security-Header:**
  - Alle `text/event-stream`-Responses setzen zwingend `Cache-Control: no-store, no-transform` und `X-Content-Type-Options: nosniff`, damit Proxys, CDNs oder Browser-Disk-Caches keine persönlichen Coaching-Antworten zwischenspeichern.
- **Harte Stream-Deadlines & Ressourcen-Cleanup:**
  - Serverseitige `AbortController`-Timeouts begrenzen jeden Upstream-Gemini-Stream strikt, und `finally`-Blöcke geben Reader-Locks auf Server und Client zuverlässig frei.

## Acceptance Criteria

- [ ] `createCoachingAdviceJsonSchema` setzt `propertyOrdering` explizit mit `coachMessage` an erster Stelle vor `scratchpad`, `suggestedFollowUps`, `recommendedWorkout` und `trainingPlan` (gefiltert auf vorhandene Properties).
- [ ] `AiCoachService.ask(options)` behält seine `ResultAsync<CoachingAdviceResult, CoachingAdviceError>`-Signatur und ergänzt ausschließlich `onStreamPreview?: (textSoFar: string) => void` unter Beibehaltung aller `neverthrow`-Ketten und 401-Retries.
- [ ] `POST /functions/v1/ai-coach` mit `action: "coach"` streamt per `text/event-stream` (`preview`, `complete`, `error`) aus `:streamGenerateContent?alt=sse` und setzt zwingend `Cache-Control: no-store, no-transform` sowie `X-Content-Type-Options: nosniff`.
- [ ] `extractCoachMessageSoFar(accumulatedJson)` extrahiert und unescapet `coachMessage` korrekt (inkl. `\n`, `\"`, Unicode-Escapes sowie abgeschnittenem trailing Backslash am Ende des aktuellen Chunks).
- [ ] Live gestreamte `coachMessage`-Previews werden im Frontend XSS-sicher dargestellt (Plain-Text oder `DOMPurify.sanitize()`); `recommendedWorkout`, `trainingPlan` und `startDeload` mutieren niemals den Domain-State vor Empfang des serverseitig validierten `event: complete`, und `streamingCoachMessage` wird im `finally` sauber zurückgesetzt.
- [ ] Im Coach-Chat erscheint `coachMessage` live während des Streamings (~1,5–2,5s bis zum ersten Text), und nach `event: complete` stehen `scratchpad` („Coach's Rationale“), `recommendedWorkout`, `suggestedFollowUps` und ggf. `trainingPlan` nahtlos bereit.
- [ ] Tritt vor dem ersten gesendeten `preview`-Event ein retryable Modellfehler auf, greift automatisch das Fallback-Modell; bei endgültigem Fehler oder abgebrochenem/ungültigem JSON wird `refund_ai_quota` ausgelöst und kein defektes JSON als final gespeichert.
- [ ] Server- und Client-Stream-Handler erzwingen harte `AbortController`-Timeouts und geben Reader-Locks in `finally`-Blöcken frei; das Upstream-Gemini-`AbortSignal` ist vom Client-Disconnect entkoppelt und läuft über `EdgeRuntime.waitUntil(...)` kontrolliert bis zum `ai_request_results`-Write weiter.
- [ ] `pnpm test:unit`, `pnpm type-check`, `pnpm lint` und `src/modules/architecture.boundaries.test.ts` sind grün.

## Testing Decisions

- **Pure `extractCoachMessageSoFar` Tests:** Edge-Case-Tests für unvollständiges JSON, am String-Ende abgeschnittene Escapes (`\` oder `\u00` am Ende), vollständige Escapes (`\n`, `\"`, `\u00fc`), leeres JSON und spätes/fehlendes Feld.
- **SSE Protocol, Security Header, Disconnect-Survival & Fallback Tests:** Unit-Tests für `streamWithFallback` mit gemocktem `ReadableStream` und gemocktem `EdgeRuntime.waitUntil` (Verify: `Cache-Control: no-store, no-transform` + `X-Content-Type-Options: nosniff` gesetzt; Fallback bei `429`/`502` vor erstem `preview`; kein doppeltes Senden nach Stream-Start; Client-`ReadableStream.cancel()` bricht Upstream-Stream nicht ab und finalisiert via `waitUntil` bis `ai_request_results`; `event: complete` liefert validiertes + normalisiertes JSON; Quota-Refund bei truncated JSON; Reader-Lock-Cleanup in `finally`).
- **Frontend Stream Consumer, Deep Seam, XSS & Store Tests:** Tests am `aiEdgeClient` / `AiCoachService.ask` / `aiOrchestratorStore`-Seam mit simulierten SSE-Chunks: verifizieren Live-Update von `streamingCoachMessage` über `onStreamPreview` (inkl. `finally`-Reset), 401-Refresh vor Stream-Start, XSS-Sanitization, keine vorzeitige Mutation von `TrainingPlan`/`startDeload`, finale Übernahme bei `event: complete` sowie Fallback auf `action: "recover"` bei künstlichem Stream-Abbruch.
