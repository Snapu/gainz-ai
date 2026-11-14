# Issue Tracker Configuration

This file configures where and how engineering skills (like `/to-tickets`, `/to-spec`, `/implement`) store and manage issues/tickets for Gainz AI.

---

## 1. Primary Mode: Local Markdown Tickets

When working inside the IDE or sandboxed agent sessions, tickets are created as local markdown files to remain version-controlled, offline-capable, and easily reviewable.

- **Directory**: `.agents/tickets/`
- **Naming Pattern**: `TICKET-[NNN]-[kebab-case-title].md` (e.g., `TICKET-001-plan-cycle-normalization.md`)
- **Format**: Conforms to the standard ticket template defined in `.agents/skills/to-tickets/SKILL.md`.

---

## 2. Remote Mode: GitHub Issues

When online and user explicitly requests syncing to GitHub:
- **Repository**: `Snapu/gainz-ai`
- **Tooling**: GitHub CLI (`gh issue create --title "..." --body "..." --label "..."`)
- **Labels**:
  - `domain`: Pure business logic / invariants
  - `application`: Use cases / ResultAsync orchestration
  - `infrastructure`: Sheets / GenAI / LocalStorage
  - `presentation`: UI / ViewModel / Reka UI
  - `tracer-bullet`: Vertical slice
