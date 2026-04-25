# Deployment

## Prerequisites

- Google Workspace account.
- Staging spreadsheet.
- Apps Script project.
- Node.js 18+ for local checks and `npx @google/clasp`.

## Configure clasp

Do not commit `.clasp.json`. It is generated locally from environment variables.

```powershell
$env:TRUST_OPS_PRODUCTION_SCRIPT_ID="PRODUCTION_SCRIPT_ID"
$env:TRUST_OPS_TESTING_SCRIPT_ID="TESTING_SCRIPT_ID"
npm run clasp:configure
```

`main` uses `TRUST_OPS_PRODUCTION_SCRIPT_ID`. Any other branch uses `TRUST_OPS_TESTING_SCRIPT_ID`.

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
- Every test user can open the staging spreadsheet when the web app is deployed as `User accessing the web app`.
- Owner creates a project, category, user, and task.
- Regular user can view all tasks.
- Regular user can add time only to assigned tasks.
- Manager can create time but cannot edit existing time.
- Owner/Admin can view and edit all time.
- Locked pay-period override requires a reason and writes audit.

## User Access Troubleshooting

When the web app is deployed as `User accessing the web app`, Google runs server calls as the signed-in user. That user must have access to the backing spreadsheet, not just a row in the `Users` table.

If a newly added user cannot enter:

- Confirm their `Users.Email` value exactly matches the Google account shown by the app's Access Diagnostic.
- Confirm `Users.Active` is true and `Archived` is not true.
- Share the backing staging/production spreadsheet with that Google account. Editor access is currently required because user-executed Apps Script calls write to Sheets.
- Have the user reload the web app and accept the authorization prompt.
- If `Active email` is blank in the diagnostic, Apps Script is not exposing the user's identity for that deployment/account context; redeploy and confirm the web app is still set to execute as `User accessing the web app`.

## Production Gate

Do not point production at the live operational spreadsheet until staging smoke tests pass and rollback steps are documented.
