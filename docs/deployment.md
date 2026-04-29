# Deployment

## Prerequisites

- Google account that owns the Apps Script project and Google Cloud OAuth client.
- Staging spreadsheet.
- Apps Script project.
- Google OAuth client ID for Google Identity Services.
- GitHub Pages URL for the login bridge.
- Node.js 18+ for local checks and `npx @google/clasp`.

## Configure clasp

Do not commit `.clasp.json`. It is generated locally from environment variables or from `.env` / `.env.local`.

```powershell
copy .env.example .env
npm run clasp:configure
```

`.env.example` only contains placeholder values. Keep real Apps Script IDs, OAuth values, and auth-bridge URLs in your local `.env` / `.env.local` files or in GitHub repository secrets.

`main` uses `TRUST_OPS_PRODUCTION_SCRIPT_ID`. `testing` uses `TRUST_OPS_TESTING_SCRIPT_ID`. Any other branch uses `TRUST_OPS_WORKING_SCRIPT_ID`.

For local development, put branch-specific script IDs in `.env` or `.env.local`. `scripts/configure-clasp.js` will load those files automatically if the shell does not already define the variables.

## Push Source

```powershell
npm run check
npm run clasp:login
npm run clasp:push
```

Local pushes follow the same branch routing as GitHub Actions.

## GitHub Actions Sync

Use a push workflow to mirror GitHub branches into the matching Apps Script project:

- `main` pushes to production.
- `testing` pushes to testing.
- every other branch pushes to working.

Required GitHub secrets:

- `TRUST_OPS_PRODUCTION_SCRIPT_ID`
- `TRUST_OPS_TESTING_SCRIPT_ID`
- `TRUST_OPS_WORKING_SCRIPT_ID`
- `CLASPRC_JSON` for clasp auth

For GitHub Actions, keep those values in repository secrets rather than in files.

The workflow should run on `push` only, not pull requests. That keeps the GitHub-to-clasp sync aligned with the branch promotion path:

1. Create a feature/update/working branch and push it to GitHub.
2. GitHub Actions pushes that branch to the working Apps Script project.
3. Merge into `testing` and push to GitHub to update the testing Apps Script project.
4. After verification, merge into `main` and push to GitHub to update production.

## Bootstrap Staging

In Apps Script, run:

```javascript
setupTrustOps("STAGING_SPREADSHEET_ID", "owner@example.com")
```

The signed-in account must match the owner email.
Set the script properties `GOOGLE_OAUTH_CLIENT_ID` and `TRUST_OPS_GITHUB_PAGES_AUTH_URL` for each environment before opening the web app.

## GitHub Pages Login Bridge

Host the sign-in page on GitHub Pages from this repository:

- Use the `docs/` folder as the GitHub Pages source.
- The published site root should be the login page.
- Add `https://<your-github-user>.github.io` to the OAuth client's authorized JavaScript origins.
- The login page receives `client_id` and `return_url` query parameters from the Apps Script app and runs as a same-page GitHub auth bridge.
- Google Identity Services may still show Google's own account chooser or consent popup, but Trust Ops itself keeps the bridge flow same-page.
- After successful sign-in, the bridge returns the same browser page to the deployed Apps Script URL with the Google ID token.
- The Apps Script deployment should pass its canonical web app URL to the bridge; that keeps the return target on the actual deployed app instead of the internal iframe URL.

Example deployment URL:

```text
https://<your-github-user>.github.io/trust-management-system/
```

## Web App Settings

Deploy as a web app:

- Execute as: `Me`
- Access: Anyone, even anonymous
- Set the script properties before sharing the URL:
  - `GOOGLE_OAUTH_CLIENT_ID`
  - `TRUST_OPS_GITHUB_PAGES_AUTH_URL`

Regular users should only need access to the web app URL. They do not need direct spreadsheet sharing because the app verifies Google Sign-In against the `Users` allowlist and executes server-side as the script owner.

Subprojects and subtasks are rendered as collapsible children in the app UI. They default to collapsed on load, and their progress rolls up from completed leaf items only.

## Staging Smoke Test

- Unknown user is blocked.
- Owner user loads the app.
- Every test user can open the app when the web app is deployed as `Me`.
- Owner creates a project, category, user, and task.
- Regular user can view all tasks.
- Regular user can add time only to assigned tasks.
- Manager can create time but cannot edit existing time.
- Owner/Admin can view and edit all time.
- A non-listed Google account is rejected after sign-in.
- An inactive or archived `Users` row is rejected after sign-in.
- Sign-out returns the browser to the Trust Ops landing screen, and the next sign-in restarts the GitHub Pages bridge.
- Locked pay-period override requires a reason and writes audit.

## Legacy Data Migration

The admin Settings area includes a legacy import panel for moving older data into the canonical sheets.

- Preferred source: a Google Sheet copy of the legacy workbook, or a bundle of CSV exports.
- CSV files should use the legacy sheet names, for example `Users.csv`, `Projects.csv`, `Time Log.csv`, `Pay Summary.csv`, `Assignment Board.csv`, `Imported Tasks.csv`, `Time Categories.csv`, and `Tags.csv`.
- CSV imports can be piecemeal. You can import `Users.csv` first, then come back later and import `Tasks.csv`, `Time Log.csv`, or any other remaining files.
- Imported users are normalized into the current user schema, projects and categories are matched by name, tasks are deduplicated by natural key where practical, and time/pay data is written as historical records.
- Historical pay periods are imported as locked snapshots so the pay summary screens stay consistent with archived data.

## User Access Troubleshooting

When the web app is deployed as `Me`, Google runs server calls as the script owner. Users only need access to the app itself, not direct editor access to the backing spreadsheet.

If a newly added user cannot enter:

- Confirm their `Users.Email` value exactly matches the Google account returned by Google Sign-In.
- Confirm `Users.Active` is true and `Archived` is not true.
- Confirm the web app deployment itself is public (`Anyone, even anonymous`) and not still set to `DOMAIN`, because Trust Ops now does its own allowlisting after load.
- If you want operators to inspect the spreadsheet directly, share it manually as a viewer or editor. Regular users do not need direct spreadsheet sharing.
- Running `setupTrustOps(...)` or `syncSpreadsheetAccess()` is optional and should be reserved for trusted operators who need sheet access.
- If the app cannot load, confirm the deployment is still set to execute as `Me` and that the user has access to the web app URL.
- If the login bridge says the client ID or return URL is missing, confirm the GitHub Pages site root is the login page and that the Apps Script app is passing both query parameters.
- If sign-in or loading behaves differently on iPhone or Android, open the GitHub Pages login page directly in Safari/Chrome and try a private/incognito tab if multiple Google accounts are already signed in.
- If the browser keeps trying to hand the page to Google Drive or another embedded viewer, open the Trust Ops URL directly in Safari or Chrome so the same-page bridge can return to the deployed app cleanly.
- If the browser returns to a blank page after sign-in, confirm the bridge is targeting the deployed web app URL and not the internal `script.googleusercontent.com` iframe URL.

## OAuth Scope Notes

The manifest includes Drive and profile scopes for profile image upload and current-user Google profile photo lookup. Staging users will need to reauthorize after these scopes are deployed.
- Have the user reload the web app and accept the authorization prompt.
- If sign-in fails before the app loads, confirm the Google OAuth client ID script property is set for that deployment/account context and that the web app is still set to execute as `Me`.

## Production Gate

Do not point production at the live operational spreadsheet until staging smoke tests pass and rollback steps are documented.
