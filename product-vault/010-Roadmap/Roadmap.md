# Product Roadmap

## Current Quarter
```dataview
TABLE status, priority, owner
FROM "020-Epics"
WHERE target-quarter = "Q1 2026"
SORT priority ASC
```

## Next Quarter
```dataview
TABLE status, priority, owner
FROM "020-Epics"
WHERE target-quarter = "Q2 2026"
SORT priority ASC
```

## Future
```dataview
TABLE status, priority, owner, target-quarter
FROM "020-Epics"
WHERE target-quarter != "Q1 2026" AND target-quarter != "Q2 2026"
SORT target-quarter ASC
```

## Ideas & Proposals
<!-- Items not yet promoted to epics -->
-
