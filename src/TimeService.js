var TrustOpsTimeService = (function () {
  function resolveTargetUser(context, payload) {
    var targetUserId = payload.userId || payload["User ID"] || context.userId;
    if (!(payload._approvedRequest && TrustOpsPermissionService.canApproveTimeRequests(context))) {
      TrustOpsPermissionService.requireAllowed(
        TrustOpsPermissionService.canCreateTimeEntry(context, targetUserId),
        "You do not have permission to create time for this user."
      );
    }
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

  function lockedDecision(context, period, payload) {
    if (!TrustOpsPayService.isLocked(period)) return { locked: false, override: false, request: false };
    if (payload && payload._approvedRequest && TrustOpsPermissionService.canApproveTimeRequests(context)) {
      return { locked: true, override: true, request: false, reason: payload.overrideReason || "Approved locked-period request" };
    }
    if (TrustOpsPermissionService.canOverrideLockedPeriod(context)) {
      TrustOpsUtils.requireValue(payload && payload.overrideReason, "Override reason");
      return { locked: true, override: true, request: false, reason: payload.overrideReason };
    }
    return { locked: true, override: false, request: true, reason: payload && (payload.requestReason || payload.reason) || "Locked-period change request" };
  }

  function buildTimeRecord(context, payload, existing) {
    var now = TrustOpsUtils.nowIso();
    var targetPayload = {};
    Object.keys(payload || {}).forEach(function (key) {
      targetPayload[key] = payload[key];
    });
    if (existing && !targetPayload.userId && !targetPayload["User ID"]) {
      targetPayload.userId = existing["User ID"];
    }
    var targetUser = resolveTargetUser(context, targetPayload || {});
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
      if (!(payload._approvedRequest && TrustOpsPermissionService.canApproveTimeRequests(context))) {
        TrustOpsPermissionService.requireAllowed(
          TrustOpsPermissionService.canAddTimeToTask(context, task, targetUser["User ID"]),
          "You cannot add time to this task."
        );
      }
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
    var decision = lockedDecision(context, built.payPeriod, payload || {});
    if (decision.request) {
      return {
        requestCreated: true,
        request: TrustOpsTimeRequestService.createRequest(context, {
          requestType: TrustOpsConfig.REQUEST_TYPES.CREATE,
          targetUserId: built.record["User ID"],
          payPeriodId: built.payPeriod["Pay Period ID"],
          after: built.record,
          reason: decision.reason
        })
      };
    }
    var saved = TrustOpsSheetService.appendRecord(TrustOpsConfig.SHEETS.TIME_ENTRIES, built.record);
    TrustOpsAuditService.log(
      context,
      decision.override ? "TIME_ENTRY_CREATED_LOCKED_OVERRIDE" : "TIME_ENTRY_CREATED",
      "Time Entry",
      saved["Time Entry ID"],
      null,
      saved,
      decision.override ? decision.reason : ""
    );
    return TrustOpsUtils.sanitizeForClient(saved);
  }

  function updateTimeEntry(context, payload) {
    var entryId = payload["Time Entry ID"] || payload.timeEntryId;
    var existing = TrustOpsSheetService.findById(TrustOpsConfig.SHEETS.TIME_ENTRIES, entryId);
    if (!existing || TrustOpsUtils.toBoolean(existing.Deleted)) throw new Error("Time entry not found.");
    if (!(payload && payload._approvedRequest && TrustOpsPermissionService.canApproveTimeRequests(context))) {
      TrustOpsPermissionService.requireAllowed(
        TrustOpsPermissionService.canEditTimeEntry(context, existing),
        "You do not have permission to edit this time entry."
      );
    }
    var oldPeriod = getPeriodByIdOrDate(existing["Pay Period ID"], existing.Date);
    var built = buildTimeRecord(context, payload || {}, existing);
    var oldDecision = lockedDecision(context, oldPeriod, payload || {});
    var newDecision = lockedDecision(context, built.payPeriod, payload || {});
    if (oldDecision.request || newDecision.request) {
      return {
        requestCreated: true,
        request: TrustOpsTimeRequestService.createRequest(context, {
          requestType: TrustOpsConfig.REQUEST_TYPES.EDIT,
          targetUserId: built.record["User ID"],
          timeEntryId: entryId,
          payPeriodId: built.payPeriod["Pay Period ID"],
          before: existing,
          after: built.record,
          reason: oldDecision.reason || newDecision.reason
        })
      };
    }
    var saved = TrustOpsSheetService.updateById(TrustOpsConfig.SHEETS.TIME_ENTRIES, entryId, built.record);
    TrustOpsAuditService.log(
      context,
      oldDecision.override || newDecision.override ? "TIME_ENTRY_UPDATED_LOCKED_OVERRIDE" : "TIME_ENTRY_UPDATED",
      "Time Entry",
      entryId,
      existing,
      saved,
      oldDecision.override || newDecision.override ? oldDecision.reason || newDecision.reason : ""
    );
    return TrustOpsUtils.sanitizeForClient(saved);
  }

  function deleteTimeEntry(context, payload) {
    var entryId = payload.timeEntryId || payload["Time Entry ID"];
    var existing = TrustOpsSheetService.findById(TrustOpsConfig.SHEETS.TIME_ENTRIES, entryId);
    if (!existing || TrustOpsUtils.toBoolean(existing.Deleted)) throw new Error("Time entry not found.");
    if (!(payload && payload._approvedRequest && TrustOpsPermissionService.canApproveTimeRequests(context))) {
      TrustOpsPermissionService.requireAllowed(
        TrustOpsPermissionService.canDeleteTimeEntry(context, existing),
        "You do not have permission to delete this time entry."
      );
    }
    var period = getPeriodByIdOrDate(existing["Pay Period ID"], existing.Date);
    var decision = lockedDecision(context, period, payload || {});
    if (decision.request) {
      return {
        requestCreated: true,
        request: TrustOpsTimeRequestService.createRequest(context, {
          requestType: TrustOpsConfig.REQUEST_TYPES.DELETE,
          targetUserId: existing["User ID"],
          timeEntryId: entryId,
          payPeriodId: period["Pay Period ID"],
          before: existing,
          after: { Deleted: true },
          reason: decision.reason
        })
      };
    }
    var saved = TrustOpsSheetService.updateById(TrustOpsConfig.SHEETS.TIME_ENTRIES, entryId, {
      "Deleted": true,
      "Updated By User ID": context.userId,
      "Updated At": TrustOpsUtils.nowIso()
    });
    TrustOpsAuditService.log(
      context,
      decision.override ? "TIME_ENTRY_DELETED_LOCKED_OVERRIDE" : "TIME_ENTRY_DELETED",
      "Time Entry",
      entryId,
      existing,
      saved,
      decision.override ? decision.reason : ""
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
    return TrustOpsUtils.recordsForClient(entries).map(function (entry) {
      entry._permissions = {
        canEdit: TrustOpsPermissionService.canEditTimeEntry(context, entry),
        canDelete: TrustOpsPermissionService.canDeleteTimeEntry(context, entry)
      };
      return entry;
    });
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
      selectedPayPeriod: TrustOpsUtils.sanitizeForClient(payload.payPeriodId ? TrustOpsSheetService.findById(TrustOpsConfig.SHEETS.PAY_PERIODS, payload.payPeriodId) : TrustOpsPayService.getCurrentPayPeriod()),
      entries: entries,
      requests: TrustOpsTimeRequestService.listRequests(context, { payPeriodId: payload.payPeriodId })
    };
  }

  function applyApprovedRequest(context, requestType, timeEntryId, payload, reason) {
    var approvedPayload = {};
    Object.keys(payload || {}).forEach(function (key) {
      approvedPayload[key] = payload[key];
    });
    approvedPayload._approvedRequest = true;
    approvedPayload.overrideReason = reason || "Approved locked-period request";
    if (requestType === TrustOpsConfig.REQUEST_TYPES.CREATE) {
      return createTimeEntry(context, approvedPayload);
    }
    if (requestType === TrustOpsConfig.REQUEST_TYPES.DELETE) {
      approvedPayload.timeEntryId = timeEntryId;
      return deleteTimeEntry(context, approvedPayload);
    }
    approvedPayload.timeEntryId = timeEntryId;
    return updateTimeEntry(context, approvedPayload);
  }

  return {
    createTimeEntry: createTimeEntry,
    updateTimeEntry: updateTimeEntry,
    deleteTimeEntry: deleteTimeEntry,
    listTimeEntries: listTimeEntries,
    getTrackerData: getTrackerData,
    applyApprovedRequest: applyApprovedRequest
  };
})();
