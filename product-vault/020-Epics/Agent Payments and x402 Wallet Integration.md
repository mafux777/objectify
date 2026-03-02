---
type: epic
status: in-progress
priority: high
owner:
created: 2026-03-02
target-quarter: Q1 2026
tags: [payments, x402, wallet, agents, micropayments]
---

# Agent Payments and x402 Wallet Integration

## Objective
Add an agent payments system to Objectify using the x402 protocol (HTTP 402-based micropayments). Enables AI agents to pay for Objectify services programmatically — converting images, accessing specs, or using the editor API — without traditional auth/billing flows.

## Success Criteria
- [ ] `packages/wallet` package scaffolded and integrated into the monorepo
- [ ] x402 protocol implementation (HTTP 402 challenge/response flow)
- [ ] Agent-facing payment endpoints that gate access behind micropayment
- [ ] Wallet CLI for managing balances and viewing transaction history
- [ ] Sample diagram specs visualizing the payment flow (`agent-payment-flow.json`, `spatial-calibration.json`)
- [ ] Documentation for agent developers on how to pay for Objectify API calls

## User Impact
AI agents (and the developers orchestrating them) can consume Objectify as a paid API without signing up for accounts or managing API keys. Payment is inline with the HTTP request via x402. Opens up a machine-to-machine revenue channel.

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
- Which blockchain/payment network for x402 settlement (Ethereum L2, Solana, etc.)?
- Minimum payment granularity — per-request or batched?
- Should the wallet package be publishable as a standalone npm package for agent developers?
- How does x402 wallet balance interact with the SaaS credit system (if at all)?

## Notes
- Worktree: `wallet-cli`
- x402 is an emerging standard for HTTP-native micropayments — the `402 Payment Required` status code finally gets real use
- Sample flow diagrams already exist to visualize the payment architecture
