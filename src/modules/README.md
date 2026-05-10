# Modules

This folder contains bounded-context modules using layered architecture.

Layer intent:
- domain: framework-agnostic business types/rules
- application: use-cases and orchestration contracts
- infrastructure: external adapters (APIs, persistence)
- presentation: Vue/Pinia views, stores, composables

Migration status:
- Module-first structure is active.
- Shared UI/presentation infrastructure lives in `src/shared/presentation`.
- Avoid deep imports from module internals; use layer facades:
  - `@/modules/{name}/domain`
  - `@/modules/{name}/application`
  - `@/modules/{name}/presentation`
