var TrustOpsPermissionService = (function () {
  function hasRole(context, roles) {
    if (!context) return false;
    return roles.indexOf(context.role) !== -1;
  }

  function isOwner(context) {
    return hasRole(context, [TrustOpsConfig.ROLES.OWNER]);
  }

  function isAdmin(context) {
    return hasRole(context, [TrustOpsConfig.ROLES.ADMIN]);
  }

  function isManager(context) {
    return hasRole(context, [TrustOpsConfig.ROLES.MANAGER]);
  }

  function isPrivileged(context) {
    return hasRole(context, [TrustOpsConfig.ROLES.OWNER, TrustOpsConfig.ROLES.ADMIN, TrustOpsConfig.ROLES.MANAGER]);
  }

  function isOwnerOrAdmin(context) {
    return hasRole(context, [TrustOpsConfig.ROLES.OWNER, TrustOpsConfig.ROLES.ADMIN]);
  }

  function canViewBoard(context) {
    return Boolean(context);
  }

  function canCreateTask(context) {
    return isPrivileged(context);
  }

  function canEditTask(context) {
    return isPrivileged(context);
  }

  function canCompleteTask(context) {
    return isPrivileged(context);
  }

  function getAssigneeIds(task) {
    return TrustOpsUtils.splitList(task && task["Assignee User IDs"]);
  }

  function isAssignedToTask(context, task) {
    if (!context || !task) return false;
    return getAssigneeIds(task).indexOf(String(context.userId)) !== -1;
  }

  function canAddTimeToTask(context, task, targetUserId) {
    if (!context || !task) return false;
    var effectiveUserId = targetUserId || context.userId;
    if (isPrivileged(context)) {
      return getAssigneeIds(task).indexOf(String(effectiveUserId)) !== -1 || isOwnerOrAdmin(context) || isManager(context);
    }
    return String(effectiveUserId) === String(context.userId) && isAssignedToTask(context, task);
  }

  function canCreateTimeEntry(context, targetUserId) {
    if (!context) return false;
    if (isOwnerOrAdmin(context) || isManager(context)) return true;
    return String(targetUserId || context.userId) === String(context.userId);
  }

  function canViewTimeEntries(context, targetUserId) {
    if (!context) return false;
    if (isOwnerOrAdmin(context)) return true;
    return String(targetUserId || context.userId) === String(context.userId);
  }

  function canEditTimeEntry(context, entry) {
    if (!context || !entry) return false;
    if (isOwnerOrAdmin(context)) return true;
    if (isManager(context)) return false;
    return String(entry["User ID"]) === String(context.userId);
  }

  function canOverrideLockedPeriod(context) {
    return isOwnerOrAdmin(context);
  }

  function canViewPaySummary(context, targetUserId) {
    if (!context) return false;
    if (isOwnerOrAdmin(context)) return true;
    return String(targetUserId || context.userId) === String(context.userId);
  }

  function canManageUsers(context) {
    return isOwnerOrAdmin(context);
  }

  function canSetPayRate(context) {
    return isOwnerOrAdmin(context);
  }

  function canManageProjects(context) {
    return isPrivileged(context);
  }

  function canManageSettings(context) {
    return isOwnerOrAdmin(context);
  }

  function getClientPermissions(context) {
    return {
      canViewBoard: canViewBoard(context),
      canCreateTask: canCreateTask(context),
      canEditTask: canEditTask(context),
      canCompleteTask: canCompleteTask(context),
      canCreateTimeForAnyUser: isOwnerOrAdmin(context) || isManager(context),
      canViewAllTime: isOwnerOrAdmin(context),
      canEditAllTime: isOwnerOrAdmin(context),
      canViewAllPay: isOwnerOrAdmin(context),
      canManageUsers: canManageUsers(context),
      canManageProjects: canManageProjects(context),
      canManageSettings: canManageSettings(context),
      canOverrideLockedPeriod: canOverrideLockedPeriod(context)
    };
  }

  function requireAllowed(allowed, message) {
    if (!allowed) {
      throw new Error(message || "You do not have permission to perform this action.");
    }
  }

  return {
    hasRole: hasRole,
    isOwner: isOwner,
    isAdmin: isAdmin,
    isManager: isManager,
    isPrivileged: isPrivileged,
    isOwnerOrAdmin: isOwnerOrAdmin,
    canViewBoard: canViewBoard,
    canCreateTask: canCreateTask,
    canEditTask: canEditTask,
    canCompleteTask: canCompleteTask,
    isAssignedToTask: isAssignedToTask,
    canAddTimeToTask: canAddTimeToTask,
    canCreateTimeEntry: canCreateTimeEntry,
    canViewTimeEntries: canViewTimeEntries,
    canEditTimeEntry: canEditTimeEntry,
    canOverrideLockedPeriod: canOverrideLockedPeriod,
    canViewPaySummary: canViewPaySummary,
    canManageUsers: canManageUsers,
    canSetPayRate: canSetPayRate,
    canManageProjects: canManageProjects,
    canManageSettings: canManageSettings,
    getClientPermissions: getClientPermissions,
    requireAllowed: requireAllowed
  };
})();
