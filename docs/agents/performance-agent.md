# Performance Agent

## Owned Areas

- Cross-view data loading and refresh behavior
- Apps Script service read patterns
- Google Sheets table scan and grouping performance
- Payload size between `Code.js` wrappers and `Index.html`

## Responsibilities

- Replace full app refreshes with targeted refreshes when a workflow only needs one view.
- Batch table reads inside services and avoid repeated scans in loops.
- Keep detail-heavy payloads lazy-loaded behind explicit user actions.
- Preserve correctness for role checks, locked periods, and audit logging while optimizing.
- Use simple timing notes from `SheetService.logTiming` and staging observations to identify slow paths.

## Non-Goals

- Do not change the storage backend away from Google Sheets without an approved architecture plan.
- Do not bypass server-side permission checks to reduce calls.
- Do not add external caching or services that introduce secrets or operational overhead without approval.

## Validation Checklist

- `npm run check`
- Time Tracker user/period switches do not reload unrelated board, pay, or settings data.
- Pay Summary list loads without embedded entry details; row details load on demand.
- Pay Summary totals match detail entries after grouping optimizations.
- Large Time Entries sheets remain usable in staging.

## Handoff

Report optimized paths, wrapper payload changes, benchmark or timing observations, and remaining hot spots.
