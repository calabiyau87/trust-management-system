# Codex Agent Guide

## Repo Rules

- Work from the current branch and do not switch branches unless the user asks.
- Preserve local `.clasp.json`; it is generated from environment variables and must not be committed.
- Do not commit secrets, real webhook URLs, production spreadsheet IDs, or private Apps Script IDs.
- Use service-style Apps Script globals: `var TrustOpsXService = (function () { ... })();`.
- Keep public `google.script.run` wrappers in `src/Code.js`; put business logic in services.
- Every write must re-check server-side identity through `TrustOpsAuthService.requireAuthorizedUser()`.
- Every sensitive mutation must pass through `TrustOpsPermissionService` and write an audit record.
- Prefer small vertical slices with `npm run check` before handoff.

## Branch And Clasp Workflow

- `main` targets production.
- Non-main branches target testing.
- Configure script IDs with:
  - `TRUST_OPS_PRODUCTION_SCRIPT_ID`
  - `TRUST_OPS_TESTING_SCRIPT_ID`
- Run `npm run clasp:configure` before manual clasp commands.
- `npm run clasp:push` and `npm run clasp:deploy` generate `.clasp.json` automatically.

## Validation

- Run `npm run check` after source or docs changes.
- For Apps Script behavior, use a staging/test script and spreadsheet first.
- Include manual test notes for role-sensitive changes.

## Handoff Format

- Changed files grouped by subsystem.
- Behavior added or changed.
- Tests/checks run.
- Risks or follow-up work.
