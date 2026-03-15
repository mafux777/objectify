# Test Setup

## Prerequisites

- **Docker Desktop** running
- **Supabase CLI** (`brew install supabase/tap/supabase`)
- **Playwright** (`npm install` at repo root)

## Running Tests

```bash
# 1. Start local Supabase (first time pulls ~1GB of Docker images)
supabase stop && supabase start

# 2. Reset DB for clean state
supabase db reset

# 3. Start dev server pointing to local Supabase
VITE_SUPABASE_URL=http://127.0.0.1:54321 \
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0 \
npx vite --config packages/web/vite.config.ts packages/web

# 4. Run tests (in another terminal)
npx playwright test tests/auth.spec.ts

# Run headed (watch the browser)
npx playwright test tests/auth.spec.ts --headed
```

**Important:** The dev server MUST use the local Supabase env vars above. If started with `npm run dev`, Vite reads `.env` which points to production Supabase.

## What config.toml Changes Enable Testing

These settings in `supabase/config.toml` are required for tests to work:

```toml
# Edge functions accessible without gateway JWT verification
[functions.create-wallet]
verify_jwt = false
[functions.check-balance]
verify_jwt = false
[functions.convert]
verify_jwt = false

# Edge function secrets (master wallet address is public)
[edge_runtime.secrets]
MASTER_SAFE_OWNER_ADDRESS = "0xD7e9b7124963439205B0EB9D2f919F05EF9F2919"
BASE_RPC_URL = "https://mainnet.base.org"

# Fast email sending for tests (default 1m is too slow)
max_frequency = "1s"

# High rate limit for test reruns
email_sent = 100
```

After changing `config.toml`, you must do a full `supabase stop && supabase start` (not just `db reset`).

## Local Services

| Service | URL | Purpose |
|---------|-----|---------|
| Dev server | http://localhost:5173 | Vite dev server |
| Supabase API | http://127.0.0.1:54321 | REST, Auth, Edge Functions |
| Supabase Studio | http://127.0.0.1:54323 | DB admin UI |
| Mailpit | http://127.0.0.1:54324 | Captures confirmation emails |
| Postgres | postgresql://postgres:postgres@127.0.0.1:54322/postgres | Direct DB |

## Test Files

- `tests/AUTH_TEST_PLAN.md` — human-readable test plan
- `tests/auth.spec.ts` — Playwright tests (13 tests, all passing)
- `playwright.config.ts` — Playwright configuration

## What's Tested (13/13 passing)

### Auth Flow (serial, tests a real user journey)
1. **Anonymous first visit** — auto sign-in, wallet created, 0 credits
2. **Session persistence** — wallet survives navigation and page reload
3. **Email sign-up** — form submission, email confirmation via Mailpit, wallet preserved, credits granted
4. **Sign out** — new anonymous session, different wallet
5. **Sign back in** — email+password login restores account with wallet
6. **Second cycle** — sign-out/sign-in again works

### Login Page UI (independent)
7. Sign-in form default state
8. Sign-up form toggle
9. Password mismatch validation
10. Wrong credentials error
11. Cancel navigation
12. Google button presence

## Known Issue

The anonymous→email sign-up flow uses `updateUser({ email, password })` which confirms the email but doesn't flip Supabase's `is_anonymous` flag. After sign-out + sign-in with `signInWithPassword`, the wallet may differ because the identity linking isn't fully resolved. This is documented in test 6 with a TODO.

## Troubleshooting

**"email rate limit exceeded"**: Run `supabase stop && supabase start` to restart GoTrue with fresh rate limit counters, then `supabase db reset` for clean user data.

**Dev server pointing to production**: Kill all vite processes (`pkill -f vite`) and restart with the local env vars.

**Edge functions not working**: Verify `supabase status` shows edge functions, and check `docker exec supabase_auth_objectify env | grep MASTER` to confirm secrets are loaded.
