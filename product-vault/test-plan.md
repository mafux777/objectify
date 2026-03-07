# Objectify — Test Plan

## Overview

This document defines manual and automatable test cases for the Objectify web application. Each section corresponds to a page or feature. Tests are written so they can be executed in a browser manually or scripted with Puppeteer.

**Base URL:** `https://objectify-cwj.pages.dev` (or `http://localhost:5173` for local dev)

---

## 1. Landing Page (`/`)

### 1.1 Page loads and renders

| # | Step | Expected |
|---|------|----------|
| 1 | Navigate to `/` | Page loads without errors |
| 2 | Check for logo | "Objectify" text visible in nav |
| 3 | Check hero section | Heading "Turn any diagram image into an editable, interactive diagram" is visible |
| 4 | Check "How it works" section | Three steps visible: Upload, Convert, Edit & Export |
| 5 | Check video embed | YouTube iframe is present with `src` containing `youtube-nocookie.com` |
| 6 | Check features section | 6 feature cards visible (Image to Diagram, Text to Diagram, Chat Refinement, 7 Templates, PNG Export, Interactive Editor) |
| 7 | Check CTA banner | "First 50 users get 5 free credits" text visible |
| 8 | Check footer | Footer text visible |

### 1.2 Navigation (unauthenticated)

| # | Step | Expected |
|---|------|----------|
| 1 | Click "Sign In" in nav | Navigates to `/login` |
| 2 | Return to `/`, click "Get Started Free" | Navigates to `/login` |
| 3 | Click "Try it free" hero button | Navigates to `/login` |
| 4 | Click "Get Started" CTA button | Navigates to `/login` |

### 1.3 Navigation (authenticated)

| # | Step | Expected |
|---|------|----------|
| 1 | Log in, then navigate to `/` | Nav shows "Open Editor" button instead of Sign In / Get Started |
| 2 | Click "Open Editor" | Navigates to `/app` |
| 3 | Click "Try it free" hero button | Navigates to `/app` |
| 4 | Click "Get Started" CTA button | Navigates to `/app` |

---

## 2. Login Page (`/login`)

### 2.1 Sign In form

| # | Step | Expected |
|---|------|----------|
| 1 | Navigate to `/login` | Login card visible with logo, tagline, "Sign In" heading |
| 2 | Check logo link | Clicking "Objectify" logo navigates to `/` |
| 3 | Check tagline | "Turn diagram images into editable, interactive diagrams" visible |
| 4 | Verify form fields | Email and Password inputs visible; no Confirm Password field |
| 5 | Submit with empty fields | Browser native validation prevents submit |
| 6 | Submit with invalid email | Browser native validation prevents submit |
| 7 | Submit with wrong password | Error message displayed (e.g. "Invalid login credentials") |
| 8 | Submit with valid credentials | Redirects to `/app` |

### 2.2 Sign Up form

| # | Step | Expected |
|---|------|----------|
| 1 | Click "Sign Up" toggle | Heading changes to "Create Account"; Confirm Password field appears |
| 2 | Enter mismatched passwords | Error: "Passwords do not match." shown; form does NOT submit |
| 3 | Enter matching passwords, valid email | "Check your email" screen shown with the entered email |
| 4 | Click "Sign In" toggle | Switches back; Confirm Password disappears; error clears |

### 2.3 Forgot Password

| # | Step | Expected |
|---|------|----------|
| 1 | On Sign In view, verify "Forgot password?" link | Link visible below password field |
| 2 | Click "Forgot password?" with empty email | Error: "Enter your email address first." |
| 3 | Enter email, click "Forgot password?" | "Check your email" screen shown: "We sent a password reset link to **{email}**" |
| 4 | Click "Back to sign in" | Returns to sign-in form |

### 2.4 Google OAuth

| # | Step | Expected |
|---|------|----------|
| 1 | Click "Continue with Google" | Redirects to Google OAuth consent screen |
| 2 | Complete Google sign-in | Redirects back to `/app` |

### 2.5 Already authenticated

| # | Step | Expected |
|---|------|----------|
| 1 | Log in, then navigate to `/login` | Immediately redirects to `/app` |

---

## 3. Protected Routes

### 3.1 Unauthenticated access

| # | Step | Expected |
|---|------|----------|
| 1 | Clear session, navigate to `/app` | Redirected to `/login` |
| 2 | Clear session, navigate to `/dashboard` | Redirected to `/login` |
| 3 | Clear session, navigate to `/settings` | Redirected to `/login` |

### 3.2 Loading state

| # | Step | Expected |
|---|------|----------|
| 1 | Navigate to `/app` on slow connection | "Loading..." text shown while auth resolves |

---

## 4. Editor — Welcome Screen (`/app`, no document open)

### 4.1 Action cards

| # | Step | Expected |
|---|------|----------|
| 1 | Verify 4 action cards | "New Blank Diagram", "Create from Prompt", "Import from Image", "Import JSON" |
| 2 | Check badges | First 3 cards show "Free" badge (green); "Import from Image" shows "1 credit" badge (blue) |
| 3 | Click "New Blank Diagram" | New tab opens with "Untitled Diagram"; editor canvas shown |
| 4 | Click "Create from Prompt" | Prompt modal opens |
| 5 | Click "Import from Image" | Image import modal opens |
| 6 | Click "Import JSON" | File picker opens filtered to `.json` |

### 4.2 Templates

| # | Step | Expected |
|---|------|----------|
| 1 | Verify 7 template cards | All listed: Project Thunderbattle, Auth0 CRUD Architecture, Trading Pipeline, Algo Trading Pipeline, Talos Linux Components, How Objectify Works, Image Import Flow |
| 2 | Click any template | New tab opens with that template title; diagram renders |

### 4.3 Saved documents

| # | Step | Expected |
|---|------|----------|
| 1 | Create a document, return to welcome | "Saved Diagrams" section appears with the document listed |
| 2 | Verify sort order | Most recently updated document appears first |
| 3 | Click a saved document | Opens that document in the editor |
| 4 | Click delete (x) on a saved document | Confirmation dialog appears; confirming removes the document |

### 4.4 JSON import via drag-and-drop

| # | Step | Expected |
|---|------|----------|
| 1 | Drag a valid `diagram-spec.json` onto the drop zone | Document created and opened |
| 2 | Drag an invalid JSON file | Alert with error message |

### 4.5 JSON import via file picker

| # | Step | Expected |
|---|------|----------|
| 1 | Click "Import JSON", select a valid spec file | Document created and opened |
| 2 | Select an invalid JSON file | Alert with error message |

---

## 5. Editor — App Header

### 5.1 Authenticated user

| # | Step | Expected |
|---|------|----------|
| 1 | Check header | "Objectify" title, credit count ("N credits"), "Settings" button, and "Sign Out" button visible |
| 2 | Click "Settings" | Navigates to `/settings` |
| 3 | Click "Sign Out" | Session cleared; redirects to `/` (landing page) |

### 5.2 Anonymous/unauthenticated state

| # | Step | Expected |
|---|------|----------|
| 1 | Check header (if accessible) | User ID prefix shown in monospace (`User: abcd1234`) |

---

## 6. Editor — Tab Bar

### 6.1 Tab operations

| # | Step | Expected |
|---|------|----------|
| 1 | Open two documents | Two tabs visible; most recently opened is active |
| 2 | Click inactive tab | Switches to that document |
| 3 | Click close (x) on a tab | Tab closes; another tab becomes active |
| 4 | Middle-click a tab | Tab closes |
| 5 | Double-click a tab | Inline rename input appears with current title selected |
| 6 | Type new name, press Enter | Tab title updates |
| 7 | Press Escape during rename | Rename cancelled; original title preserved |

### 6.2 Tab context menu (right-click)

| # | Step | Expected |
|---|------|----------|
| 1 | Right-click a tab | Context menu with: Rename, Download JSON, Download PNG, Close, Delete |
| 2 | Click "Rename" | Inline rename input appears |
| 3 | Click "Download JSON" | Browser downloads `{slug}-spec.json` |
| 4 | Click "Download PNG" | PNG export triggered |
| 5 | Click "Close" | Tab closes |
| 6 | Click "Delete" | Confirmation dialog; confirming deletes document |

### 6.3 Add menu (+)

| # | Step | Expected |
|---|------|----------|
| 1 | Click "+" button | Dropdown with: New Blank Diagram, Create from Prompt, Import from Image, Import JSON |
| 2 | Click outside menu | Menu closes |
| 3 | Click any option | Corresponding action fires; menu closes |

---

## 7. Prompt Modal (Create from Prompt)

| # | Step | Expected |
|---|------|----------|
| 1 | Open modal | Heading "Create Diagram from Prompt", textarea, Cancel/Generate buttons |
| 2 | Textarea is auto-focused | Cursor in textarea |
| 3 | "Generate" disabled with empty textarea | Button disabled |
| 4 | Type a prompt, click "Generate" | Button text changes to "Generating..."; inputs disabled |
| 5 | Successful generation | Modal closes; new document tab opens with generated diagram |
| 6 | Failed generation | Error message shown in modal; modal stays open |
| 7 | Press Cmd/Ctrl+Enter | Triggers generate (same as clicking the button) |
| 8 | Click Cancel | Modal closes; no document created |
| 9 | Click backdrop | Modal closes |
| 10 | Click backdrop while generating | Modal does NOT close |

---

## 8. Image Import Modal

### 8.1 File selection

| # | Step | Expected |
|---|------|----------|
| 1 | Open modal | Heading "Import Diagram from Image", drop zone with icon, Cancel/Analyze buttons |
| 2 | Click drop zone | File picker opens (PNG, JPEG, WebP, GIF) |
| 3 | Select a valid image | Preview shown with filename; "Change" button appears |
| 4 | Select a non-image file | Error: "Please select a PNG, JPEG, WebP, or GIF image." |
| 5 | Drag-and-drop a valid image onto modal | Preview shown |
| 6 | Click "Change" | Preview removed; drop zone shown again |

### 8.2 Analyze (authenticated)

| # | Step | Expected |
|---|------|----------|
| 1 | With image selected, check credit notice | "This will use 1 credit. You have N remaining." shown |
| 2 | Click "Analyze" | Button text changes to "Uploading & analyzing..."; cannot close modal |
| 3 | Successful analysis | Modal closes; new document tab opens with diagram |
| 4 | Credit balance refreshes | Header credit count decrements by 1 |
| 5 | With 0 credits, click "Analyze" | Error: "No credits remaining. Visit your dashboard to request more." |

### 8.3 Analyze (unauthenticated fallback)

| # | Step | Expected |
|---|------|----------|
| 1 | Without auth, click "Analyze" | Uses client-side OpenRouter API; progress text shown |
| 2 | No VITE_OPENROUTER_API_KEY set | Error: "No API key configured (VITE_OPENROUTER_API_KEY)" |

---

## 9. Dashboard (`/dashboard`)

### 9.1 Layout

| # | Step | Expected |
|---|------|----------|
| 1 | Navigate to `/dashboard` | Header with "Objectify" (links to `/`), "Open Editor", "Sign Out" |
| 2 | Credit display | Shows credit count with "credits remaining" label |
| 3 | Conversion history heading | "Conversion History" visible |

### 9.2 Conversion history

| # | Step | Expected |
|---|------|----------|
| 1 | No conversions | "No conversions yet. Try converting an image" with link to `/app` |
| 2 | With conversions | List of conversion cards showing title, date, and status |
| 3 | Click a conversion card | Navigates to `/app` |

### 9.3 Waitlist (0 credits)

| # | Step | Expected |
|---|------|----------|
| 1 | With 0 credits | "Get More Credits" section appears with waitlist form |
| 2 | Form fields | Email, credit amount dropdown (5/10/25/50), optional "what would you pay" |
| 3 | Submit form | "Thanks! We'll be in touch soon." confirmation shown |
| 4 | With credits > 0 | Waitlist section is NOT shown |

### 9.4 Navigation

| # | Step | Expected |
|---|------|----------|
| 1 | Click "Open Editor" | Navigates to `/app` |
| 2 | Click "Sign Out" | Signs out; redirects to `/` |
| 3 | Click "Objectify" logo | Navigates to `/` |

---

## 10. Share with Developer (Editor Toolbar)

### 10.1 Share button

| # | Step | Expected |
|---|------|----------|
| 1 | Open a diagram (template or saved) | "Share" button visible in top-right toolbar panel, after Export PNG |
| 2 | Share button has distinct styling | Light blue background (`#e3f2fd`), blue border (`#90caf9`) |

### 10.2 Share modal

| # | Step | Expected |
|---|------|----------|
| 1 | Click "Share" button | Modal opens with heading "Share with Developer" |
| 2 | Check summary bar | Shows document title, node count, and edge count (e.g. "Project Thunderbattle · 9 nodes, 4 edges") |
| 3 | Check textarea | Placeholder: "Tell us what happened, what you expected, or any suggestions..." |
| 4 | Check checkboxes | Three checkboxes, all checked by default: "Include diagram specification", "Include chat history (N messages)", "Include auto-logged feedback" |
| 5 | Uncheck "Include chat history" | Checkbox unchecked; label still shows message count |
| 6 | Check buttons | "Cancel" and "Submit Feedback" buttons visible |

### 10.3 Submit feedback

| # | Step | Expected |
|---|------|----------|
| 1 | Type a comment, click "Submit Feedback" | Button text changes to "Submitting..."; inputs disabled |
| 2 | Successful submission | Modal shows "Thank you!" with "Your feedback has been submitted." and "Close" button |
| 3 | Click "Close" on success screen | Modal closes; editor visible |
| 4 | Verify localStorage (local mode) | `objectify:shared-feedback` key contains JSON array with submission (userId, documentTitle, diagramSpec, chatHistory, userComment, createdAt) |
| 5 | Submit with empty comment | Still submits successfully (comment is optional) |
| 6 | Submit with all checkboxes unchecked | Submits with empty spec (`{ diagrams: [] }`), empty chat history, no feedback records |

### 10.4 Chat history tracking

| # | Step | Expected |
|---|------|----------|
| 1 | Open a diagram, send a chat message via command bar | Chat processes normally |
| 2 | Open Share modal | "Include chat history" shows updated count (e.g. "2 messages" for user + assistant) |
| 3 | Submit feedback | Stored payload includes chat messages with role, content, timestamp, and category |

### 10.5 Cancel / dismiss

| # | Step | Expected |
|---|------|----------|
| 1 | Click "Cancel" | Modal closes; no data submitted |
| 2 | Click modal backdrop | Modal closes; no data submitted |
| 3 | Click backdrop while submitting | Modal does NOT close |

---

## 11. Settings Page (`/settings`)

### 11.1 Layout

| # | Step | Expected |
|---|------|----------|
| 1 | Navigate to `/settings` | Page loads with header: "Objectify" logo, "Open Editor", "Sign Out" |
| 2 | Check heading | "Settings" heading visible |
| 3 | Check account section | "Account" heading with Email, Provider, and User ID fields |
| 4 | Email field (authenticated) | Shows user's email address |
| 5 | Email field (anonymous/bypass) | Shows "Anonymous" |
| 6 | Provider field | Shows "Google" for OAuth users, "Local" for bypass mode |
| 7 | Member since (authenticated) | Shows month and year of account creation |
| 8 | User ID | Full UUID shown in monospace font |

### 11.2 Feedback submissions

| # | Step | Expected |
|---|------|----------|
| 1 | No submissions | "No feedback submitted yet. Use the Share button in the editor to send feedback." |
| 2 | After submitting feedback via Share | Submission card visible with document title, date, chat message count |
| 3 | Submission with comment | Quoted comment preview shown (truncated if long) |
| 4 | Multiple submissions | Listed in reverse chronological order (newest first) |

### 11.3 Delete Account — Danger Zone

| # | Step | Expected |
|---|------|----------|
| 1 | Check danger zone | Red bordered section with "Danger Zone" heading, warning text, red "Delete Account" button |
| 2 | Click "Delete Account" | Confirmation prompt appears: "Type DELETE to confirm:" with input, "Delete Forever", "Cancel" |
| 3 | "Delete Forever" initially | Button is greyed out / disabled |
| 4 | Type "DELETE" in input | "Delete Forever" button turns red and becomes enabled |
| 5 | Type something other than "DELETE" | Button remains disabled |
| 6 | Click "Cancel" | Confirmation prompt hides; back to single "Delete Account" button |
| 7 | Type "DELETE" and click "Delete Forever" | Button shows "Deleting..."; account data cleared |
| 8 | After deletion (local mode) | All `objectify:*` localStorage keys removed; redirects to `/` |
| 9 | After deletion (authenticated) | Supabase data deleted (profiles, conversions, credit_transactions, shared_feedback, storage); auth user removed; redirects to `/` |

### 11.4 Navigation

| # | Step | Expected |
|---|------|----------|
| 1 | Click "Open Editor" | Navigates to `/app` |
| 2 | Click "Sign Out" | Signs out; redirects to `/` |
| 3 | Click "Objectify" logo | Navigates to `/` |

### 11.5 Protected route

| # | Step | Expected |
|---|------|----------|
| 1 | Clear session, navigate to `/settings` | Redirected to `/login` |

---

## 12. Editor — App Header (Settings Link)

### 12.1 Settings link (authenticated)

| # | Step | Expected |
|---|------|----------|
| 1 | Check header (authenticated) | "Settings" button visible next to "Sign Out" |
| 2 | Click "Settings" | Navigates to `/settings` |

### 12.2 Settings link (anonymous)

| # | Step | Expected |
|---|------|----------|
| 1 | Check header (bypass/anonymous) | "Settings" button NOT visible; user ID prefix shown instead |

---

## 13. Routing & Catch-all

| # | Step | Expected |
|---|------|----------|
| 1 | Navigate to `/nonexistent` | Redirects to `/` |
| 2 | Navigate to `/app/anything` | Redirects to `/` |
| 3 | Hard refresh on `/app` (authenticated) | Page loads correctly (SPA `_redirects` working) |
| 4 | Hard refresh on `/login` | Page loads correctly |

---

## 14. Cross-cutting Concerns

### 14.1 Responsive design

| # | Step | Expected |
|---|------|----------|
| 1 | View landing page at 640px width | Layout adapts (single column, smaller fonts) |
| 2 | View login page at 640px width | Card adjusts to available width |
| 3 | View editor welcome screen at 640px width | Action cards and grid reflow |

### 14.2 Session persistence

| # | Step | Expected |
|---|------|----------|
| 1 | Log in, close tab, reopen | Session persisted; `/app` loads without re-login |
| 2 | Sign out, close tab, reopen, go to `/app` | Redirected to `/login` |

### 14.3 Document persistence

| # | Step | Expected |
|---|------|----------|
| 1 | Create document, refresh page | Document appears in "Saved Diagrams" |
| 2 | Delete document, refresh page | Document is gone |

---

## Puppeteer Automation Notes

**Selectors to use:**

| Element | Selector |
|---------|----------|
| Landing hero CTA | `.landing-btn-lg` |
| Login email input | `input[type="email"]` |
| Login password input | `input[type="password"]` |
| Login confirm password | `input[placeholder="Confirm password"]` |
| Login submit button | `form button[type="submit"]` |
| Sign Up toggle | `.toggle-text .link-btn` |
| Forgot password link | `button.link-btn` (within sign-in form) |
| Google button | `.google-btn` |
| Welcome action cards | `.welcome-action-card` (4 of them) |
| Action badges | `.action-badge.free`, `.action-badge.credit` |
| Template cards | `.welcome-section:last-of-type .welcome-doc-card` |
| Saved doc cards | `.welcome-section:first-of-type .welcome-doc-card` |
| Tab bar tabs | `.document-tab` |
| Tab close button | `.tab-close` |
| Tab add button | `.tab-bar-add` |
| Add menu items | `.tab-add-menu button` |
| Prompt modal | `.prompt-modal` |
| Prompt textarea | `.prompt-modal textarea` |
| Image import modal | `.prompt-modal` (same backdrop class) |
| Modal cancel/action | `.modal-actions button` |
| Header credits | `.app-header span` (first span with credits text) |
| Header settings button | `.app-header .load-btn` (first `.load-btn` when authenticated) |
| Header sign out | `.app-header .load-btn` (second `.load-btn` when authenticated) |
| Dashboard credits | `.dashboard-credits-num` |
| Share button (toolbar) | `.react-flow__panel button` containing "Share" text |
| Share modal | `.prompt-modal-backdrop .prompt-modal` (reuses prompt modal CSS) |
| Share modal textarea | `.prompt-modal textarea` |
| Share modal checkboxes | `.prompt-modal input[type="checkbox"]` (3 of them) |
| Share submit button | `.prompt-modal .modal-actions button.primary` |
| Settings page | `.dashboard-page` (reuses dashboard layout) |
| Settings feedback cards | `.dashboard-conversion` |
| Delete account button | `button` containing "Delete Account" text |
| Delete confirm input | `input[placeholder="DELETE"]` |
| Delete forever button | `button` containing "Delete Forever" text |

**Auth helper pattern:**

```js
async function loginAs(page, email, password) {
  await page.goto(BASE_URL + "/login");
  await page.type('input[type="email"]', email);
  await page.type('input[type="password"]', password);
  await page.click('form button[type="submit"]');
  await page.waitForNavigation();
}
```

**Recommended test execution order:**
1. Landing page (no auth required)
2. Login/signup flows
3. Protected route guards
4. Editor welcome screen
5. Document CRUD (create, rename, delete)
6. Prompt modal
7. Image import modal
8. Dashboard
9. Share with Developer (toolbar + modal + submit)
10. Settings page (layout + feedback submissions)
11. Settings — Delete Account (confirmation flow)
12. App Header — Settings link
13. Routing catch-all
14. Responsive checks
