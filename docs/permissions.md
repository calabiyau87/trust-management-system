# Permissions

Permissions are enforced server-side in `TrustOpsPermissionService`. UI hiding is only a convenience.

## Owner

Full system access:

- Manage users, roles, pay settings, projects, categories, and settings.
- Create/edit/complete tasks.
- Create/edit/view all time entries.
- View all pay summaries.
- Lock pay periods.
- Override locked-period edits with an audit reason.

## Admin

Administrative access:

- Manage users, roles, pay settings, projects, categories, and settings.
- Create/edit/complete tasks.
- Create/edit/view all time entries.
- View all pay summaries.
- Lock pay periods.
- Override locked-period edits with an audit reason.

Admin cannot assign the Owner role.

## Manager

Operational access:

- View the Assignment Board.
- Default preset can create/edit tasks, create time entries for others, and manage projects.
- Additional task, time, pay-period, and settings permissions are controlled by Manager Permission overrides.

Managers can be granted approval, lock/unlock, edit, delete, and settings capabilities through explicit overrides.

## User

Basic access:

- View the Assignment Board.
- Add time only to assigned tasks.
- Add general time for self.
- Edit own unlocked time entries.
- View own pay summary.

Users cannot complete or edit tasks in the MVP.

## Locked Pay Periods

Locked pay periods block normal edits. Users without override permission create Time Edit Requests. Owner/Admin and Managers with approval permission can approve or reject those requests. Direct overrides require a reason and are audited.
