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
| `Authorization` | Conditional | `Bearer <google_id_token>` (Mandatory for `/ai-coach`; not required for `/auth-token`). |

---

## 2. Authentication & Token Exchange Endpoint: `/auth-token`

- **Endpoint Path**: `POST /functions/v1/auth-token`
- **Authentication**: Public (protected by Supabase `apikey`).
- **Rate Limit**: Max 30 requests per 60-second window per client IP.
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
| `429 Too Many Requests` | `{"error": "rate-limited", "message": "..."}` | Rate limit exceeded (Retry-After: 60s). |
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
| `429 Too Many Requests` | `{"error": "rate-limited", "message": "..."}` | Rate limit exceeded. |

---

## 3. AI Coaching & Classification Endpoint: `/ai-coach`

- **Endpoint Path**: `POST /functions/v1/ai-coach`
- **Authentication**: **Mandatory** `Authorization: Bearer <google_id_token>`
- **Upstream Models**:
  - Coaching: `gemini-3.8-flash` (Primary) → `gemini-2.5-flash` → `gemini-3.5-flash-lite`
  - Classification: `gemini-2.5-flash` (Primary) → `gemini-3.5-flash-lite`
- **Daily Quotas**:
  - `coach`: Default 25 requests per UTC day (configured via `AI_DAILY_COACH_LIMIT`).
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
Authorization: Bearer <GOOGLE_ID_TOKEN>
Content-Type: application/json
```

#### Request Body Schema

```typescript
{
  action: "coach";
  mode: "planning" | "execution";
  allowPlanUpdate?: boolean;
  muscleGroups: string[];
  contents: Array<{
    role: "user" | "model";
    parts: Array<{ text: string }>;
  }>;
}
```

#### Constraints & Timeouts

- `contents`: Array of conversational turns. User prompts are compacted client-side to prevent quadratic token growth.
- **Timeouts**:
  - Server: `55,000ms` for planning or first message; `40,000ms` for conversational follow-ups.
  - Client: `65,000ms` for planning; `48,000ms` for follow-ups (providing network transit buffer).

#### Example Request

```bash
curl -X POST "https://<PROJECT_REF>.supabase.co/functions/v1/ai-coach" \
  -H "apikey: <SUPABASE_ANON_KEY>" \
  -H "Authorization: Bearer <GOOGLE_ID_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "coach",
    "mode": "execution",
    "allowPlanUpdate": true,
    "muscleGroups": ["chest", "back", "quads", "hamstrings", "shoulders", "biceps", "triceps"],
    "contents": [
      {
        "role": "user",
        "parts": [{ "text": "# session\nworkoutDays: 4\n# question\nCan I swap Incline Dumbbell Bench today?" }]
      }
    ]
  }'
```

#### Success Response: `200 OK`

```json
{
  "text": "{\"coachMessage\": \"Swapping Incline Dumbbell Bench for Incline Machine Press fits your volume perfectly...\", \"recommendedWorkout\": [{\"exerciseName\": \"Incline Machine Press\", \"targetSets\": 3, \"targetReps\": \"8-12\", \"targetRpe\": 8.0, \"restSeconds\": 120, \"primaryMuscle\": \"Chest\"}], \"suggestedFollowUps\": [{\"label\": \"Warmup Sets\", \"prompt\": \"How should I warm up for Incline Machine Press?\"}]}",
  "thought": "Athlete requested swap for incline dumbbell bench. Selecting mechanical chest press variant...",
  "quota": {
    "currentCount": 1,
    "dailyLimit": 25,
    "resetAt": "2026-11-13T00:00:00.000Z"
  }
}
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
  -H "Authorization: Bearer <GOOGLE_ID_TOKEN>" \
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

## 4. Rate Limiting, Quotas & Error Handling

When an athlete reaches their daily limit (25 coach / 50 classify) or the platform ceiling is reached:

#### HTTP `429 Too Many Requests`

```json
{
  "error": "rate-limit-exceeded",
  "quota": {
    "currentCount": 25,
    "dailyLimit": 25,
    "resetAt": "2026-11-13T00:00:00.000Z"
  }
}
```

### Response Status Code Summary

| Status Code | Meaning | Client Handling |
| :--- | :--- | :--- |
| `200 OK` | Request succeeded. | Parse `text` JSON into domain model with Zod. |
| `400 Bad Request` | Invalid payload or JSON. | Check request body structure. |
| `401 Unauthorized` | Invalid or expired Google ID Token. | Refresh token via `/auth-token` and retry. |
| `429 Too Many Requests` | Daily user quota or platform cap reached. | Show friendly quota limit alert with reset time. |
| `502 Bad Gateway` | Upstream Gemini API failed. | Quota was refunded by server. Retry with exponential backoff. |

---

## 5. Security & Architectural Invariants

1. **JWKS Token Verification**: Google ID Tokens are cryptographically validated against Google JWKS (`RS256`) checking signature, audience (`GOOGLE_CLIENT_ID`), issuer (`accounts.google.com`), and expiration.
2. **Access Token Introspection**: When the caller sends an opaque Google OAuth `access_token` (rather than a 3-segment JWT ID token), `ai-coach` validates it via `POST https://oauth2.googleapis.com/tokeninfo` (`application/x-www-form-urlencoded` body) and verifies `sub` plus `aud`/`azp === GOOGLE_CLIENT_ID`. Invalid or expired 3-segment JWT ID tokens fail closed without falling back.
3. **Identity Derivation**: `userId` is strictly derived from the verified token's `sub` claim. It cannot be spoofed by client payload parameters.
4. **Database RLS & Protection**: `ai_daily_usage` has Row-Level Security enabled for `service_role` only. Public client tokens (`anon`) cannot query or modify quota rows directly.
5. **Probabilistic Pruning**: Records older than 30 days are pruned probabilistically (`random() < 0.01`) within quota RPC calls to prevent index lock contention on the hot path.
