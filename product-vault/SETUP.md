# Product Vault — Setup Guide

## 1. Install Obsidian

Download from [obsidian.md](https://obsidian.md) and install for your platform.

## 2. Open This Vault

1. Launch Obsidian
2. Click **"Open folder as vault"**
3. Select this `product-vault` directory
4. Obsidian will detect the `.obsidian/` config and load settings automatically

## 3. Install Required Community Plugins

Go to **Settings → Community Plugins → Turn off Restricted Mode → Browse**

Install and enable these plugins (in order of importance):

| Plugin | Why |
|--------|-----|
| **Dataview** | Powers the dashboard queries — filters, sorts, and tables across all items |
| **Templater** | Lets you insert templates with dynamic dates and prompts |
| **Kanban** | Gives you a drag-and-drop board view (like Trello/Jira boards) |
| **Tasks** | Tracks checkbox tasks across the vault with due dates and queries |
| **Calendar** | Sidebar calendar for navigating sprint/meeting notes by date |

### Plugin Configuration

#### Dataview
- Settings → Enable **JavaScript Queries** (for advanced dashboard)
- Settings → Enable **Inline Queries**

#### Templater
- Settings → **Template folder location** → `Templates`
- Settings → Enable **Trigger Templater on new file creation**
- Settings → **Folder Templates**: map folders to templates (see below)

**Folder Template Mappings:**
| Folder | Template |
|--------|----------|
| `020-Epics` | `Templates/Epic` |
| `030-Stories` | `Templates/Story` |
| `040-Bugs` | `Templates/Bug` |
| `050-Tasks` | `Templates/Task` |
| `060-Sprints` | `Templates/Sprint` |
| `070-Retrospectives` | `Templates/Retrospective` |
| `080-Meeting-Notes` | `Templates/Meeting Notes` |

This way, any new file created in a folder auto-fills with the right template.

## 4. Workflow

### Creating Items
- Navigate to the appropriate folder (e.g., `030-Stories`)
- Create a new note (Ctrl/Cmd + N, then move it to the folder, or right-click the folder → New Note)
- Templater auto-fills the frontmatter and structure
- Fill in the fields

### Frontmatter Fields Explained

| Field | Values | Purpose |
|-------|--------|---------|
| `status` | `backlog`, `ready`, `in-progress`, `review`, `done`, `cancelled` | Tracks workflow state |
| `priority` | `critical`, `high`, `medium`, `low` | Urgency ranking |
| `type` | `epic`, `story`, `bug`, `task` | Item classification |
| `epic` | `[[Link to Epic]]` | Parent epic (for stories/bugs/tasks) |
| `assignee` | name string | Who owns this |
| `sprint` | `[[Link to Sprint]]` | Which sprint this belongs to |
| `created` | date | Auto-set by Templater |
| `due` | date | Target completion |
| `tags` | list | Free-form labels |

### Moving Items Through the Pipeline
1. Update the `status` field in the frontmatter
2. The dashboard auto-updates via Dataview queries
3. Or use the Kanban board for drag-and-drop

### Completing Items
- Set `status: done` — item stays in its folder but filters out of active views
- Optionally move to `Archive/` for a clean folder view

## 5. Keyboard Shortcuts (Recommended)

Set these in **Settings → Hotkeys**:

| Action | Suggested Shortcut |
|--------|--------------------|
| Templater: Insert template | `Alt + T` |
| Open Dashboard | `Alt + D` (bookmark the dashboard note) |
| Toggle Kanban view | `Alt + K` |

## 6. Folder Overview

```
product-vault/
├── 000-Dashboard/       ← Main views: board, backlog, metrics
├── 010-Roadmap/         ← High-level quarterly/yearly plans
├── 020-Epics/           ← Large features or initiatives
├── 030-Stories/         ← User stories and feature requests
├── 040-Bugs/            ← Bug reports
├── 050-Tasks/           ← Small standalone tasks
├── 060-Sprints/         ← Sprint planning and tracking
├── 070-Retrospectives/  ← Sprint retros
├── 080-Meeting-Notes/   ← Standups, planning, stakeholder notes
├── Templates/           ← All templates live here
└── Archive/             ← Completed/cancelled items
```
