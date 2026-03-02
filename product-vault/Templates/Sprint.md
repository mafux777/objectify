---
type: sprint
status: planned
start: <% tp.date.now("YYYY-MM-DD") %>
end: <% tp.date.now("YYYY-MM-DD", 14) %>
goal:
tags: []
---

# <% tp.file.title %>

## Sprint Goal
<!-- One sentence: what does this sprint deliver? -->


## Committed Items
```dataview
TABLE type, status, priority, assignee, estimate
FROM "030-Stories" OR "040-Bugs" OR "050-Tasks"
WHERE sprint = link(this.file.name)
SORT priority ASC
```

## Capacity
| Team Member | Available Days | Allocated Points |
|-------------|---------------|-----------------|
|             |               |                 |

## Risks / Blockers
-

## Daily Notes
### Day 1
-

## Outcome
<!-- Fill at sprint end -->
- **Velocity:**
- **Completed:**
- **Carried Over:**

