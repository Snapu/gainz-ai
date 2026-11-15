# 02: Mobile Screen-Lock Resilience (Wake Lock) & Idempotent Server-Side Request Recovery

**What to build:** Verhindere verlorene AI-Antworten und doppelte AI-Kosten auf Smartphones, indem während aktiver Coaching-Anfragen über `@vueuse/core` (`useWakeLock`) automatisch ein Screen Wake Lock gehalten wird und jede Anfrage per idempotenter `clientRequestId` kurzzeitig (30 Minuten) in Supabase (`public.ai_request_results`) zwischengespeichert wird, sodass sich die App beim Entsperren oder App-Wechsel nahtlos das fertige Ergebnis abholt.

**Blocked by:** TICKET-001

**Status:** ready-for-agent

---

## Problem Statement

Wenn das Smartphone im Gym während einer laufenden AI-Anfrage (insbesondere bei 2-Wochen-`TrainingPlan`-Generierung von 15–30s) in den Standby geht, aktiv gesperrt wird oder der Athlet kurz in eine andere App (z. B. Spotify, Timer) wechselt, friert iOS/Android die aktive `fetch`-Verbindung ein oder bricht sie ab:

1. Die Supabase Edge Function läuft im Hintergrund weiter, ruft Gemini ab, zahlt die Tokens und zieht einen Quota-Punkt ab.
2. Das Frontend erhält keine Response, der Athlet sieht nach dem Entsperren nichts, löst die Anfrage erneut aus und **zahlt sowohl Latenz als auch AI-Kosten und Quota doppelt**.

## Solution

Ein schlanker zweistufiger Schutzmechanismus (**Prävention + Server-Side Recovery**):

1. **Prävention (Wake Lock via `@vueuse/core`):** Während ein AI-Request läuft (`chatStore.isLoading`), hält der Client über `useWakeLock()` das Display wach (degradiert auf iOS im Stromsparmodus bei `NotAllowedError` lautlos ohne Fehler).
2. **Idempotente Server-Recovery (`ai_request_results`):** Jede Coaching-Anfrage trägt eine clientseitig generierte `clientRequestId` (UUID v4), die vor dem Request-Start über `useLocalStorage("ai-coach:pending-request", null)` (nur minimale Metadaten, kein eigenes Repository-Boilerplate) gesichert wird. Die Edge Function speichert Status (`processing` | `completed` | `failed`) und das fertig validierte `CoachingAdvice`-Ergebnis für maximal **30 Minuten** in `public.ai_request_results` (ohne Speicherung von Input-DTOs). Kehrt die App per `useDocumentVisibility()` (`@vueuse/core`) oder `@capacitor/app` `appStateChange` zurück oder bricht der `fetch` ab, fragt `aiOrchestratorStore` über `action: "recover"` nach und leitet das Ergebnis exakt durch `handleCoachingSuccess` (inkl. `persistLearnedMuscleGroups` und `TrainingPlan`-Update) – ohne Gemini erneut aufzurufen.

## User Stories

1. As an **athlete in the gym**, I want my phone screen to stay awake while the AI coach is generating my workout or training plan, so that automatic screen timeout does not kill the active request (and fail silently in iOS Low Power Mode).
2. As an **athlete who manually locks my phone or switches apps during a request**, I want the app to automatically recover and apply the finished AI response (including learned muscles and plan updates) as soon as I unlock or return to Gainz AI, so that I do not have to wait or ask again.
3. As an **app owner**, I want duplicate requests with the same `clientRequestId` to return the stored server result instead of calling Gemini again, so that mobile network drops never cause double AI token billing or double quota consumption.
4. As an **athlete whose quota check fails (`429`) or errors (`500`)**, I want the temporary processing lock cleaned up immediately, so that I am never blocked from retrying once eligible.
5. As a **security-conscious engineer**, I want `ai_request_results` protected by Row-Level Security (`service_role` only), `REVOKE ALL` from `public`/`anon`/`authenticated`, and bound to the verified Google `userId` (`sub`) via composite key `(user_id, client_request_id)`, so that one athlete can never recover another athlete's coaching data (BOLA/IDOR prevention).
6. As a **privacy-conscious athlete (GDPR Art. 5 & Art. 9)**, I want `ai_request_results` to store zero incoming health/profile inputs, expire strictly after 30 minutes, and be deleted immediately upon recovery, so that my coaching data is minimized and never lingers on the server.
7. As an **app owner**, I want `pendingCoachRequest` wiped from `localStorage` on logout and expiry, so that shared or lost devices keep zero stale recovery state.

## Architectural & Implementation Decisions

### 1. Datenbank-Schema (`public.ai_request_results`) & Piggyback-Cleanup

- Neue Supabase-Migration für `public.ai_request_results`:
  - Spalten: `client_request_id` (UUID), `user_id` (text, abgeleitet aus verifiziertem Google `sub`), `action` (`'coach'`), `status` (`'processing' | 'completed' | 'failed'`), `response_payload` (JSONB, enthält **ausschließlich** `CoachingAdvice` + `quota` — niemals das eingehende Trainings-/Gesundheits-DTO), `error_code` (text, optional), `created_at` (timestamptz), `updated_at` (timestamptz), `expires_at` (`timestamptz not null default (now() + interval '30 minutes')`).
  - Composite Primary Key `(user_id, client_request_id)` zur strikten Mandanten-Isolation und Idempotenz.
  - RLS aktiviert (`ENABLE ROW LEVEL SECURITY`) mit `REVOKE ALL ON TABLE public.ai_request_results FROM PUBLIC, anon, authenticated` und `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ai_request_results TO service_role`. Etwaige SQL-Funktionen nutzen `SECURITY INVOKER` + `SET search_path = ''`.
  - **30-Minuten-Hard-Expiry & Piggyback-Cleanup:** Alle `SELECT`-Abfragen erzwingen `AND expires_at > now()`. Das Löschen abgelaufener Zeilen (`DELETE FROM public.ai_request_results WHERE expires_at <= now()`) wird als einzelnes SQL-Statement direkt im bestehenden `consume_ai_quota`-RPC (probabilistisch oder direkt) sowie beim `action: "recover"` (Delete-on-Recovery) ausgeführt — kein Cron-Job nötig.

### 2. Deterministische Backend State-Machine (Lock → Quota → Execution) & `action: "recover"`

- **Idempotenter Einstieg in `ai-coach`:**
  - `CoachActionRequest` akzeptiert eine per Zod (`z.string().uuid()`) strikt auf UUID v4 validierte `clientRequestId`.
  - Exakte transaktionale Reihenfolge für `(verifiedUser.userId, clientRequestId)` (mit `AND expires_at > now()`):
    1. Bestehenden Eintrag prüfen:
       - `status === 'completed'`: Liefert sofort das gespeicherte `response_payload` (`200 OK`) ohne Quota-Abzug und ohne Gemini-Call.
       - `status === 'processing'` (noch aktiv): Liefert HTTP `202 Accepted` (`{ status: "processing" }`), sodass der Client kurz pollt statt neu zu starten.
    2. Atomaren `'processing'`-Lock per `INSERT INTO public.ai_request_results (...) VALUES (...) ON CONFLICT (user_id, client_request_id) DO NOTHING` erwerben (parallele Retries derselben ID werden atomar abgefangen).
    3. `consume_ai_quota` aufrufen. **Kritisch:** Wenn `quota.allowed === false` (`429`) oder das RPC fehlschlägt (`500`), wird die zuvor angelegte `'processing'`-Lock-Zeile **sofort wieder gelöscht**, bevor `429`/`500` zurückgegeben wird.
    4. Coach-Logik ausführen: bei Erfolg Übergang nach `'completed'` mit `response_payload`; bei Fehler `refund_ai_quota` ausführen und Übergang nach `'failed'`.
- **Neuer Endpoint-Modus `action: "recover"`:**
  - Akzeptiert `{ action: "recover", clientRequestId }` (UUID-v4-validiert) für authentifizierte Caller (`verifiedUser.userId` aus Google-`sub`).
  - Filtert strikt auf `(verifiedUser.userId, clientRequestId)` mit `AND expires_at > now()` und liefert `{ status: "completed", ...responsePayload }` (`200`, löscht den abgeholten Eintrag deterministisch), `{ status: "processing" }` (`202`), `{ status: "failed", error }` (`502` / Fehlerstatus) oder ein generisches `404 Not Found` (unbekannt, anderer User oder abgelaufen).
- `docs/api/endpoints.md` wird um `clientRequestId` und `action: "recover"` erweitert.

### 3. Schlanke Frontend-Integration mit `@vueuse/core` (Ponytail-Ansatz)

- **Kein separates Repository- oder Composable-Boilerplate:** Statt einer neuen Repository-Klasse (`LocalStoragePendingRequestRepository`) und eigenen Event-Wrappern nutzt `aiOrchestratorStore.ts` direkt die bereits installierten `@vueuse/core`-Primitives:
  - `useWakeLock()` (im `try`/`catch`/Watch auf `chatStore.isLoading` — schlägt im iOS Stromsparmodus mit `NotAllowedError` still fehl, ohne den Request zu stören).
  - `useLocalStorage<PendingCoachRequest | null>("ai-coach:pending-request", null)` für minimale Metadaten (`{ clientRequestId, userMessageId, sessionId, mode, startedAt }`) — **niemals** Profil-, Log- oder Gesundheitsdaten.
  - `useDocumentVisibility()` + `@capacitor/app` `App.addListener("appStateChange", ...)` zum automatischen Recovery-Trigger bei App-Resume oder nach Netzwerkabbruch eines aktiven Calls.
- **Identische Success-Pipeline:** Nach erfolgreichem `action: "recover"` ruft `aiOrchestratorStore` dieselbe `handleCoachingSuccess`-Funktion auf, damit neben `coachChatStore` und `trainingPlanStore` auch `persistLearnedMuscleGroups` und `deloadStore` identisch aktualisiert werden.
- **Storage-Hygiene:** `pendingCoachRequest` wird nach erfolgreichem Übernehmen, bei endgültigem Fehler, nach Ablauf von 30 Minuten sowie explizit bei `authStore.logout()` sofort auf `null` gesetzt.

### 4. IT-Security & Datenschutz (DSGVO / Privacy-by-Design) Guardrails

- **Strikte Datenminimierung & 30-Minuten-TTL (DSGVO Art. 5 Abs. 1 lit. c & e, Art. 9):**
  - Keine Speicherung von Input-DTOs (`userProfile`, `events`, `logs`) in `public.ai_request_results`; harter Ablauf nach 30 Minuten (`AND expires_at > now()`), sofortiges Löschen nach Recovery (`Delete-on-Recovery`).
- **BOLA- / IDOR-Prävention & Mandanten-Isolation:**
  - `clientRequestId` strikt UUID v4; Zugriff nur über Composite-Key `(user_id, client_request_id)` aus verifiziertem Google-`sub`; generisches `404 Not Found` ohne Existenz-Orakel; RLS + `REVOKE ALL FROM PUBLIC, anon, authenticated` + `GRANT ... TO service_role` + `SECURITY INVOKER` + `SET search_path = ''`.

## Acceptance Criteria

- [ ] Während ein Coaching-Request aktiv lädt, fordert das Frontend über `useWakeLock()` (`@vueuse/core`) einen Screen Wake Lock an, gibt ihn nach Abschluss/Fehler frei und degradiert bei iOS Stromsparmodus (`NotAllowedError`) lautlos ohne Fehler.
- [ ] Jeder Coaching-Request erzeugt eine UUID v4 (`clientRequestId`) und speichert über `useLocalStorage("ai-coach:pending-request", null)` ausschließlich minimale Metadaten (`{ clientRequestId, userMessageId, sessionId, mode, startedAt }`, ohne Profil-/Gesundheitsdaten); bei `authStore.logout()` sowie nach >30 Minuten wird der State sofort bereinigt.
- [ ] Supabase verfügt über `public.ai_request_results` (Migration mit `ENABLE ROW LEVEL SECURITY`, `REVOKE ALL FROM PUBLIC, anon, authenticated`, `GRANT ... TO service_role`, PK `(user_id, client_request_id)`, `expires_at` = +30 Minuten, keine Input-DTOs) sowie abgelaufenes Cleanup im `consume_ai_quota`-RPC.
- [ ] Alle Lese- und Recovery-Queries prüfen auf `(user_id, client_request_id)` aus verifiziertem `sub` sowie `expires_at > now()`; fremde oder abgelaufene IDs liefern generisches `404 Not Found`, und abgeholte Einträge werden bei `recover` sofort gelöscht.
- [ ] Atomares `INSERT ... ON CONFLICT DO NOTHING` verhindert doppelte Gemini-Calls/Quota-Abzüge bei derselben `clientRequestId`; schlägt `consume_ai_quota` mit `429` (`allowed = false`) oder `500` fehl, wird der zuvor angelegte `'processing'`-Lock sofort wieder gelöscht.
- [ ] Schlägt ein aktiver Request durch Screen-Lock/App-Wechsel fehl oder kehrt die App per `useDocumentVisibility()` / Capacitor `appStateChange` in den Vordergrund zurück, ruft `aiOrchestratorStore` `action: "recover"` auf und wendet `handleCoachingSuccess` (inkl. `persistLearnedMuscleGroups` und `TrainingPlan`-Update) identisch an.
- [ ] Bei serverseitigem Fehler (`status: "failed"`) wird kein falscher Success-Zustand gespeichert, das Quota bleibt erstattet und der User erhält eine saubere Fehlermeldung.
- [ ] `pnpm test:unit`, `pnpm type-check`, `pnpm lint` und `src/modules/architecture.boundaries.test.ts` sind grün.

## Testing Decisions

- **Backend Recovery, BOLA & Lock-Cleanup Tests:** Unit-Tests für `ai-coach` Request-Lifecycle mit gemocktem DB-Adapter und `quota.ts` (Verify: `completed` Cache-Hit spart Quota & Gemini; `processing` liefert `202`; `quota.allowed === false` / RPC-Fehler löscht `'processing'`-Lock sofort; fremde `user_id` oder `expires_at <= now()` liefert `404`; erfolgreiche `recover`-Abholung triggert Delete-on-Recovery; Fehler setzt Status auf `failed` + erstattet Quota; keine Input-DTOs im DB-Write).
- **Frontend Recovery & Wake-Lock Seam Tests:** Tests am `aiOrchestratorStore`-Seam mit simuliertem Netzwerk-Abbruch während `isLoading`, anschließendem `visibilitychange` / Recovery-Poll (`202` → `200`), iOS-`NotAllowedError`-Fallback bei `useWakeLock()`, Verifikation von `persistLearnedMuscleGroups` nach Recovery sowie Bereinigung bei `authStore.logout()` und 30-Minuten-Ablauf.
