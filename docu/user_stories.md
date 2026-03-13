# Gainz AI — User Stories

## 1. Authentication

**As a** user, **I want to** sign in with my Google account **so that** the app can access my Google Drive spreadsheet and sync my data.

**User flow:**
1. Unauthenticated users are always redirected to the login page.
2. User signs in with Google. The app requests OAuth scopes for Spreadsheets, Drive metadata, and Drive file access.
3. On success → token + expiry stored in `localStorage`. Routing continues (see §2).
4. On failure → error notification (distinct messages for "missing scopes" vs generic failure).

**Stores:** `useAuthStore` — `login()` returns `Result<..., "token-request-failed" | "missing-scopes">`.

**Side effects:**
- OAuth token + expiry persisted to `localStorage`.
- Errors reported to Sentry.

**Token expiry:** `isLoggedIn` is a computed that checks `expiresAt > Date.now()`. When the token expires, the user is treated as logged-out and redirected to login. There is no silent refresh.

---

## 2. App Routing & Initialization

**As a** user, **I want** the app to route me to the right place based on my login and setup state **so that** I always land where I need to be.

**Routing logic** (driven by a reactive watcher in `main.ts`):

| `isLoggedIn` | Spreadsheet loaded | Profile loaded | `setupCompleted` | Destination |
|---|---|---|---|---|
| ❌ | — | — | — | Login page |
| ✅ | ❌ | — | — | Stay on loading screen |
| ✅ | ✅ | ❌ | — | Stay on loading screen |
| ✅ | ✅ | ✅ | ❌ | Onboarding wizard (step 1) |
| ✅ | ✅ | ✅ | ✅ | Exercise logs |

**Loading screen:** Shown after login while spreadsheet and profile are being fetched. Sequential messages: *"Loading spreadsheet…"* → *"Loading profile…"*.

**`setupCompleted` flag:** Stored in `localStorage` (`hasCompletedSetup`). Set to `true` when the profile is loaded from the spreadsheet and contains data, or when the profile is saved for the first time.

**Spreadsheet initialization:** On login, the spreadsheet store auto-initializes: looks up an existing spreadsheet by name in Google Drive, or creates a new one if none exists.

**Background sync:** When the service worker completes a background sync, exercise logs and exercises stores are refreshed. Stores also auto-refresh on document visibility change (debounced) to handle PWA ↔ browser tab switching.

**Stores:** `useAuthStore`, `useSpreadsheetStore`, `useUserProfileStore`

---

## 3. Onboarding Wizard (8-step flow)

**As a** user, **I want to** set up my fitness profile through a guided wizard **so that** the AI and tracking features are personalized to me.

Each step reads/writes to `useUserProfileStore`. The wizard can be exited at any time (returns to exercise logs). Navigation: Previous (hidden on first step) / Next (labeled "Save" on last step).

**Step sequence:** Fitness Goal → Fitness Level → Workout Days Per Week → Workout Location → Equipment → Body Stats → Free Input → API Key → Exercise Logs

| Step | Goal | Input Type | Bound Field |
|---|---|---|---|
| 1. Fitness Goal | Select fitness goals | Multi-select (Build muscle, Lose fat, Improve endurance, Increase mobility, General fitness) | `fitnessGoal` |
| 2. Fitness Level | Specify experience level | Single-select (Beginner / Intermediate / Advanced) | `fitnessLevel` |
| 3. Workout Days | Set training frequency | Single-select (2 / 3 / 4 / 5+) | `workoutDaysPerWeek` |
| 4. Workout Location | Specify training environment | Single-select (Gym / Home / Both) | `workoutLocation` |
| 5. Equipment | Indicate available equipment | Multi-select (13 options: bodyweight, resistance bands, suspension trainer, gymnastic rings, pull-up bar, dip bar, dumbbells, kettlebells, barbell & rack, bench, cable machine, cardio machines, medicine ball) | `equipmentAccess` |
| 6. Body Stats | Enter biometrics | Numeric inputs (age, height cm, weight kg) | `age`, `heightCm`, `weightKg` |
| 7. Free Input | Provide extra context | Free-text | `freeUserInput` |
| 8. API Key | Enter Gemini API key (optional, can do later) | Text input + link to Google AI Studio | `apiKey` |

**All fields are optional.** The user can skip any step and proceed.

**Stores:** `useUserProfileStore`

**Side effects:**
- Profile auto-saved to spreadsheet with a 1.5s debounce on every field change.
- `apiKey` stored separately in `localStorage` (never written to the spreadsheet).
- On first save, `hasCompletedSetup` is set to `true`, which changes future routing.

**Re-access:** The wizard is accessible from the exercise logs side menu ("Settings"), allowing the user to update their profile at any time.

---

## 4. Exercise Logging (Main Hub)

**As a** user, **I want to** log exercises, view my training history, and access app features **so that** I can track my workouts.

**User flow:**

1. **Viewing logs:** Logs are grouped by date. Most recent logs are immediately visible. Each entry shows exercise name and any recorded metrics: reps, weight (kg), distance (m), duration (min).
2. **Logging a new exercise:** User opens the log form, which contains:
   - A searchable exercise selector. User can search existing exercises, select one, or type a new name to create it. Exercises can be deleted from the list.
   - Numeric inputs for reps, weight, distance, and duration.
   - A stopwatch for timing rest periods (start/reset).
   - When an exercise is selected, inputs pre-fill from the last logged values for that exercise.
   - User confirms the log.
3. **Deleting a log:** User deletes a log entry.
4. **Side menu:** Provides links to: Settings (wizard), Events, Open Spreadsheet (external), Privacy Policy, Impressum.

**Data model:** An exercise log has: `id` (UUID), `exerciseName` (required), `loggedAt` (auto-set to now), `reps` (optional), `weight` (optional), `distance` (optional), `duration` (optional).

**Stores:**
- `useExerciseLogsStore` — `.exerciseLogs`, `.addExerciseLog()`, `.removeExerciseLog()`, `.lastLogForExercise()`
- `useExercisesStore` — `.exercises`, `.addExercise()`, `.removeExerciseByName()`
- `useSpreadsheetStore` — `.spreadsheetUrl`

**Side effects:**
- New exercise saved to exercises store on every log submission (deduplicated by name).
- Haptic feedback (Capacitor native) on successful log.
- All mutations are **optimistic** (UI updates immediately) and **offline-capable** (Workbox BackgroundSync queues requests when offline, retries on reconnect).

**Embedded features:**
- Consistency level display (see §6).
- AI coaching (see §5).

---

## 5. AI Coaching Feedback

**As a** user, **I want to** get AI-powered training feedback **so that** I receive personalized coaching based on my logs and profile.

**User flow:**
1. User requests AI feedback from the exercise logs page.
2. Cached messages are shown immediately if available.
3. A new AI response is requested only if today's log count has changed since the last response.
4. While loading, a loading indicator is shown.
5. AI responses are rendered as sanitized markdown, in reverse chronological order, with relative timestamps.

**Prerequisite:** A valid Gemini API key must be configured. If not, the user is alerted.

**Data sent to AI:** User profile, exercise logs, training summaries, previous conversation messages, and events.

**Caching:** Messages are stored per day in `localStorage` (key: `ai-messages-{date}`). Sessions older than 7 days are auto-cleaned on store init.

**Error handling:** Distinct alerts for "missing API key" and "content generation failed".

**Stores:** `useAiStore` — `.isLoading`, `.messages`, `.askAi()`

---

## 6. Consistency & Leveling

**As a** user, **I want to** see my consistency level, XP progress, and workout streak **so that** I stay motivated.

- Shown prominently to motivate the user.
- Computes progress from all historical workout dates (training summaries from spreadsheet) + current-year exercise logs.
- Shows: level number, XP progress, title, and 🔥 flames (1–3 based on momentum vs target days/week).

**Training summaries:** Loaded from the spreadsheet on init. Historical exercise logs are automatically migrated into month-level and year-level summaries to keep the spreadsheet compact.

**Stores:** `useExerciseLogsStore`, `useUserProfileStore` (`.workoutDaysPerWeek`), `useTrainingSummaryStore`
**Services:** `calculateUserProgress()` (leveling), `summaryToWorkoutDates()` (training summary)

---

## 7. Events Calendar

**As a** user, **I want to** schedule and view special events (rest days, injuries, etc.) on a calendar **so that** I can plan around my schedule.

**User flow:**
1. Event dates are visually marked on a calendar view.
2. Event list shown with type and formatted date range.
3. User opens the event creation form:
   - Select an event type from presets (Sickness, Injury, Fasting, Rest Day), or choose "Other" and type a custom type.
   - Pick one or more dates.
   - Save.
4. New event is saved to the events store.
5. User can delete existing events.

**Data model:** An event has: `id` (UUID), `type` (string), `dates` (string array, ISO date format). Validated with Zod schema on load.

**Storage:** Events are **localStorage-only** (not synced to spreadsheet). They are persisted to and loaded from `localStorage` on every mutation/init.

**Stores:** `useEventsStore` — `.events`, `.addEvent()`, `.removeEvent()`

---

## 8. PWA Lifecycle

### Install Prompt

**As a** user, **I want to** be prompted to install the app as a PWA **so that** I can use it like a native app.

- **Android/Chrome:** Intercepts the browser install prompt, offers an install action, triggers native install dialog.
- **iOS:** Shows instructions explaining "Add to Home Screen". Dismissal persisted in `localStorage`.
- Hidden if already running in standalone mode.

### Update Notification

**As a** user, **I want to** be notified when a new version is available **so that** I can update the app.

- Service worker checks for updates every 60 seconds and on app visibility change.
- User can choose "Update" or "Later".

---

## 9. Legal Pages

### Privacy Policy
Static German-language privacy policy. No stores or services.

### Impressum
Static German-language legal imprint. No stores or services.

---

## Store & Service Dependency Map

| Store | Persistence | Key State | Key Actions | Used By |
|---|---|---|---|---|
| `useAuthStore` | localStorage | `isLoggedIn`, `accessToken`, `expiresAt` | `login()` | Auth, Routing |
| `useUserProfileStore` | Spreadsheet + localStorage | `userProfile`, `apiKey`, `setupCompleted`, `isLoading` | `updateProfile()` | Routing, Wizard, Consistency |
| `useSpreadsheetStore` | — (runtime) | `doc`, `spreadsheetUrl` | auto-inits on login | Routing, Exercise Logging |
| `useExerciseLogsStore` | Spreadsheet (offline-synced) | `exerciseLogs`, `isLoading` | `addExerciseLog()`, `removeExerciseLog()`, `lastLogForExercise()` | Exercise Logging, Consistency |
| `useExercisesStore` | Spreadsheet (offline-synced) | `exercises` | `addExercise()`, `removeExerciseByName()` | Exercise Logging |
| `useAiStore` | localStorage (per-day) | `messages`, `isLoading` | `askAi()` | AI Coaching |
| `useEventsStore` | localStorage | `events` | `addEvent()`, `removeEvent()` | Events Calendar, AI Coaching |
| `useTrainingSummaryStore` | Spreadsheet | `summaries` | auto-migrates months/years | Consistency |

| Service | Purpose | Used By |
|---|---|---|
| `services/leveling` | `calculateUserProgress()` — XP, level, momentum | Consistency |
| `services/trainingSummary` | `summaryToWorkoutDates()` — extract dates from summaries | Consistency |
| `services/utils/date` | `localeDateString()` — format dates for grouping | Exercise Logging, AI |
| `services/utils/units` | `formatNumberWithUnit()`, `formatUnit()` — localized unit display | Exercise Logging |
| `services/utils/offlineSyncedStore` | Optimistic offline-first CRUD with Workbox BackgroundSync | Exercise Logging, Exercises |
