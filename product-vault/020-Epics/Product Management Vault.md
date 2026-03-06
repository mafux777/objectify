---
type: epic
status: in-progress
priority: medium
owner:
created: 2026-03-02
target-quarter: Q1 2026
tags: [tooling, planning, obsidian]
---

# Product Management Vault

## Objective
Build a lightweight Obsidian-based project management system to replace Jira for tracking Objectify product work. Provides dashboards, Kanban boards, templates, and Dataview-powered queries across epics, stories, bugs, tasks, sprints, retros, and meeting notes.

## Success Criteria
- [ ] Vault structure with numbered folders and working templates
- [ ] Dataview-powered dashboard with status/priority/assignee views
- [ ] Kanban board for drag-and-drop workflow
- [ ] Metrics page with breakdowns by status, priority, severity
- [ ] Roadmap view with quarterly epic tracking
- [ ] Templater folder mappings so new files auto-fill
- [ ] Setup guide for plugin installation and configuration

## User Impact
The team gets a fast, local, version-controllable planning system that lives alongside the code. No SaaS dependency, no context switching — planning happens in the same repo.

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
- Should the vault be committed to the main objectify repo or kept as a separate repo?
- Do we need a custom Obsidian plugin for tighter integration with the codebase?

## Notes
- Worktree: `structured-orbiting-corbato`
- Most of the initial structure is already in place — dashboard, templates, and setup guide are done
