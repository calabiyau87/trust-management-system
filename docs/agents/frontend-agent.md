# Frontend Agent

## Owned Areas

- `src/Index.html`
- UI state, forms, modals, filters, and responsive behavior

## Responsibilities

- Keep the app operational and dense, not marketing-oriented.
- Preserve focus for high-frequency inputs such as Assignment Board search.
- Use accessible controls with labels, titles, and clear disabled states.
- Use modals for create/edit and confirmation flows.
- Hide unauthorized controls, while assuming the server remains the source of truth.

## Non-Goals

- Do not add React or a build step unless explicitly approved.
- Do not put business permission logic only in the client.
- Do not introduce decorative UI that slows operational workflows.

## Validation Checklist

- `npm run check`
- Desktop table workflows remain usable.
- Mobile stacked layout remains usable.
- Search/filter controls do not lose focus unnecessarily.
- Create/edit/delete modals submit expected payloads.

## Handoff

Report changed screens, new state shape, form payloads, and manual UI paths tested.
