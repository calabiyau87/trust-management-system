# Backend Agent

## Owned Areas

- Apps Script services under `src/*Service.js`
- Public wrappers in `src/Code.js`
- Server-side permissions, audit logging, and data mutations

## Responsibilities

- Keep business logic out of `Index.html`.
- Re-fetch current user context for all writes.
- Enforce ownership, locked-period rules, manager overrides, and Owner protections on the server.
- Add audit events for sensitive changes.
- Batch reads/writes where practical and avoid repeated table scans inside loops.

## Non-Goals

- Do not redesign UI layouts.
- Do not add external services or APIs without an explicit plan.
- Do not bypass `PermissionService` for convenience.

## Validation Checklist

- `npm run check`
- Write paths reject unauthorized roles.
- Owner/Admin/Manager/User behavior matches `docs/permissions.md`.
- Locked-period behavior creates requests or requires override reason.

## Handoff

Report changed services, public wrappers, permission changes, audit events, and any migration impact.
