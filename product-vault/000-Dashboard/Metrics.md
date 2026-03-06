# Metrics

## Items by Status
```dataview
TABLE length(rows) AS Count
FROM "030-Stories" OR "040-Bugs" OR "050-Tasks"
GROUP BY status
```

## Items by Priority
```dataview
TABLE length(rows) AS Count
FROM "030-Stories" OR "040-Bugs" OR "050-Tasks"
WHERE status != "done" AND status != "cancelled"
GROUP BY priority
```

## Items by Assignee
```dataview
TABLE length(rows) AS Count
FROM "030-Stories" OR "040-Bugs" OR "050-Tasks"
WHERE status != "done" AND status != "cancelled" AND assignee != null
GROUP BY assignee
```

## Bugs by Severity
```dataview
TABLE length(rows) AS Count
FROM "040-Bugs"
WHERE status != "done" AND status != "cancelled"
GROUP BY severity
```

## Unassigned Items
```dataview
TABLE type, status, priority
FROM "030-Stories" OR "040-Bugs" OR "050-Tasks"
WHERE (assignee = null OR assignee = "") AND status != "done" AND status != "cancelled"
SORT priority ASC
```
