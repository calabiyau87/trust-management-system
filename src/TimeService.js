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

  function normalizeEntrySource(entrySource) {
    return TrustOpsUtils.normalizeKey(entrySource) === "clocked" ? "Clocked" : "Logged";
  }

  function normalizeTimeEntryRecord(entry) {
    var record = TrustOpsUtils.sanitizeForClient(entry);
    record["Entry Source"] = normalizeEntrySource(record["Entry Source"]);
    record["Punch Session ID"] = record["Punch Session ID"] || "";
    record["Punch Segment"] = record["Punch Segment"] || "";
    record["Clock In At"] = record["Clock In At"] || "";
    record["Clock Out At"] = record["Clock Out At"] || "";
    return record;
  }

  function normalizeTimeEntryRecords(entries) {
    return (entries || []).map(normalizeTimeEntryRecord);
  }

  function validateHours(hours, minimum) {
    var numberValue = TrustOpsUtils.toNumber(hours);
    if (numberValue <= 0) throw new Error("Hours must be greater than 0.");
    if (numberValue < (minimum || 0.1)) throw new Error("Hours must be at least " + (minimum || 0.1) + ".");
    if (numberValue > 24) throw new Error("Hours cannot exceed 24 for one entry.");
    return Math.round(numberValue * 100) / 100;
  }

  function getPeriodByIdOrDate(payPeriodId, dateValue) {
    var period = payPeriodId ? TrustOpsSheetService.findById(TrustOpsConfig.SHEETS.PAY_PERIODS, payPeriodId) : null;
    return period || TrustOpsPayService.findPayPeriodForDate(dateValue);
  }

  function resolveEntryScope(context, payload, existing) {
    var targetPayload = {};
    Object.keys(payload || {}).forEach(function (key) {
      targetPayload[key] = payload[key];
    });
    if (existing && !targetPayload.userId && !targetPayload["User ID"]) {
      targetPayload.userId = existing["User ID"];
    }
    var targetUser = resolveTargetUser(context, targetPayload || {});
    var entryType = payload.entryType || payload["Entry Type"] || existing && existing["Entry Type"] || TrustOpsConfig.ENTRY_TYPES.TASK;
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

    return {
      targetUser: targetUser,
      entryType: entryType,
      taskId: taskId,
      categoryId: categoryId,
      taskOrCategory: taskOrCategory,
      projectId: projectId,
      projectName: projectName
    };
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
    var scope = resolveEntryScope(context, payload, existing);
    var entrySource = normalizeEntrySource(payload["Entry Source"] || payload.entrySource || existing && existing["Entry Source"]);
    var clockInAt = TrustOpsUtils.formatDateTime(payload["Clock In At"] || payload.clockInAt || existing && existing["Clock In At"] || "");
    var clockOutAt = TrustOpsUtils.formatDateTime(payload["Clock Out At"] || payload.clockOutAt || existing && existing["Clock Out At"] || "");
    var dateValue = TrustOpsUtils.formatDate(
      payload.Date ||
      payload.date ||
      existing && existing.Date ||
      (entrySource === "Clocked" ? clockInAt : "")
    );
    TrustOpsUtils.requireValue(dateValue, "Date");
    var hoursValue = payload.Hours || payload.hours || existing && existing.Hours;
    if (entrySource === "Clocked") {
      hoursValue = TrustOpsUtils.hoursBetween(clockInAt, clockOutAt);
    }
    var hours = validateHours(hoursValue, entrySource === "Clocked" ? 0.01 : 0.1);
    var taskId = scope.taskId;
    var categoryId = scope.categoryId;
    var taskOrCategory = scope.taskOrCategory;
    var projectId = scope.projectId;
    var projectName = scope.projectName;

    var period = TrustOpsPayService.findPayPeriodForDate(dateValue);
    return {
      record: {
        "Date": dateValue,
        "User ID": scope.targetUser["User ID"],
        "User Name": scope.targetUser["Full Name"],
        "Entry Type": scope.entryType,
        "Task ID": taskId,
        "Category ID": categoryId,
        "Task / Category": taskOrCategory,
        "Project ID": projectId,
        "Project Name": projectName,
        "Hours": hours,
        "Notes": payload.Notes || payload.notes || existing && existing.Notes || "",
        "Entry Source": entrySource,
        "Punch Session ID": payload["Punch Session ID"] || payload.punchSessionId || existing && existing["Punch Session ID"] || "",
        "Punch Segment": payload["Punch Segment"] || payload.punchSegment || existing && existing["Punch Segment"] || "",
        "Clock In At": entrySource === "Clocked" ? clockInAt : "",
        "Clock Out At": entrySource === "Clocked" ? clockOutAt : "",
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

  function buildPunchSessionRecord(context, payload, existing) {
    var now = TrustOpsUtils.nowIso();
    var scope = resolveEntryScope(context, payload, existing);
    var clockInAt = TrustOpsUtils.formatDateTime(payload["Clock In At"] || payload.clockInAt || existing && existing["Clock In At"] || now);
    return {
      "Punch Session ID": existing ? existing["Punch Session ID"] : "",
      "User ID": scope.targetUser["User ID"],
      "User Name": scope.targetUser["Full Name"],
      "Entry Type": scope.entryType,
      "Task ID": scope.taskId,
      "Category ID": scope.categoryId,
      "Task / Category": scope.taskOrCategory,
      "Project ID": scope.projectId,
      "Project Name": scope.projectName,
      "Clock In At": clockInAt,
      "Clock Out At": existing ? existing["Clock Out At"] || "" : "",
      "Total Hours": existing ? existing["Total Hours"] || "" : "",
      "Status": existing ? existing.Status || "Open" : "Open",
      "Notes": payload.Notes || payload.notes || existing && existing.Notes || "",
      "Created By User ID": existing ? existing["Created By User ID"] : context.userId,
      "Created At": existing ? existing["Created At"] : now,
      "Updated By User ID": context.userId,
      "Updated At": now
    };
  }

  function readPunchSessions() {
    return TrustOpsSheetService.readTable(TrustOpsConfig.SHEETS.TIME_PUNCHES);
  }

  function activePunchForUser(userId) {
    var sessions = readPunchSessions().filter(function (session) {
      return String(session["User ID"]) === String(userId) && TrustOpsUtils.normalizeText(session.Status) === "Open";
    });
    sessions.sort(function (a, b) {
      return String(b["Clock In At"] || "").localeCompare(String(a["Clock In At"] || ""));
    });
    return sessions[0] || null;
  }

  function hasLoggedTimeOnDate(userId, dateValue) {
    var date = TrustOpsUtils.formatDate(dateValue);
    if (!date) return false;
    return readTimeEntries().some(function (entry) {
      if (TrustOpsUtils.toBoolean(entry.Deleted)) return false;
      if (String(entry["User ID"]) !== String(userId)) return false;
      if (TrustOpsUtils.formatDate(entry.Date) !== date) return false;
      return normalizeEntrySource(entry["Entry Source"]) === "Logged";
    });
  }

  function readTimeEntries() {
    return TrustOpsSheetService.readTable(TrustOpsConfig.SHEETS.TIME_ENTRIES);
  }

  function appendPunchSession(record) {
    var sheet = TrustOpsSheetService.getSheet(TrustOpsConfig.SHEETS.TIME_PUNCHES);
    var headers = TrustOpsSheetService.getHeaders(TrustOpsConfig.SHEETS.TIME_PUNCHES);
    var config = TrustOpsConfig.TABLES[TrustOpsConfig.SHEETS.TIME_PUNCHES];
    var normalizedRecord = {};
    Object.keys(record || {}).forEach(function (key) {
      normalizedRecord[key] = record[key];
    });
    if (config.idColumn && !TrustOpsUtils.normalizeText(normalizedRecord[config.idColumn])) {
      normalizedRecord[config.idColumn] = TrustOpsUtils.makeId("pun");
    }
    var row = headers.map(function (header) {
      var value = normalizedRecord[header];
      if (value === undefined || value === null) return "";
      if (value instanceof Date) return TrustOpsUtils.formatDateTime(value);
      return value;
    });
    sheet.appendRow(row);
    TrustOpsSheetService.resetRequestCache();
    return TrustOpsSheetService.findById(TrustOpsConfig.SHEETS.TIME_PUNCHES, normalizedRecord[config.idColumn]);
  }

  function resolvePunchBoundaryTime(payload) {
    return TrustOpsUtils.formatDateTime(
      payload && (
        payload.transferAt ||
        payload.clockAt ||
        payload.clockOutAt ||
        payload["Transfer At"] ||
        payload["Clock At"] ||
        payload["Clock Out At"]
      ) || TrustOpsUtils.nowIso()
    );
  }

  function closeOpenPunchSession(context, targetUserId, requestPayload) {
    var closed = null;
    var segments = [];
    var punchSessionId = requestPayload && (requestPayload.punchSessionId || requestPayload["Punch Session ID"]);
    var clockAt = "";
    TrustOpsSheetService.withLock(function () {
      var punch = punchSessionId
        ? TrustOpsSheetService.findById(TrustOpsConfig.SHEETS.TIME_PUNCHES, punchSessionId)
        : activePunchForUser(targetUserId);
      if (!punch || TrustOpsUtils.normalizeText(punch.Status) !== "Open") {
        throw new Error("No open punch was found for this user.");
      }
      if (String(punch["User ID"]) !== String(targetUserId)) {
        throw new Error("This punch belongs to a different user.");
      }
      clockAt = resolvePunchBoundaryTime(requestPayload);
      var openAt = TrustOpsUtils.parseDateTime(punch["Clock In At"]);
      var closeAt = TrustOpsUtils.parseDateTime(clockAt);
      if (!openAt || !closeAt || closeAt.getTime() <= openAt.getTime()) {
        throw new Error("Clock out must be later than clock in.");
      }
      var totalHours = TrustOpsUtils.hoursBetween(openAt, closeAt);
      closed = updatePunchSession(punch["Punch Session ID"], {
        "Clock Out At": clockAt,
        "Total Hours": totalHours,
        "Status": "Closed",
        "Updated By User ID": context.userId,
        "Updated At": TrustOpsUtils.nowIso()
      });
      segments = splitPunchSegments(punch["Clock In At"], clockAt);
    });
    return {
      closed: closed,
      segments: segments,
      clockAt: clockAt
    };
  }

  function updatePunchSession(punchSessionId, patch) {
    var sheet = TrustOpsSheetService.getSheet(TrustOpsConfig.SHEETS.TIME_PUNCHES);
    var headers = TrustOpsSheetService.getHeaders(TrustOpsConfig.SHEETS.TIME_PUNCHES);
    var config = TrustOpsConfig.TABLES[TrustOpsConfig.SHEETS.TIME_PUNCHES];
    var existing = TrustOpsSheetService.findById(TrustOpsConfig.SHEETS.TIME_PUNCHES, punchSessionId);
    if (!existing) {
      throw new Error("Punch session not found.");
    }
    var updated = {};
    headers.forEach(function (header) {
      updated[header] = existing[header];
    });
    Object.keys(patch || {}).forEach(function (key) {
      if (headers.indexOf(key) !== -1 && key !== config.idColumn) {
        updated[key] = patch[key];
      }
    });
    var row = headers.map(function (header) {
      var value = updated[header];
      if (value === undefined || value === null) return "";
      if (value instanceof Date) return TrustOpsUtils.formatDateTime(value);
      return value;
    });
    sheet.getRange(existing._rowNumber, 1, 1, headers.length).setValues([row]);
    TrustOpsSheetService.resetRequestCache();
    return TrustOpsSheetService.findById(TrustOpsConfig.SHEETS.TIME_PUNCHES, punchSessionId);
  }

  function splitPunchSegments(startValue, endValue) {
    var start = TrustOpsUtils.parseDateTime(startValue);
    var end = TrustOpsUtils.parseDateTime(endValue);
    if (!start || !end || end.getTime() <= start.getTime()) return [];
    var segments = [];
    var currentStart = start;
    var segmentIndex = 1;
    while (currentStart.getTime() < end.getTime()) {
      var dayStart = TrustOpsUtils.parseDate(TrustOpsUtils.formatDate(currentStart));
      var nextBoundary = TrustOpsUtils.addDays(dayStart, 1);
      var currentEnd = nextBoundary && nextBoundary.getTime() < end.getTime() ? nextBoundary : end;
      segments.push({
        index: segmentIndex,
        start: new Date(currentStart.getTime()),
        end: new Date(currentEnd.getTime())
      });
      currentStart = new Date(currentEnd.getTime());
      segmentIndex += 1;
    }
    return segments;
  }

  function createClockedSegmentEntry(context, punchSession, segment, payload) {
    var entryPayload = {
      userId: punchSession["User ID"],
      entryType: punchSession["Entry Type"],
      date: TrustOpsUtils.formatDate(segment.start),
      hours: TrustOpsUtils.hoursBetween(segment.start, segment.end),
      taskId: punchSession["Task ID"],
      categoryId: punchSession["Category ID"],
      notes: punchSession.Notes || "",
      entrySource: "Clocked",
      punchSessionId: punchSession["Punch Session ID"],
      punchSegment: segment.index,
      clockInAt: segment.start,
      clockOutAt: segment.end
    };
    var built = buildTimeRecord(context, entryPayload, null);
    if (TrustOpsPayService.isLocked(built.payPeriod)) {
      return {
        requestCreated: true,
        request: TrustOpsTimeRequestService.createRequest(context, {
          requestType: TrustOpsConfig.REQUEST_TYPES.CREATE,
          targetUserId: punchSession["User ID"],
          payPeriodId: built.payPeriod["Pay Period ID"],
          after: built.record,
          reason: payload && (payload.requestReason || payload.reason) || "Clocked punch entered into locked period."
        })
      };
    }
    var saved = TrustOpsSheetService.appendRecord(TrustOpsConfig.SHEETS.TIME_ENTRIES, built.record);
    TrustOpsAuditService.log(
      context,
      "TIME_ENTRY_CLOCKED_CREATED",
      "Time Entry",
      saved["Time Entry ID"],
      null,
      saved,
      ""
    );
    return {
      requestCreated: false,
      entry: normalizeTimeEntryRecord(saved)
    };
  }

  function clockIn(context, payload) {
    var requestPayload = payload || {};
    var targetPayload = {};
    Object.keys(requestPayload).forEach(function (key) {
      targetPayload[key] = requestPayload[key];
    });
    var scope = resolveEntryScope(context, targetPayload, null);
    var clockInAt = TrustOpsUtils.formatDateTime(requestPayload.clockInAt || requestPayload["Clock In At"] || TrustOpsUtils.nowIso());
    var punched = TrustOpsSheetService.withLock(function () {
      var existingOpen = activePunchForUser(scope.targetUser["User ID"]);
      if (existingOpen) {
        throw new Error("This user already has an open punch.");
      }
      return appendPunchSession({
        "User ID": scope.targetUser["User ID"],
        "User Name": scope.targetUser["Full Name"],
        "Entry Type": scope.entryType,
        "Task ID": scope.taskId,
        "Category ID": scope.categoryId,
        "Task / Category": scope.taskOrCategory,
        "Project ID": scope.projectId,
        "Project Name": scope.projectName,
        "Clock In At": clockInAt,
        "Clock Out At": "",
        "Status": "Open",
        "Notes": requestPayload.Notes || requestPayload.notes || "",
        "Created By User ID": context.userId,
        "Created At": TrustOpsUtils.nowIso(),
        "Updated By User ID": context.userId,
        "Updated At": TrustOpsUtils.nowIso()
      });
    });
    TrustOpsAuditService.log(context, "TIME_PUNCH_CLOCKED_IN", "Time Punch", punched["Punch Session ID"], null, punched, "");
    var warning = hasLoggedTimeOnDate(scope.targetUser["User ID"], clockInAt)
      ? "This user already has logged time on " + TrustOpsUtils.formatDate(clockInAt) + "."
      : "";
    return {
      punch: TrustOpsUtils.sanitizeForClient(punched),
      warning: warning
    };
  }

  function clockOut(context, payload) {
    var requestPayload = payload || {};
    var targetUserId = requestPayload.userId || requestPayload["User ID"] || context.userId;
    TrustOpsPermissionService.requireAllowed(
      TrustOpsPermissionService.canCreateTimeEntry(context, targetUserId),
      "You do not have permission to close this punch."
    );
    var closure = closeOpenPunchSession(context, targetUserId, requestPayload);
    var segments = [];
    segments = closure.segments;
    var entries = [];
    var requests = [];
    segments.forEach(function (segment) {
      var result = createClockedSegmentEntry(context, closure.closed, segment, requestPayload);
      if (result.requestCreated) {
        requests.push(result.request);
      } else {
        entries.push(result.entry);
      }
    });
    TrustOpsAuditService.log(context, "TIME_PUNCH_CLOCKED_OUT", "Time Punch", closure.closed["Punch Session ID"], null, closure.closed, "");
    return {
      punch: TrustOpsUtils.sanitizeForClient(closure.closed),
      entries: entries,
      requests: requests
    };
  }

  function punchesMatchScope(punch, scope) {
    return String(punch["Entry Type"] || "") === String(scope.entryType || "") &&
      String(punch["Task ID"] || "") === String(scope.taskId || "") &&
      String(punch["Category ID"] || "") === String(scope.categoryId || "");
  }

  function clockTransfer(context, payload) {
    var requestPayload = payload || {};
    var targetUserId = requestPayload.userId || requestPayload["User ID"] || context.userId;
    TrustOpsPermissionService.requireAllowed(
      TrustOpsPermissionService.canCreateTimeEntry(context, targetUserId),
      "You do not have permission to transfer this punch."
    );
    var destinationScope = resolveEntryScope(context, requestPayload, null);
    if (String(destinationScope.targetUser["User ID"]) !== String(targetUserId)) {
      throw new Error("Transfer destination must belong to the same user as the active punch.");
    }
    var closure = null;
    var newPunch = null;
    TrustOpsSheetService.withLock(function () {
      var punch = requestPayload.punchSessionId || requestPayload["Punch Session ID"]
        ? TrustOpsSheetService.findById(TrustOpsConfig.SHEETS.TIME_PUNCHES, requestPayload.punchSessionId || requestPayload["Punch Session ID"])
        : activePunchForUser(targetUserId);
      if (!punch || TrustOpsUtils.normalizeText(punch.Status) !== "Open") {
        throw new Error("No open punch was found for this user.");
      }
      if (String(punch["User ID"]) !== String(targetUserId)) {
        throw new Error("This punch belongs to a different user.");
      }
      if (punchesMatchScope(punch, destinationScope)) {
        throw new Error("Transfer target must be different from the current punch.");
      }
      var transferAt = resolvePunchBoundaryTime(requestPayload);
      var openAt = TrustOpsUtils.parseDateTime(punch["Clock In At"]);
      var closeAt = TrustOpsUtils.parseDateTime(transferAt);
      if (!openAt || !closeAt || closeAt.getTime() <= openAt.getTime()) {
        throw new Error("Transfer time must be later than clock in.");
      }
      var totalHours = TrustOpsUtils.hoursBetween(openAt, closeAt);
      closure = updatePunchSession(punch["Punch Session ID"], {
        "Clock Out At": transferAt,
        "Total Hours": totalHours,
        "Status": "Closed",
        "Updated By User ID": context.userId,
        "Updated At": TrustOpsUtils.nowIso()
      });
      newPunch = appendPunchSession({
        "User ID": destinationScope.targetUser["User ID"],
        "User Name": destinationScope.targetUser["Full Name"],
        "Entry Type": destinationScope.entryType,
        "Task ID": destinationScope.taskId,
        "Category ID": destinationScope.categoryId,
        "Task / Category": destinationScope.taskOrCategory,
        "Project ID": destinationScope.projectId,
        "Project Name": destinationScope.projectName,
        "Clock In At": transferAt,
        "Clock Out At": "",
        "Status": "Open",
        "Notes": requestPayload.Notes || requestPayload.notes || "",
        "Created By User ID": context.userId,
        "Created At": TrustOpsUtils.nowIso(),
        "Updated By User ID": context.userId,
        "Updated At": TrustOpsUtils.nowIso()
      });
    });
    var segments = splitPunchSegments(closure["Clock In At"], closure["Clock Out At"]);
    var entries = [];
    var requests = [];
    segments.forEach(function (segment) {
      var result = createClockedSegmentEntry(context, closure, segment, requestPayload);
      if (result.requestCreated) {
        requests.push(result.request);
      } else {
        entries.push(result.entry);
      }
    });
    TrustOpsAuditService.log(context, "TIME_PUNCH_CLOCKED_OUT", "Time Punch", closure["Punch Session ID"], null, closure, "");
    TrustOpsAuditService.log(context, "TIME_PUNCH_CLOCKED_IN", "Time Punch", newPunch["Punch Session ID"], null, newPunch, "");
    var warning = hasLoggedTimeOnDate(destinationScope.targetUser["User ID"], closure["Clock Out At"])
      ? "This user already has logged time on " + TrustOpsUtils.formatDate(closure["Clock Out At"]) + "."
      : "";
    return {
      previousPunch: TrustOpsUtils.sanitizeForClient(closure),
      punch: TrustOpsUtils.sanitizeForClient(newPunch),
      entries: entries,
      requests: requests,
      warning: warning
    };
  }

  function getTrackerPunchState(context, targetUserId) {
    var openPunch = activePunchForUser(targetUserId);
    return {
      activePunch: openPunch ? TrustOpsUtils.sanitizeForClient(openPunch) : null,
      activePunchWarning: openPunch && hasLoggedTimeOnDate(targetUserId, openPunch["Clock In At"])
        ? "This user already has logged time on " + TrustOpsUtils.formatDate(openPunch["Clock In At"]) + "."
        : ""
    };
  }

  function backfillCategoryDefaultProject(context, categoryId, oldProjectId, newProjectId) {
    TrustOpsPermissionService.requireAllowed(
      TrustOpsPermissionService.canManageTimeCategories(context),
      "You do not have permission to manage time categories."
    );
    var normalizedCategoryId = TrustOpsUtils.requireValue(categoryId, "Category");
    var normalizedNewProjectId = TrustOpsUtils.normalizeText(newProjectId);
    var normalizedOldProjectId = TrustOpsUtils.normalizeText(oldProjectId);
    var category = TrustOpsSheetService.findById(TrustOpsConfig.SHEETS.TIME_CATEGORIES, normalizedCategoryId);
    if (!category) throw new Error("Time category not found.");
    if (!normalizedNewProjectId) {
      throw new Error("A new default project is required for backfill.");
    }
    var newProject = TrustOpsSheetService.findById(TrustOpsConfig.SHEETS.PROJECTS, normalizedNewProjectId);
    if (!newProject) throw new Error("Project not found.");
    var entries = TrustOpsSheetService.readTable(TrustOpsConfig.SHEETS.TIME_ENTRIES).filter(function (entry) {
      if (TrustOpsUtils.toBoolean(entry.Deleted)) return false;
      if (String(entry["Category ID"]) !== String(normalizedCategoryId)) return false;
      return String(entry["Project ID"] || "") === String(normalizedOldProjectId || "");
    });
    var changed = [];
    entries.forEach(function (entry) {
      var saved = TrustOpsSheetService.updateById(TrustOpsConfig.SHEETS.TIME_ENTRIES, entry["Time Entry ID"], {
        "Project ID": normalizedNewProjectId,
        "Project Name": newProject["Project Name"],
        "Updated By User ID": context.userId,
        "Updated At": TrustOpsUtils.nowIso()
      });
      changed.push(saved);
    });
    TrustOpsAuditService.log(
      context,
      "CATEGORY_DEFAULT_PROJECT_BACKFILLED",
      "Time Category",
      normalizedCategoryId,
      {
        "Old Default Project ID": normalizedOldProjectId,
        "New Default Project ID": normalizedNewProjectId,
        "Time Entry Count": entries.length
      },
      {
        "Old Default Project ID": normalizedOldProjectId,
        "New Default Project ID": normalizedNewProjectId,
        "Time Entry Count": changed.length
      },
      "Backfilled " + changed.length + " time entr" + (changed.length === 1 ? "y" : "ies") + "."
    );
    return {
      updated: changed.length,
      categoryId: normalizedCategoryId,
      oldProjectId: normalizedOldProjectId,
      newProjectId: normalizedNewProjectId
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
      built.record["Entry Source"] === "Clocked"
        ? (decision.override ? "TIME_ENTRY_CLOCKED_CREATED_LOCKED_OVERRIDE" : "TIME_ENTRY_CLOCKED_CREATED")
        : (decision.override ? "TIME_ENTRY_CREATED_LOCKED_OVERRIDE" : "TIME_ENTRY_CREATED"),
      "Time Entry",
      saved["Time Entry ID"],
      null,
      saved,
      decision.override ? decision.reason : ""
    );
    return normalizeTimeEntryRecord(saved);
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
    return normalizeTimeEntryRecord(saved);
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
    return normalizeTimeEntryRecord(saved);
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
      var aSort = a["Clock Out At"] || a["Clock In At"] || a.Date || "";
      var bSort = b["Clock Out At"] || b["Clock In At"] || b.Date || "";
      if (aSort === bSort) return String(b["Updated At"]).localeCompare(String(a["Updated At"]));
      return String(bSort).localeCompare(String(aSort));
    });
    return normalizeTimeEntryRecords(entries).map(function (entry) {
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
    var punchState = TrustOpsPermissionService.canViewTimeEntries(context, targetUserId)
      ? getTrackerPunchState(context, targetUserId)
      : { activePunch: null, activePunchWarning: "" };
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
      requests: TrustOpsTimeRequestService.listRequests(context, { payPeriodId: payload.payPeriodId }),
      activePunch: punchState.activePunch,
      activePunchWarning: punchState.activePunchWarning
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
    clockIn: clockIn,
    clockOut: clockOut,
    clockTransfer: clockTransfer,
    applyApprovedRequest: applyApprovedRequest,
    backfillCategoryDefaultProject: backfillCategoryDefaultProject,
    normalizeTimeEntryRecord: normalizeTimeEntryRecord,
    normalizeTimeEntryRecords: normalizeTimeEntryRecords,
    getTrackerPunchState: getTrackerPunchState
  };
})();
