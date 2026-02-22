# AGENTS.md - Gainz AI Development Guide

This file provides guidance for AI coding agents working on the Gainz AI project.

## Project Overview

- **Stack**: Vue 3 + Ionic Vue + Pinia (state) + Capacitor (native) + TypeScript
- **Package Manager**: pnpm (always use pnpm, never npm/yarn)
- **Entry Point**: `src/main.ts`

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
pnpm run test:unit src/services/trainingSummary.test.ts

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
- Use `defineModel` for two-way binding (see `src/components/ui/UiCombobox.vue`)
- Use `defineEmits` with explicit event types

### Imports
- **Ionic**: Import individually from `@ionic/vue` (e.g., `IonButton`, `IonModal`)
- **Vue**: Import from `vue` as needed
- **Internal**: Use `@/` alias (e.g., `import { useAuthStore } from "@/stores/auth"`)
- **Organize**: Biome's `organizeImports` action handles this automatically

### Pinia Stores
- Use setup function pattern: `defineStore('name', () => { ... })`
- Naming: `useXxxStore()` (e.g., `useAuthStore`)
- Return refs and functions, not reactive objects
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

## Project Structure

```
src/
├── main.ts              # App entry, mounts Ionic + Pinia + router
├── router/index.ts      # Route definitions
├── views/               # Top-level pages
│   └── wizard/          # Wizard step components
├── components/          # Reusable components
│   └── ui/              # Shared UI patterns (UiCombobox, etc.)
├── stores/              # Pinia stores (auth, userProfile, exercises, etc.)
├── services/            # Domain services (spreadsheets, exercises, etc.)
└── assets/              # Static assets
```

## Key Integration Points

| Service | File | Notes |
|---------|------|-------|
| AI (Google GenAI) | `src/stores/ai.ts` | Uses `window.crypto.subtle` - mock in tests |
| Google Sheets | `src/services/spreadsheets.ts` | Uses `google-spreadsheet` |
| OAuth | `src/stores/auth.ts` | Uses `vue3-google-login` |
| Capacitor | `capacitor.config.ts` | Native plugins (haptics, keyboard, status-bar) |

## Security Notes

- Never log access tokens or sensitive data
- Use environment variables for API keys (see `.env`)

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

## References

- UI patterns: `src/components/ui/UiCombobox.vue`
- Store pattern: `src/stores/auth.ts`
- Test example: `src/services/trainingSummary.test.ts`
- Services: `src/services/spreadsheets.ts`
- Error handling: `src/services/exercises.ts`
