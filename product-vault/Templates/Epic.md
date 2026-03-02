---
type: epic
status: backlog
priority: medium
owner:
created: <% tp.date.now("YYYY-MM-DD") %>
target-quarter:
tags: []
---

# <% tp.file.title %>

## Objective
<!-- What does this epic accomplish? Why does it matter? -->


## Success Criteria
- [ ]


## User Impact
<!-- Who benefits and how? -->


## Stories
<!-- Link stories that belong to this epic -->
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
-

## Notes

