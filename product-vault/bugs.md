# Bugs

## BUG-001: Credit balance not updating after prompt-based generation
- **Status:** Resolved
- **Severity:** Medium
- **Description:** Creating a diagram from a text prompt either does not consume a credit or does not visibly update the credit display in the header. User cannot tell if credits were used.
- **Expected:** Credit balance should decrement (or prompt generation should be clearly marked as free) so the user knows what costs credits and what doesn't.
- **Root cause:** By design, only image-to-diagram conversion (via edge function) costs credits. Text prompt and chat refinement are free (client-side OpenRouter calls). However, there is no UI indication of this — the user has no way to know which actions are free vs paid.
- **Resolution:** Added "Free" badges on New Blank Diagram, Create from Prompt, and Import JSON action cards. Added "1 credit" badge on Import from Image. CSS styles added for `.action-badge.free` (green) and `.action-badge.credit` (blue).

## BUG-002: Google OAuth button shown but not configured
- **Status:** Resolved
- **Severity:** High
- **Description:** The login page shows a "Continue with Google" button, but Google OAuth is not configured in Supabase. Clicking it fails silently or shows an error.
- **Resolution:** Configured Google OAuth via Supabase Management API with Google Cloud OAuth credentials. Redirect URI set to `https://lvmibmarrdrejomzurch.supabase.co/auth/v1/callback`.

## BUG-003: Signup form missing password confirmation field
- **Status:** Resolved
- **Severity:** Low
- **Description:** The signup form only asks for password once. Standard practice is to require the user to type the password twice to prevent typos, especially since email confirmation is enabled.
- **Expected:** Add a "Confirm password" field during signup that must match the password field before submission.
