function doGet(e) {
  var template = HtmlService.createTemplateFromFile("Index");
  template.googleClientId = TrustOpsAuthService.getGoogleClientId();
  template.githubAuthUrl = TrustOpsAuthService.getGithubPagesAuthUrl();
  template.webAppUrl = ScriptApp.getService().getUrl();
  template.initialAuthToken = "";
  if (e && e.parameter) {
    template.initialAuthToken = TrustOpsUtils.normalizeText(
      e.parameter.trust_ops_token ||
      e.parameter.id_token ||
      e.parameter.auth_token ||
      e.parameter.token ||
      ""
    );
  }
  return template.evaluate()
    .setTitle("Trust Ops")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

var TrustOpsRequestAuth = {
  token: ""
};

function resetTrustOpsRequest_() {
  TrustOpsSheetService.resetRequestCache();
}

function requireTrustOpsContext_() {
  resetTrustOpsRequest_();
  return TrustOpsAuthService.requireAuthorizedUser(TrustOpsRequestAuth.token);
}

function invokeServer(methodName, authToken, args) {
  var previousToken = TrustOpsRequestAuth.token;
  TrustOpsRequestAuth.token = authToken || "";
  try {
    var fn = globalThis[methodName];
    if (!fn && this) {
      fn = this[methodName];
    }
    if (typeof fn !== "function") {
      throw new Error("Unknown server method: " + methodName);
    }
    return fn.apply(null, Array.isArray(args) ? args : []);
  } finally {
    TrustOpsRequestAuth.token = previousToken;
  }
}

function setupTrustOps(spreadsheetId, ownerEmail) {
  resetTrustOpsRequest_();
  return TrustOpsMigrationService.bootstrap(spreadsheetId, ownerEmail);
}

function getInitialData() {
  resetTrustOpsRequest_();
  var context = requireTrustOpsContext_();
  TrustOpsSheetService.ensureAllSheets();
  var googleProfile = context.googleProfile || {};
  if (googleProfile.picture && !context.user["Google Profile Photo URL"]) {
    context.user["Google Profile Photo URL"] = googleProfile.picture;
  }
  var currentPayPeriod = TrustOpsPayService.getCurrentPayPeriod();
  return {
    appName: TrustOpsConfig.APP_NAME,
    constants: {
      roles: TrustOpsConfig.ROLES,
      taskStatuses: TrustOpsConfig.TASK_STATUSES,
      projectStatuses: TrustOpsConfig.PROJECT_STATUSES,
      priorities: TrustOpsConfig.PRIORITIES,
      entryTypes: TrustOpsConfig.ENTRY_TYPES,
      themeModes: TrustOpsConfig.THEME_MODES,
      managerPresets: TrustOpsConfig.MANAGER_PRESETS,
      permissionCapabilities: TrustOpsManagerPermissionService.CAPABILITIES
    },
    currentUser: context.user,
    context: {
      userId: context.userId,
      email: context.email,
      fullName: context.fullName,
      role: context.role
    },
    permissions: TrustOpsPermissionService.getClientPermissions(context),
    users: TrustOpsUserService.listUsers(context, false),
    projects: TrustOpsProjectService.listProjects(false),
    categories: TrustOpsProjectService.listCategories(false),
    tags: TrustOpsTagService.listTags(false),
    boardViews: TrustOpsBoardViewService.listBoardViews(context),
    managerPermissions: TrustOpsPermissionService.isOwnerOrAdmin(context) ? TrustOpsManagerPermissionService.listManagerPermissions(context) : [],
    userPermissions: TrustOpsPermissionService.isOwnerOrAdmin(context) ? TrustOpsManagerPermissionService.listUserPermissions(context) : [],
    payPeriods: TrustOpsPayService.listPayPeriods(),
    currentPayPeriod: TrustOpsUtils.sanitizeForClient(currentPayPeriod),
    organizationName: TrustOpsSettingsService.getOrganizationName(),
    tasks: TrustOpsTaskService.listTasks(context, {}),
    tracker: TrustOpsTimeService.getTrackerData(context, { userId: context.userId, payPeriodId: currentPayPeriod["Pay Period ID"] }),
    paySummary: TrustOpsPayService.getPaySummary(context, { userId: context.userId, payPeriodId: currentPayPeriod["Pay Period ID"] }),
    projectDashboard: TrustOpsProjectService.getProjectDashboard(context, { rangeMode: "current" }),
    timeRequests: TrustOpsTimeRequestService.listRequests(context, { status: TrustOpsConfig.REQUEST_STATUS.PENDING }),
    settings: TrustOpsPermissionService.canManageSettings(context) ? TrustOpsSettingsService.listSettings(context) : [],
    organizationName: TrustOpsSettingsService.getOrganizationName(),
    visualSettings: TrustOpsSettingsService.getClientVisualSettings(),
    googleProfile: googleProfile
  };
}

function getAuthDiagnostic() {
  resetTrustOpsRequest_();
  return TrustOpsAuthService.getPublicAuthDiagnostic(TrustOpsRequestAuth.token);
}

function refreshAppData(filters) {
  var context = requireTrustOpsContext_();
  var payload = filters || {};
  return {
    currentUser: context.user,
    context: {
      userId: context.userId,
      email: context.email,
      fullName: context.fullName,
      role: context.role
    },
    permissions: TrustOpsPermissionService.getClientPermissions(context),
    tasks: TrustOpsTaskService.listTasks(context, payload.taskFilters || {}),
    tracker: TrustOpsTimeService.getTrackerData(context, payload.timeFilters || {}),
    paySummary: TrustOpsPayService.getPaySummary(context, payload.payFilters || {}),
    users: TrustOpsUserService.listUsers(context, false),
    projects: TrustOpsProjectService.listProjects(false),
    categories: TrustOpsProjectService.listCategories(false),
    tags: TrustOpsTagService.listTags(false),
    projectDashboard: TrustOpsProjectService.getProjectDashboard(context, payload.projectFilters || { rangeMode: "current" }),
    boardViews: TrustOpsBoardViewService.listBoardViews(context),
    managerPermissions: TrustOpsPermissionService.isOwnerOrAdmin(context) ? TrustOpsManagerPermissionService.listManagerPermissions(context) : [],
    userPermissions: TrustOpsPermissionService.isOwnerOrAdmin(context) ? TrustOpsManagerPermissionService.listUserPermissions(context) : [],
    payPeriods: TrustOpsPayService.listPayPeriods(),
    timeRequests: TrustOpsTimeRequestService.listRequests(context, { status: TrustOpsConfig.REQUEST_STATUS.PENDING }),
    settings: TrustOpsPermissionService.canManageSettings(context) ? TrustOpsSettingsService.listSettings(context) : [],
    organizationName: TrustOpsSettingsService.getOrganizationName(),
    visualSettings: TrustOpsSettingsService.getClientVisualSettings()
  };
}

function getBoardData(filters) {
  var context = requireTrustOpsContext_();
  return {
    tasks: TrustOpsTaskService.listTasks(context, filters || {}),
    tags: TrustOpsTagService.listTags(false),
    boardViews: TrustOpsBoardViewService.listBoardViews(context),
    visualSettings: TrustOpsSettingsService.getClientVisualSettings()
  };
}

function getProjectDashboard(filters) {
  return TrustOpsProjectService.getProjectDashboard(requireTrustOpsContext_(), filters || {});
}

function getProjectDetail(projectId, filters) {
  return TrustOpsProjectService.getProjectDetail(requireTrustOpsContext_(), projectId, filters || {});
}

function createTask(payload) {
  return TrustOpsTaskService.createTask(requireTrustOpsContext_(), payload || {});
}

function updateTask(payload) {
  return TrustOpsTaskService.updateTask(requireTrustOpsContext_(), payload || {});
}

function completeTask(taskId) {
  return TrustOpsTaskService.completeTask(requireTrustOpsContext_(), taskId);
}

function archiveTask(taskId) {
  return TrustOpsTaskService.archiveTask(requireTrustOpsContext_(), taskId);
}

function createTimeEntry(payload) {
  return TrustOpsTimeService.createTimeEntry(requireTrustOpsContext_(), payload || {});
}

function clockInPunch(payload) {
  return TrustOpsTimeService.clockIn(requireTrustOpsContext_(), payload || {});
}

function clockOutPunch(payload) {
  return TrustOpsTimeService.clockOut(requireTrustOpsContext_(), payload || {});
}

function clockTransferPunch(payload) {
  return TrustOpsTimeService.clockTransfer(requireTrustOpsContext_(), payload || {});
}

function updateTimeEntry(payload) {
  return TrustOpsTimeService.updateTimeEntry(requireTrustOpsContext_(), payload || {});
}

function deleteTimeEntry(payload) {
  return TrustOpsTimeService.deleteTimeEntry(requireTrustOpsContext_(), payload || {});
}

function getTimeEntries(filters) {
  return TrustOpsTimeService.listTimeEntries(requireTrustOpsContext_(), filters || {});
}

function getTrackerData(filters) {
  return TrustOpsTimeService.getTrackerData(requireTrustOpsContext_(), filters || {});
}

function getPaySummary(filters) {
  return TrustOpsPayService.getPaySummary(requireTrustOpsContext_(), filters || {});
}

function getPaySummaryDetail(filters) {
  return TrustOpsPayService.getPaySummaryDetail(requireTrustOpsContext_(), filters || {});
}

function getPayPeriodForDate(dateValue) {
  requireTrustOpsContext_();
  return TrustOpsUtils.sanitizeForClient(TrustOpsPayService.findPayPeriodForDate(dateValue));
}

function lockPayPeriod(payPeriodId) {
  return TrustOpsPayService.lockPayPeriod(requireTrustOpsContext_(), payPeriodId);
}

function unlockPayPeriod(payPeriodId) {
  return TrustOpsPayService.unlockPayPeriod(requireTrustOpsContext_(), payPeriodId);
}

function saveUser(payload) {
  return TrustOpsUserService.saveUser(requireTrustOpsContext_(), payload || {});
}

function updateProfile(payload) {
  return TrustOpsUserService.updateProfile(requireTrustOpsContext_(), payload || {});
}

function uploadProfileImage(payload) {
  return TrustOpsUserService.uploadProfileImage(requireTrustOpsContext_(), payload || {});
}

function removeProfileImage(userId) {
  return TrustOpsUserService.removeProfileImage(requireTrustOpsContext_(), userId);
}

function shareSpreadsheetWithUser(userId) {
  return TrustOpsUserService.shareSpreadsheetWithUser(requireTrustOpsContext_(), userId);
}

function syncSpreadsheetAccess() {
  return TrustOpsUserService.syncSpreadsheetAccess(requireTrustOpsContext_());
}

function archiveUser(userId) {
  return TrustOpsUserService.archiveUser(requireTrustOpsContext_(), userId);
}

function saveProject(payload) {
  return TrustOpsProjectService.saveProject(requireTrustOpsContext_(), payload || {});
}

function saveCategory(payload) {
  return TrustOpsProjectService.saveCategory(requireTrustOpsContext_(), payload || {});
}

function archiveProject(projectId) {
  return TrustOpsProjectService.archiveProject(requireTrustOpsContext_(), projectId);
}

function unarchiveProject(projectId) {
  return TrustOpsProjectService.unarchiveProject(requireTrustOpsContext_(), projectId);
}

function archiveCategory(categoryId) {
  return TrustOpsProjectService.archiveCategory(requireTrustOpsContext_(), categoryId);
}

function saveTag(payload) {
  return TrustOpsTagService.saveTag(requireTrustOpsContext_(), payload || {});
}

function archiveTag(tagId) {
  return TrustOpsTagService.archiveTag(requireTrustOpsContext_(), tagId);
}

function saveBoardView(payload) {
  return TrustOpsBoardViewService.saveBoardView(requireTrustOpsContext_(), payload || {});
}

function archiveBoardView(viewId) {
  return TrustOpsBoardViewService.archiveBoardView(requireTrustOpsContext_(), viewId);
}

function saveManagerPermissions(payload) {
  return TrustOpsManagerPermissionService.saveManagerPermissions(requireTrustOpsContext_(), payload || {});
}

function saveUserPermissions(payload) {
  return TrustOpsManagerPermissionService.saveUserPermissions(requireTrustOpsContext_(), payload || {});
}

function createTimeEditRequest(payload) {
  return TrustOpsTimeRequestService.createRequest(requireTrustOpsContext_(), payload || {});
}

function approveTimeEditRequest(requestId, decisionNotes) {
  return TrustOpsTimeRequestService.approveRequest(requireTrustOpsContext_(), requestId, decisionNotes || "");
}

function rejectTimeEditRequest(requestId, decisionNotes) {
  return TrustOpsTimeRequestService.rejectRequest(requireTrustOpsContext_(), requestId, decisionNotes || "");
}

function diagnoseUserAccess(email) {
  return TrustOpsAuthService.diagnoseUserAccess(requireTrustOpsContext_(), email);
}

function saveSetting(payload) {
  return TrustOpsSettingsService.saveSetting(requireTrustOpsContext_(), payload || {});
}

function getMigrationPreview(payload) {
  return TrustOpsMigrationService.getLegacyMigrationPreview(requireTrustOpsContext_(), payload || {});
}

function getLegacyMigrationPreview(payload) {
  return TrustOpsMigrationService.getLegacyMigrationPreview(requireTrustOpsContext_(), payload || {});
}

function migrateAssignmentBoardTasks() {
  return TrustOpsMigrationService.migrateAssignmentBoardTasks(requireTrustOpsContext_());
}

function repairTaskAssigneeAssignments() {
  return TrustOpsMigrationService.repairTaskAssigneeAssignments(requireTrustOpsContext_());
}

function importLegacyWorkbook(payload) {
  return TrustOpsMigrationService.importLegacyWorkbook(requireTrustOpsContext_(), payload || {});
}
