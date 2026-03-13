# Gainz AI — Reka UI Implementation Guide

> Stack: **Reka UI** (headless primitives) + **Tailwind CSS v4** (styling)
> Source: [reka-ui.com/docs](https://reka-ui.com/docs/overview/introduction)

---

## Installation

```bash
pnpm add reka-ui @internationalized/number
```

> `@internationalized/number` is required for `NumberField` locale-aware formatting.

---

## 1. Global App Setup — `ConfigProvider`

Wrap the root of the app with `ConfigProvider` to set global dir, locale, and scroll behavior.

```vue
<script setup lang="ts">
import { ConfigProvider } from 'reka-ui'
</script>
<template>
  <ConfigProvider locale="en" :scroll-body="false">
    <RouterView />
  </ConfigProvider>
</template>
```

**Key props:**

| Prop | Type | Default | Use |
|---|---|---|---|
| `locale` | `string` | `'en'` | Passed to NumberField, DateFormatter, etc. |
| `dir` | `'ltr' \| 'rtl'` | `'ltr'` | RTL support |
| `scroll-body` | `boolean \| ScrollBodyOption` | `true` | Prevent layout shift on Dialog/overlay open |

> **Tip:** Set `scroll-body="false"` for mobile apps where scroll lock causes layout shift.

---

## 2. Styling Pattern

Reka UI components are **fully unstyled**. All styling is done via Tailwind classes and `data-state` attributes.

### Applying Tailwind

```vue
<DialogOverlay class="fixed inset-0 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out" />
```

### Responding to component state

Every stateful component exposes `data-state` attributes:

| Component | data-state values |
|---|---|
| Dialog, Sheet | `open` / `closed` |
| Accordion | `open` / `closed` |
| Toggle / ToggleGroup | `on` / `off` |
| NumberField | `disabled` |
| Autocomplete | `open` / `closed` |

```css
/* Tailwind selector form */
data-[state=open]:opacity-100
data-[state=closed]:opacity-0
data-[disabled]:cursor-not-allowed
data-[pressed]:bg-primary
```

### Extending a primitive (recommended pattern)

```vue
<script setup lang="ts">
import { NumberFieldRoot, type NumberFieldRootProps } from 'reka-ui'
interface Props extends NumberFieldRootProps { label: string }
defineProps<Props>()
</script>
<template>
  <NumberFieldRoot v-bind="$props">
    <slot />
  </NumberFieldRoot>
</template>
```

### Teleported/portaled elements

Dialog, Autocomplete, and Toast content are teleported to `<body>`. When using Vue scoped styles, target them with `:deep()` or use global Tailwind classes directly.

---

## 3. Exercise Selector — `Autocomplete`

**Use case:** The exercise search/select/create input in the log form.

**Why Autocomplete, not Combobox:**
- `Autocomplete` → `modelValue` is always a `string` (whatever the user typed). Value is not constrained to the list. ✅ Needed for "create new exercise by typing"
- `Combobox` → `modelValue` must be from a predefined set. ❌ Would block free-text exercise creation

### Anatomy

```vue
<AutocompleteRoot v-model="exerciseName">
  <AutocompleteAnchor>
    <AutocompleteInput placeholder="Search or add exercise..." />
    <AutocompleteCancel />           <!-- clears input -->
  </AutocompleteAnchor>
  <AutocompletePortal>
    <AutocompleteContent hide-when-empty>
      <AutocompleteViewport>
        <AutocompleteEmpty>No exercises found</AutocompleteEmpty>
        <AutocompleteItem
          v-for="ex in exercises"
          :key="ex.name"
          :value="ex.name"
        >
          {{ ex.name }}
        </AutocompleteItem>
      </AutocompleteViewport>
    </AutocompleteContent>
  </AutocompletePortal>
</AutocompleteRoot>
```

**Key props (Root):**

| Prop | Notes |
|---|---|
| `v-model` | `string` — reflects typed text; selecting fills input |
| `filter-function` | Custom filter, or use `useFilter` composable |
| `display-value` | Format the displayed string |

**Key props (Content):**

| Prop | Notes |
|---|---|
| `hide-when-empty` | Hides dropdown when no items match — UX essential |
| `position` | `'popper'` (anchored) or `'item-aligned'` |

**Delete from list:** Add a secondary action inside each item row (not a built-in Reka feature — implement as a button inside `AutocompleteItem` content with `@click.stop`).

### `useFilter` — locale-aware filtering

```ts
import { useFilter } from 'reka-ui'
const { contains } = useFilter({ sensitivity: 'base' }) // case+accent insensitive
const filtered = computed(() =>
  exercises.value.filter(ex => contains(ex.name, searchText.value))
)
```

---

## 4. Metric Inputs — `NumberField`

**Use case:** Reps, weight, distance, duration inputs in the log form.

Replaces the hand-rolled `UiNumberStepper`. `NumberField` handles:
- Keyboard navigation (arrow up/down)
- Hold-to-spin (click and hold +/− button)
- Mouse wheel changes
- Locale-aware number formatting
- Float precision (step snapping)

### Anatomy

```vue
<NumberFieldRoot
  v-model="currentReps"
  :min="0"
  :step="1"
  :format-options="{ minimumFractionDigits: 0 }"
>
  <label>Reps</label>
  <NumberFieldDecrement />
  <NumberFieldInput />
  <NumberFieldIncrement />
</NumberFieldRoot>
```

**Key props (Root):**

| Prop | Notes |
|---|---|
| `v-model` | `number \| null` |
| `min` / `max` | Bounds |
| `step` | Amount per tick (default `1`) |
| `step-snapping` | Snaps to step multiples (default `true`) |
| `format-options` | `Intl.NumberFormatOptions` — e.g. `{ style: 'unit', unit: 'kilogram' }` |
| `disable-wheel-change` | `true` for mobile — prevents accidental scroll changes |
| `locale` | Inherited from `ConfigProvider` |

**For the Gainz AI log form:**

| Field | `step` | `format-options` |
|---|---|---|
| Reps | `1` | `{ maximumFractionDigits: 0 }` |
| Weight (kg) | `0.5` | `{ style: 'unit', unit: 'kilogram' }` |
| Distance (m) | `100` | `{ style: 'unit', unit: 'meter' }` |
| Duration (min) | `0.5` | `{ style: 'unit', unit: 'minute' }` |

> ⚠️ Install `@internationalized/number` separately — required for `NumberField`.

---

## 5. Wizard Selections — `ToggleGroup`

**Use case:** All wizard step selections (fitness goal, fitness level, workout days, location, equipment).

Replaces `UiCheckbox`. `ToggleGroup` supports both single and multi select with full keyboard navigation and roving focus — ideal for mobile tap targets.

### Anatomy

```vue
<!-- Single-select (e.g. FitnessLevel) -->
<ToggleGroupRoot type="single" v-model="fitnessLevel">
  <ToggleGroupItem value="beginner">🟢 Beginner</ToggleGroupItem>
  <ToggleGroupItem value="intermediate">🟡 Intermediate</ToggleGroupItem>
  <ToggleGroupItem value="advanced">🔴 Advanced</ToggleGroupItem>
</ToggleGroupRoot>

<!-- Multi-select (e.g. FitnessGoal) -->
<ToggleGroupRoot type="multiple" v-model="fitnessGoal">
  <ToggleGroupItem value="build_muscle">🏋️ Build muscle</ToggleGroupItem>
  <ToggleGroupItem value="lose_fat">🏃 Lose fat</ToggleGroupItem>
  <!-- ... -->
</ToggleGroupRoot>
```

**Key props (Root):**

| Prop | Notes |
|---|---|
| `type` | `'single'` or `'multiple'` |
| `v-model` | `string` (single) or `string[]` (multiple) |
| `orientation` | `'horizontal'` or `'vertical'` (default). Vertical suits stacked mobile lists |

**Styling active state:**

```html
<ToggleGroupItem
  value="build_muscle"
  class="rounded-xl border px-4 py-3 data-[state=on]:bg-primary data-[state=on]:text-white"
>
  🏋️ Build muscle
</ToggleGroupItem>
```

---

## 6. Overlays — `Dialog`

**Use cases:**
- Exercise log form (triggered from main screen)
- AI coaching feedback panel
- Event creation form
- Add event confirmation

`Dialog` provides: focus trapping, `Esc` to close, ARIA roles, and portal rendering.

### Anatomy

```vue
<DialogRoot v-model:open="isOpen">
  <DialogTrigger as-child>
    <button>Open</button>
  </DialogTrigger>
  <DialogPortal>
    <DialogOverlay class="fixed inset-0 bg-black/60 data-[state=open]:animate-in data-[state=closed]:animate-out" />
    <DialogContent class="fixed bottom-0 left-0 right-0 rounded-t-2xl bg-background p-6 data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom">
      <DialogTitle>Log Exercise</DialogTitle>
      <DialogDescription class="sr-only">...</DialogDescription>
      <!-- content -->
      <DialogClose as-child>
        <button>✕</button>
      </DialogClose>
    </DialogContent>
  </DialogPortal>
</DialogRoot>
```

**Key props (Root):**

| Prop | Notes |
|---|---|
| `v-model:open` | Controlled open state |
| `modal` | `true` (default) — traps focus |

**Key props (Content):**

| Prop | Notes |
|---|---|
| `@interact-outside` | Intercept outside clicks — e.g. call `event.preventDefault()` to block dismiss |

> **Sheet/bottom-sheet pattern:** `DialogContent` styled as a bottom-anchored panel (`fixed bottom-0 inset-x-0 rounded-t-2xl`) produces the Ionic-style bottom sheet without any additional library. Animate with `data-[state=open]:slide-in-from-bottom`.

---

## 7. Notifications — `Toast`

**Use cases:** Auth error notification, AI error, PWA update prompt.

`Toast` requires a `ToastProvider` + `ToastViewport` placed once in `App.vue`, then individual `ToastRoot` instances are rendered imperatively.

### Setup in App.vue

```vue
<ToastProvider>
  <RouterView />
  <ToastViewport class="fixed bottom-4 left-1/2 -translate-x-1/2 flex flex-col gap-2 z-50" />
</ToastProvider>
```

### Usage

```vue
<ToastRoot v-model:open="showToast" :duration="3000">
  <ToastTitle>Login failed</ToastTitle>
  <ToastDescription>Please grant the required permissions.</ToastDescription>
  <ToastAction alt-text="Try again" as-child>
    <button>Retry</button>
  </ToastAction>
  <ToastClose />
</ToastRoot>
```

**Key patterns:**

| Pattern | Notes |
|---|---|
| `duration` | Auto-dismiss in ms (default 5000) |
| `ToastAction` requires `alt-text` | Accessibility — screen reader label for the action |
| Swipe to dismiss | Animate with `data-[swipe=move]:translate-x-[--radix-toast-swipe-move-x]` data attributes |

---

## 8. XP Progress — `Progress`

**Use case:** Consistency level XP progress bar.

```vue
<ProgressRoot :value="userProgress.progressPercent" :max="100" class="relative h-2 w-full overflow-hidden rounded-full bg-muted">
  <ProgressIndicator
    class="h-full bg-primary transition-all duration-500"
    :style="{ transform: `translateX(-${100 - userProgress.progressPercent}%)` }"
  />
</ProgressRoot>
```

**State attribute:** `data-state="indeterminate"` when `value` is `null` — use for loading state.

---

## 9. Useful Utilities

### `useFilter`
Locale-aware, accent-insensitive string matching. Use for the exercise search in `Autocomplete`.

```ts
import { useFilter } from 'reka-ui'
const { contains, startsWith } = useFilter({ sensitivity: 'base' })
// 'base' = ignores case and accents
```

### `useDateFormatter`
Locale-aware date formatting. Use for event date display and log timestamps.

```ts
import { useDateFormatter } from 'reka-ui'
const formatter = useDateFormatter('en')
formatter.custom(date, { month: 'long', day: 'numeric', year: 'numeric' })
```

### `asChild` — composition pattern

All Reka UI components support `as-child`. Merges the component's props/events/accessibility onto your own element, instead of rendering Reka's default wrapper.

```vue
<!-- Renders a <button> with all DialogTrigger behavior, no extra div -->
<DialogTrigger as-child>
  <button class="my-custom-button">Open</button>
</DialogTrigger>
```

---

## 10. Component → Use Case Map

| Use Case | Reka UI Component | Notes |
|---|---|---|
| Exercise search + create | `Autocomplete` | Free-text + suggestion list; `useFilter` for matching |
| Reps / weight / distance / duration | `NumberField` | Native hold-to-spin, locale formatting |
| Wizard single-select | `ToggleGroup type="single"` | Replaces `UiCheckbox` single-mode |
| Wizard multi-select | `ToggleGroup type="multiple"` | Replaces `UiCheckbox` multiple-mode |
| Log form overlay | `Dialog` styled as bottom sheet | `fixed bottom-0 inset-x-0 rounded-t-2xl` |
| AI feedback overlay | `Dialog` | Full-screen or large sheet |
| Event creation | `Dialog` | Same pattern |
| Auth error / AI error | `Toast` | `ToastProvider` once in `App.vue` |
| PWA update prompt | `Toast` with `ToastAction` | "Update" / "Later" actions |
| XP progress bar | `Progress` | `data-state=indeterminate` for loading |
| Global locale/dir/scroll | `ConfigProvider` | Wrap `App.vue` root |
| Date display | `useDateFormatter` | Locale-aware, consistent with `ConfigProvider` locale |
| Exercise search filter | `useFilter` | `sensitivity: 'base'` for accent/case-insensitive |

---

## 11. Not in Reka UI (implement manually)

| Feature | Notes |
|---|---|
| Stopwatch | Custom timer logic — no Reka primitive |
| Delete gesture on log items | Custom gesture/action — no Reka primitive |
| Markdown rendering | Custom renderer — not a UI primitive |
| Sidebar / navigation menu | Custom — can be composed from `Dialog` or built independently |
