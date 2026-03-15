# Auth & Sign-Up Test Plan

Tests run against local Supabase (`supabase start`) + local dev server (`npm run dev`).
Email confirmation is handled via Inbucket at `http://localhost:54324`.

## Prerequisites

- `supabase start` running (local Supabase stack)
- `npm run dev -w packages/web` running on `http://localhost:5173`
- Fresh database state (`supabase db reset`) before each full test run

---

## Test Scenarios

### 1. Anonymous First Visit

| Step | Action | Expected |
|------|--------|----------|
| 1.1 | Open app in fresh browser (no cookies) | Auto anonymous sign-in, redirected to `/app` |
| 1.2 | Check header | "Sign In" button visible, no "Sign Out" |
| 1.3 | Check wallet | Wallet address (0x...) visible in header |
| 1.4 | Check credits | 0 credits (anonymous users get 0) |
| 1.5 | Record wallet address | Store for later comparison |

### 2. Session Persistence (Navigate Away & Back)

| Step | Action | Expected |
|------|--------|----------|
| 2.1 | Navigate to `/docs` (landing page) | Landing page loads |
| 2.2 | Navigate back to `/app` | Same session, same wallet address as 1.5 |
| 2.3 | Reload the page (hard refresh) | Same session, same wallet address as 1.5 |

### 3. Email Sign-Up (Anonymous → Email User)

| Step | Action | Expected |
|------|--------|----------|
| 3.1 | Click "Sign In" in header | Navigates to `/login` |
| 3.2 | Switch to "Sign Up" tab | Sign-up form visible (email, password, confirm) |
| 3.3 | Enter email + password, submit | "Check your email" confirmation shown |
| 3.4 | Open Inbucket, find confirmation email | Email received with confirmation link |
| 3.5 | Visit confirmation link | Session upgraded to email user |
| 3.6 | Check header | Email shown, "Sign Out" button visible, no "Sign In" |
| 3.7 | Check wallet | **Same wallet address** as step 1.5 (preserved from anonymous) |
| 3.8 | Check credits | Sign-up bonus granted (5 for first 50 users) |

### 4. Sign Out (Email User → New Anonymous)

| Step | Action | Expected |
|------|--------|----------|
| 4.1 | Click "Sign Out" | Session cleared |
| 4.2 | Check state | Auto-signed in as new anonymous user |
| 4.3 | Check wallet | **Different wallet address** than step 1.5 (new anonymous session) |
| 4.4 | Check credits | 0 credits |
| 4.5 | Record new wallet address | Store for comparison |

### 5. Sign Back In (Restore Email Account)

| Step | Action | Expected |
|------|--------|----------|
| 5.1 | Click "Sign In" | Navigates to `/login` |
| 5.2 | Enter email + password from step 3.3 | Signs in successfully |
| 5.3 | Check wallet | **Original wallet address** from step 1.5 restored |
| 5.4 | Check credits | Same credits as after step 3.8 |

### 6. Google OAuth Sign-Up (Fresh Anonymous → Google)

> Note: Google OAuth cannot be fully automated in Playwright without mocking.
> These tests use Supabase's admin API to simulate the OAuth flow.

| Step | Action | Expected |
|------|--------|----------|
| 6.1 | Start fresh browser, get anonymous session | New anonymous user with wallet |
| 6.2 | Record wallet address | Store for comparison |
| 6.3 | Click "Continue with Google" | Redirects to Google (or mock) |
| 6.4 | Complete Google sign-in | Session upgraded, identity linked |
| 6.5 | Check wallet | **Same wallet** as step 6.2 (preserved) |
| 6.6 | Check credits | Sign-up bonus granted |

### 7. Google Sign Out & Sign Back In

| Step | Action | Expected |
|------|--------|----------|
| 7.1 | Sign out | New anonymous session with different wallet |
| 7.2 | Sign in with Google again | Original wallet from 6.2 restored |
| 7.3 | Credits preserved | Same as after 6.6 |

### 8. Identity Conflict (Anonymous Has Google Email Already Used)

| Step | Action | Expected |
|------|--------|----------|
| 8.1 | Sign out from Google account | New anonymous session |
| 8.2 | Try "Continue with Google" with same account | `identity_already_exists` error caught |
| 8.3 | App auto-retries with `signInWithOAuth` | Signs in normally (discards anonymous session) |
| 8.4 | Check wallet | Original Google user's wallet restored |

---

## Edge Cases

### 9. Concurrent Tab Behavior
- Open two tabs as anonymous → should share same session
- Sign in on one tab → other tab should reflect change on next interaction

### 10. Expired Session
- Wait for JWT expiry (3600s in config) → app should auto-refresh token

### 11. Admin Role Protection
- Sign in as non-admin → attempt to update own role via Supabase client → should fail (RLS blocks it)

---

## Running Tests

```bash
# Start local infra
supabase start
npm run dev -w packages/web

# Reset DB for clean state
supabase db reset

# Run tests
npx playwright test tests/auth.spec.ts

# Run with UI
npx playwright test tests/auth.spec.ts --ui
```
