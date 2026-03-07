# Feature Requests

## FR-001: Sign out should redirect to landing page
- **Status:** Resolved
- **Description:** After clicking Sign Out, user was taken to a bare login page with no context. Should go to the landing page instead.
- **Resolution:** Updated signOut handlers in AppHeader and DashboardPage to navigate to `/` after signing out.
