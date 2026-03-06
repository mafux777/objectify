---
type: epic
status: backlog
priority: high
owner:
created: 2026-03-02
target-quarter: Q1 2026
tags: [rendering, connectors, editor, ux, guide-layout]
---

# Diagram Rendering and Connectors

## Objective
Improve how connectors are routed and rendered in Objectify spec diagrams, especially for guide-based layouts. Connectors should be visually clear, avoid overlapping with nodes, and route intelligently through the whitespace between guidelines. This epic covers connector routing algorithms, new routing types, edge rendering improvements, and related UX polish.

## Success Criteria
- [ ] Connectors in guide-based layouts route through channels between guidelines by default
- [ ] Smooth-bend rendering with rounded corners (no sharp right angles)
- [ ] Multiple connectors sharing a channel are visually distinguishable (spread offset)
- [ ] Existing routing types (`straight`, `bezier`, `step`, `smoothstep`) remain available as overrides
- [ ] No regression in ELK or spatial layout connector rendering
- [ ] Performance holds on diagrams with 50+ edges

## User Impact
Diagrams become significantly easier to read. Connectors no longer hide behind unrelated nodes or pile up on guidelines. The visual quality gap between Objectify and hand-drawn diagrams shrinks.

## Stories
```dataview
TABLE status, priority, assignee
FROM "030-Stories"
WHERE epic = link(this.file.name)
SORT priority ASC
```

## Bugs
```dataview
TABLE status, priority, assignee
FROM "040-Bugs"
WHERE epic = link(this.file.name)
SORT priority ASC
```

## Open Questions
- Should connector routing eventually support full obstacle avoidance (around node bounding boxes), or is guide-channel routing sufficient?
- Interactive drag-to-reroute — is that a follow-up story under this epic or a separate epic?

## Notes
- Primary work happens on the main branch (no dedicated worktree yet)
- Key files: `CustomEdge.tsx`, `spec-to-flow.ts`, `guide-layout.ts`, `FlowDiagram.tsx`
- First story already filed: [[Magnetic repulsion connectors for guide-based layouts]]
