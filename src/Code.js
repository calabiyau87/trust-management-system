function doGet() {
  return HtmlService.createHtmlOutputFromFile("Index")
    .setTitle("Trust Ops")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function setupTrustOps(spreadsheetId, ownerEmail) {
  return TrustOpsMigrationService.bootstrap(spreadsheetId, ownerEmail);
}

function getInitialData() {
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
    payPeriods: TrustOpsPayService.listPayPeriods(),
    currentPayPeriod: TrustOpsUtils.sanitizeForClient(currentPayPeriod),
    tasks: TrustOpsTaskService.listTasks(context, {}),
    tracker: TrustOpsTimeService.getTrackerData(context, { userId: context.userId, payPeriodId: currentPayPeriod["Pay Period ID"] }),
    paySummary: TrustOpsPayService.getPaySummary(context, { userId: context.userId, payPeriodId: currentPayPeriod["Pay Period ID"] }),
    settings: TrustOpsPermissionService.canManageSettings(context) ? TrustOpsSettingsService.listSettings(context) : []
  };
}

function refreshAppData(filters) {
  var context = TrustOpsAuthService.requireAuthorizedUser();
  var payload = filters || {};
  return {
    tasks: TrustOpsTaskService.listTasks(context, payload.taskFilters || {}),
    tracker: TrustOpsTimeService.getTrackerData(context, payload.timeFilters || {}),
    paySummary: TrustOpsPayService.getPaySummary(context, payload.payFilters || {}),
    users: TrustOpsUserService.listUsers(context, false),
    projects: TrustOpsProjectService.listProjects(false),
    categories: TrustOpsProjectService.listCategories(false),
    payPeriods: TrustOpsPayService.listPayPeriods(),
    settings: TrustOpsPermissionService.canManageSettings(context) ? TrustOpsSettingsService.listSettings(context) : []
  };
}

function createTask(payload) {
  return TrustOpsTaskService.createTask(TrustOpsAuthService.requireAuthorizedUser(), payload || {});
}

function updateTask(payload) {
  return TrustOpsTaskService.updateTask(TrustOpsAuthService.requireAuthorizedUser(), payload || {});
}

function completeTask(taskId) {
  return TrustOpsTaskService.completeTask(TrustOpsAuthService.requireAuthorizedUser(), taskId);
}

function createTimeEntry(payload) {
  return TrustOpsTimeService.createTimeEntry(TrustOpsAuthService.requireAuthorizedUser(), payload || {});
}

function updateTimeEntry(payload) {
  return TrustOpsTimeService.updateTimeEntry(TrustOpsAuthService.requireAuthorizedUser(), payload || {});
}

function getTimeEntries(filters) {
  return TrustOpsTimeService.listTimeEntries(TrustOpsAuthService.requireAuthorizedUser(), filters || {});
}

function getTrackerData(filters) {
  return TrustOpsTimeService.getTrackerData(TrustOpsAuthService.requireAuthorizedUser(), filters || {});
}

function getPaySummary(filters) {
  return TrustOpsPayService.getPaySummary(TrustOpsAuthService.requireAuthorizedUser(), filters || {});
}

function lockPayPeriod(payPeriodId) {
  return TrustOpsPayService.lockPayPeriod(TrustOpsAuthService.requireAuthorizedUser(), payPeriodId);
}

function saveUser(payload) {
  return TrustOpsUserService.saveUser(TrustOpsAuthService.requireAuthorizedUser(), payload || {});
}

function archiveUser(userId) {
  return TrustOpsUserService.archiveUser(TrustOpsAuthService.requireAuthorizedUser(), userId);
}

function saveProject(payload) {
  return TrustOpsProjectService.saveProject(TrustOpsAuthService.requireAuthorizedUser(), payload || {});
}

function saveCategory(payload) {
  return TrustOpsProjectService.saveCategory(TrustOpsAuthService.requireAuthorizedUser(), payload || {});
}

function saveSetting(payload) {
  return TrustOpsSettingsService.saveSetting(TrustOpsAuthService.requireAuthorizedUser(), payload || {});
}

function getMigrationPreview() {
  return TrustOpsMigrationService.getMigrationPreview(TrustOpsAuthService.requireAuthorizedUser());
}

function migrateAssignmentBoardTasks() {
  return TrustOpsMigrationService.migrateAssignmentBoardTasks(TrustOpsAuthService.requireAuthorizedUser());
}
