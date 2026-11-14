# Gainz AI - Agent Instructions

## Project Overview

- **Stack**: Vue 3.5, Pinia 4, Capacitor 8, TypeScript 6, Tailwind CSS 4, Reka UI, Zod 4, `neverthrow`.
- **Package Manager**: `pnpm` ONLY.
- **Architecture**: Strict Domain-Driven Design (DDD), enforced automatically by `src/modules/architecture.boundaries.test.ts`. Model the business using ubiquitous language. Keep aggregates small. The domain layer must have NO external or infrastructure dependencies.
- **Tone & Terminology**:
  - **Athletic & Scientific Nüchternheit**: Use clear, objective sports science and fitness terminology (e.g., progressive overload, RPE, e1RM, volume landmarks, fatigue indicators, athlete profile).
  - ❌ **NO Anime / Fantasy / Solo Leveling Jargon**: Strictly avoid terms like "Hunter", "Dungeon", "Awakening", "Quest", or roleplay mechanics in user-facing copy, prompts, or code comments. Keep the tone grounded, athletic, and professional.

## Architecture & Boundaries

```text
src/
├── main.ts                  # Entry point
├── router/                  # Vue Router config
├── views/                   # Route-level page views (only import module presentation facades)
├── shared/presentation/     # Cross-domain UI and composables (NO domain/app/infra imports)
│   ├── components/ui/       # Base HTML/Reka wrappers (Ui* prefix, stateless)
│   ├── components/          # Composite/layout components
│   └── composables/         # Shared Vue composables (e.g., useToast)
├── modules/                 # Bounded Contexts + architecture.boundaries.test.ts
│   ├── aiCoach/             # AI workout generation, mesocycle planning, exercise classification
│   ├── auth/                # Google OAuth & session state
│   ├── deload/              # Fatigue-driven deload lifecycle & snapshots
│   ├── events/              # Health/schedule events (sickness, travel, injury)
│   ├── migration/           # Schema & exercise weight data migrations
│   ├── platform/            # App-wide infra (Google Sheets, local storage, rest timer, sync)
│   ├── profile/             # Athlete profile, goals, equipment access, API keys
│   ├── sharedKernel/        # Cross-domain primitives, muscle groups, leveling
│   ├── trainingInsights/    # ACWR, e1RM, volume landmarks (MEV/MAV/MRV), fatigue triggers
│   ├── trainingLogs/        # Workout sessions, set logging, exercise history
│   └── trainingSummary/     # Aggregated session & weekly training summaries
│       ├── domain/          # Core business logic & types. NO external, UI, or infra imports.
│       ├── application/     # Use cases & ports. Imports domain. NO presentation or cross-module infra.
│       ├── infrastructure/  # External adapters (Sheets, GenAI, LocalStorage). NO presentation imports.
│       └── presentation/    # Pinia stores, view-model composables, module Vue components.
└── lib/                     # General utilities (e.g., cn() for Tailwind)
```

### Enforced Boundary Rules (`src/modules/architecture.boundaries.test.ts`)

- **Layer Facades Only**: Never import from deep module internals. Always use layer barrel facades (`@/modules/{module}/domain`, `@/modules/{module}/application`, `@/modules/{module}/presentation`).
- **Domain Isolation**: `domain/` production files may only import from their own module's domain or other modules' `domain` facades.
- **Application Isolation**: `application/` files must never import `presentation`, cross-module `infrastructure`, `localStorage`, or `google-spreadsheet`.
- **Cross-Module Store Rule**: Files in `presentation/stores/` may only import `domain` or `application` layers from their **own** module or `sharedKernel`. Cross-module communication in stores must go through other modules' `presentation` facades.
- **Views & Shared UI Isolation**: `src/views/` and `src/shared/presentation/` may only import `@/modules/{module}/presentation` facades.
- **Tab View Orchestration**: Top-level tab views (`HomeTab.vue`, `InsightsTab.vue`, `PlanTab.vue`, `CoachTab.vue`) must delegate state and orchestration to view-model composables (`use*ViewModel`) and **never** call `use*Store()` directly.
- **Delegate Decisions to Domain**: Infrastructure and presentation must **delegate** business decisions to the domain — never recompute them. If a domain aggregate already answers a question (e.g., `TrainingPlan` determining which session is next), outer layers must call that method rather than inlining duplicate logic.

## Engineering Workflow: Pocock (Architect) → Ponytail (Implementer)

All non-trivial feature development and refactoring follow a strict two-phase separation of concerns:

### Phase 1: The Architect (Matt Pocock Philosophy)

1. **Grill Ambiguities First**: If requirements or edge cases are unclear, ask 1–3 focused clarifying questions (`ask_question`) before locking in designs.
2. **Ubiquitous Language & Bounded Contexts**: Align strictly with `GLOSSARY.md`. Assign ownership to the proper module (`aiCoach`, `trainingInsights`, etc.). Domain models must be pure.
3. **Spec-Driven Design (`/to-spec`)**: Draft a concise specification across Gainz AI's 4 layers (`domain`, `application`, `infrastructure`, `presentation`).
4. **Tracer-Bullet Ticket Slicing (`/to-tickets`)**: Slice the spec into granular, dependency-ordered tickets (`Depends on: #...`) that each fit comfortably within a single LLM context window.

### Phase 2: The Implementer (Ponytail 5 Philosophy)

1. **The 7-Rung Decision Ladder**: Stop at the first viable rung before writing code:
   1. _Does this need to exist?_ (YAGNI – skip speculative features/helpers).
   2. _Already in this codebase?_ (Reuse `@/shared/presentation/components/`, `@/modules/sharedKernel`, `cn()`).
   3. _Stdlib does it?_ (Modern ES2024+ methods: `Object.groupBy`, `toSorted`, etc.).
   4. _Native platform / Capacitor feature?_ (HTML5 elements, CSS container queries, native plugins).
   5. _Installed dependency solves it?_ (`@vueuse/core`, `reka-ui`, `lucide-vue-next`, `neverthrow`, `zod`).
   6. _Can it be one readable line?_ (Avoid multi-file wrapper wrappers).
   7. _Only then:_ Write the minimum amount of custom code that works.
2. **Red-Green-Refactor Loop (`/tdd`)**:
   - Write one focused failing unit test (`*.test.ts`) at the public seam **first**.
   - Write the minimum viable code to make it green.
   - Run `pnpm test:unit` and verify `src/modules/architecture.boundaries.test.ts` remains green.
3. **Non-Negotiable Safety Rails**:
   - Never compromise on DDD layer isolation (`architecture.boundaries.test.ts`).
   - Never swallow errors; use typed `neverthrow` Result/ResultAsync chains.
   - Always validate external data through Zod schemas (ACL) at network/storage boundaries.
   - Strictly adhere to Design Tokens (`rounded-xl`, `active:scale-95`, typography scale).

## Agent skills

### Issue tracker

Issues and tracer-bullet tickets are tracked locally under `.agents/tickets/` with optional GitHub issue sync (`Snapu/gainz-ai`). See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context repository layout centered around `GLOSSARY.md` and strict DDD bounded contexts (`src/modules/*`). See `docs/agents/domain.md`.

## Key Integration Points

- **AI (Google GenAI via Supabase Edge Function)**:
  - Infrastructure adapters: `src/modules/aiCoach/infrastructure/requestCoachingAdvice.ts`, `classifyExercises.ts`, and `aiEdgeClient.ts` calling Supabase `ai-coach` Edge Function (server-side `gemini-3.8-flash` with `gemini-2.5-flash` fallback).
  - Anti-Corruption Layer (ACL): `src/modules/aiCoach/infrastructure/CoachingAdviceTranslator.ts` (Zod validation into `CoachingAdvice` domain model).
  - Presentation orchestration: `src/modules/aiCoach/presentation/stores/aiOrchestratorStore.ts`, `coachChatStore.ts`, and `trainingPlanStore.ts`.
- **Google Sheets & Offline Sync**: `src/modules/platform/infrastructure/spreadsheets.ts` (`google-spreadsheet`) and `src/modules/platform/presentation/composables/offlineSyncedStore.ts`. Do NOT leak `google-spreadsheet` outside infrastructure.
- **Auth**: `src/modules/auth/presentation/stores/authStore.ts` and `src/modules/auth/infrastructure/googleOAuthClient.ts` (`vue3-google-login`).
- **Capacitor**: `capacitor.config.ts` for native plugins (`@capacitor/app`, `@capacitor/core`, `@capacitor/keyboard`, `ios-haptics`).

## Coding Standards

1. **TypeScript**: Strict mode (`~6.0.3`). Explicit return types for exported functions. NO `any` (use `unknown` and type guards).
2. **Simplicity (Ponytail 5)**: The best code is the code you never wrote. Stop over-engineering. Enforce the 7-rung decision ladder (YAGNI → Codebase reuse → Stdlib → Native platform → Installed deps → One-liner → Minimal code). Avoid premature abstractions, duplicate helper functions, and wrapper layers that only pass calls through.
3. **Vue & State**: `<script setup lang="ts">` exclusively. Props down, events up. Prefer local `ref`/`reactive` for UI state. Extract view orchestration and reusable logic to composables (`use*ViewModel`). Use Pinia ONLY for cross-component domain state (`defineStore` setup pattern).
4. **Error Handling (`neverthrow`)**: Prefer `.map()`/`.andThen()`/`.orElse()`/`.andTee()` expressive chains over manual `.isErr()` branching. Use semantic error unions (e.g., `'missing-api-key' | 'coaching-request-failed'`) rather than generic strings or thrown exceptions.
5. **Formatting/Linting**: Biome (`biome.json`). 2 spaces, 100 char line width, double quotes. Run `pnpm lint`, `pnpm format`, `pnpm type-check`, and `pnpm test:unit`.

## Testing

- **Framework**: Vitest + `@vue/test-utils`. Co-located suffix `*.test.ts`.
- **Architecture Verification**: Always ensure `src/modules/architecture.boundaries.test.ts` passes when adding or moving imports.

## Design Tokens

### Border Radius

- `rounded-lg`: Small elements (nav, input spinners, toaster buttons).
- `rounded-xl`: Standard components (cards, buttons, toggles, modals, inputs).
- `rounded-full`: Circles only (icon buttons, badges, radial progress).
- ❌ DO NOT use: `rounded-md`, `rounded-2xl`, `rounded-3xl`.

### Transitions & Animations

- `duration-200`: Fast feedback (hovers, quick interactions).
- `duration-300`: Standard animations (overlays, layout shifts).
- ❌ DO NOT use: `duration-100`, `duration-500`, `duration-1000`.

### Interactive States

- **Hover**: `hover:bg-white/5` (subtle), `hover:bg-white/10` (medium), `hover:bg-white/15` (bold/emphasis).
  - ❌ DO NOT use: `/[0.04]`, `/7`, `/12`, `/20`.
- **Active**: `active:scale-95` (all interactive elements), `active:bg-white/15` (background intensification).
  - ❌ DO NOT use: `active:scale-90`, `active:scale-[0.98]`, `active:scale-110`.
- **Disabled**: Must use `disabled:opacity-50 disabled:pointer-events-none disabled:cursor-not-allowed`.
- **Focus**: Must use `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background`.
  - ❌ DO NOT use: `focus:outline`, `focus-visible:border`, non-standard rings.

### Typography

- **Sizes & Scale**:
  - `text-micro` (or `text-[10px] font-bold uppercase tracking-wider`): Allowed exclusively for micro-labels, stat keys ("SETS", "TONNAGE"), superset badges, and table column headers.
  - `text-xs`: Helper text, timestamps, captions.
  - `text-sm`: Controls, list items, button labels.
  - `text-sm font-bold text-foreground`: Card/Section Headings (`<h3 class="text-sm font-bold text-foreground">Heading</h3>`).
  - `text-base`: Body text, chat bubbles, notes.
  - `text-lg font-black tracking-tight`: Top-level Tab Page Titles in `AppHeader`.
  - `text-xl font-black tracking-tight`: Hero Card Titles (Rank, Mesocycle).
  - `text-2xl font-black tabular-nums tracking-tight`: Primary KPI values (Sets, Volume, Timer, Level).
  - `text-3xl font-black tabular-nums tracking-tight`: Hero KPI values (Readiness / Fatigue Score).
  - ❌ DO NOT use: Custom pixel font sizes outside `text-micro`.
- **Weights**:
  - `font-medium`: Helper text, metadata.
  - `font-semibold`: Controls, chips, form labels.
  - `font-bold`: Section titles, key values, emphasis.
  - `font-black`: Hero metrics, brand, and tab page titles.
  - ❌ DO NOT use `font-normal` in UI components.

### Spacing & Layout

- **Page Shell**: Top-level tab views must use:
  `<main class="flex-1 w-full max-w-2xl mx-auto px-4 pt-4 pb-28 overflow-y-auto no-scrollbar flex flex-col gap-5">`
- **Header Brand & Titles**: All main tabs (HomeTab, PlanTab, CoachTab, InsightsTab) display the athletic brand hero logo (`<h1 class="text-2xl font-black italic tracking-tighter">Gainz<span class="text-primary">AI</span></h1>`).
- **Gaps**: `gap-2`, `gap-3`, `gap-4`, `gap-5`, `gap-6` (0.5rem steps). Standard section gap is `gap-5`.
- **Card Padding**: Standard `p-4` (Hero cards use `p-5`).
- **Margins**: `mb-3`, `mb-4`, `mt-2`.
- ❌ DO NOT use: `gap-1.5`, `px-2 py-6`, `mb-5`.

### Shadows

- `shadow-sm`: Subtle depth (cards, light elevation).
- `shadow-lg`: Prominent depth (modals, dropdowns, floating panels).
- ❌ DO NOT use: `shadow-md`, colored shadows, `shadow-inner`.

### Surfaces & Status Colors

- **Surfaces**:
  - Level 1 (Cards): Always wrap standalone content blocks in `<UiCard>`.
  - Level 2 (Nested insets/rows): Use `bg-white/5 border border-white/5 rounded-xl`.
  - Training Plans: Use dense, structured row lists / flex rows with hairline dividers (`divide-white/5`), uppercase micro-headers, and continuous vertical superset indicator lines for mobile-optimized high-density scanning. (Do not use rigid HTML `<table>` elements).
- **Status Surfaces (Dark Mode)**:
  - **Success**: `bg-emerald-500/10 border-emerald-500/20 text-emerald-400`
  - **Warning**: `bg-orange-500/10 border-orange-500/20 text-orange-400`
  - **Danger**: `bg-red-500/10 border-red-500/20 text-red-400`
  - **Info / Accent**: `bg-primary/10 border-primary/20 text-primary`
  - ❌ DO NOT use raw Tailwind colors like `amber-500`, `cyan-400`, or raw `oklch(...)` inline (except chart-coordinated legend dots).

### Components

- **Empty States**: Always use `<EmptyState>`. ❌ DO NOT create inline ad-hoc empty states.
- **Section Headers**: Use `<SectionHeader title="..." subtitle="..." />` or standard `<h3 class="text-sm font-bold text-foreground">` with `mb-3`.
- **Icon Buttons**: Use exactly `class="rounded-full p-2.5 bg-white/5 hover:bg-white/10 transition-colors focus:outline-none focus:ring-2 focus:ring-primary active:scale-95"`.
- **Selection**: Use `UiToggleGroup` + `UiToggleGroupItem` (default variant). Do not mix with `ClickableList` or create custom selection components.
- **Chips/Badges**: Always use `<UiBadge>`. Never use custom spans with inline colors. Add `uppercase tracking-wider` for short statuses.
- **Loaders & Skeletons**: Always use `<UiTelemetryLoader text="..." />` for asynchronous loading and background calibration states. ❌ DO NOT use flashing grey skeleton placeholder boxes.
- **Exercise Progression**: Use `<UiProgressionLine>` for set-by-set history curves. ❌ DO NOT use legacy bar charts (`UiBarGraph` has been removed).

### Iconography & Directional Indicators

- **Chevrons (`ChevronRight` / `ChevronDown`)**: Used exclusively for **hierarchical drill-downs, list navigation, and disclosure**:
  - Tappable table/set rows that open a detail view/sheet (e.g. set log edit row).
  - Submenu drill-downs (e.g. `GlobalHeaderActions`).
  - Accordion / disclosure triggers (`ChevronDown`).
  - ❌ DO NOT use chevrons on action execution buttons (e.g. `Log Set` action button must NOT have a `ChevronRight`).
- **Arrows (`ArrowRight` / `ArrowLeft` / `ArrowUp`)**: Used exclusively for **context transitions, directional movement, and actions**:
  - Cross-tab or cross-page transitions (e.g. `Open in Train Tab` uses `<ArrowRight class="w-3.5 h-3.5" />`).
  - Submitting input forms (e.g. chat send uses `<ArrowUp class="w-5 h-5" />`).
  - Back navigation in headers (`ArrowLeft`).
  - Trend direction indicators in metrics (e.g. `ArrowRight` for flat plateau trend).
- **Primary Action Buttons**: Action execution buttons (e.g. `Log Set 1`, `Save`, `Start`) should rely on clear typographic labels and appropriate variant styles without redundant trailing chevrons.
