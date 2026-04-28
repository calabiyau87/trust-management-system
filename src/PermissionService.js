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
    return isOwnerOrAdmin(context) || isManager(context);
  }

  function isOwnerOrAdmin(context) {
    return hasRole(context, [TrustOpsConfig.ROLES.OWNER, TrustOpsConfig.ROLES.ADMIN]);
  }

  function managerCan(context, capability) {
    return TrustOpsManagerPermissionService.managerCan(context, capability);
  }

  function canManageOwnTasks(context) {
    return isOwnerOrAdmin(context) || managerCan(context, "Can Manage Own Tasks");
  }

  function canCreateTasksForOthers(context) {
    return isOwnerOrAdmin(context) || managerCan(context, "Can Create Tasks");
  }

  function createdByCurrentUser(context, record) {
    if (!context || !record) return false;
    return String(record["Created By User ID"] || "") === String(context.userId || "");
  }

  function userIdIsOwner(userId) {
    if (!TrustOpsUtils.normalizeText(userId)) return false;
    var user = TrustOpsAuthService.getUserById(userId);
    return user && user.Role === TrustOpsConfig.ROLES.OWNER;
  }

  function ownerControlled(record) {
    if (!record) return false;
    var userId = record["User ID"] || record["Created By User ID"] || record["Owner User ID"] || "";
    return userIdIsOwner(userId);
  }

  function canAdminMutateRecord(context, record) {
    if (isOwner(context)) return true;
    if (isAdmin(context)) return !ownerControlled(record);
    return false;
  }

  function canViewBoard(context) {
    return Boolean(context);
  }

  function canCreateTask(context) {
    return canManageOwnTasks(context) || canCreateTasksForOthers(context);
  }

  function canEditTask(context, task) {
    if (!context || !task) return false;
    if (canAdminMutateRecord(context, task)) return true;
    if (managerCan(context, "Can Edit Tasks")) return true;
    return canManageOwnTasks(context) && createdByCurrentUser(context, task);
  }

  function canDeleteTask(context, task) {
    if (!context || !task) return false;
    if (canAdminMutateRecord(context, task)) return true;
    if (managerCan(context, "Can Delete Tasks")) return true;
    return canManageOwnTasks(context) && createdByCurrentUser(context, task);
  }

  function canCompleteTask(context, task) {
    if (!context || !task) return false;
    if (canEditTask(context, task)) return true;
    return isAssignedToTask(context, task) && Number(task["Child Task Count"] || 0) === 0;
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
    if (isOwnerOrAdmin(context)) return true;
    if (managerCan(context, "Can Create Time For Others")) return true;
    if (String(effectiveUserId) !== String(context.userId)) return false;
    if (isAssignedToTask(context, task)) return true;
    return canManageOwnTasks(context) && createdByCurrentUser(context, task);
  }

  function canCreateTimeEntry(context, targetUserId) {
    if (!context) return false;
    if (isOwnerOrAdmin(context)) return true;
    if (managerCan(context, "Can Create Time For Others")) return true;
    return String(targetUserId || context.userId) === String(context.userId);
  }

  function canViewTimeEntries(context, targetUserId) {
    if (!context) return false;
    if (isOwnerOrAdmin(context)) return true;
    if (managerCan(context, "Can View All Time")) return true;
    return String(targetUserId || context.userId) === String(context.userId);
  }

  function canEditTimeEntry(context, entry) {
    if (!context || !entry) return false;
    if (canAdminMutateRecord(context, entry)) return true;
    if (managerCan(context, "Can Edit Time Entries")) return true;
    return String(entry["User ID"]) === String(context.userId) || String(entry["Created By User ID"]) === String(context.userId);
  }

  function canDeleteTimeEntry(context, entry) {
    if (!context || !entry) return false;
    if (canAdminMutateRecord(context, entry)) return true;
    if (managerCan(context, "Can Delete Time Entries")) return true;
    return String(entry["User ID"]) === String(context.userId) || String(entry["Created By User ID"]) === String(context.userId);
  }

  function canApproveTimeRequests(context) {
    return isOwnerOrAdmin(context) || managerCan(context, "Can Approve Time Requests");
  }

  function canLockPayPeriod(context) {
    return isOwnerOrAdmin(context) || managerCan(context, "Can Lock Pay Periods");
  }

  function canUnlockPayPeriod(context) {
    return isOwnerOrAdmin(context) || managerCan(context, "Can Unlock Pay Periods");
  }

  function canOverrideLockedPeriod(context) {
    return canLockPayPeriod(context) || canUnlockPayPeriod(context);
  }

  function canViewPaySummary(context, targetUserId) {
    if (!context) return false;
    if (isOwnerOrAdmin(context) || managerCan(context, "Can View All Pay")) return true;
    return String(targetUserId || context.userId) === String(context.userId);
  }

  function canManageUsers(context) {
    return isOwnerOrAdmin(context) || managerCan(context, "Can Manage Users");
  }

  function canSetPayRate(context) {
    return isOwnerOrAdmin(context);
  }

  function canManageProjects(context) {
    return isOwnerOrAdmin(context) || managerCan(context, "Can Manage Projects");
  }

  function canManageTimeCategories(context) {
    return isOwnerOrAdmin(context) || managerCan(context, "Can Manage Time Categories");
  }

  function canManageTags(context) {
    return isOwnerOrAdmin(context) || managerCan(context, "Can Manage Tags");
  }

  function canManageSettings(context) {
    return isOwnerOrAdmin(context) || managerCan(context, "Can Manage Settings");
  }

  function canManageOrganization(context) {
    return isOwnerOrAdmin(context) || managerCan(context, "Can Manage Organization");
  }

  function canImportLegacyData(context) {
    return isOwnerOrAdmin(context) || managerCan(context, "Can Import Legacy Data");
  }

  function canManageBoardViews(context) {
    return isOwnerOrAdmin(context) || managerCan(context, "Can Manage Board Views") || managerCan(context, "Can Manage Settings");
  }

  function canEditProfile(context, userId) {
    if (!context) return false;
    return String(context.userId) === String(userId) || canManageUsers(context);
  }

  function canChangeProfileColor(context, userId) {
    if (!context) return false;
    if (isOwnerOrAdmin(context)) return true;
    return String(context.userId) === String(userId) && managerCan(context, "Can Change Profile Color");
  }

  function getClientPermissions(context) {
    return {
      canViewBoard: canViewBoard(context),
      canCreateTask: canCreateTask(context),
      canManageOwnTasks: canManageOwnTasks(context),
      canCreateTasksForOthers: canCreateTasksForOthers(context),
      canEditTask: isOwnerOrAdmin(context) || managerCan(context, "Can Edit Tasks"),
      canDeleteTask: isOwnerOrAdmin(context) || managerCan(context, "Can Delete Tasks"),
      canCompleteTask: isOwnerOrAdmin(context) || managerCan(context, "Can Edit Tasks"),
      canCreateTimeForAnyUser: isOwnerOrAdmin(context) || managerCan(context, "Can Create Time For Others"),
      canViewAllTime: isOwnerOrAdmin(context) || managerCan(context, "Can View All Time"),
      canEditAllTime: isOwnerOrAdmin(context) || managerCan(context, "Can Edit Time Entries"),
      canDeleteAllTime: isOwnerOrAdmin(context) || managerCan(context, "Can Delete Time Entries"),
      canApproveTimeRequests: canApproveTimeRequests(context),
      canViewAllPay: isOwnerOrAdmin(context) || managerCan(context, "Can View All Pay"),
      canManageUsers: canManageUsers(context),
      canManageProjects: canManageProjects(context),
      canManageTimeCategories: canManageTimeCategories(context),
      canManageTags: canManageTags(context),
      canManageOrganization: canManageOrganization(context),
      canManageSettings: canManageSettings(context),
      canImportLegacyData: canImportLegacyData(context),
      canManageBoardViews: canManageBoardViews(context),
      canChangeProfileColor: canChangeProfileColor(context, context.userId),
      canLockPayPeriod: canLockPayPeriod(context),
      canUnlockPayPeriod: canUnlockPayPeriod(context),
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
    userIdIsOwner: userIdIsOwner,
    ownerControlled: ownerControlled,
    canAdminMutateRecord: canAdminMutateRecord,
    canViewBoard: canViewBoard,
    canManageOwnTasks: canManageOwnTasks,
    canCreateTasksForOthers: canCreateTasksForOthers,
    canCreateTask: canCreateTask,
    canEditTask: canEditTask,
    canDeleteTask: canDeleteTask,
    canCompleteTask: canCompleteTask,
    isAssignedToTask: isAssignedToTask,
    canAddTimeToTask: canAddTimeToTask,
    canCreateTimeEntry: canCreateTimeEntry,
    canViewTimeEntries: canViewTimeEntries,
    canEditTimeEntry: canEditTimeEntry,
    canDeleteTimeEntry: canDeleteTimeEntry,
    canApproveTimeRequests: canApproveTimeRequests,
    canLockPayPeriod: canLockPayPeriod,
    canUnlockPayPeriod: canUnlockPayPeriod,
    canOverrideLockedPeriod: canOverrideLockedPeriod,
    canViewPaySummary: canViewPaySummary,
    canManageUsers: canManageUsers,
    canSetPayRate: canSetPayRate,
    canManageProjects: canManageProjects,
    canManageTimeCategories: canManageTimeCategories,
    canManageTags: canManageTags,
    canManageOrganization: canManageOrganization,
    canManageSettings: canManageSettings,
    canImportLegacyData: canImportLegacyData,
    canManageBoardViews: canManageBoardViews,
    canChangeProfileColor: canChangeProfileColor,
    canEditProfile: canEditProfile,
    getClientPermissions: getClientPermissions,
    requireAllowed: requireAllowed
  };
})();
