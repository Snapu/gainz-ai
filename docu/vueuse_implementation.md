# Gainz AI — VueUse Implementation Guide

> All composables from `@vueuse/core` (already installed).

---

## 1. Persistence — `useLocalStorage`

**Replaces:** Raw `localStorage.getItem/setItem` calls scattered across stores.

Already used in: `useAuthStore` (token), `useUserProfileStore` (apiKey, hasCompletedSetup).

**Extend to all persistent state:**

| Store | Key | Type |
|---|---|---|
| `useAuthStore` | `auth:accessToken` | `string \| null` |
| `useAuthStore` | `auth:expiresAt` | `number \| null` |
| `useUserProfileStore` | `userProfile:apiKey` | `string \| null` |
| `useUserProfileStore` | `hasCompletedSetup` | `boolean` |
| `useAiStore` | `ai-messages-{date}` | `AiMessage[]` |
| `useEventsStore` | `events:stored` | `Event[]` |

```ts
import { useLocalStorage } from '@vueuse/core'

const accessToken = useLocalStorage<string | null>('auth:accessToken', null)
// Reactive, auto-syncs across tabs
```

**Key benefit:** Reactive across tabs — when the user has PWA + browser open simultaneously, storage changes propagate automatically.

---

## 2. Async Data Loading — `useAsyncState`

**Use case:** Loading spreadsheet data (exercise logs, exercises, training summaries) from Google Sheets on store init.

Already used in `useOfflineSyncedStore`. The pattern:

```ts
import { useAsyncState } from '@vueuse/core'

const { state: exerciseLogs, isLoading } = useAsyncState(
  () => loadExerciseLogs(spreadsheetDoc),
  [], // default value while loading
)
```

**Key props:**

| Option | Notes |
|---|---|
| `immediate` | `true` (default) — runs on init |
| `resetOnExecute` | Reset state to default on each execution |
| `onError` | Error callback |

---

## 3. Profile Auto-Save — `useDebounceFn`

**Use case:** Debounce writes to Google Sheets when the user is editing profile fields in the wizard.

Already used in `useUserProfileStore`. Correct pattern — keep as-is.

```ts
import { useDebounceFn } from '@vueuse/core'

const debouncedSave = useDebounceFn(async () => {
  await saveUserProfile(userProfile.value, doc)
}, 1500)
```

**Why 1500ms:** Balances perceived responsiveness with avoiding API spam on fast successive edits.

---

## 4. Sync on App Resume — `useDocumentVisibility`

**Use case:** Re-sync exercise logs and exercises when the user switches back to the app (PWA ↔ browser tab).

Already used in `useOfflineSyncedStore`. Correct pattern — keep as-is.

```ts
import { useDocumentVisibility } from '@vueuse/core'

const visibility = useDocumentVisibility()
watch(visibility, (state) => {
  if (state === 'visible') debouncedRefresh()
})
```

---

## 5. Connectivity State — `useOnline`

**Use case:** Gate spreadsheet write operations — queue when offline, execute when back online (Workbox handles retry, but UI should reflect state).

Already used in `useOfflineSyncedStore`. Expose to UI stores if needed:

```ts
import { useOnline } from '@vueuse/core'
const isOnline = useOnline()
// Show "offline" indicator when isOnline.value === false
```

---

## 6. Stopwatch Timer — `useIntervalFn`

**Use case:** Stopwatch for timing rest periods in the log form.

Replaces a hand-rolled `setInterval`. `useIntervalFn` provides reactive `pause`/`resume`/`isActive` controls and auto-clears on component unmount.

```ts
import { useIntervalFn } from '@vueuse/core'
import { ref } from 'vue'

const elapsed = ref(0)
const { pause, resume, isActive } = useIntervalFn(() => {
  elapsed.value++
}, 1000, { immediate: false })

function toggle() {
  isActive.value ? pause() : resume()
}
function reset() {
  pause()
  elapsed.value = 0
}
```

---

## 7. AI Message Timestamps — `useTimeAgo`

**Use case:** Display relative timestamps on AI messages ("2 minutes ago", "just now").

```ts
import { useTimeAgo } from '@vueuse/core'

const timeAgo = useTimeAgo(message.timestamp)
// Reactive — updates automatically every minute
```

**Why not manual formatting:** `useTimeAgo` is reactive and updates without manual refresh loops.

---

## 8. Wizard Navigation — `useStepper`

**Use case:** Managing the 8-step onboarding wizard flow — active step, navigation guards, completion state.

```ts
import { useStepper } from '@vueuse/core'

const wizard = useStepper({
  'fitness-goal': { title: 'Fitness Goal' },
  'fitness-level': { title: 'Fitness Level' },
  'workout-days': { title: 'Workout Days' },
  'workout-location': { title: 'Workout Location' },
  'equipment': { title: 'Equipment' },
  'body-stats': { title: 'Body Stats' },
  'free-input': { title: 'Additional Info' },
  'api-key': { title: 'API Key' },
})

wizard.goToNext()
wizard.goToPrevious()
wizard.isFirst.value   // hide "Previous" on step 1
wizard.isLast.value    // label "Next" as "Save" on step 8
wizard.stepNames       // ['fitness-goal', ...]
```

**Replaces:** Manual route-based step tracking and index management.

---

## 9. Delete Gesture — `usePointerSwipe`

**Use case:** Detect horizontal swipe on log list items to reveal a delete action.

`usePointerSwipe` works with both touch and pointer events (mouse, stylus) — correct for mobile-first.

```ts
import { usePointerSwipe } from '@vueuse/core'
import { ref } from 'vue'

const itemEl = ref<HTMLElement>()
const { distanceX, isSwiping } = usePointerSwipe(itemEl, {
  onSwipeEnd(e, direction) {
    if (direction === 'left' && Math.abs(distanceX.value) > 80) {
      // reveal delete or auto-confirm delete
    }
  }
})
```

---

## 10. Open/Close State — `useToggle`

**Use case:** Any boolean open/close state (log form trigger, menu open, AI panel open).

```ts
import { useToggle } from '@vueuse/core'

const [isOpen, toggle] = useToggle(false)
// toggle() // flip
// isOpen.value = true // set directly
```

**Simpler than:** `const isOpen = ref(false)` + `function toggle() { isOpen.value = !isOpen.value }`.

---

## 11. Composable → Use Case Map

| Use Case | Composable | Notes |
|---|---|---|
| Auth token + expiry storage | `useLocalStorage` | Reactive across tabs |
| Profile API key storage | `useLocalStorage` | Separate from spreadsheet data |
| Setup completion flag | `useLocalStorage` | Drives routing state machine |
| AI messages per-day cache | `useLocalStorage` | Keyed by date string |
| Events persistence | `useLocalStorage` | Replaces raw `localStorage` calls |
| Spreadsheet data loading | `useAsyncState` | `isLoading` state included |
| Profile auto-save | `useDebounceFn` | 1.5s delay |
| Sync on app resume | `useDocumentVisibility` | Debounced refresh |
| Offline detection | `useOnline` | Gate writes, show indicator |
| Stopwatch | `useIntervalFn` | Pause/resume/reset with auto-cleanup |
| AI message timestamps | `useTimeAgo` | Reactive, updates automatically |
| Wizard step navigation | `useStepper` | Replaces manual index tracking |
| Log item delete gesture | `usePointerSwipe` | Touch + pointer events |
| Any open/close state | `useToggle` | Cleaner than manual bool + function |
