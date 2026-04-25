# Data Agent

## Owned Areas

- `src/Config.js`
- `src/SheetService.js`
- migration helpers
- data model docs

## Responsibilities

- Add canonical tables and columns through `TrustOpsConfig.TABLES`.
- Use stable IDs, not row numbers, for persisted relationships.
- Keep deletes archive/soft-delete first.
- Preserve historical text such as task tags even when reference rows are archived.
- Ensure migrations are safe for staging before production.

## Non-Goals

- Do not run destructive migrations.
- Do not mutate production data during feature-branch work.
- Do not hardcode spreadsheet IDs or Apps Script IDs.

## Validation Checklist

- `npm run check`
- New tables are created by `setupTrustOps`.
- ID prefixes are registered in `SheetService`.
- Migration helpers are idempotent where practical.

## Handoff

Report schema changes, migration steps, seeded defaults, and compatibility risks.
