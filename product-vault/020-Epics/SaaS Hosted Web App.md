---
type: epic
status: in-progress
priority: critical
owner:
created: 2026-03-02
target-quarter: Q1 2026
tags: [saas, product, supabase, vercel, auth, monetization]
---

# SaaS Hosted Web App

## Objective
Productize the Objectify editor into a multi-user hosted web application with authentication, image upload and conversion, a credit-based billing system, landing page, and cloud deployment. Turn the local tool into a shareable, monetizable product.

## Success Criteria
- [ ] Supabase auth with sign-up/login/logout flow
- [ ] Landing page with value proposition and waitlist form
- [ ] User dashboard showing saved diagrams
- [ ] Image upload + conversion pipeline (image → Objectify spec)
- [ ] Credit balance system for gating conversions
- [ ] Waitlist form for early access
- [ ] Vercel deployment configuration and working production URL
- [ ] Multi-user data isolation (users only see their own diagrams)

## User Impact
Anyone can visit the site, sign up, upload an image of a diagram or architecture, and get a live editable Objectify spec back. Credits gate usage for sustainability. The waitlist builds an audience pre-launch.

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
- Free tier credit allowance — how many conversions before paywall?
- Stripe integration timeline or stay with credits-only for MVP?
- Should saved diagrams support real-time collaboration (future scope)?

## Notes
- Worktree: `vast-scribbling-thimble`
- Core stack: Supabase (auth + DB), Vercel (hosting), existing React/Vite frontend
