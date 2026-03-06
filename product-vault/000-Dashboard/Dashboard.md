# Product Dashboard

## In Progress
```dataview
TABLE type, priority, assignee, sprint, due
FROM "020-Epics" OR "030-Stories" OR "040-Bugs" OR "050-Tasks"
WHERE status = "in-progress"
SORT priority ASC
```

## In Review
```dataview
TABLE type, priority, assignee, sprint
FROM "030-Stories" OR "040-Bugs" OR "050-Tasks"
WHERE status = "review"
SORT priority ASC
```

## Ready (Up Next)
```dataview
TABLE type, priority, assignee, sprint
FROM "030-Stories" OR "040-Bugs" OR "050-Tasks"
WHERE status = "ready"
SORT priority ASC
```

## Backlog — High Priority
```dataview
TABLE type, assignee, epic
FROM "030-Stories" OR "040-Bugs" OR "050-Tasks"
WHERE status = "backlog" AND (priority = "critical" OR priority = "high")
SORT priority ASC
```

## Open Bugs
```dataview
TABLE priority, severity, assignee, status
FROM "040-Bugs"
WHERE status != "done" AND status != "cancelled"
SORT severity ASC
```

## Active Epics
```dataview
TABLE status, priority, owner, target-quarter
FROM "020-Epics"
WHERE status != "done" AND status != "cancelled"
SORT priority ASC
```

## Recently Completed (Last 14 Days)
```dataview
TABLE type, priority, assignee
FROM "030-Stories" OR "040-Bugs" OR "050-Tasks"
WHERE status = "done"
SORT file.mtime DESC
LIMIT 15
```
