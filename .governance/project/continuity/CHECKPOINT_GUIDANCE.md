# Checkpoint Guidance

## Required triggers

Write a compact checkpoint when any of these occur:

- New human instruction or correction
- Material decision (architecture, scope, trade-off)
- Blocker or open loop discovered
- Task phase change (plan → implement → verify → document)
- Prolonged multi-step execution without a checkpoint
- Compaction or handoff risk (context window, agent swap, end of session)

## What to capture

- Current objective and spec/issue link
- Decisions made (with rationale one line each)
- Blockers and exact next actions
- Verification state (what passed / what failed)
- Open loops not yet in backlog

## Where to write

| Urgency | Location |
|---------|----------|
| Same session | `session/CURRENT.md` |
| Survives today | `recent/YYYY-MM-DD.md` |
| Durable for project | `project/CONTINUITY.md` |

## Anti-patterns

- Relying on chat history as the only record
- End-of-day-only updates after long silent runs
- Pasting full transcripts instead of structured facts
