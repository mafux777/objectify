# Runbook: Managing Supabase

## Prerequisites

- [uv](https://docs.astral.sh/uv/) installed
- `scripts/.env` file with your Supabase Management API token (already set up, gitignored)
- Token is generated at https://supabase.com/dashboard/account/tokens

## Quick Start

```bash
uv run scripts/supabase_admin.py <command> [options]
```

The token is loaded automatically from `scripts/.env`.

## Project Info

```
Project Ref: lvmibmarrdrejomzurch
URL:         https://lvmibmarrdrejomzurch.supabase.co
```

---

## 1. System Overview

```bash
uv run scripts/supabase_admin.py stats
```

Shows user count, total credits, conversion stats, feedback count, waitlist size, and storage usage.

## 2. Users

```bash
# List all users with credits, provider, and last sign-in
uv run scripts/supabase_admin.py users

# Detailed view for one user (accepts email or UUID prefix)
uv run scripts/supabase_admin.py user funkmeister380@gmail.com
uv run scripts/supabase_admin.py user 2ee0f5da
```

The `user` command shows credits, conversion stats, recent transactions, feedback count, and recent uploads.

## 3. Credits

```bash
# Set one user's credits to a specific value
uv run scripts/supabase_admin.py set-credits funkmeister380@gmail.com 10

# Add credits to a user (negative to subtract)
uv run scripts/supabase_admin.py add-credits funkmeister380@gmail.com 5

# Reset ALL users to n credits
uv run scripts/supabase_admin.py reset-credits 5
```

## 4. Conversions

```bash
# List all conversions (most recent first, limit 50)
uv run scripts/supabase_admin.py conversions

# Filter to one user
uv run scripts/supabase_admin.py conversions funkmeister380@gmail.com
```

## 5. Credit Transactions

```bash
# All transactions
uv run scripts/supabase_admin.py transactions

# For one user
uv run scripts/supabase_admin.py transactions funkmeister380@gmail.com
```

## 6. Shared Feedback

```bash
# All feedback submissions
uv run scripts/supabase_admin.py feedback

# For one user
uv run scripts/supabase_admin.py feedback funkmeister380@gmail.com
```

Each row contains: `diagram_spec` (JSONB), `chat_history` (JSONB array), `feedback_messages` (JSONB array), `user_comment` (text), and `user_agent`.

## 7. Waitlist

```bash
uv run scripts/supabase_admin.py waitlist
```

## 8. Storage

```bash
# Bucket stats (file count, unique users, total size)
uv run scripts/supabase_admin.py storage

# List files (all or for one user)
uv run scripts/supabase_admin.py storage-files
uv run scripts/supabase_admin.py storage-files 2ee0f5da-abc6-410f-ba7e-b1ee55a6ae31
```

## 9. Delete User

```bash
uv run scripts/supabase_admin.py delete-user funkmeister380+001@gmail.com
```

Removes profile, conversions, credit transactions, feedback, storage files, and auth record. Requires typing the email to confirm.

## 10. Arbitrary SQL

```bash
uv run scripts/supabase_admin.py sql "SELECT count(*) FROM public.conversions"
```

Runs any SQL via the Management API (bypasses RLS). Use with care.

---

## Tables & RLS Summary

| Table                | RLS Enabled | Policies |
|----------------------|-------------|----------|
| `profiles`           | Yes         | Select own, Update own |
| `conversions`        | Yes         | Select own, Insert own, Update own |
| `credit_transactions`| Yes         | Select own |
| `waitlist`           | Yes         | Insert (authenticated only) |
| `shared_feedback`    | Yes         | Insert own, Select own |

## Supabase CLI Quick Reference

These commands use the Supabase CLI directly (not the admin script):

```bash
npx supabase projects list              # List all projects
npx supabase projects api-keys --project-ref lvmibmarrdrejomzurch
npx supabase db dump --linked           # Dump schema (requires Docker)
npx supabase functions list             # List edge functions
npx supabase secrets list               # List secrets
```
