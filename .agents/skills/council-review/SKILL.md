---
name: council-review
description: >-
  Run a multi-perspective triad review (Elite Coach, Sports Science Professor, and Principal AI Architect)
  on training features, AI coach prompts, domain formulas, or UX flows. Trigger via /council-review or when
  the user asks to evaluate a feature from coaching, sports science, and architectural perspectives.
---

# Gainz AI Council Review (Triad Evaluation)

Evaluates a proposed feature, domain model, AI prompt, or code diff through three competing domain lenses to ensure Gainz AI stays scientifically sound, gym-practical, and architecturally clean.

## The Three Perspectives

Read the detailed directives in `references/` when conducting the review or pass them to parallel `research` subagents:

1. **[Elite Coach](references/elite-coach.md)** — Practical gym UX, sweaty-hands ergonomics, workout logistics (no absurd cross-gym supersets), and athlete psychology/adherence.
2. **[Sports Science Professor](references/sports-science-professor.md)** — Exercise physiology, biomechanics, hypertrophy mechanisms (mechanical tension, SFR, MEV/MAV/MRV volume landmarks, ACWR, CNS fatigue, periodization).
3. **[Principal AI Architect](references/principal-ai-architect.md)** — Strict DDD boundaries (`src/modules/architecture.boundaries.test.ts`), `neverthrow` composition, LLM token efficiency, and resolving tension between theory and UX.

## Execution Workflow

1. **Scope the Target**: Identify the files, domain logic (e.g., `trainingInsights`, `aiCoach`, `deload`, `trainingLogs`), or feature proposal under review.
2. **Parallel Subagent Evaluation (Recommended for deep reviews)**:
   - Launch three `research` subagents in parallel using `invoke_subagent`, assigning one persona from `references/` to each.
   - For quick reviews, evaluate sequentially using the three lenses directly.
3. **Structured Output**:
   - **🏋️ Elite Coach Verdict**: Practicality, UX friction, and gym-floor reality check.
   - **🔬 Sports Science Professor Verdict**: Physiological accuracy, formulas, and volume/fatigue critique.
   - **🏛️ Principal AI Architect Synthesis**: DDD boundary check, `neverthrow` & token efficiency review, and the final **90% value / 10% complexity** resolution where the Coach and Professor disagree.
