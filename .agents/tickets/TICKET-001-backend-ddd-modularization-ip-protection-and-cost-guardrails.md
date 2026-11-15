# 01: Backend Modularization, IP Protection (Prompt & Post-Processing to Server) & AI Cost Guardrails

**What to build:** Zerlege den 1.055-Zeilen-Monolithen der `ai-coach`-Edge-Function in eine schlanke, flache Modulstruktur (`_shared/` + `ai-coach/{index,prompt,schemas,postProcess,classify}.ts`), verlagere sämtliche Geschäftsgeheimnisse (Prompt-Engineering, Heuristiken, Zod-ACL und Domänen-Nachbereitung) aus dem Frontend ins Backend, blende das Prompt-Debug-Leck in Produktion aus und aktiviere gezielte AI-Kosten- & Latenz-Guardrails bei 100 % erhaltener Antwort-, Planungs- und „Coach's Rationale“-Qualität.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

---

## Problem Statement

1. **Monolithisches Backend & Code-Duplizierung:** Die gesamte `ai-coach`-Edge-Function (HTTP/CORS, Google-JWKS-Auth, Quota-RPCs, Gemini-Fallback-Client, Coaching- & Classify-Prompts, JSON-Schemas) liegt in einer einzigen 1.055-Zeilen-Datei; Infrastruktur-Helfer (`corsHeaders`, `fetchWithTimeout`, `jsonResponse`) sind zwischen `auth-token` und `ai-coach` dupliziert.
2. **Offenlegung von Geschäftsgeheimnissen (IP) & offenes Gateway:**
   - Das Frontend assembliert den kompletten Coaching-Prompt (`# session`, `# workload`, `# muscles`, `# exercises`, `# program`, `rpe_trigger:overload_ready`, `SWAP`, `hyp`/`str`-Zielgewichte) inklusive Konversations-Kompaktierung und sendet fertige `contents: GeminiContent[]` ans Backend. Damit sind Prompt-Format und Sports-Science-Heuristiken im Browser-Network-Tab vollständig einsehbar.
   - Zusätzlich existiert in `CoachTab.vue` ein „Debug Data“-Button (`Sent Prompt Payload`), der diesen Prompt im UI anzeigt.
   - Da `/ai-coach` beliebige `contents` akzeptiert, könnte ein missbräuchlicher Client eigene Prompts über den Server-API-Key ausführen.
3. **Unnötige AI-Kosten & Latenz:**
   - `allowPlanUpdate` wird aktuell bei jeder Chat-Frage pauschal aktiviert (`Boolean(options.question)`), wodurch Gemini ungewollt den kompletten 2-Wochen-`TrainingPlan` (~3.500 teure Output-Tokens) neu generiert.
   - Unbegrenztes Thinking im Modell verursacht vermeidbare Output-Token-Kosten; gezieltes `thinkingBudget` senkt die Kosten drastisch ohne Qualitätsverlust.
   - Die strenge Zod-Validierung (`CoachingAdviceTranslator`) läuft erst im Frontend, sodass ein ungültiges Modell-JSON einen zweiten Client-Retry auslöst (doppelte Token-Kosten und doppelter Quota-Abzug).
   - `classifyExercisesIfNeeded` blockiert aktuell vor dem `coach`-Call im Wasserfall, obwohl die meisten Übungen durch Erweiterung des bestehenden statischen Dictionaries direkt lokal abgedeckt werden können.

## Solution

- **Schlanke Ponytail-Struktur im Backend:** Gemeinsame Infrastruktur nach `supabase/functions/_shared/` (`http.ts`, `auth.ts`, `quota.ts`, `gemini.ts`) und flache, fokussierte Module in `supabase/functions/ai-coach/` (`index.ts`, `prompt.ts`, `schemas.ts`, `postProcess.ts`, `classify.ts`) – ohne künstliche `domain/`/`application/`-Unterordner oder Single-Adapter-Port-Wrapper.
- **IP-Schutz & geschlossener DTO-Vertrag:** Das Frontend sendet nur noch ein typisiertes Trainingskontext-DTO mit bereits vorberechneten primitiven Feldern (`primaryMuscle`, `progressionIncrementKg` in `insights.e1rm`, `nextUncompletedSessionKey` / `currentWeekNumber` auf `activePlan`), sodass das Backend **keinerlei** Imports aus `src/` benötigt. Prompt-Bau, Zod-ACL und `postProcessCoachingAdvice` wandern komplett ins Backend; in Produktion wird kein `requestPayload` zurückgegeben und der „Debug Data“-Block in `CoachTab.vue` nur noch in DEV (`import.meta.env.DEV`) angezeigt.
- **„Coach's Rationale“ (`scratchpad`) erhalten ohne IP-Leak:** `scratchpad` bleibt als kurzes 2–3-Zeilen-Feld im JSON-Schema erhalten (steht aber **hinter** `coachMessage`), während `includeThoughts` auf `false` bleibt, damit Geminis rohe englische System-Prompt-Reflexionen (`part.thought`) niemals ins Frontend leaken.
- **Kosten- & Latenz-Guardrails:** Intent-basiertes `allowPlanUpdate`, gestaffeltes `thinkingConfig: { thinkingBudget }` (`1024` für `planning`, `256` für `execution`), serverseitige Zod-Validierung im Fallback-Loop (inkl. `refund_ai_quota`), Erweiterung von `exerciseMuscleMap.ts` um gängige DE/EN-Übungsnamen sowie nicht-blockierendes (fire-and-forget) `classifyExercisesIfNeeded` – **ohne** zusätzliche Postgres-Tabelle für Übungen.

## User Stories

1. As an **app owner**, I want prompt assembly, sports-science heuristics (`SWAP`, `overload_ready`, `hyp`/`str`), and coaching post-processing to live exclusively on the server and the UI `"Debug Data"` prompt viewer hidden in production, so that our core coaching IP cannot be inspected by end users.
2. As an **app owner**, I want the `/ai-coach` endpoint to accept only structured, validated training-context DTOs instead of arbitrary `GeminiContent[]`, so that callers cannot hijack the endpoint for unrelated LLM prompts.
3. As an **app owner**, I want routine execution questions (e.g. swapping one exercise today) to omit `trainingPlanSchema` unless a multi-week plan/split change is explicitly requested, so that output-token costs and latency drop dramatically without degrading coaching quality.
4. As an **app owner**, I want explicit `thinkingConfig.thinkingBudget` (`1024` for planning, `256` for execution) with `includeThoughts: false` and a concise `scratchpad` field placed after `coachMessage`, so that we control reasoning costs, preserve the "Coach's Rationale" UI feature, and never leak internal system instructions.
5. As an **athlete**, I want invalid or incomplete AI responses to be caught and retried via server-side model fallback before returning to the app, so that I never lose a daily quota slot for a malformed response.
6. As an **athlete**, I want common German and English exercises recognized locally via `exerciseMuscleMap.ts` and rare unknown exercises classified non-blockingly in the background, so that my coaching requests never stall behind a sequential `classify` waterfall.
7. As an **athlete training offline in the gym**, I want real-time `e1RM`, `VolumeLandmarks`, `ACWR`, and rest-timer UI updates to remain local on the client, so that logging sets stays instantaneous even without internet access.
8. As an **athlete sharing health and biometric context (GDPR Art. 9)**, I want my prompts, logs, and coaching responses never to appear in server logs and never to be linked to my email, name, or OAuth tokens, so that my health data stays strictly confidential.
9. As an **app owner**, I want user-controlled DTO strings sanitized against markdown header/marker spoofing and bounded in payload size, so that attackers cannot inject fake prompt sections (`# workload`, `[NEXT_SESSION]`) or cause isolate memory-exhaustion DoS.

## Architectural & Implementation Decisions

### 1. Flache Zielstruktur unter `supabase/functions/`

- `supabase/functions/_shared/`:
  - `http.ts`: CORS-Header, `jsonResponse`, `fetchWithTimeout`, Error-Mapping.
  - `auth.ts`: Verifikation via Google JWKS (`verifyGoogleIdToken`) und OAuth `tokeninfo`-Fallback (`verifyGoogleAccessToken`) zur Ableitung von `userId` (`sub`).
  - `quota.ts`: Postgres-RPC-Adapter für `consume_ai_quota` und `refund_ai_quota`.
  - `gemini.ts`: `generateWithFallback`, Modell-Timeout-Budgetierung, Retryable-Status-Erkennung und `thinkingConfig`-Steuerung (`thinkingBudget`, `includeThoughts: false`).
- `supabase/functions/auth-token/`: `index.ts` (schlanker HTTP-Controller) + `rateLimiter.ts`, nutzt `_shared/http.ts`.
- `supabase/functions/ai-coach/`:
  - `index.ts`: Schlanker HTTP-Controller für Request-Parsing, Body-Size-/Zod-Prüfung, Auth, Quota-Lifecycle und Action-Routing (`coach` | `classify`).
  - `prompt.ts`: Reine Funktionen für `BASE_SYSTEM_INSTRUCTION`, Mode-Direktiven, Prompt-Assembling (`# session`, `# workload`, `# muscles`, `# exercises`, `# program`), Prefix-Ordering für Gemini Context Caching sowie Input-Sanitization.
  - `schemas.ts`: Request-DTO-Zod-Schema, Gemini `responseJsonSchema` (inkl. `scratchpad` **nach** `coachMessage`) und strenge Response-Zod-ACL.
  - `postProcess.ts`: Reine Domänen-Nachbereitung (`targetRpe`-Rundung/Fallback, `clampRestSeconds`, `DeloadPhase`-Schutz, `backfillRecommendedWorkout`).
  - `classify.ts`: Übungsklassifizierungs-Prompt, Schema und Handler.

### 2. Geschlossener, autarker DTO-Vertrag (`/ai-coach` `action: "coach"`)

- **Keine Frontend-Imports im Backend:** Um hermetisches Deno-Deployment (`supabase functions deploy`) zu garantieren, darf `supabase/functions/` niemals aus `@/modules/*` (`src/`) importieren. Statt komplexe Domänen-Klassen (`TrainingPlan`, `getMuscleActivation`, `getProgressionIncrement`) im Backend zu duplizieren, liefert das Frontend im Request-DTO pro Übung in `insights.e1rm` die bereits berechneten primitiven Werte (`primaryMuscle`, `progressionIncrementKg`) sowie auf `activePlan` die primitiven Felder `nextUncompletedSessionKey` und `currentWeekNumber` mit.
- **`allowPlanUpdate` & `thinkingBudget`:**
  - `allowPlanUpdate` wird serverseitig nur aktiviert, wenn `mode === "planning"` oder der User-Intent in `question` explizit eine Änderung am mehrwöchigen Trainingsplan/Split adressiert — niemals pauschal für jede Rückfrage.
  - `thinkingConfig`: `thinkingBudget: 1024` im `planning`-Mode / Erst-Setup, `thinkingBudget: 256` für schnelle `execution`-Follow-ups, und `includeThoughts: false`.
- **Serverseitige Response-ACL im Fallback-Loop:** Schlägt die Zod-Validierung der Gemini-Antwort fehl, greift serverseitig das Fallback-Modell oder `refund_ai_quota` (HTTP `502`), ohne dass der Client ein zweites Mal Quota verbraucht.
- **Schutz der Prompt-IP im UI:** Der Server liefert in Produktion kein `requestPayload` zurück; in `src/views/CoachTab.vue` wird die „Debug Data“ (`Sent Prompt Payload`)-Sektion ausgeblendet bzw. strikt hinter `import.meta.env.DEV` gegated. „Coach's Rationale“ (`scratchpad`) bleibt als nutzerfreundliche 2–3-Zeilen-Zusammenfassung im JSON-Schema erhalten.

### 3. Übungsklassifizierung ohne neue DB-Tabelle (Ponytail-Ansatz)

- Erweiterung des bestehenden statischen Dictionaries in `src/modules/trainingInsights/domain/exerciseMuscleMap.ts` um ~30 gängige deutsche und englische Übungsnamen/Synonyme.
- In `src/modules/aiCoach/presentation/stores/aiOrchestratorStore.ts` wird `classifyExercisesIfNeeded()` von `runCoachingRequest()` entkoppelt (non-blocking / fire-and-forget im Hintergrund nach bzw. parallel zum Laden), sodass die `coach`-Antwortzeit niemals auf `classify` wartet. Für wirklich unbekannte Freitext-Übungen bleibt `action: "classify"` im Backend bestehen; auf eine neue DB-Tabelle `exercise_classifications` wird verzichtet.

### 4. IT-Security & Datenschutz (DSGVO / Privacy-by-Design) Guardrails

- **Prompt-Injection- & Delimiter-Spoofing-Härtung am DTO-Endpoint:**
  - Sanitization aller nutzerkontrollierten String-Felder im eingehenden DTO (`question`, `userProfile.freeUserInput`, `exerciseName`, `sessionLabel`) durch Entfernen/Escaping von Markdown-Sektionsheadern (`^#\s+`) und internen Kontrollmarkern (`[NEXT_SESSION]`, `[DONE]`), sodass User-Eingaben keine internen Sektionen (`# workload`, `# muscles`, `# program`) fälschen können.
  - Strikte serverseitige Payload-Größenbegrenzung (max. `100 KB` Request-Body) sowie harte Array-/String-Bounds via Zod (`recentLogs <= 500`, `previousMessages <= 40`, `events <= 50`, `question <= 2.000` Zeichen) gegen Memory-Exhaustion-DoS in Deno-Isolates.
- **DSGVO Art. 9 (Gesundheitsdaten) & Zero-PII-Logging:**
  - Da das DTO Gesundheitsereignisse (`sickness`, `injury`) und biometrische Profilwerte (`age`, `heightCm`, `weightKg`) überträgt, darf die Edge Function niemals Request-Bodies, assemblierte Prompts oder rohe Modell-Outputs per `console.*` oder in Supabase-Logs protokollieren; geloggt werden ausschließlich anonymisierte Fehlercodes, HTTP-Statuscodes sowie Latenz-/Modell-Metadaten.
  - Es werden niemals E-Mail-Adressen, Klarnamen oder OAuth-Tokens der Athleten an Gemini übertragen.

### 5. Software-Architektur: Boundary-Checks, Contract-Parity & Dead-Code-Hygiene

- **Automatisierte Backend-Boundary-Checks (`src/modules/architecture.boundaries.test.ts` & `tsconfig.vitest.json`):**
  - `src/modules/architecture.boundaries.test.ts` scannt künftig auch `supabase/functions/` und erzwingt:
    1. `supabase/functions/` importiert niemals aus `@/modules/*` (`src/`).
    2. `supabase/functions/_shared/` importiert niemals aus `../ai-coach/` oder `../auth-token/`.
    3. Pure Backend-Module (`prompt.ts`, `schemas.ts`, `postProcess.ts`) haben null HTTP-/Netzwerk-Imports (`Deno.serve`, `fetch`, `npm:jose`) und laufen direkt über `pnpm test:unit` in Vitest.
- **Contract-Parity-Test:** Ein Vitest-Test übergibt den Output des Frontend-DTO-Mappers direkt an das Backend-DTO-Zod-Schema (`schemas.ts`), um volle Kompatibilität über die Frontend/Backend-Grenze abzusichern.
- **Dead-Code-Hygiene (`knip`):** Veraltete Frontend-Prompt-Builder-Dateien (`promptAssembler.ts`, `promptBuilder.ts`, `CoachingAdviceTranslator.ts`, doppeltes Post-Processing) werden entfernt und über `pnpm knip` auf null verwaiste Exporte geprüft.

## Acceptance Criteria

- [ ] `supabase/functions/ai-coach/index.ts` ist auf einen schlanken HTTP-Entrypoint reduziert; gemeinsame Infrastruktur liegt in `supabase/functions/_shared/` und wird von `ai-coach` und `auth-token` ohne Code-Duplizierung genutzt; `ai-coach` nutzt flache Module (`prompt.ts`, `schemas.ts`, `postProcess.ts`, `classify.ts`).
- [ ] `prompt.ts`, `schemas.ts` (Zod-ACL) und `postProcess.ts` laufen vollständig im `ai-coach`-Backend; das Frontend sendet ein strukturiertes Trainingskontext-DTO mit vorberechneten Primitiven (`primaryMuscle`, `progressionIncrementKg`, `nextUncompletedSessionKey`, `currentWeekNumber`) statt fertiger `GeminiContent[]`.
- [ ] In Produktion gibt der Server keinen `requestPayload` zurück und `CoachTab.vue` zeigt keinen „Debug Data“ (`Sent Prompt Payload`)-Button mehr für Endnutzer an (`import.meta.env.DEV` oder entfernt).
- [ ] `scratchpad` bleibt als kurzes Feld **nach** `coachMessage` im JSON-Schema für das „Coach's Rationale“-Feature erhalten; `includeThoughts` ist `false` und `thinkingConfig.thinkingBudget` ist explizit gesetzt (`1024` für `planning`, `256` für `execution`).
- [ ] Im `execution`-Mode wird `trainingPlanSchema` nur noch bei explizitem Plan-Änderungs-Intent mitgesendet (nicht mehr pauschal bei jeder `question`).
- [ ] Schlägt die Zod-Validierung der Gemini-Antwort fehl, greift serverseitig der Modell-Fallback bzw. `refund_ai_quota`, ohne dass der Client ein zweites Mal Quota verbraucht.
- [ ] `exerciseMuscleMap.ts` deckt gängige DE/EN-Übungssynonyme statisch ab und `classifyExercisesIfNeeded()` läuft non-blocking im Hintergrund, sodass `coach` niemals darauf wartet.
- [ ] Eingehende DTOs werden auf max. `100 KB` Body-Größe und Zod-Array-/Längen-Bounds geprüft; nutzerkontrollierte Felder werden gegen Markdown-Header- (`^#\s+`) und Marker-Spoofing (`[NEXT_SESSION]`, `[DONE]`) bereinigt; die Edge Function loggt keinerlei PII, Prompts, Gesundheitsdaten oder rohe Antworten.
- [ ] `src/modules/architecture.boundaries.test.ts` prüft auch `supabase/functions/`, ein Contract-Parity-Test zwischen Frontend-DTO-Mapper und Backend-Zod-Schema ist grün, und `coachingAdvice`/UI-Insights (`e1RM`, `ACWR`, `VolumeLandmarks`) funktionieren weiterhin 100 % offlinefähig im Gym.
- [ ] `pnpm test:unit`, `pnpm type-check`, `pnpm lint` und `pnpm knip` laufen fehlerfrei durch; `docs/api/endpoints.md` und `docs/adr/0001-it-security-concept-and-confidential-backend.md` sind aktualisiert.

## Testing Decisions

- **Pure Backend Tests (`supabase/functions/ai-coach/*.test.ts`):** Unit-Tests in Vitest für `prompt.ts` (Sektionsbau, Prefix-Stabilität, Intent-Erkennung für `allowPlanUpdate`, Sanitization von `# ` / `[NEXT_SESSION]` / `[DONE]`), `schemas.ts` (DTO-Bounds, Response-Zod-ACL, `scratchpad` nach `coachMessage`) und `postProcess.ts` (RPE/Rest/Deload/Backfill).
- **Backend Handler / Fallback Tests:** Tests für `ai-coach/index.ts` mit gemocktem `gemini.ts` und `quota.ts` (Verify: invalid JSON/Zod-Fehler triggert Fallback bzw. `refund_ai_quota` mit `usageDate`; `> 100 KB` Body wird abgelehnt; keine PII/Prompt-Payloads in Error-Logs).
- **Architecture Boundary & Contract Parity Tests:** Erweiterte Regeln in `src/modules/architecture.boundaries.test.ts` für `supabase/functions/` sowie ein Contract-Parity-Test zwischen Frontend-DTO-Mapper und `schemas.ts`.
- **Frontend Regression:** Bestehende Tests in `src/modules/aiCoach/` (inkl. nicht-blockierendem `classifyExercisesIfNeeded` und `CoachTab.vue` DEV-Gate für Debug-Payload) bleiben grün.
