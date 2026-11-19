# Gainz AI Backend API Specification

This document provides the authoritative technical reference for the Gainz AI backend API implemented via Supabase Edge Functions (`Deno.serve`).

---

## 1. Global Configuration & Architecture

- **Runtime**: Deno on Supabase Edge Functions
- **Base URL**: `https://<PROJECT_REF>.supabase.co/functions/v1`
- **Default Content-Type**: `application/json`
- **CORS Handling**:
  - All endpoints support preflight `OPTIONS` requests returning `200 OK`.
  - Allowed Headers: `authorization, x-client-info, apikey, content-type`.
  - Allowed Methods: `POST, OPTIONS`.

### Standard Headers

| Header | Required | Description |
| :--- | :--- | :--- |
| `apikey` | **Yes** | Supabase anonymous public API key. |
| `Content-Type` | **Yes** | Must be `application/json`. |
| `Authorization` | Conditional | `Bearer <google_token>` — Google OIDC ID token (primary) or OAuth access token fallback (mandatory for `/ai-coach`; not required for `/auth-token`). |

---

## 2. Authentication & Token Exchange Endpoint: `/auth-token`

- **Endpoint Path**: `POST /functions/v1/auth-token`
- **Authentication**: Public (protected by Supabase `apikey`).
- **Rate Limit**: Max 30 requests per 60-second window per attributed client IP (and a shared 10 requests per 60-second fallback limit when client IP headers are absent).
- **Purpose**: Implements the OAuth 2.0 Authorization Code flow and token refresh as a confidential client. Keeps `GOOGLE_CLIENT_SECRET` strictly on the server.

### 2.1 Action: `authorization_code`

Exchanges a one-time Google OAuth authorization code (obtained from `google.accounts.oauth2.initCodeClient`) for an OAuth access token, refresh token, and ID token.

#### Request Body Schema

```typescript
{
  grantType: "authorization_code";
  code: string;  // The one-time authorization code from Google (trimmed, non-empty)
}
```

#### Example Request

```bash
curl -X POST "https://<PROJECT_REF>.supabase.co/functions/v1/auth-token" \
  -H "apikey: <SUPABASE_ANON_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "grantType": "authorization_code",
    "code": "4/0AeanS0..."
  }'
```

#### Success Response: `200 OK`

```json
{
  "access_token": "ya29.a0AfH6SM...",
  "refresh_token": "1//04...",
  "id_token": "eyJhbGciOiJSUzI1NiIs...",
  "expires_in": 3599,
  "scope": "https://www.googleapis.com/auth/drive.file openid",
  "token_type": "Bearer"
}
```

> [!NOTE]
> Client applications map `expires_in` to an epoch millisecond timestamp (`Date.now() + expires_in * 1000`) for precise background refresh scheduling.

#### Error Responses

| Status Code | Error Response | Cause |
| :--- | :--- | :--- |
| `400 Bad Request` | `{"error": "invalid-request"}` | Payload omitted or malformed `code` / `grantType`. |
| `401 Unauthorized` | `{"error": "token-exchange-failed", "details": "invalid_grant"}` | The code was already used, expired, or invalid. |
| `429 Too Many Requests` | `{"error": "rate-limited", "message": "..."}` | Rate limit exceeded (dynamic `Retry-After` header: `1–60s` remaining in window). |
| `500 Server Error` | `{"error": "missing-server-config"}` | Missing `GOOGLE_CLIENT_SECRET` in Supabase vault. |
| `502 Bad Gateway` | `{"error": "token-exchange-failed"}` | Google OAuth service unreachable or returned upstream 5xx. |

---

### 2.2 Action: `refresh_token`

Exchanges a previously stored Google OAuth refresh token for a fresh access token without user interaction.

#### Request Body Schema

```typescript
{
  grantType: "refresh_token";
  refreshToken: string;  // Stored Google OAuth refresh token (trimmed, non-empty)
}
```

#### Example Request

```bash
curl -X POST "https://<PROJECT_REF>.supabase.co/functions/v1/auth-token" \
  -H "apikey: <SUPABASE_ANON_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "grantType": "refresh_token",
    "refreshToken": "1//04..."
  }'
```

#### Success Response: `200 OK`

```json
{
  "access_token": "ya29.a0AfH6SM...",
  "expires_in": 3599,
  "scope": "https://www.googleapis.com/auth/drive.file openid",
  "token_type": "Bearer"
}
```

#### Error Responses

| Status Code | Error Response | Cause |
| :--- | :--- | :--- |
| `400 Bad Request` | `{"error": "invalid-request"}` | Missing or empty `refreshToken`. |
| `401 Unauthorized` | `{"error": "token-refresh-failed", "details": "invalid_grant"}` | The user revoked app permissions or refresh token is invalid. |
| `429 Too Many Requests` | `{"error": "rate-limited", "message": "..."}` | Rate limit exceeded (dynamic `Retry-After` header: `1–60s` remaining in window). |

---

## 3. AI Coaching & Classification Endpoint: `/ai-coach`

- **Endpoint Path**: `POST /functions/v1/ai-coach`
- **Authentication**: **Mandatory** `Authorization: Bearer <google_token>` (Google OIDC ID token via JWKS, or OAuth access token fallback via `tokeninfo`)
- **Upstream Models**:
  - Coaching: `gemini-3.8-flash` (Primary) → `gemini-3.5-flash-lite`
  - Classification: `gemini-3.5-flash-lite` (Primary) → `gemini-3.8-flash`
- **Daily Quotas**:
  - `coach`: Default 15 requests per UTC day (configured via `AI_DAILY_COACH_LIMIT`).
  - `classify`: Default 50 requests per UTC day (configured via `AI_DAILY_CLASSIFY_LIMIT`).
  - Global Emergency Ceiling: 10,000 coach requests / 20,000 classify requests per UTC day platform-wide.
  - Quotas are automatically refunded via Postgres RPC `refund_ai_quota` if Gemini fails or aborts.

---

### 3.1 Action: `coach` (Workout & Mesocycle Coaching)

Generates customized mesocycle adjustments, exercise progression guidance, fatigue remediation, and workout modifications based on athlete history.

#### Request Headers

```http
POST /functions/v1/ai-coach HTTP/1.1
Host: <PROJECT_REF>.supabase.co
apikey: <SUPABASE_ANON_KEY>
Authorization: Bearer <GOOGLE_TOKEN>
Content-Type: application/json
```

#### Request Body Schema (`CoachActionRequestDto`)

Requests are validated with strict Zod schemas and capped at `100 KB` HTTP body size (`413 payload-too-large`). Arbitrary prompt `contents` arrays and client-supplied system instructions are rejected (`400 invalid-request`).

```typescript
{
  action: "coach";
  clientRequestId?: string;     // Optional UUID v4 idempotency key for lock/abort recovery
  mode: "planning" | "execution";
  muscleGroups: string[];       // 1..50 allowed muscle groups
  locale: string;
  localDate: string;            // YYYY-MM-DD
  nowIso: string;
  workoutPhase: "planning" | "mid-workout" | "post-workout";
  workoutStatus: string;
  sessionStartBoundaryMs: number;
  question?: string;            // Max 2000 chars (sanitized server-side)
  userProfile: {
    age?: number;
    heightCm?: number;
    weightKg?: number;
    fitnessGoal?: string[];
    fitnessLevel?: "beginner" | "intermediate" | "advanced";
    workoutDaysPerWeek?: number;
    workoutDurationMinutes?: number;
    workoutLocation?: "gym" | "home" | "both";
    equipmentAccess?: string[];
    freeUserInput?: string;     // Max 2000 chars (sanitized server-side)
  };
  insights: {
    acwr: number | null;
    deloadStatus: "active" | "completed" | "canceled" | "none";
    deloadEndsAt: string | null;
    deloadTimeRemainingMs: number | null;
    deloadTriggerSnapshot: { triggeredBy: string[]; riskScore: number } | null;
    fatigue: {
      shouldDeload: boolean;
      reason?: string;
      hasSufficientHistory: boolean;
      decliningExercises: number;
      riskScore: number;
      loadWindow: { sets: object; tonnage: object };
    };
    muscleGroups: Record<string, object>; // Max 25 groups
    e1rm: Record<string, object>;         // Max 200 exercises
  };
  recentLogs: Array<object>;    // Max 500 recent logs (trailing 90 days)
  trainingSummaries: Array<{
    year: number;
    month: number;
    workoutDays: number;
    exercises: Array<{
      exerciseName: string;
      sets: number;
      totalReps?: number;
      maxWeight?: number;
      totalVolume?: number;
    }>;                         // Max 20 exercises per month
  }>;                           // Max 12 recent months
  previousMessages: Array<{
    role: "user" | "coach";
    content: string;            // Max 8000 chars (strips trainingPlan & scratchpad)
    timestamp: string;
  }>;                           // Max 40 turns
  events?: Array<{ type: string; dates: string[] }>; // Max 50 events
  activePlan?: object | null;
  completedSessionKeys?: string[];
}
```

#### Constraints, Cost Guardrails & Timeouts

- **Server-Side IP & Prompt Assembly**: Prompt templates, system instructions, Zod response validation, and clinical post-processing (`supabase/functions/ai-coach/prompt.ts`, `schemas.ts`, `postProcess.ts`) reside exclusively on the server.
- **Closed Schema & Thinking Levels**:
  - `mode: "planning"`: `thinkingConfig: { level: "medium", includeThoughts: false }` (`thinkingLevel: "MEDIUM"` on Gemini 3), includes `trainingPlan` output schema.
  - `mode: "execution"`: `thinkingConfig: { level: "low", includeThoughts: false }` (`thinkingLevel: "LOW"` on Gemini 3); `trainingPlan` output schema is only enabled if the athlete's `question` explicitly requests a schedule/split/plan update (`shouldAllowPlanUpdate`).
  - `action: "classify"`: `thinkingConfig: { level: "minimal", includeThoughts: false }` (`thinkingLevel: "MINIMAL"` on Gemini 3 lite / `"LOW"` fallback).
- **Idempotency & Lock Recovery (`clientRequestId`)**: When a valid UUID v4 `clientRequestId` is provided on `action: "coach"`, the Edge Function claims an atomic lock in `public.ai_request_results` before consuming quota:
  - Duplicate `action: "coach"` request while the original execution is still running returns `202 Accepted` (`{ "status": "processing" }`) without double-charging quota (or `200 OK` JSON `{ advice, quota }` if already completed, or `502 Bad Gateway` if already failed).
  - For interrupted mobile runs, the client calls `action: "recover"`, which uses atomic `DELETE ... RETURNING` on terminal `completed` / `failed` rows (single-use recovery; subsequent `recover` calls return `404`).
- **Response Validation & Fallback**: For `coach`, structured JSON outputs are validated with `parseCoachingAdviceResponse` inside `streamWithFallback` (while `classify` validates via `generateWithFallback`). On `coach`, malformed model JSON or upstream stream errors automatically fall back across configured Gemini models until the first non-whitespace `preview` chunk commits; post-commit or all-model failures invoke `refund_ai_quota`, mark the idempotency row `failed`, and emit an SSE `event: error` payload.
- **Timeouts**:
  - Server: `55,000ms` (`mode === "planning" || previousMessages.length === 0 || workoutPhase === "planning"`), `40,000ms` (Coaching Follow-ups), `30,000ms` (`classify`).
  - Client: `65,000ms` (`mode === "planning" || previousMessages.length === 0 || workoutPhase === "planning"`), `48,000ms` (Coaching Follow-ups), `35,000ms` (`classify`), `15,000ms` (`recover`).

#### Example Request

```bash
curl -X POST "https://<PROJECT_REF>.supabase.co/functions/v1/ai-coach" \
  -H "apikey: <SUPABASE_ANON_KEY>" \
  -H "Authorization: Bearer <GOOGLE_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "coach",
    "mode": "execution",
    "muscleGroups": ["Chest", "Lats", "Upper Back", "Quads", "Hamstrings"],
    "locale": "en-US",
    "localDate": "2026-11-15",
    "nowIso": "2026-11-15T10:30:00.000Z",
    "workoutPhase": "planning",
    "workoutStatus": "Not started",
    "sessionStartBoundaryMs": 1794700800000,
    "question": "Can I swap Incline Dumbbell Bench today?",
    "userProfile": { "workoutDaysPerWeek": 4 },
    "insights": {
      "acwr": 1.0,
      "deloadStatus": "none",
      "deloadEndsAt": null,
      "deloadTimeRemainingMs": null,
      "deloadTriggerSnapshot": null,
      "fatigue": {
        "shouldDeload": false,
        "hasSufficientHistory": false,
        "decliningExercises": 0,
        "riskScore": 0,
        "loadWindow": {
          "sets": { "weekMinus3": 0, "weekMinus2": 0, "weekMinus1": 0, "current": 0, "prior3WeekAvg": 0, "ratioVsPriorAvg": null },
          "tonnage": { "weekMinus3": 0, "weekMinus2": 0, "weekMinus1": 0, "current": 0, "prior3WeekAvg": 0, "ratioVsPriorAvg": null }
        }
      },
      "muscleGroups": {},
      "e1rm": {}
    },
    "recentLogs": [],
    "trainingSummaries": [],
    "previousMessages": [],
    "events": []
  }'
```

#### Success Response: `200 OK` (`text/event-stream; charset=utf-8`)

New accepted `action: "coach"` requests stream Server-Sent Events (SSE) backed by Gemini `:streamGenerateContent?alt=sse` with `coachMessage` ordered first in `propertyOrdering`.

- **Response Headers**:
  - `Content-Type: text/event-stream; charset=utf-8`
  - `Cache-Control: no-store, no-transform`
  - `X-Content-Type-Options: nosniff`
- **Resilience**: Upstream Gemini generation runs inside a server `AbortController` and `EdgeRuntime.waitUntil(...)`, decoupled from client socket disconnects so interrupted runs still finish and persist for `action: "recover"`. Model fallback only occurs before the first `preview` event is emitted.
- **Duplicate `clientRequestId` Hits**: Idempotent `action: "coach"` retries matching an existing lock return standard JSON (`200 OK` `{ advice, quota }` if completed, `202 Accepted` `{ "status": "processing" }` while active—signaling the client to poll `action: "recover"`—or `502 Bad Gateway` if failed).

```text
event: preview
data: {"text":"Swapping Incline Dumbbell Bench for "}

event: preview
data: {"text":"Swapping Incline Dumbbell Bench for Incline Machine Press fits your volume perfectly..."}

event: complete
data: {"advice":{"coachMessage":"Swapping Incline Dumbbell Bench for Incline Machine Press fits your volume perfectly...","scratchpad":"1. Athlete requested mechanical chest variant swap.\n2. Preserved push volume within MAV.","recommendedWorkout":[{"exerciseName":"Incline Machine Press","targetSets":3,"targetReps":"8-12","targetRpe":8.0,"restSeconds":120,"primaryMuscle":"Chest"}],"suggestedFollowUps":[{"label":"Warmup Sets","prompt":"How should I warm up for Incline Machine Press?"}]},"quota":{"currentCount":1,"dailyLimit":15,"resetAt":"2026-11-16T00:00:00.000Z"}}
```

If upstream generation fails or produces invalid/truncated JSON after the SSE stream starts, the server refunds quota, marks the idempotency entry failed, and emits a terminal error event:

```text
event: error
data: {"error":"coaching-request-failed"}
```

---

### 3.2 Action: `classify` (Exercise Normalization)

Classifies a list of free-text exercise names into standardized muscle groups and movement patterns.

#### Request Body Schema

```typescript
{
  action: "classify";
  exerciseNames: string[];  // 0 to 100 exercise names
  muscleGroups: string[];   // Standard allowed muscle group identifiers
}
```

#### Timeouts

- Server: `30,000ms`
- Client: `35,000ms`

#### Example Request

```bash
curl -X POST "https://<PROJECT_REF>.supabase.co/functions/v1/ai-coach" \
  -H "apikey: <SUPABASE_ANON_KEY>" \
  -H "Authorization: Bearer <GOOGLE_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "classify",
    "exerciseNames": [
      "Barbell Incline Press",
      "Romanian Deadlift"
    ],
    "muscleGroups": ["chest", "hamstrings", "glutes", "back", "shoulders", "biceps", "triceps"]
  }'
```

#### Success Response: `200 OK`

```json
{
  "text": "{\"classifications\": [{\"exerciseName\": \"Barbell Incline Press\", \"primaryMuscle\": \"chest\", \"secondaryMuscles\": [{\"muscleGroup\": \"shoulders\", \"contribution\": 0.3}], \"confidence\": 0.95}, {\"exerciseName\": \"Romanian Deadlift\", \"primaryMuscle\": \"hamstrings\", \"secondaryMuscles\": [{\"muscleGroup\": \"glutes\", \"contribution\": 0.4}], \"confidence\": 0.98}]}",
  "quota": {
    "currentCount": 1,
    "dailyLimit": 50,
    "resetAt": "2026-11-13T00:00:00.000Z"
  }
}
```

---

### 3.3 Action: `recover` (Idempotent Result Recovery)

Retrieves the outcome of an interrupted `action: "coach"` request using its UUID v4 `clientRequestId` (e.g., when a mobile OS suspends the client socket during screen lock).

#### Request Body Schema

```typescript
{
  action: "recover";
  clientRequestId: string; // UUID v4 generated for the original coach call
}
```

#### Responses

- **`200 OK` (Completed — Delete-on-Recovery)**: Returns `{ "status": "completed", "advice": { ... }, "quota"?: { ... } }` and deletes the `ai_request_results` row atomically (`DELETE ... RETURNING`). Subsequent recovery calls for the same `clientRequestId` return `404`.
- **`202 Accepted` (Still Processing)**: Returns `{ "status": "processing" }` while the original Edge Function invocation is still executing. Clients may poll until completion or TTL expiry.
- **`404 Not Found`**: Returns `{ "error": "not-found" }` when the `clientRequestId` does not exist, belongs to another user, was already recovered, or exceeded its 30-minute TTL.
- **`502 Bad Gateway`**: Returns `{ "status": "failed", "error": "coaching-request-failed" }` when the original server invocation failed; deletes the `failed` marker row immediately so the athlete can retry cleanly.
- **`503 Service Unavailable`**: Returns `{ "error": "recovery-check-failed" }` when `ai_request_results` cannot be read transiently; does not delete the entry so the client may retry.

---

## 4. Rate Limiting, Quotas & Error Handling

When an athlete reaches their daily limit (15 coach / 50 classify) or the platform ceiling is reached:

#### HTTP `429 Too Many Requests`

```json
{
  "error": "rate-limit-exceeded",
  "quota": {
    "currentCount": 15,
    "dailyLimit": 15,
    "resetAt": "2026-11-16T00:00:00.000Z"
  }
}
```

### Response Status Code Summary

| Status Code | Meaning | Client Handling |
| :--- | :--- | :--- |
| `200 OK` | Request succeeded (or SSE stream opened for `coach`). | For live `coach`, consume SSE `preview` / `complete` / `error` events; for cached duplicate `coach`, consume JSON `{ advice, quota }`; for `recover`, consume JSON `{ status: "completed", advice, quota }`; for `classify`, parse JSON `{ text }`. |
| `202 Accepted` | Request with matching `clientRequestId` is still executing. | Show loading state and poll `action: "recover"` while foregrounded. |
| `400 Bad Request` | Invalid DTO payload or JSON. | Check closed DTO schema structure and bounds. |
| `401 Unauthorized` | Invalid or expired Google token (OIDC ID token or OAuth access token). | Refresh token via `/auth-token` and retry. |
| `404 Not Found` | `recover` target missing, expired (>30m), or already consumed. | Clear pending local recovery state and allow retry. |
| `413 Payload Too Large` | Request body exceeded `100 KB`. | Trim excess historical logs/messages cleanly on client. |
| `429 Too Many Requests` | Daily user quota or platform cap reached. | Show friendly quota limit alert with reset time. |
| `502 Bad Gateway` | Upstream Gemini failure or invalid JSON (`classify`), or recovered request marked failed (`recover`). | Live `coach` failures after stream open arrive as SSE `event: error` with refunded quota; on `recover`, failed marker is deleted so client may retry. |
| `503 Service Unavailable` | Transient recovery store unavailability (`recovery-check-failed` on `recover`). | Keep local pending request state and retry recovery polling. |

---

## 5. Security & Architectural Invariants

1. **JWKS Token Verification**: Google ID Tokens are cryptographically validated against Google JWKS (`RS256`) checking signature, audience (`GOOGLE_CLIENT_ID`), issuer (`accounts.google.com`), and expiration.
2. **Access Token Introspection**: When the caller sends an opaque Google OAuth `access_token` (rather than a 3-segment JWT ID token), `ai-coach` validates it via `POST https://oauth2.googleapis.com/tokeninfo` (`application/x-www-form-urlencoded` body) and verifies `sub` plus `aud`/`azp === GOOGLE_CLIENT_ID`. Invalid or expired 3-segment JWT ID tokens fail closed without falling back.
3. **Identity Derivation**: `userId` is strictly derived from the verified token's `sub` claim. It cannot be spoofed by client payload parameters.
4. **Database RLS & Data Minimization**: Both `ai_daily_usage` and `ai_request_results` have Row-Level Security enabled for `service_role` only (`REVOKE ALL` from `public`, `anon`, and `authenticated`). `ai_request_results` stores zero athlete input DTOs—only the idempotency state and `{ advice, quota }` result, bounded by Delete-on-Recovery and a strict 30-minute TTL.
5. **Quota & Idempotency Pruning**: `ai_daily_usage` records older than 30 days are pruned probabilistically (`random() < 0.01`), and expired `ai_request_results` rows (`expires_at <= now()`) are pruned probabilistically (`random() < 0.05`) on `coach` calls to `consume_ai_quota`.
