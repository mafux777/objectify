---
type: epic
status: in-progress
priority: high
owner:
created: 2026-03-02
target-quarter: Q1 2026
tags: [content, youtube, marketing, automation]
---

# YouTube Video Production Pipeline

## Objective
Create a repeatable pipeline for producing and publishing YouTube videos about Objectify. Includes scripted video plans, a production guide, and Node.js automation for uploading videos and managing descriptions at scale.

## Success Criteria
- [ ] Numbered video scripts/plans covering key topics (agent marketplace, JSON spec, open source, prompt feedback)
- [ ] Production guide with recording/editing/publishing workflow
- [ ] `upload-to-youtube.mjs` — automated video upload via YouTube API
- [ ] `update-descriptions.mjs` — batch update video descriptions
- [ ] At least 4 video scripts drafted and ready for recording

## User Impact
Builds public awareness and developer audience for Objectify. Automated tooling removes friction from the publish cycle so content ships consistently.

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
- What's the target publish cadence (weekly, biweekly)?
- Should videos embed live Objectify demos or use screen recordings of the editor?
- Thumbnail generation — manual or automated?

## Notes
- Worktree: `video-scripts`
- Video topics identified so far: agent marketplace, JSON spec format, open source strategy, prompt feedback loop
