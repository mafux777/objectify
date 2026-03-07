# Runbook: Checking Supabase Programmatically

## Prerequisites

- Supabase CLI installed (`npx supabase`)
- Project linked (`npx supabase link --project-ref <ref>`)
- Logged in (`npx supabase login`)

## Project Info

```
Project Ref: lvmibmarrdrejomzurch
URL:         https://lvmibmarrdrejomzurch.supabase.co
```

---

## 1. List Projects

```bash
npx supabase projects list
```

## 2. Get API Keys

```bash
npx supabase projects api-keys --project-ref lvmibmarrdrejomzurch
```

Returns `anon`, `service_role`, and `default` keys.

## 3. List Auth Users

```bash
SERVICE_KEY="<service_role_key>"
URL="https://lvmibmarrdrejomzurch.supabase.co"

curl -s "$URL/auth/v1/admin/users?page=1&per_page=50" \
  -H "apikey: $SERVICE_KEY" \
  -H "Authorization: Bearer $SERVICE_KEY" | python3 -m json.tool
```

Key fields per user: `id`, `email`, `created_at`, `last_sign_in_at`, `app_metadata.provider`.

## 4. Query Tables (as admin, bypasses RLS)

```bash
# All rows from a table
curl -s "$URL/rest/v1/<table>?select=*" \
  -H "apikey: $SERVICE_KEY" \
  -H "Authorization: Bearer $SERVICE_KEY"

# Specific columns
curl -s "$URL/rest/v1/conversions?select=id,user_id,status,created_at" \
  -H "apikey: $SERVICE_KEY" \
  -H "Authorization: Bearer $SERVICE_KEY"

# Filter by column
curl -s "$URL/rest/v1/conversions?select=id,user_id&user_id=eq.<uuid>" \
  -H "apikey: $SERVICE_KEY" \
  -H "Authorization: Bearer $SERVICE_KEY"

# Limit results
curl -s "$URL/rest/v1/conversions?select=id&limit=5" \
  -H "apikey: $SERVICE_KEY" \
  -H "Authorization: Bearer $SERVICE_KEY"
```

## 5. Test Row Level Security (RLS)

### Unauthenticated (anon key) — should return `[]`

```bash
ANON_KEY="<anon_key>"

curl -s "$URL/rest/v1/conversions?select=id,user_id" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $ANON_KEY"
```

### As a specific user — should return only that user's rows

```bash
# Step 1: Sign in to get a user JWT (email/password users only)
USER_JWT=$(curl -s "$URL/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"their_password"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# Step 2: Query as that user
curl -s "$URL/rest/v1/conversions?select=id,user_id" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $USER_JWT"
```

Compare results: user A should not see user B's rows.

## 6. Check Profiles & Credits

```bash
curl -s "$URL/rest/v1/profiles?select=id,email,credits" \
  -H "apikey: $SERVICE_KEY" \
  -H "Authorization: Bearer $SERVICE_KEY" | python3 -m json.tool
```

## 7. Check Credit Transactions

```bash
curl -s "$URL/rest/v1/credit_transactions?select=id,user_id,amount,reason,created_at&order=created_at.desc" \
  -H "apikey: $SERVICE_KEY" \
  -H "Authorization: Bearer $SERVICE_KEY" | python3 -m json.tool
```

## 8. Query Shared Feedback (Developer/Agent Access)

```bash
# List all feedback submissions (newest first)
curl -s "$URL/rest/v1/shared_feedback?select=*&order=created_at.desc" \
  -H "apikey: $SERVICE_KEY" \
  -H "Authorization: Bearer $SERVICE_KEY" | python3 -m json.tool

# Feedback for a specific user
curl -s "$URL/rest/v1/shared_feedback?select=*&user_id=eq.<USER_UUID>" \
  -H "apikey: $SERVICE_KEY" \
  -H "Authorization: Bearer $SERVICE_KEY" | python3 -m json.tool

# Just comments and titles (lightweight overview)
curl -s "$URL/rest/v1/shared_feedback?select=id,document_title,user_comment,created_at&order=created_at.desc" \
  -H "apikey: $SERVICE_KEY" \
  -H "Authorization: Bearer $SERVICE_KEY" | python3 -m json.tool
```

Each row contains: `diagram_spec` (JSONB), `chat_history` (JSONB array of messages), `feedback_messages` (JSONB array), `user_comment` (text), and `user_agent`.

## 9. Tables & RLS Summary

| Table                | RLS Enabled | Policies |
|----------------------|-------------|----------|
| `profiles`           | Yes         | Select own, Update own |
| `conversions`        | Yes         | Select own, Insert own, Update own |
| `credit_transactions`| Yes         | Select own |
| `waitlist`           | Yes         | Insert (authenticated only) |
| `shared_feedback`    | Yes         | Insert own, Select own |

## 10. Useful PostgREST Query Operators

| Operator | Meaning          | Example                        |
|----------|------------------|--------------------------------|
| `eq`     | equals           | `?user_id=eq.<uuid>`          |
| `neq`    | not equals       | `?status=neq.pending`         |
| `gt`     | greater than     | `?credits=gt.0`               |
| `gte`    | greater or equal | `?credits=gte.5`              |
| `lt`     | less than        | `?credits=lt.1`               |
| `order`  | sort             | `?order=created_at.desc`      |
| `limit`  | max rows         | `?limit=10`                   |
| `is`     | null check       | `?image_url=is.null`          |

## 11. CLI Commands Quick Reference

```bash
npx supabase projects list              # List all projects
npx supabase projects api-keys ...      # Get API keys
npx supabase db dump --linked           # Dump schema (requires Docker)
npx supabase inspect db db-stats        # DB stats
npx supabase inspect db table-stats     # Table sizes & row counts
npx supabase functions list             # List edge functions
npx supabase secrets list               # List secrets
```
