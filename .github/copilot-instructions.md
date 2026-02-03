## Purpose

This file gives focused, actionable guidance for AI coding agents working on this Ionic + Vue + Capacitor project so they can be immediately productive. It documents the app architecture, developer workflows, project-specific patterns, and important integration points with concrete file references and short examples.

Quick start (what to run)

- Use the repo's package manager (pnpm is used here; a lockfile exists):
  - Install: `pnpm install`
  - Dev server: `pnpm dev` (runs `vite`)
  - Build: `pnpm run build` (note: `build` runs `type-check` and `build-only` in parallel)
  - Preview production build: `pnpm run preview`
  - Unit tests: `pnpm run test:unit` (Vitest)
  - Lint/format: `pnpm run lint` / `pnpm run format`
  - Type check: `pnpm run type-check` (uses `vue-tsc`)

Project high-level architecture

- Frameworks: Vue 3 + Ionic Vue + Pinia (state management) + Capacitor for native features.
- Entry: `src/main.ts` — mounts Ionic + Pinia + router and contains the top-level watch that drives app navigation based on auth, profile setup, and spreadsheet state.
- Views: `src/views/` — top-level pages. Wizard steps live under `src/views/wizard/` (each step is one component/route).
- UI: `src/components/` — reusable components; `src/components/ui/` contains shared UI patterns (e.g. `UiCombobox.vue`).
- Stores: `src/stores/` — Pinia stores (useXxxStore pattern). Examples: `auth.ts`, `userProfile.ts`, `exerciseLogs.ts`, `ai.ts`.
- Services: `src/services/` — small domain/service files (e.g. `spreadsheets.ts`, `exercises.ts`, `exerciseLogs.ts`) that encapsulate external API logic.

Key integration points

- AI: `@google/genai` used in `src/stores/ai.ts`. The store composes JSON payloads and streams markdown into the DOM. Note: code uses `window.crypto.subtle.digest` — unit tests must mock or polyfill this.
- Google Sheets: `google-spreadsheet` is used in `src/services/spreadsheets.ts` for spreadsheet access.
- OAuth / keys: `src/oauth2.keys.json` contains OAuth-related data used during development — treat as sensitive.
- Capacitor: `capacitor.config.ts` + the `@capacitor/*` dependencies are present — native plugins (keyboard, haptics, status-bar) are used.

Project-specific conventions & patterns (concrete, reproducible)

- Script setup + TS: components use `<script setup lang="ts">` across the codebase. Follow that pattern when adding components.
- Imports: Ionic components are imported individually from `@ionic/vue` (e.g. `IonModal`, `IonSearchbar`) for clarity and tree-shaking.
- Model binding: some components use `defineModel` for two-way bindings (see `UiCombobox.vue`). When editing component APIs, preserve the `defineProps` / `defineModel` contract.
- Ionic modal & refs: opening modals calls the underlying web component element: `modalRef.value?.$el.present()` and `searchbarRef.value?.$el.setFocus()` — follow this pattern when interacting with Ionic web components.
- Events: components emit concise domain events like `'selected'` and `'deleted'` (see `UiCombobox.vue`) — prefer using these small, descriptive event names.
- Stores: Pinia stores are defined with `defineStore('name', () => { ... })` returning functions and refs; consumers call `useXxxStore()` directly (see `src/main.ts` usage).

Testing notes

- Unit tests run with Vitest + @vue/test-utils. Ionic web components and browser APIs are lightly used in the UI; tests typically need to stub or mock:
  - Ionic components (or mount components with global stubs in your test setup).
  - `window.crypto.subtle` used in `src/stores/ai.ts` — mock `subtle.digest` or stub `generateCacheKey` in tests.

Build & CI specifics

- Build runs `vue-tsc --build` as part of `type-check` and then `vite build`. The top-level `build` script uses `run-p` (`npm-run-all2`) to parallelize tasks. CI should run `pnpm run type-check` before `pnpm run build` or rely on the `build` script which bundles both.

Where to look for concrete examples

- UI + Ionic patterns: `src/components/ui/UiCombobox.vue` (modal/searchbar pattern, emitted events)
- AI integration: `src/stores/ai.ts` (streaming markdown, Google GenAI usage)
- App flow / routing: `src/main.ts` (watch that routes based on store state) and `src/router/index.ts` (route list and wizard step routes)
- Services: `src/services/spreadsheets.ts` (Google Sheets auth & usage)

Do NOT assume

- Secrets are present safely — `src/oauth2.keys.json` may contain keys; treat as sensitive and do not print values.
- Tests run without additional setup — a browser-like environment and small mocks may be required.

If you need more details

- Ask for target area (UI, store, service, or CI) and I will update these instructions with examples, helper snippets, and test fixtures.

Feedback

- Please review for missing references or patterns you rely on and I will iterate.
