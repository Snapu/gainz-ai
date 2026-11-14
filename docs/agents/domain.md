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
  - `aiCoach`: AI mesocycle planning, exercise classification, and coaching advice
  - `trainingInsights`: Volume landmarks (MEV/MAV/MRV), ACWR, e1RM, fatigue triggers
  - `trainingLogs`: Workout sessions, set logging, and exercise history
  - `trainingSummary`: Aggregated session and weekly volume/tonnage rollups
  - `deload`: Fatigue-driven deload lifecycles and snapshots
  - `events`: Health and schedule disruptions (sickness, injury, travel)
  - `profile`: Athlete biometrics, lifting experience, equipment access
  - `sharedKernel`: Shared domain primitives (muscle groups, fatigue trigger IDs, leveling)
  - `platform`: Infrastructure (Google Sheets sync, LocalStorage, rest timer, Supabase config)
  - `auth`: Google OAuth 2.0, token management, session state
  - `migration`: Schema migrations and upcasters

---

## 3. Architectural Rules & Seams
- **Architecture Test**: `src/modules/architecture.boundaries.test.ts` (enforces strict layer facades and dependency boundaries).
- **ADRs (Architectural Decision Records)**: `docs/adr/` (consulted before re-litigating design decisions).
- **API Documentation**: `docs/api/` (Supabase backend Edge Functions and contracts).
- **Layering Model**: 4 strict layers (`domain/`, `application/`, `infrastructure/`, `presentation/`).
