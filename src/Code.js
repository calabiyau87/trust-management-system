function doGet() {
  return HtmlService.createHtmlOutputFromFile("Index")
    .setTitle("Trust Ops")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function resetTrustOpsRequest_() {
  TrustOpsSheetService.resetRequestCache();
}

function requireTrustOpsContext_() {
  resetTrustOpsRequest_();
  return TrustOpsAuthService.requireAuthorizedUser();
}

function setupTrustOps(spreadsheetId, ownerEmail) {
  resetTrustOpsRequest_();
  return TrustOpsMigrationService.bootstrap(spreadsheetId, ownerEmail);
}

function getInitialData() {
  resetTrustOpsRequest_();
  TrustOpsSheetService.ensureAllSheets();
  var context = TrustOpsAuthService.requireAuthorizedUser();
  var currentPayPeriod = TrustOpsPayService.getCurrentPayPeriod();
  return {
    appName: TrustOpsConfig.APP_NAME,
    constants: {
      roles: TrustOpsConfig.ROLES,
      taskStatuses: TrustOpsConfig.TASK_STATUSES,
      priorities: TrustOpsConfig.PRIORITIES,
      entryTypes: TrustOpsConfig.ENTRY_TYPES
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
    payPeriods: TrustOpsPayService.listPayPeriods(),
    currentPayPeriod: TrustOpsUtils.sanitizeForClient(currentPayPeriod),
    tasks: TrustOpsTaskService.listTasks(context, {}),
    tracker: TrustOpsTimeService.getTrackerData(context, { userId: context.userId, payPeriodId: currentPayPeriod["Pay Period ID"] }),
    paySummary: TrustOpsPayService.getPaySummary(context, { userId: context.userId, payPeriodId: currentPayPeriod["Pay Period ID"] }),
    timeRequests: TrustOpsTimeRequestService.listRequests(context, { status: TrustOpsConfig.REQUEST_STATUS.PENDING }),
    settings: TrustOpsPermissionService.canManageSettings(context) ? TrustOpsSettingsService.listSettings(context) : []
  };
}

function getAuthDiagnostic() {
  resetTrustOpsRequest_();
  return TrustOpsAuthService.getPublicAuthDiagnostic();
}

function refreshAppData(filters) {
  var context = requireTrustOpsContext_();
  var payload = filters || {};
  return {
    tasks: TrustOpsTaskService.listTasks(context, payload.taskFilters || {}),
    tracker: TrustOpsTimeService.getTrackerData(context, payload.timeFilters || {}),
    paySummary: TrustOpsPayService.getPaySummary(context, payload.payFilters || {}),
    users: TrustOpsUserService.listUsers(context, false),
    projects: TrustOpsProjectService.listProjects(false),
    categories: TrustOpsProjectService.listCategories(false),
    tags: TrustOpsTagService.listTags(false),
    boardViews: TrustOpsBoardViewService.listBoardViews(context),
    managerPermissions: TrustOpsPermissionService.isOwnerOrAdmin(context) ? TrustOpsManagerPermissionService.listManagerPermissions(context) : [],
    payPeriods: TrustOpsPayService.listPayPeriods(),
    timeRequests: TrustOpsTimeRequestService.listRequests(context, { status: TrustOpsConfig.REQUEST_STATUS.PENDING }),
    settings: TrustOpsPermissionService.canManageSettings(context) ? TrustOpsSettingsService.listSettings(context) : []
  };
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

function getMigrationPreview() {
  return TrustOpsMigrationService.getMigrationPreview(requireTrustOpsContext_());
}

function migrateAssignmentBoardTasks() {
  return TrustOpsMigrationService.migrateAssignmentBoardTasks(requireTrustOpsContext_());
}
