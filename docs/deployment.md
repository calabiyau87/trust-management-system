# Deployment

## Prerequisites

- Google Workspace account.
- Staging spreadsheet.
- Apps Script project.
- Node.js 18+ for local checks and `npx @google/clasp`.

## Configure clasp

Replace the placeholder in `.clasp.json`:

```json
{
  "scriptId": "YOUR_STAGING_SCRIPT_ID",
  "rootDir": "src"
}
```

## Push Source

```powershell
npm run check
npm run clasp:login
npm run clasp:push
```

## Bootstrap Staging

In Apps Script, run:

```javascript
setupTrustOps("STAGING_SPREADSHEET_ID", "owner@example.com")
```

The signed-in account must match the owner email.

## Web App Settings

Deploy as a web app:

- Execute as: `User accessing the web app`
- Access: Workspace domain or explicit allowed users

The manifest currently uses domain access. Tighten this in Apps Script deployment settings when staging/prod policies are known.

## Staging Smoke Test

- Unknown user is blocked.
- Owner user loads the app.
- Owner creates a project, category, user, and task.
- Regular user can view all tasks.
- Regular user can add time only to assigned tasks.
- Manager can create time but cannot edit existing time.
- Owner/Admin can view and edit all time.
- Locked pay-period override requires a reason and writes audit.

## Production Gate

Do not point production at the live operational spreadsheet until staging smoke tests pass and rollback steps are documented.
