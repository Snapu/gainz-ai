---
name: to-spec
description: >-
  Turn an idea, bug report, or feature request into a concise, testable DDD specification across
  Gainz AI's bounded contexts before writing code. Trigger via /to-spec or when planning a multi-layer
  feature across domain, application, infrastructure, and presentation.
---

# Spec-Driven DDD Planning (`/to-spec`)

Before implementing a non-trivial feature or architectural change in Gainz AI, produce a compact, actionable specification that aligns with `.agents/AGENTS.md` and `src/modules/architecture.boundaries.test.ts`.

## Step 1: Interrogate Ambiguities (Grill First)
If requirements have unresolved branches (e.g., edge cases in fatigue triggers, offline sync behavior, or mid-workout plan mutations), ask 1–3 targeted clarifying questions before locking the spec.

## Step 2: Map Bounded Contexts & Layer Contracts
Structure the spec around Gainz AI's strict 4-layer DDD boundaries:

1. **Ubiquitous Language & Bounded Context(s)**
   - Which module(s) own this behavior? (`aiCoach`, `auth`, `deload`, `events`, `migration`, `platform`, `profile`, `sharedKernel`, `trainingInsights`, `trainingLogs`, `trainingSummary`)
   - Does any cross-domain primitive belong in `sharedKernel`?
2. **Domain Layer (`domain/`)**
   - What entities, value objects, or aggregate methods own the business decision?
   - What invariants must hold? (Zero external/infra imports).
   - What semantic error union types (`type FeatureError = ...`) represent domain failures?
3. **Application Layer (`application/`)**
   - What use-case functions or ports orchestrate the domain logic using `neverthrow` (`Result` / `ResultAsync` chains via `.map()`, `.andThen()`, `.orElse()`)?
4. **Infrastructure Layer (`infrastructure/`)** *(if applicable)*
   - What external adapter (`@google/genai`, `google-spreadsheet`, `localStorage`) or Anti-Corruption Layer (Zod translator) is needed?
5. **Presentation Layer (`presentation/` & `views/`)**
   - Which Pinia store (`presentation/stores/`) or view-model composable (`use*ViewModel`) exposes this to the UI?
   - Verify: Top-level tab views (`HomeTab`, `InsightsTab`, `PlanTab`, `CoachTab`) must only call `use*ViewModel`, never `use*Store()` directly.
   - Verify: Stores only import `domain`/`application` from their own module or `sharedKernel`; cross-module access uses `presentation` facades.

## Step 3: Red-Green-Refactor Test Plan
List the failing unit tests (`*.test.ts`) to write **first** at each layer (starting with pure `domain/` tests, then `application/` use-case tests, plus verifying `src/modules/architecture.boundaries.test.ts`).
