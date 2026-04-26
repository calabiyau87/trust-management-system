# Architecture

## Stack

- Google Apps Script Web App
- Google Sheets as canonical storage
- Vanilla `Index.html` SPA
- GitHub Pages login bridge using Google Identity Services
- `google.script.run` for client/server calls
- `clasp` for deployment

No external backend, database, React build step, Chat API, Google Tasks API, Gmail API, or Calendar API is required for the MVP.

## Server Shape

`Code.js` exposes only web app entrypoints and public wrappers. Domain behavior lives in service-style globals:

- `TrustOpsAuthService`
- `TrustOpsPermissionService`
- `TrustOpsSheetService`
- `TrustOpsTaskService`
- `TrustOpsTimeService`
- `TrustOpsPayService`
- `TrustOpsAuditService`
- `TrustOpsMigrationService`

Every write path follows:

```text
google.script.run wrapper -> AuthService (verifies Google ID token) -> PermissionService -> domain service -> SheetService -> AuditService
```

The browser signs in on GitHub Pages, receives a Google ID token, and passes that token back to the Apps Script web app in the URL fragment. The Apps Script UI stores the token in session storage and attaches it to every `google.script.run` wrapper invocation.

Projects and tasks are hierarchical in the UI, but the Sheets model stays flat. Server services derive a one-level tree for subprojects and subtasks, compute rollup progress from completed leaf items, and keep parent links as additive columns only.

## Storage Model

Sheets are treated as normalized tables with stable IDs. Row numbers are internal implementation details only. `SheetService` owns table reads, appends, ID lookup, updates, header creation, and write locking.

The `Projects` and `Tasks` sheets now include optional parent-link columns so the UI can render collapsible nested lists without a destructive migration:

- `Projects.Parent Project ID`
- `Projects.Parent Project Name`
- `Tasks.Parent Task ID`
- `Tasks.Parent Task Title`

## Concurrency

Writes use `LockService` through `SheetService.withLock`. Services should avoid row-by-row loops for large data operations and should batch where the Apps Script API makes that practical.

## Integrations

Integrations are placeholders for MVP:

- Chat webhook notifications: next milestone.
- Google Tasks mirroring: deferred.
- Gmail summaries/reminders: deferred.
- Calendar suggestions: deferred.

The app remains the source of truth for tasks and time.
