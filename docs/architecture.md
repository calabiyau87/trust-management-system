# Architecture

## Stack

- Google Apps Script Web App
- Google Sheets as canonical storage
- Vanilla `Index.html` SPA
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
google.script.run wrapper -> AuthService -> PermissionService -> domain service -> SheetService -> AuditService
```

## Storage Model

Sheets are treated as normalized tables with stable IDs. Row numbers are internal implementation details only. `SheetService` owns table reads, appends, ID lookup, updates, header creation, and write locking.

## Concurrency

Writes use `LockService` through `SheetService.withLock`. Services should avoid row-by-row loops for large data operations and should batch where the Apps Script API makes that practical.

## Integrations

Integrations are placeholders for MVP:

- Chat webhook notifications: next milestone.
- Google Tasks mirroring: deferred.
- Gmail summaries/reminders: deferred.
- Calendar suggestions: deferred.

The app remains the source of truth for tasks and time.
