# Data Model

Canonical tables are created by `setupTrustOps(spreadsheetId, ownerEmail)`.

## Users

Stable ID: `User ID`

Tracks identity, role, active state, profile color/image/theme preferences, pay configuration, tracking flags, manager assignment, timestamps, and archive state.

Roles:

- Owner
- Admin
- Manager
- User

Pay types:

- Hourly
- Salary
- None

## Projects

Stable ID: `Project ID`

Stores project name, description, derived/manual status, active state, timestamps, and archive state.

Project status rules:

- `Not Started` when a project has no active tasks.
- `In Progress` when active incomplete work exists.
- `Completed` when all active tasks are complete.
- `Holding` is a manual status.
- `Archived` is separate from the project status field.

## Tasks

Stable ID: `Task ID`

Canonical task source of truth. Stores title, notes, status, due date, assignee names and IDs, project, priority, tags, creator, completion metadata, source, deferred integration fields, and archive state.

Statuses:

- In Progress
- Complete
- Blocked
- Waiting
- Archived

Priorities:

- Low
- Medium
- High
- Urgent

## Time Entries

Stable ID: `Time Entry ID`

Supports task time and general time. Stores date, user, entry type, task/category reference, project, hours, notes, pay period, creator/updater metadata, locked marker, and soft-delete marker.

Entry types:

- Task
- General Time

If a time category changes its default project, the app can optionally backfill earlier matching general-time entries from the previous default project to the new one.

## Pay Periods

Stable ID: `Pay Period ID`

Uses simple MVP statuses:

- Open
- Locked

If no pay period exists for an entry date, `PayService` generates one from `PAY_PERIOD_ANCHOR_DATE` and `DEFAULT_PAY_PERIOD_DAYS`.

## Tags

Stable ID: `Tag ID`

Stores reusable task tags for searchable dropdowns. Archived tags remain as historical text on existing tasks.

## Board Views

Stable ID: `Board View ID`

Stores saved Assignment Board filters, grouping, sorting, visible columns, owner, and Private/Shared visibility.

## User Permissions

Stable ID: `Manager Permission ID`

Stored in the `Manager Permissions` sheet for backward compatibility. Supports Manager preset defaults plus per-capability overrides for any user, including task creation, tag management, board-view management, profile-color changes, time, pay-period, and settings/admin scopes.

## Time Edit Requests

Stable ID: `Time Edit Request ID`

Stores locked-period create/edit/delete requests with before/after JSON, reason, status, and approval/rejection metadata.

## Pay Summaries

Stable ID: `Pay Summary ID`

Open periods are calculated live. When a period is locked, summaries are snapshotted for payroll history.

Locked-period summary lists read snapshot rows when available. Pay summary detail views are calculated from time entries on demand.

## Audit Log

Stable ID: `Audit ID`

Stores actor, timestamp, action, entity type, entity ID, before JSON, after JSON, and notes. Sensitive writes and locked-period overrides must be auditable.

## Settings

Stable ID: `Setting Key`

Stores non-sensitive configuration. Secrets and future webhook URLs should move to `PropertiesService`.

Current visual settings include `TASK_STATUS_COLORS_JSON` and `PROJECT_STATUS_COLORS_JSON`, status-to-hex-color maps used by Assignment Board and project dashboard badges.
