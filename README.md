# Trust Management System

Trust Ops is a Google Workspace MVP for internal trust and property operations. It uses a Google Apps Script web app, Google Sheets as canonical storage, and a vanilla HTML/CSS/JS single-page interface.

## MVP Scope

- Google-authenticated web app using `Session.getActiveUser().getEmail()`.
- Canonical Sheets tables for users, projects, tasks, time entries, categories, pay periods, pay summaries, audit log, and settings.
- Server-side role and ownership checks for every write.
- Assignment Board with filters and role-aware task actions.
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
  AuthService.js          # Google identity and active user context
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
3. Replace `PASTE_STAGING_SCRIPT_ID_HERE` in `.clasp.json`.
4. Log in and push:

```powershell
npm run clasp:login
npm run clasp:push
```

5. In the Apps Script editor, run:

```javascript
setupTrustOps("STAGING_SPREADSHEET_ID", "owner@example.com")
```

The signed-in Google account must match `owner@example.com`. This creates the canonical tabs, default settings, first Owner user, default time categories, and the current pay period.

## Deployment

Deploy the Apps Script web app as:

- Execute as: `User accessing the web app`
- Access: your Workspace domain or explicit allowed users

Use staging first. Do not connect the production spreadsheet until auth, permissions, time entry, pay summary, and audit smoke tests pass.

## Important Runtime Notes

- All writes re-fetch the current server-side user context.
- Managers can create time entries for users but cannot edit existing entries.
- Regular Users can view all tasks but only add time to assigned tasks.
- Owner/Admin can edit all time entries and override locked periods with an audit reason.
- Pay summaries are calculated live while a period is open and snapshotted when locked.
