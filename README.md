# Trust Management System

Trust Ops is a Google Workspace MVP for internal trust and property operations. It uses a Google Apps Script web app, Google Sheets as canonical storage, and a vanilla HTML/CSS/JS single-page interface.

## MVP Scope

- Google Sign-In authenticated web app using a GitHub Pages login bridge and Google ID tokens verified server-side against the `Users` allowlist.
- Canonical Sheets tables for users, projects, tasks, time entries, categories, pay periods, pay summaries, audit log, and settings.
- Server-side role and ownership checks for every write.
- Assignment Board with filters and role-aware task actions.
- One-level nested subprojects and subtasks with collapsible UI and progress rollups.
- Task and general time entry creation.
- User self-service time entry editing.
- Owner/Admin all-user time review and editing.
- Pay-period totals and Open/Locked pay-period state.
- Audit logging for sensitive writes and locked-period overrides.
- Google Chat, Google Tasks, Gmail, and Calendar are intentionally deferred.

## Repo Layout

```text
src/
  Code.js                 # web app entrypoints and google.script.run wrappers
  Config.js               # constants, sheet names, canonical columns
  SheetService.js         # low-level Sheets table access
  AuthService.js          # Google identity verification and allowlist context
  PermissionService.js    # centralized RBAC decisions
  TaskService.js          # task CRUD and Assignment Board data
  TimeService.js          # time entry CRUD and tracker data
  PayService.js           # pay periods, summaries, locking
  AuditService.js         # mutation audit logging
  MigrationService.js     # bootstrap and staging migration helpers
  Index.html              # vanilla SPA UI
docs/
  architecture.md
  data-model.md
  permissions.md
  deployment.md
  roadmap.md
scripts/
  static-check.js
```

## Local Checks

```powershell
npm run check
```

The checker validates required files, JSON manifests, Apps Script JavaScript syntax, and expected UI wiring. It does not replace staging smoke tests in Google Apps Script.

## First-Time Setup

1. Create or copy a staging Google Sheet.
2. Create a Google Apps Script project.
3. Set Apps Script target environment variables:

```powershell
copy .env.example .env
```

4. Set the `GOOGLE_OAUTH_CLIENT_ID` script property for each Apps Script environment before opening the web app.
5. Set the `TRUST_OPS_GITHUB_PAGES_AUTH_URL` script property to your GitHub Pages login page.

6. Log in and push:

```powershell
npm run clasp:login
npm run clasp:push
```

6. In the Apps Script editor, run:

```javascript
setupTrustOps("STAGING_SPREADSHEET_ID", "owner@example.com")
```

The signed-in Google account must match `owner@example.com`. This creates the canonical tabs, default settings, first Owner user, default time categories, default tag/permission tables, and the current pay period.

## Deployment

Deploy the Apps Script web app as:

- Execute as: `Me`
- Access: Anyone, even anonymous
- Set `GOOGLE_OAUTH_CLIENT_ID` and `TRUST_OPS_GITHUB_PAGES_AUTH_URL` before sharing the URL.
- Add `https://<your-github-user>.github.io` to the OAuth client’s authorized JavaScript origins.

Trust Ops still enforces Google Sign-In and the Users allowlist after the page loads, so the web app itself should be publicly reachable even though application access remains restricted.

Use staging first. Do not connect the production spreadsheet until auth, permissions, time entry, pay summary, and audit smoke tests pass.

For local work, keep your script IDs in `.env` or `.env.local`. The clasp helper reads those files automatically when the corresponding shell variables are not set.

GitHub pushes are branch-routed as follows:

- `main` -> production Apps Script project
- `testing` -> testing Apps Script project
- any other branch -> working Apps Script project

## Important Runtime Notes

- All writes re-fetch the current server-side user context.
- Managers can create time entries for users but cannot edit existing entries.
- Regular Users can view all tasks but only add time to assigned tasks.
- Assigned users can complete leaf subtasks even when they cannot edit the parent task.
- Owner/Admin can edit all time entries, lock/unlock periods, and override locked periods with an audit reason.
- Locked-period changes by non-overriding users create approval requests.
- Pay summaries are calculated live while a period is open and snapshotted when locked.
