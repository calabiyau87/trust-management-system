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
- Create/edit/complete tasks.
- Create time entries for any user.
- Manage projects.

Managers cannot edit existing time entries in the MVP.

## User

Basic access:

- View the Assignment Board.
- Add time only to assigned tasks.
- Add general time for self.
- Edit own unlocked time entries.
- View own pay summary.

Users cannot complete or edit tasks in the MVP.

## Locked Pay Periods

Locked pay periods block normal edits. Owner/Admin can override locked-period time entry creation or edits only when an override reason is provided. The override is written to the audit log.
