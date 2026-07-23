# Gainz AI - Agent Instructions

## Project Overview
- **Stack**: Vue 3, Pinia, Capacitor, TypeScript, Tailwind CSS, Reka UI.
- **Package Manager**: `pnpm` ONLY.
- **Architecture**: Strict Domain-Driven Design (DDD). Model the business using ubiquitous language. Keep aggregates small. The domain layer must have NO external dependencies.

## Architecture & Boundaries
```text
src/
├── main.ts                  # Entry point
├── router/                  # Vue Router config
├── views/                   # Page-level route components
├── shared/presentation/     # Cross-domain UI and composables (No domain imports allowed)
│   ├── components/ui/       # Base HTML/Reka wrappers (Ui* prefix, stateless)
│   ├── components/          # Composite/layout components
│   └── composables/         # Shared Vue composables (e.g., useToast)
├── modules/                 # Bounded Contexts (auth, aiCoach, trainingLogs, platform, sharedKernel)
│   └── {module_name}/
│       ├── domain/          # Core business logic & types. NO external or infra imports.
│       ├── application/     # Use cases. Imports from domain. NO infra imports.
│       ├── infrastructure/  # External adapters (Sheets, GenAI).
│       └── presentation/    # Pinia stores, Vue components for this module.
└── lib/                     # General utilities (e.g., cn() for Tailwind)
```
- **Rule**: Never import from deep module internals. Use layer facades (e.g., `import { useAuthStore } from '@/modules/auth/presentation'`).
- **Rule**: `sharedKernel` is for cross-domain logic. `platform` is for app-wide infra (Spreadsheets, local storage).
- **Rule**: Infrastructure and presentation must **delegate** business decisions to the domain — never recompute them. If a domain aggregate already answers a question (e.g., "which session is next?"), outer layers must call that method, not inline their own logic. Duplicated decision logic drifts silently.

## Key Integration Points
- **AI (Google GenAI)**: `src/modules/aiCoach/presentation/stores/aiStore.ts`. Tests must mock `window.crypto.subtle`.
- **Google Sheets**: `src/modules/platform/infrastructure/spreadsheets.ts` using `google-spreadsheet`. Do NOT leak this library to the application layer.
- **Auth**: `src/modules/auth/presentation/stores/authStore.ts` using `vue3-google-login`.
- **Capacitor**: `capacitor.config.ts` for native plugins (haptics, keyboard, status-bar).

## Coding Standards
1. **TypeScript**: Strict mode. Explicit return types for functions. NO `any` (use `unknown` if needed).
2. **Simplicity**: Do not over-engineer. Write lean, readable code. Avoid premature abstractions. Solve the immediate problem simply rather than building complex generic systems for hypothetical future needs.
3. **Vue & State**: `<script setup lang="ts">` exclusively. Props down, events up. Prefer local `ref`/`reactive` for UI state. Extract reusable logic to composables. Use Pinia ONLY for cross-component domain state (`defineStore` setup pattern).
4. **Error Handling (neverthrow)**: Prefer `.map()`/`.andThen()` expressive chains over manual `.isErr()` branching. Use semantic error unions (e.g., `'user-not-found' | 'db-error'`) rather than generic strings.
5. **Formatting/Linting**: Biome (`biome.json`). 2 spaces, 100 char line width, double quotes. Run `pnpm lint` and `pnpm format`.

## Testing
- **Framework**: Vitest + `@vue/test-utils`. Suffix `*.test.ts`.

## Design Tokens

## Border Radius
- `rounded-lg`: Small elements (nav, input spinners, toaster buttons).
- `rounded-xl`: Standard components (cards, buttons, toggles, modals, inputs).
- `rounded-full`: Circles only (icon buttons, badges, radial progress).
- ❌ DO NOT use: `rounded-md`, `rounded-2xl`, `rounded-3xl`.

## Transitions & Animations
- `duration-200`: Fast feedback (hovers, quick interactions).
- `duration-300`: Standard animations (overlays, layout shifts).
- ❌ DO NOT use: `duration-100`, `duration-500`, `duration-1000`.

## Interactive States
- **Hover**: `hover:bg-white/5` (subtle), `hover:bg-white/10` (medium), `hover:bg-white/15` (bold/emphasis).
  - ❌ DO NOT use: `/[0.04]`, `/7`, `/12`, `/20`.
- **Active**: `active:scale-95` (all interactive elements), `active:bg-white/15` (background intensification).
  - ❌ DO NOT use: `active:scale-90`, `active:scale-[0.98]`, `active:scale-110`.
- **Disabled**: Must use `disabled:opacity-50 disabled:pointer-events-none disabled:cursor-not-allowed`.
- **Focus**: Must use `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background`.
  - ❌ DO NOT use: `focus:outline`, `focus-visible:border`, non-standard rings.

## Typography
- **Sizes**:
  - `text-xs`: Small labels, captions (replaces `text-[9px]`, `text-[10px]`).
  - `text-sm`: Standard labels, buttons, card/tab headers.
  - `text-base`: Body text.
  - `text-lg`: Prominent section headers, empty state titles.
  - `text-xl`: Page titles.
  - ❌ DO NOT use: Custom pixel sizes.
- **Weights**:
  - `font-medium`: Helper text, metadata.
  - `font-semibold`: Controls, chips, form labels.
  - `font-bold`: Section titles, key values, emphasis.
  - `font-black`: Hero/brand moments ONLY.
  - ❌ DO NOT use `font-normal` in UI components.
- **Card/Section Headings**: Use exactly `<h3 class="text-sm font-bold text-foreground">Heading</h3>`.

## Spacing & Layout
- **Gaps**: `gap-2`, `gap-3`, `gap-4`, `gap-5`, `gap-6` (0.5rem steps).
- **Padding**: `px-4 py-3` or `px-5 py-4` (Standard proportional sizes).
- **Margins**: `mb-3`, `mb-4`, `mt-2`.
- ❌ DO NOT use: `gap-1.5`, `px-2 py-6`, `mb-5`.

## Shadows
- `shadow-sm`: Subtle depth (cards, light elevation).
- `shadow-lg`: Prominent depth (modals, dropdowns, floating panels).
- ❌ DO NOT use: `shadow-md`, colored shadows, `shadow-inner`.

## Components
- **Icon Buttons**: Use exactly `class="rounded-full p-2.5 bg-white/5 hover:bg-white/10 transition-colors focus:outline-none focus:ring-2 focus:ring-primary active:scale-95"`.
- **Selection**: Use `UiToggleGroup` + `UiToggleGroupItem` (default variant). Do not mix with `ClickableList` or create custom selection components.
- **Chips/Badges**: Always use `<UiBadge>`. Never use custom spans with inline colors. Add `uppercase tracking-wider` for short statuses.
