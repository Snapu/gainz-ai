# Domain Documentation & Architecture Layout

This file specifies where domain models, ubiquitous language, and architectural decisions reside in Gainz AI for consumption by engineering skills.

---

## 1. Ubiquitous Language & Core Glossary
- **Location**: `GLOSSARY.md` (root)
- **Role**: Authoritative dictionary of business terms, sport science metrics (`VolumeLandmarks`, `ACWR`, `e1RM`, `RIR`, `FatigueTrigger`, `DeloadPhase`), and Bounded Context definitions.

---

## 2. Bounded Contexts
- **Location**: `src/modules/{module}/`
- **Available Contexts**:
  - `aiCoach`: AI mesocycle planning and coaching advice
  - `trainingInsights`: Volume landmarks, ACWR, fatigue detection
  - `trainingLogs`: Workout sessions and set logging
  - `trainingSummary`: Aggregated session and weekly tonnage rollups
  - `deload`: Fatigue-driven deload lifecycles and snapshots
  - `events`: Health and schedule disruptions (sickness, injury, travel)
  - `profile`: Athlete biometrics, lifting experience, equipment access
  - `sharedKernel`: Shared domain primitives (muscle groups, fatigue trigger IDs, dates)
  - `platform`: Infrastructure (Google Sheets sync, LocalStorage, rest timer)
  - `auth`: Google OAuth and session state
  - `migration`: Schema migrations and upcasters

---

## 3. Architectural Rules & Seams
- **Architecture Test**: `src/modules/architecture.boundaries.test.ts` (enforces strict layer facades and dependency boundaries).
- **ADRs (Architectural Decision Records)**: `docs/adr/` (consulted before re-litigating design decisions).
- **Layering Model**: 4 strict layers (`domain/`, `application/`, `infrastructure/`, `presentation/`).
