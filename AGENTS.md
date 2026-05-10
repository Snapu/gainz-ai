# AGENTS.md - Gainz AI Development Guide

> **Self-Correction Policy**: If you encounter information in this file that is outdated, incorrect, or no longer matches the actual codebase, you must correct it before proceeding with your task.

This file provides guidance for AI coding agents working on the Gainz AI project.

## Project Overview

- **Stack**: Vue 3 + Ionic Vue + Pinia (state) + Capacitor (native) + TypeScript
- **Package Manager**: pnpm (always use pnpm, never npm/yarn)
- **Entry Point**: `src/main.ts`
- **Architecture**: DDD (Domain-Driven Design) + Vue.js best practices + Tailwind CSS + Reka UI

## Build & Development Commands

```bash
# Install dependencies
pnpm install

# Development server
pnpm dev

# Build (runs type-check + vite build in parallel)
pnpm run build

# Preview production build
pnpm run preview

# Run single test file
pnpm run test:unit src/modules/trainingSummary/application/trainingSummary.test.ts

# Run tests in watch mode
pnpm run test:unit -- --watch

# Type check only
pnpm run type-check

# Lint (Biome)
pnpm run lint

# Format (Biome)
pnpm run format
```

## Code Style Guidelines

### Formatting & Linting
- **Tool**: Biome (`biome.json`)
- **Indent**: 2 spaces
- **Line Width**: 100 characters max
- **Quotes**: Double quotes for JavaScript/TypeScript
- **Trailing Commas**: Allowed
- Run `pnpm run lint` before committing

### TypeScript
- Always use explicit types for function parameters and return types
- Use `type` for simple type aliases, `interface` for object shapes
- Never use `any` — use `unknown` if type is truly unknown
- Enable strict mode in tsconfig (extends from `@vue/tsconfig`)

### Vue Components
- Use `<script setup lang="ts">` exclusively
- Use `defineProps` with generic type inference
- Use `defineModel` for two-way binding (see `src/shared/presentation/components/ui/UiCombobox.vue`)
- Use `defineEmits` with explicit event types

### Imports
- **Ionic**: Import individually from `@ionic/vue` (e.g., `IonButton`, `IonModal`)
- **Vue**: Import from `vue` as needed
- **Internal**: Use `@/` alias:
  - Domain modules: `@/modules/{name}/{layer}` facade (e.g., `@/modules/auth/presentation`, `@/modules/trainingLogs/domain`)
  - Shared UI: `@/shared/presentation/components/{path}` (e.g., `@/shared/presentation/components/AppHeader`)
  - Shared composables: `@/shared/presentation/composables/{name}` (e.g., `@/shared/presentation/composables/useToast`)
  - Rule: Avoid deep module imports like `@/modules/*/presentation/stores/*`, `@/modules/*/application/useCases`, or `@/modules/*/domain/*`; import from layer facades instead (`@/modules/*/presentation`, `@/modules/*/application`, `@/modules/*/domain`)
  - Utilities: `@/shared/presentation/lib/utils` (e.g., `cn()` for classname merging)
- **Organize**: Biome's `organizeImports` action handles this automatically

### Pinia Stores
- Use setup function pattern: `defineStore('name', () => { ... })`
- Naming: `useXxxStore()` (e.g., `useAuthStore`)
- Return refs and functions, not reactive objects
- Located in: `src/modules/{name}/presentation/stores/{file}.ts`
- Example:
```typescript
export const useAuthStore = defineStore("auth", () => {
  const accessToken = useLocalStorage<string | null>("auth:accessToken", null);
  const isLoggedIn = computed(() => !!accessToken.value);
  return { accessToken, isLoggedIn, login };
});
```

### Ionic Component Patterns
- Access underlying web component via `.$el`: `modalRef.value?.$el.present()`
- Set focus via `.$el.setFocus()`
- Use Ionic events (e.g., `@ion-focus`, `@ion-input`)

### Error Handling
- Use `neverthrow` library (Result types) for fallible operations
- Never swallow errors with empty catch blocks
- Propagate errors with meaningful string literal error codes
- Example:
```typescript
import { err, ok, type Result } from "neverthrow";

function divide(a: number, b: number): Result<number, "division-by-zero"> {
  if (b === 0) return err("division-by-zero");
  return ok(a / b);
}
```

### Testing
- **Framework**: Vitest + @vue/test-utils
- **Naming**: `*.test.ts` suffix (e.g., `auth.test.ts`)
- **Location**: Same directory as source, or `__tests__/` folder
- **Pattern**: Use `describe` blocks for grouping, `it` for test cases
- **Mocking**:
  - Mock Ionic components with global stubs
  - Mock `window.crypto.subtle` for AI store tests
  - Use `vi.fn()` for spies

Example test helper:
```typescript
function createLog(exerciseName: string, loggedAt: Date): ExerciseLog {
  return { id: crypto.randomUUID(), exerciseName, loggedAt };
}
```

## Architecture Overview

```
src/
├── main.ts                          # App entry, mounts Ionic + Pinia + router
├── App.vue                          # Root Vue component
│
├── router/                          # Vue Router config
│   └── index.ts                     # Route definitions
│
├── views/                           # Page-level components (lazy-loaded by router)
│   ├── Login.vue
│   ├── wizard/WizardFlow.vue
│   ├── ExerciseLogs.vue
│   └── ...
│
├── shared/                          # Shared presentation infrastructure (not domain-aware)
│   └── presentation/
│       ├── components/              # UI component library
│       │   ├── AppHeader.vue        # Composite layout components
│       │   ├── ExerciseSelector.vue
│       │   ├── ui/                  # Base UI primitives (Ui* prefix)
│       │   │   ├── UiButton.vue
│       │   │   ├── UiInput.vue
│       │   │   ├── UiCard.vue
│       │   │   └── styles.ts        # CVA style contracts
│       │   └── ...
│       ├── composables/             # Cross-cutting Vue composables
│       │   ├── useToast.ts
│       │   ├── useAuthErrorHandler.ts
│       │   └── ...
│
├── modules/                         # DDD: Bounded contexts (domain-driven)
│   ├── shared/                      # Domain-aware shared logic
│   │   ├── domain/                  # Core entities, value objects, types
│   │   │   ├── parseData.ts         # Canonical Zod parsing
│   │   │   ├── date.ts              # Canonical date formatting
│   │   │   └── ...
│   │   ├── application/             # Use cases, orchestration
│   │   │   ├── exerciseMuscleMap.ts
│   │   │   ├── leveling.ts
│   │   │   └── ...
│   │   └── infrastructure/          # External integrations
│   │       ├── spreadsheets.ts      # Google Sheets client
│   │       └── ...
│   │
│   ├── auth/                        # Auth bounded context
│   │   ├── domain/
│   │   ├── application/
│   │   ├── infrastructure/
│   │   └── presentation/
│   │       └── stores/authStore.ts
│   │
│   ├── profile/                     # User profile context
│   │   ├── domain/
│   │   ├── application/
│   │   ├── infrastructure/
│   │   ├── presentation/
│   │   │   ├── stores/
│   │   │   └── constants/wizard.ts  # Profile-specific configuration
│   │   └── ...
│   │
│   └── ... (aiCoach, trainingLogs, trainingSummary, deload, migration, etc.)
│
├── lib/                             # General utilities (not presentation-specific)
│   └── utils.ts                     # cn() for classname merging
│
├── theme/                           # Global styles & design tokens
│   └── variables.css
│
└── assets/                          # Static assets (images, etc.)
```

## Component Placement Rules

**These rules enforce DDD + Presentation architecture boundaries.** The type-checker and tests validate placement.

### `src/shared/presentation/components/ui/` — Base UI Primitives

- **Allowed**: Stateless or near-stateless wrappers around HTML/Reka-ui primitives
  - Examples: buttons, inputs, badges, modals, cards, toggles, forms
- **Naming**: All files **must** use the `Ui*` prefix (e.g., `UiButton.vue`, `UiInput.vue`, `UiCard.vue`)
- **Forbidden**:
  - Domain-specific render logic
  - Exercise/workout/user data
  - Module-internal business state or logic
- **Styling**: Use style contracts from `styles.ts` (CVA variants, `uiFieldClass`, `uiSelectableItemClass`)
- **Testing**: Components here are tested with minimal mocking (mostly visual/interaction)

### `src/shared/presentation/components/` — Composite & Layout Components

- **Allowed**: Components that compose `ui/` primitives + shared presentation concerns
  - Examples: `AppHeader`, `ExerciseSelector`, `SessionLogGroup`, `MuscleActivationMap`, `EmptyState`
  - These may fetch data from stores but do NOT import module-specific domain logic
- **No `Ui` prefix** — these are composite/layout components, not primitives
- **Naming**: Clear, descriptive names matching their visual role
- **Testing**: Use shallow mounting; mock stores as needed

### `src/shared/presentation/composables/` — Shared Composables

- **Allowed**: Cross-cutting Vue composables (not domain-specific)
  - Examples: `useToast`, `useAuthErrorHandler`, `useAuthExpirationWatcher`, `useKeyboardHeight`
  - These provide UI-layer utilities, error handling, or lifecycle management
- **Forbidden**: Anything that imports from `src/modules/*/domain` or `src/modules/*/application`
  - If a use case belongs to a domain module, put it in that module's presentation layer
- **Location**: Always in `src/shared/presentation/composables/`

### `src/modules/{name}/presentation/components/` — Domain-Specific UI (Optional)

- **Use when**: A component couples tightly to one module's domain (rare)
  - Example: `AICoachingPanel.vue` belongs in `src/modules/aiCoach/presentation/components/`
- **Import rule**: Can import from its own module's domain/application/infrastructure layers
- **Shared access**: Other modules should NOT import from here; compose via `src/shared/presentation/components/` if cross-module UI is needed

### `src/modules/{name}/presentation/constants/` — Domain-Specific Constants

- **Use for**: Feature flags, step configurations, or lookups tied to one module
  - Example: `src/modules/profile/presentation/constants/wizard.ts` (profile onboarding steps)
- **Shared constants**: General utilities like API URLs belong in `src/lib/` or `src/modules/shared/`

### `src/views/` — Page-Level Components

- **Use for**: Top-level route components only
  - Examples: `Login.vue`, `ExerciseLogs.vue`, `TrainingInsights.vue`
- **Composition**: Combine `src/shared/presentation/components/` + module stores to build the page
- **Import rule**: Import from:
  - `@/shared/presentation/components/` (composite & layout)
  - `@/modules/{name}/presentation` (module-specific state facade)
  - `@/shared/presentation/composables/` (cross-cutting utilities)
- **Forbidden**: Direct imports from module domain/application/infrastructure

## Adding a New Component — Checklist

1. **Is it a pure UI primitive?** (stateless wrapper around one HTML element or Reka-ui primitive, no domain logic)
   - → `src/shared/presentation/components/ui/UiMyComponent.vue`
   - Use `Ui*` prefix
   - Use style contracts from `styles.ts`

2. **Is it a composite or layout component?** (composes `ui/` primitives with shared concerns)
   - → `src/shared/presentation/components/MyComponent.vue`
   - No `Ui` prefix
   - May use module stores, but doesn't import domain/application code directly

3. **Does it belong to one domain module only?** (couples to that module's domain)
   - → `src/modules/{name}/presentation/components/MyComponent.vue`
   - Can import from its own module's layers
   - Rarely used; prefer composing from `src/shared/` instead

4. **Is it a composable (`useXxx`)** for cross-cutting concerns?
   - → `src/shared/presentation/composables/useMyComposable.ts`
   - Cannot import from any module's domain/application layers

5. **Is it a page?** (top-level route component)
   - → `src/views/MyPage.vue`
   - Composes layout + domain modules to render a complete page

## Key Integration Points

| Service | File | Notes |
|---------|------|-------|
| AI (Google GenAI) | `src/modules/aiCoach/presentation/stores/aiStore.ts` | Uses `window.crypto.subtle` - mock in tests |
| Google Sheets | `src/modules/shared/infrastructure/spreadsheets.ts` | Uses `google-spreadsheet` |
| OAuth | `src/modules/auth/presentation/stores/authStore.ts` | Uses `vue3-google-login` |
| Capacitor | `capacitor.config.ts` | Native plugins (haptics, keyboard, status-bar) |

## Architecture Boundaries

- **Domain layer** (`src/modules/*/domain/`) — No imports from services, stores, presentation, or other modules' infrastructure
- **Application layer** (`src/modules/*/application/`) — May import from same module's domain; no direct infrastructure access
- **Application ports** — Define repository interfaces in application use-cases and inject concrete adapters from infrastructure
- **Application anti-leak rule** — Never import `google-spreadsheet` or reference `GoogleSpreadsheet` in production application files
- **Infrastructure layer** (`src/modules/*/infrastructure/`) — Implements domain/application contracts; can call external services
- **Presentation layer** (`src/modules/*/presentation/`) — Wraps application use cases; imports from shared presentation utilities
- **Shared presentation** (`src/shared/presentation/`) — No imports from any module's internal layers; reusable across all modules

Tests in `src/modules/architecture.boundaries.test.ts` enforce these rules.

## Security Notes

- Never log access tokens or sensitive data
- Use environment variables for API keys (see `.env`)
- Sanitize user input before rendering (Vue handles this by default)

## Common Patterns

### Conditional Modal Opening
```typescript
const modalRef = ref<InstanceType<typeof IonModal> | null>(null);
function open() { modalRef.value?.$el.present(); }
```

### Event Emission
```typescript
const emit = defineEmits(["deleted", "selected"]);
function selectItem(item: string) {
  emit("selected", item);
}
```

### Cross-Module Store Usage in Views
```typescript
// In src/views/ExerciseLogs.vue
import { useExerciseLogsStore } from "@/modules/trainingLogs/presentation";
import { SessionLogGroup } from "@/shared/presentation/components/SessionLogGroup";

const logsStore = useExerciseLogsStore();
```

## References

- **UI primitives**: `src/shared/presentation/components/ui/UiButton.vue`, `src/shared/presentation/components/ui/UiInput.vue`
- **Style contracts**: `src/shared/presentation/components/ui/styles.ts` (CVA variants, `uiFieldClass`, `uiSelectableItemClass`)
- **Composite components**: `src/shared/presentation/components/AppHeader.vue`, `src/shared/presentation/components/ExerciseSelector.vue`
- **Composables**: `src/shared/presentation/composables/useToast.ts`, `src/shared/presentation/composables/useAuthErrorHandler.ts`
- **Store pattern**: `src/modules/auth/presentation/index.ts` (re-exporting `stores/authStore.ts`)
- **Test example**: `src/modules/trainingSummary/application/trainingSummary.test.ts`
- **Services**: `src/modules/shared/infrastructure/spreadsheets.ts`
- **Error handling**: use `neverthrow` result patterns in module application/infrastructure files
- **Module boundaries**: `src/modules/architecture.boundaries.test.ts` (enforces layer rules)
