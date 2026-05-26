# Promotion Guidance

Information should flow **upward deliberately** between continuity layers.

## Flow

```text
session/  →  recent/  →  project/CONTINUITY.md  →  (optional) operator global docs
```

## Promotion criteria

| From | To | When |
|------|-----|------|
| Session | Recent | Fact matters beyond this sitting but not yet project-wide |
| Recent | Project | Decision/constraint will affect future features or agents |
| Project | Operator global | Truly cross-project and safe to share (no secrets) |

## Do not promote

- Transient debugging noise
- Unconfirmed assumptions (mark provisional in project layer first)
- Person-specific phrasing that does not generalize

## Demotion / cleanup

When promoted, leave a short pointer in the lower layer ("see project/CONTINUITY.md § X") and remove duplicate prose to avoid drift.
