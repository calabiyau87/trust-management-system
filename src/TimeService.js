var TrustOpsTimeService = (function () {
  function resolveTargetUser(context, payload) {
    var targetUserId = payload.userId || payload["User ID"] || context.userId;
    TrustOpsPermissionService.requireAllowed(
      TrustOpsPermissionService.canCreateTimeEntry(context, targetUserId),
      "You do not have permission to create time for this user."
    );
    var user = TrustOpsAuthService.getUserById(targetUserId);
    if (!user) throw new Error("Target user not found.");
    if (!TrustOpsUtils.toBoolean(user.Active)) throw new Error("Target user is inactive.");
    if (!TrustOpsUtils.toBoolean(user["Track Time"])) throw new Error("Target user is not configured for time tracking.");
    return user;
  }

  function validateHours(hours) {
    var numberValue = TrustOpsUtils.toNumber(hours);
    if (numberValue <= 0) throw new Error("Hours must be greater than 0.");
    if (numberValue > 24) throw new Error("Hours cannot exceed 24 for one entry.");
    return Math.round(numberValue * 100) / 100;
  }

  function getPeriodByIdOrDate(payPeriodId, dateValue) {
    var period = payPeriodId ? TrustOpsSheetService.findById(TrustOpsConfig.SHEETS.PAY_PERIODS, payPeriodId) : null;
    return period || TrustOpsPayService.findPayPeriodForDate(dateValue);
  }

  function requireUnlockedOrOverride(context, period, overrideReason) {
    if (!TrustOpsPayService.isLocked(period)) return false;
    TrustOpsPermissionService.requireAllowed(
      TrustOpsPermissionService.canOverrideLockedPeriod(context),
      "This pay period is locked. Only Owner/Admin can override it."
    );
    TrustOpsUtils.requireValue(overrideReason, "Override reason");
    return true;
  }

  function buildTimeRecord(context, payload, existing) {
    var now = TrustOpsUtils.nowIso();
    var targetUser = existing ? TrustOpsAuthService.getUserById(existing["User ID"]) : resolveTargetUser(context, payload || {});
    var entryType = payload.entryType || payload["Entry Type"] || existing && existing["Entry Type"] || TrustOpsConfig.ENTRY_TYPES.TASK;
    var dateValue = TrustOpsUtils.formatDate(payload.Date || payload.date || existing && existing.Date);
    TrustOpsUtils.requireValue(dateValue, "Date");
    var hours = validateHours(payload.Hours || payload.hours || existing && existing.Hours);
    var projectId = payload["Project ID"] || payload.projectId || "";
    var projectName = payload["Project Name"] || payload.projectName || "";
    var taskId = "";
    var categoryId = "";
    var taskOrCategory = "";

    if (entryType === TrustOpsConfig.ENTRY_TYPES.TASK) {
      taskId = payload["Task ID"] || payload.taskId || existing && existing["Task ID"];
      var task = TrustOpsSheetService.findById(TrustOpsConfig.SHEETS.TASKS, taskId);
      if (!task) throw new Error("Task is required for task time.");
      var isSameExistingTask = existing && String(existing["Task ID"]) === String(taskId);
      if (!isSameExistingTask && (task.Status === "Complete" || task.Status === "Archived")) {
        throw new Error("Time cannot be added to a completed or archived task.");
      }
      TrustOpsPermissionService.requireAllowed(
        TrustOpsPermissionService.canAddTimeToTask(context, task, targetUser["User ID"]),
        "You cannot add time to this task."
      );
      projectId = task["Project ID"];
      projectName = task["Project Name"];
      taskOrCategory = task.Title;
    } else {
      entryType = TrustOpsConfig.ENTRY_TYPES.GENERAL;
      categoryId = payload["Category ID"] || payload.categoryId || existing && existing["Category ID"];
      var category = TrustOpsSheetService.findById(TrustOpsConfig.SHEETS.TIME_CATEGORIES, categoryId);
      if (!category) throw new Error("Category is required for general time.");
      if (!TrustOpsUtils.toBoolean(category.Active)) throw new Error("Selected category is inactive.");
      projectId = projectId || category["Default Project ID"];
      projectName = projectName || category["Default Project"];
      taskOrCategory = "[General] " + category.Category;
    }

    var period = TrustOpsPayService.findPayPeriodForDate(dateValue);
    return {
      record: {
        "Date": dateValue,
        "User ID": targetUser["User ID"],
        "User Name": targetUser["Full Name"],
        "Entry Type": entryType,
        "Task ID": taskId,
        "Category ID": categoryId,
        "Task / Category": taskOrCategory,
        "Project ID": projectId,
        "Project Name": projectName,
        "Hours": hours,
        "Notes": payload.Notes || payload.notes || existing && existing.Notes || "",
        "Pay Period ID": period["Pay Period ID"],
        "Pay Period Label": period["Pay Period Label"],
        "Created By User ID": existing ? existing["Created By User ID"] : context.userId,
        "Created At": existing ? existing["Created At"] : now,
        "Updated By User ID": context.userId,
        "Updated At": now,
        "Locked": TrustOpsPayService.isLocked(period),
        "Deleted": existing ? TrustOpsUtils.toBoolean(existing.Deleted) : false
      },
      payPeriod: period
    };
  }

  function createTimeEntry(context, payload) {
    var built = buildTimeRecord(context, payload || {}, null);
    var override = requireUnlockedOrOverride(context, built.payPeriod, payload && payload.overrideReason);
    var saved = TrustOpsSheetService.appendRecord(TrustOpsConfig.SHEETS.TIME_ENTRIES, built.record);
    TrustOpsAuditService.log(
      context,
      override ? "TIME_ENTRY_CREATED_LOCKED_OVERRIDE" : "TIME_ENTRY_CREATED",
      "Time Entry",
      saved["Time Entry ID"],
      null,
      saved,
      override ? payload.overrideReason : ""
    );
    return TrustOpsUtils.sanitizeForClient(saved);
  }

  function updateTimeEntry(context, payload) {
    var entryId = payload["Time Entry ID"] || payload.timeEntryId;
    var existing = TrustOpsSheetService.findById(TrustOpsConfig.SHEETS.TIME_ENTRIES, entryId);
    if (!existing || TrustOpsUtils.toBoolean(existing.Deleted)) throw new Error("Time entry not found.");
    TrustOpsPermissionService.requireAllowed(
      TrustOpsPermissionService.canEditTimeEntry(context, existing),
      "You do not have permission to edit this time entry."
    );
    var oldPeriod = getPeriodByIdOrDate(existing["Pay Period ID"], existing.Date);
    var built = buildTimeRecord(context, payload || {}, existing);
    var overrideOld = requireUnlockedOrOverride(context, oldPeriod, payload.overrideReason);
    var overrideNew = requireUnlockedOrOverride(context, built.payPeriod, payload.overrideReason);
    var saved = TrustOpsSheetService.updateById(TrustOpsConfig.SHEETS.TIME_ENTRIES, entryId, built.record);
    TrustOpsAuditService.log(
      context,
      overrideOld || overrideNew ? "TIME_ENTRY_UPDATED_LOCKED_OVERRIDE" : "TIME_ENTRY_UPDATED",
      "Time Entry",
      entryId,
      existing,
      saved,
      overrideOld || overrideNew ? payload.overrideReason : ""
    );
    return TrustOpsUtils.sanitizeForClient(saved);
  }

  function listTimeEntries(context, filters) {
    var payload = filters || {};
    var targetUserId = payload.userId || context.userId;
    TrustOpsPermissionService.requireAllowed(
      TrustOpsPermissionService.canViewTimeEntries(context, targetUserId),
      "You do not have permission to view these time entries."
    );
    var entries = TrustOpsSheetService.readTable(TrustOpsConfig.SHEETS.TIME_ENTRIES).filter(function (entry) {
      if (TrustOpsUtils.toBoolean(entry.Deleted)) return false;
      if (targetUserId && String(entry["User ID"]) !== String(targetUserId)) return false;
      if (payload.payPeriodId && String(entry["Pay Period ID"]) !== String(payload.payPeriodId)) return false;
      return true;
    });
    entries.sort(function (a, b) {
      if (a.Date === b.Date) return String(b["Updated At"]).localeCompare(String(a["Updated At"]));
      return String(b.Date).localeCompare(String(a.Date));
    });
    return TrustOpsUtils.recordsForClient(entries);
  }

  function getTrackerData(context, filters) {
    var payload = filters || {};
    var targetUserId = payload.userId || context.userId;
    var canCreateForTarget = TrustOpsPermissionService.canCreateTimeEntry(context, targetUserId);
    var entries = TrustOpsPermissionService.canViewTimeEntries(context, targetUserId)
      ? listTimeEntries(context, payload)
      : [];
    return {
      targetUserId: targetUserId,
      canCreateForTarget: canCreateForTarget,
      availableTasks: TrustOpsTaskService.listIncompleteTasksForUser(context, targetUserId),
      categories: TrustOpsProjectService.listCategories(false).filter(function (category) {
        return TrustOpsUtils.toBoolean(category.Active);
      }),
      currentPayPeriod: TrustOpsUtils.sanitizeForClient(TrustOpsPayService.getCurrentPayPeriod()),
      entries: entries
    };
  }

  return {
    createTimeEntry: createTimeEntry,
    updateTimeEntry: updateTimeEntry,
    listTimeEntries: listTimeEntries,
    getTrackerData: getTrackerData
  };
})();
