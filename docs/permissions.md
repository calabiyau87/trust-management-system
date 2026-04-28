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
- Access to the spreadsheet can be granted explicitly as `None`, `View`, or `Editor`.

Admin cannot assign the Owner role.

## Manager

Operational access:

- View the Assignment Board.
- Default preset can manage their own tasks, create/edit tasks for others, create time entries for others, and manage projects.
- Additional task, time, pay-period, and settings permissions are controlled by Manager Permission overrides.
- Hierarchy creation and reparenting stay privileged; subprojects and subtasks are managed server-side.

Managers can be granted approval, lock/unlock, edit, delete, own-task, and settings capabilities through explicit overrides.

## User

Basic access:

- View the Assignment Board.
- Add time only to assigned tasks.
- Add general time for self.
- Edit own unlocked time entries.
- View own pay summary.
- Set their own light/dark/system theme.
- Upload their own profile image.
- Manage tasks they created when their own-task capability is enabled.
- Assigned users can complete leaf subtasks even if they cannot edit the parent task.

Users can be granted explicit capabilities, including creating/managing their own tasks, managing tags, and changing their profile color. Tasks a user creates can be edited and deleted by that user unless a broader server-side rule blocks the mutation. Tasks created by another user for them cannot be managed by the assignee except for completing and adding time.

If `Track Pay` is enabled for a user, `Track Time` is also enforced on the server so payroll users remain time-trackable.

## User Permission Overrides

The `Manager Permissions` sheet now stores per-capability overrides for any user, not only Managers. Existing Manager rows remain valid. Owner/Admin users can edit these overrides from the Users settings modal, while the server continues to enforce owner protections. The Owner's effective permissions are implicit and the UI does not need to display a matrix for that row.

The `Can Manage Own Tasks` capability defaults on for all roles. It controls whether a user can create, edit, delete, and add time to tasks they created themselves. The broader `Can Create Tasks` capability still covers task creation for others.

The `Sheet Access` field is only meaningful for Admin users. Owner access is implicit because the Owner owns the spreadsheet, and non-admin users do not receive direct spreadsheet sharing through the app.

## Locked Pay Periods

Locked pay periods block normal edits. Users without override permission create Time Edit Requests. Owner/Admin and Managers with approval permission can approve or reject those requests. Direct overrides require a reason and are audited.
