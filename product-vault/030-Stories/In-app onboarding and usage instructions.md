---
type: story
status: backlog
priority: high
epic: "SaaS Hosted Web App"
assignee:
sprint:
estimate:
created: 2026-03-07
due:
tags: [onboarding, usability, ux]
---

# In-app onboarding and usage instructions

## User Story
**As a** new Objectify user
**I want** clear in-app guidance on how to use the editor
**So that** I can be productive immediately without external documentation

## Context
User feedback confirms confusion around core interactions (e.g., "did the box actually get created?", not knowing about alt-drag, shift-drag, guide snapping). The product should teach itself — using Objectify diagrams to explain Objectify.

The "How Objectify Works" template is now promoted as the first template with a "Start here" badge. This story tracks the broader initiative to make the product self-explanatory.

## Acceptance Criteria
- [ ] "How Objectify Works" template includes an Instructions node explaining key interactions (drag, alt-drag to free from guide, shift-drag to re-attach, right-click context menu)
- [ ] First-time users see a brief tooltip or callout pointing them to the featured template
- [ ] Editor has a "?" help button that shows a quick-reference of keyboard shortcuts and interactions
- [ ] Consider a short walkthrough overlay for first-time users (optional, assess if needed)
- [ ] Record short video clips demonstrating: guide-based layout, alt-drag, chat refinement, image import
- [ ] Videos are embedded or linked from a help section accessible within the app

## Technical Notes
- Instructions node: use transparent-background, no-border node pattern (same as existing title nodes) — no schema changes needed
- Update the refinement LLM prompt to know about text-block nodes so it can create/modify instruction nodes when users ask
- Help button: add to the top-right toolbar panel in FlowDiagram.tsx
- Video hosting: YouTube unlisted or embedded in landing page
- Analytics: track whether users open the featured template (helps measure onboarding effectiveness)

## Design
- Featured template badge: already implemented (blue "Start here" pill)
- Help popover: small panel with categorized shortcuts (Navigation, Editing, Layout)
- Instruction nodes in diagrams: styled consistently — light gray background, italic text, positioned outside the main flow

## Out of Scope
- Full interactive tutorial / guided tour (consider for a future story)
- PDF or external documentation site
- Localization of help content
