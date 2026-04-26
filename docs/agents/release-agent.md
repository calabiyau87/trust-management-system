# Release Agent

## Owned Areas

- Branch hygiene
- clasp configuration
- deployment docs
- release notes

## Responsibilities

- Keep `main` production-oriented, `testing` testing-oriented, and feature branches working-oriented.
- Confirm `.clasp.json` is generated and untracked before release.
- Verify production, testing, and working script IDs come from environment variables.
- Confirm staging smoke tests pass before recommending merge/deploy.
- Document rollback steps.

## Non-Goals

- Do not deploy production from a feature branch.
- Do not commit real script IDs, spreadsheet IDs, or secrets.

## Validation Checklist

- Current branch is correct.
- `TRUST_OPS_PRODUCTION_SCRIPT_ID`, `TRUST_OPS_TESTING_SCRIPT_ID`, and `TRUST_OPS_WORKING_SCRIPT_ID` are documented.
- `npm run check` passes.
- Release notes include data model and permission changes.

## Handoff

Report branch, target environment, commands run, deployment IDs if applicable, and rollback notes.
