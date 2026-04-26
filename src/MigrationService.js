var TrustOpsMigrationService = (function () {
  var LEGACY_SHEETS = {
    ASSIGNMENT_BOARD: "Assignment Board",
    TIME_LOG: "Time Log",
    PAY_SUMMARY: "Pay Summary",
    PROJECTS: "Projects",
    USERS: "Users",
    TIME_CATEGORIES: "Time Categories",
    PRIORITY_LIST: "Priority List",
    TAGS: "Tags",
    IMPORTED_TASKS: "Imported Tasks"
  };

  var SHEET_NAME_ALIASES = {
    assignmentboard: LEGACY_SHEETS.ASSIGNMENT_BOARD,
    timelog: LEGACY_SHEETS.TIME_LOG,
    paysummary: LEGACY_SHEETS.PAY_SUMMARY,
    projects: LEGACY_SHEETS.PROJECTS,
    users: LEGACY_SHEETS.USERS,
    timecategories: LEGACY_SHEETS.TIME_CATEGORIES,
    prioritylist: LEGACY_SHEETS.PRIORITY_LIST,
    tags: LEGACY_SHEETS.TAGS,
    importedtasks: LEGACY_SHEETS.IMPORTED_TASKS
  };

  var PROFILE_COLORS = [
    "#1f6f68",
    "#4f7cac",
    "#7b6cb3",
    "#9a5c7a",
    "#2f7351",
    "#a3542f",
    "#637381",
    "#3d5a80",
    "#8b5e34",
    "#5f4b8b",
    "#2f6f8f",
    "#6d4c41"
  ];

  function normalizeSheetName_(value) {
    return TrustOpsUtils.normalizeKey(value).replace(/[^a-z]/g, "");
  }

  function canonicalSheetName_(value) {
    return SHEET_NAME_ALIASES[normalizeSheetName_(value)] || String(value || "").trim();
  }

  function extractSpreadsheetId_(value) {
    var text = String(value || "").trim();
    if (!text) return "";
    var match = text.match(/[-\w]{25,}/);
    return match ? match[0] : text;
  }

  function cloneRows_(rows) {
    return TrustOpsUtils.clone(rows || []);
  }

  function getExistingSheetRows(sheetName) {
    var spreadsheet = TrustOpsSheetService.getSpreadsheet();
    var sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet || sheet.getLastRow() < 2 || sheet.getLastColumn() < 1) {
      return [];
    }
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function (header) {
      return String(header || "").trim();
    });
    return sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues().map(function (row, index) {
      var record = {};
      headers.forEach(function (header, headerIndex) {
        if (header) record[header] = row[headerIndex] instanceof Date ? TrustOpsUtils.formatDate(row[headerIndex]) : row[headerIndex];
      });
      record._rowNumber = index + 2;
      return record;
    });
  }

  function getSheetRowsFromSpreadsheet_(spreadsheet, sheetName) {
    if (!spreadsheet) return [];
    var sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet || sheet.getLastRow() < 2 || sheet.getLastColumn() < 1) {
      return [];
    }
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function (header) {
      return String(header || "").trim();
    });
    return sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues().map(function (row, index) {
      var record = {};
      headers.forEach(function (header, headerIndex) {
        if (!header) return;
        var value = row[headerIndex];
        record[header] = value instanceof Date ? TrustOpsUtils.formatDate(value) : value;
      });
      record._rowNumber = index + 2;
      return record;
    });
  }

  function normalizeCsvTables_(tables) {
    var output = {};
    Object.keys(tables || {}).forEach(function (sheetName) {
      output[canonicalSheetName_(sheetName)] = cloneRows_(tables[sheetName]);
    });
    return output;
  }

  function loadLegacySource_(payload) {
    var sourceType = TrustOpsUtils.normalizeKey(payload && (payload.sourceType || payload.mode || payload.importMode));
    if (sourceType === "csv" || payload && payload.tables) {
      return {
        type: "csv",
        tables: normalizeCsvTables_(payload.tables || {})
      };
    }
    if (sourceType === "sheet" || payload && (payload.spreadsheetId || payload.spreadsheetUrl || payload.sourceSpreadsheetId)) {
      var spreadsheetId = extractSpreadsheetId_(payload.spreadsheetId || payload.spreadsheetUrl || payload.sourceSpreadsheetId);
      TrustOpsUtils.requireValue(spreadsheetId, "Source spreadsheet ID");
      return {
        type: "sheet",
        spreadsheetId: spreadsheetId,
        spreadsheet: SpreadsheetApp.openById(spreadsheetId)
      };
    }
    return null;
  }

  function readLegacyRows_(source, sheetName) {
    var canonicalName = canonicalSheetName_(sheetName);
    if (!source) return [];
    if (source.type === "csv") {
      return cloneRows_(source.tables[canonicalName] || []);
    }
    if (source.type === "sheet") {
      return getSheetRowsFromSpreadsheet_(source.spreadsheet || SpreadsheetApp.openById(source.spreadsheetId), canonicalName);
    }
    return [];
  }

  function clearCanonicalData_() {
    var owners = TrustOpsSheetService.readTable(TrustOpsConfig.SHEETS.USERS).filter(function (user) {
      return TrustOpsUtils.normalizeText(user.Role) === TrustOpsConfig.ROLES.OWNER;
    });
    [
      TrustOpsConfig.SHEETS.USERS,
      TrustOpsConfig.SHEETS.PROJECTS,
      TrustOpsConfig.SHEETS.TASKS,
      TrustOpsConfig.SHEETS.TIME_ENTRIES,
      TrustOpsConfig.SHEETS.TIME_CATEGORIES,
      TrustOpsConfig.SHEETS.TAGS,
      TrustOpsConfig.SHEETS.PAY_PERIODS,
      TrustOpsConfig.SHEETS.PAY_SUMMARIES
    ].forEach(function (sheetName) {
      var sheet = TrustOpsSheetService.getSheet(sheetName);
      var lastRow = sheet.getLastRow();
      var lastColumn = sheet.getLastColumn();
      if (lastRow > 1 && lastColumn > 0) {
        sheet.getRange(2, 1, lastRow - 1, lastColumn).clearContent();
      }
    });
    owners.forEach(function (owner) {
      TrustOpsSheetService.upsertById(TrustOpsConfig.SHEETS.USERS, owner["User ID"], owner);
    });
    TrustOpsSheetService.resetRequestCache();
  }

  function seedSettings() {
    TrustOpsSheetService.upsertById(TrustOpsConfig.SHEETS.SETTINGS, TrustOpsConfig.ORGANIZATION_NAME_KEY, {
      "Setting Value": TrustOpsConfig.APP_NAME,
      "Description": "Organization name displayed in the app shell.",
      "Updated At": TrustOpsUtils.nowIso()
    });
    TrustOpsSheetService.upsertById(TrustOpsConfig.SHEETS.SETTINGS, "DEFAULT_PAY_PERIOD_DAYS", {
      "Setting Value": TrustOpsConfig.PAY_PERIOD_DAYS,
      "Description": "Number of calendar days in each pay period.",
      "Updated At": TrustOpsUtils.nowIso()
    });
    TrustOpsSheetService.upsertById(TrustOpsConfig.SHEETS.SETTINGS, "PAY_PERIOD_ANCHOR_DATE", {
      "Setting Value": TrustOpsConfig.PAY_PERIOD_ANCHOR_DATE,
      "Description": "Known start date for the repeating pay-period calendar.",
      "Updated At": TrustOpsUtils.nowIso()
    });
    TrustOpsSheetService.upsertById(TrustOpsConfig.SHEETS.SETTINGS, "TASK_STATUS_COLORS_JSON", {
      "Setting Value": TrustOpsUtils.safeJson(TrustOpsConfig.DEFAULT_TASK_STATUS_COLORS),
      "Description": "Hex colors used for Assignment Board task status badges.",
      "Updated At": TrustOpsUtils.nowIso()
    });
  }

  function seedOwner(ownerEmail) {
    var existing = TrustOpsAuthService.getUserByEmail(ownerEmail);
    if (existing) return existing;
    var email = TrustOpsUtils.normalizeEmail(ownerEmail);
    var firstName = email.split("@")[0];
    return TrustOpsSheetService.appendRecord(TrustOpsConfig.SHEETS.USERS, {
      "First Name": firstName,
      "Last Name": "",
      "Full Name": firstName,
      "Email": email,
      "Profile Color": "#1f6f68",
      "Theme Mode": "System",
      "Google Profile Photo URL": "",
      "Profile Image URL": "",
      "Profile Image File ID": "",
      "Role": TrustOpsConfig.ROLES.OWNER,
      "Active": true,
      "Pay Type": "None",
      "Hourly Rate": 0,
      "Salary Amount": 0,
      "Salary Frequency": "",
      "Track Time": true,
      "Track Pay": false,
      "Manager User ID": "",
      "Created At": TrustOpsUtils.nowIso(),
      "Updated At": TrustOpsUtils.nowIso(),
      "Archived": false
    });
  }

  function seedCategories() {
    var existing = TrustOpsSheetService.readTable(TrustOpsConfig.SHEETS.TIME_CATEGORIES);
    var existingKeys = existing.map(function (category) {
      return TrustOpsUtils.normalizeKey(category.Category);
    });
    TrustOpsConfig.DEFAULT_TIME_CATEGORIES.forEach(function (categoryName) {
      if (existingKeys.indexOf(TrustOpsUtils.normalizeKey(categoryName)) !== -1) return;
      TrustOpsSheetService.appendRecord(TrustOpsConfig.SHEETS.TIME_CATEGORIES, {
        "Category": categoryName,
        "Default Project ID": "",
        "Default Project": "",
        "Active": true,
        "Created At": TrustOpsUtils.nowIso(),
        "Updated At": TrustOpsUtils.nowIso(),
        "Archived": false
      });
    });
  }

  function listKey_(values) {
    return TrustOpsUtils.splitList(values)
      .slice()
      .sort()
      .join(" | ");
  }

  function repairTaskAssigneeAssignments(context) {
    TrustOpsPermissionService.requireAllowed(
      TrustOpsPermissionService.canManageSettings(context),
      "Only Owner/Admin can run migrations."
    );
    var activeUsers = TrustOpsUserService.listActiveUsers();
    var tasks = TrustOpsSheetService.readTable(TrustOpsConfig.SHEETS.TASKS);
    var repaired = 0;
    var failed = 0;
    tasks.forEach(function (task) {
      try {
        var resolved = TrustOpsTaskService.resolveAssignees(task["Assignee User IDs"], task.Assignees, activeUsers);
        if (!resolved.ids.length && !resolved.names.length) return;
        if (listKey_(task["Assignee User IDs"]) === listKey_(resolved.ids) && listKey_(task.Assignees) === listKey_(resolved.names)) {
          return;
        }
        var saved = TrustOpsSheetService.updateById(TrustOpsConfig.SHEETS.TASKS, task["Task ID"], {
          "Assignees": resolved.names.join(", "),
          "Assignee User IDs": resolved.ids.join(", "),
          "Updated At": TrustOpsUtils.nowIso()
        });
        TrustOpsAuditService.log(
          context,
          "TASK_ASSIGNEES_REPAIRED",
          "Task",
          task["Task ID"],
          task,
          saved,
          "Normalized assignee IDs from existing task data."
        );
        repaired += 1;
      } catch (error) {
        failed += 1;
        TrustOpsAuditService.log(
          context,
          "TASK_ASSIGNEE_REPAIR_FAILED",
          "Task",
          task["Task ID"],
          task,
          { error: error && error.message ? error.message : String(error) },
          "Failed to normalize assignees during bootstrap repair."
        );
      }
    });
    if (repaired || failed) {
      TrustOpsAuditService.log(
        context,
        "TASK_ASSIGNEE_REPAIR_COMPLETE",
        "Migration",
        "Tasks",
        null,
        { repaired: repaired, failed: failed },
        "Backfilled assignee IDs on existing tasks."
      );
    }
    return {
      repaired: repaired,
      failed: failed
    };
  }

  function bootstrap(spreadsheetId, ownerEmail) {
    TrustOpsAuthService.requireBootstrapAllowed(ownerEmail);
    TrustOpsSheetService.setSpreadsheetId(spreadsheetId);
    TrustOpsSheetService.ensureAllSheets();
    seedSettings();
    var owner = seedOwner(ownerEmail);
    seedCategories();
    if (TrustOpsPermissionService.canManageTags({ userId: owner["User ID"], role: TrustOpsConfig.ROLES.OWNER })) {
      TrustOpsTagService.seedFromTaskTags({ userId: owner["User ID"], email: TrustOpsUtils.normalizeEmail(ownerEmail), role: TrustOpsConfig.ROLES.OWNER });
    }
    TrustOpsUserService.syncSpreadsheetAccess({ userId: owner["User ID"], email: TrustOpsUtils.normalizeEmail(ownerEmail), role: TrustOpsConfig.ROLES.OWNER });
    repairTaskAssigneeAssignments({ userId: owner["User ID"], email: TrustOpsUtils.normalizeEmail(ownerEmail), role: TrustOpsConfig.ROLES.OWNER });
    TrustOpsPayService.getCurrentPayPeriod();
    TrustOpsAuditService.log(
      { userId: owner["User ID"], email: TrustOpsUtils.normalizeEmail(ownerEmail) },
      "SYSTEM_BOOTSTRAPPED",
      "System",
      "Trust Ops",
      null,
      { spreadsheetId: spreadsheetId, ownerEmail: ownerEmail },
      "Initial schema and seed data created."
    );
    return {
      spreadsheetId: spreadsheetId,
      owner: TrustOpsUtils.sanitizeForClient(owner),
      sheets: Object.keys(TrustOpsConfig.TABLES)
    };
  }

  function normalizeLegacyDate_(value) {
    if (value instanceof Date) {
      return TrustOpsUtils.formatDate(value);
    }
    var text = TrustOpsUtils.normalizeText(value);
    if (!text) return "";
    if (/^\d+(\.\d+)?$/.test(text)) {
      var serial = Math.floor(Number(text));
      if (serial > 59) {
        return TrustOpsUtils.formatDate(new Date(1899, 11, serial));
      }
    }
    var parsed = TrustOpsUtils.formatDate(text);
    if (parsed) return parsed;
    var labelMatch = text.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})$/);
    if (labelMatch) {
      var year = Number(labelMatch[3]);
      if (labelMatch[3].length === 2) year += 2000;
      return TrustOpsUtils.formatDate(new Date(year, Number(labelMatch[1]) - 1, Number(labelMatch[2])));
    }
    return "";
  }

  function normalizeLegacyPriority_(value) {
    var text = TrustOpsUtils.normalizeKey(value);
    if (text === "med" || text === "medium") return "Medium";
    if (text === "high") return "High";
    if (text === "low") return "Low";
    if (text === "urgent") return "Urgent";
    return TrustOpsUtils.normalizeText(value) || "Medium";
  }

  function normalizeLegacyTaskStatus_(value, fallback) {
    var text = TrustOpsUtils.normalizeKey(value);
    if (text === "complete" || text === "completed" || text === "done") return "Complete";
    if (text === "in progress" || text === "inprogress" || text === "open") return "In Progress";
    if (text === "waiting" || text === "hold" || text === "on hold") return "Waiting";
    if (text === "blocked") return "Blocked";
    if (text === "archived" || text === "deleted") return "Archived";
    return fallback || "In Progress";
  }

  function normalizeLegacyProjectStatus_(projectRow) {
    var text = TrustOpsUtils.normalizeKey(projectRow && (projectRow.Status || projectRow["Completion Status"]));
    if (text === "holding") return "Holding";
    if (text === "archived") return "Archived";
    if (text === "completed") return "Completed";
    var completion = TrustOpsUtils.toNumber(projectRow && projectRow["Completion Status"]);
    if (completion >= 1) return "Completed";
    if (completion > 0) return "In Progress";
    var totalTasks = TrustOpsUtils.toNumber(projectRow && (projectRow["Total Tasks"] || projectRow.TotalTasks));
    var completedTasks = TrustOpsUtils.toNumber(projectRow && (projectRow["Completed Task"] || projectRow["Completed Tasks"]));
    if (totalTasks > 0 && completedTasks >= totalTasks) return "Completed";
    if (totalTasks > 0 && completedTasks > 0) return "In Progress";
    return "Not Started";
  }

  function colorFromText_(value) {
    var text = TrustOpsUtils.normalizeKey(value);
    var hash = 0;
    for (var index = 0; index < text.length; index += 1) {
      hash = ((hash << 5) - hash) + text.charCodeAt(index);
      hash |= 0;
    }
    var color = PROFILE_COLORS[Math.abs(hash) % PROFILE_COLORS.length];
    return color;
  }

  function buildImportState_() {
    var users = TrustOpsSheetService.readTable(TrustOpsConfig.SHEETS.USERS);
    var projects = TrustOpsSheetService.readTable(TrustOpsConfig.SHEETS.PROJECTS);
    var tags = TrustOpsSheetService.readTable(TrustOpsConfig.SHEETS.TAGS);
    var categories = TrustOpsSheetService.readTable(TrustOpsConfig.SHEETS.TIME_CATEGORIES);
    var tasks = TrustOpsSheetService.readTable(TrustOpsConfig.SHEETS.TASKS);
    var timeEntries = TrustOpsSheetService.readTable(TrustOpsConfig.SHEETS.TIME_ENTRIES);
    var payPeriods = TrustOpsSheetService.readTable(TrustOpsConfig.SHEETS.PAY_PERIODS);
    var paySummaries = TrustOpsSheetService.readTable(TrustOpsConfig.SHEETS.PAY_SUMMARIES);
    return {
      users: users,
      projects: projects,
      tags: tags,
      categories: categories,
      tasks: tasks,
      timeEntries: timeEntries,
      payPeriods: payPeriods,
      paySummaries: paySummaries
    };
  }

  function indexBy_(items, keyFn) {
    var output = {};
    (items || []).forEach(function (item) {
      var key = keyFn(item);
      if (!TrustOpsUtils.normalizeText(key)) return;
      output[String(key)] = item;
    });
    return output;
  }

  function createLookupMaps_(state) {
    var tasksByKey = {};
    (state.tasks || []).forEach(function (task) {
      taskKeyCandidates_(task.Title, task["Project Name"], task["Due Date"]).forEach(function (key) {
        tasksByKey[String(key)] = task;
      });
      if (TrustOpsUtils.normalizeText(task["External Google Task Mirror IDs"])) {
        tasksByKey[TrustOpsUtils.normalizeKey(task["External Google Task Mirror IDs"])] = task;
      }
    });
    var timeEntriesByKey = {};
    (state.timeEntries || []).forEach(function (entry) {
      timeEntriesByKey[timeEntryKey_(entry)] = entry;
    });
    return {
      usersByEmail: indexBy_(state.users, function (user) {
        return TrustOpsUtils.normalizeEmail(user.Email);
      }),
      usersByName: indexBy_(state.users, function (user) {
        return TrustOpsUtils.normalizeKey(user["Full Name"]);
      }),
      projectsByName: indexBy_(state.projects, function (project) {
        return TrustOpsUtils.normalizeKey(project["Project Name"]);
      }),
      categoriesByName: indexBy_(state.categories, function (category) {
        return TrustOpsUtils.normalizeKey(category.Category);
      }),
      tagsByName: indexBy_(state.tags, function (tag) {
        return TrustOpsUtils.normalizeKey(tag.Tag);
      }),
      tasksByKey: tasksByKey,
      timeEntriesByKey: timeEntriesByKey,
      payPeriodsByKey: indexBy_(state.payPeriods, function (period) {
        return String(period["Pay Period ID"]);
      }),
      paySummariesByKey: indexBy_(state.paySummaries, function (summary) {
        return String(summary["Pay Summary ID"]);
      })
    };
  }

  function normalizeLegacyImportDecision_(value) {
    var text = TrustOpsUtils.normalizeKey(value);
    if (text === "keep" || text === "keeporiginal" || text === "original") return "keep";
    if (text === "replace") return "replace";
    return "";
  }

  function duplicateDecisionFor_(payload, kind, fingerprint) {
    var decisions = payload && (payload.duplicateDecisions || payload.importDecisions) || {};
    var kindDecisions = decisions[kind] || {};
    return normalizeLegacyImportDecision_(kindDecisions[String(fingerprint)]);
  }

  function legacyProjectFingerprint_(row) {
    return TrustOpsUtils.normalizeKey(row["Project Name"] || row.Project || row.Name || "");
  }

  function legacyUserFingerprint_(row) {
    return TrustOpsUtils.normalizeEmail(row.Email || row.email || row["Email Address"]) || TrustOpsUtils.normalizeKey(row["Full Name"] || row.Full || row.User || row.UserName || row.Name || row["User"] || "");
  }

  function legacyTagFingerprint_(row) {
    return TrustOpsUtils.normalizeKey(row.Tag || row["Tag Name"] || row.Name || "");
  }

  function legacyCategoryFingerprint_(row) {
    return TrustOpsUtils.normalizeKey(row.Category || row["Category"] || "");
  }

  function legacyTaskFingerprint_(row) {
    return taskKeyCandidates_(row.Task || row.Title || row["Title"], row.Project || row["Project Name"] || row["Default Project"], normalizeLegacyDate_(row["Due Date"] || row.Due || row["Due"]))[0] || "";
  }

  function legacyPayPeriodFingerprint_(row) {
    var startDate = normalizeLegacyDate_(row["Start Pay Period"] || row["Start Date"] || row["Start"]);
    var endDate = normalizeLegacyDate_(row["End Pay Period"] || row["End Date"] || row["End"]);
    if (startDate && endDate) return "range:" + startDate + "|" + endDate;
    return TrustOpsUtils.normalizeKey(row["Pay Period"] || row["Pay Period Label"] || row.Label || "");
  }

  function legacyPaySummaryFingerprint_(row) {
    return legacyPayPeriodFingerprint_(row) + "|" + legacyUserFingerprint_(row);
  }

  function legacyTimeEntryFingerprint_(row) {
    var dateValue = normalizeLegacyDate_(row.Date || row["Date"]);
    var entryType = TrustOpsUtils.normalizeKey(row["Entry Type"]) === "general time" ? TrustOpsConfig.ENTRY_TYPES.GENERAL : TrustOpsConfig.ENTRY_TYPES.TASK;
    var taskOrCategory = TrustOpsUtils.normalizeText(row["Task / Category"] || row.Task || row.Title || row.Category || row["Category"] || "");
    var projectName = TrustOpsUtils.normalizeText(row.Project || row["Project Name"] || "");
    var hours = TrustOpsUtils.toNumber(row.Hours || row["Hours"]);
    var notes = TrustOpsUtils.normalizeText(row.Notes || row["Notes"] || "");
    var payPeriodFingerprint = legacyPayPeriodFingerprint_(row);
    if (!payPeriodFingerprint) payPeriodFingerprint = dateValue || "";
    return [
      legacyUserFingerprint_(row),
      dateValue,
      entryType,
      taskOrCategory,
      projectName,
      hours,
      notes,
      payPeriodFingerprint
    ].join("|");
  }

  function duplicatePreviewEntry_(kind, fingerprint, existing, incoming, label) {
    return {
      kind: kind,
      fingerprint: fingerprint,
      label: label || "",
      existing: TrustOpsUtils.sanitizeForClient(existing),
      incoming: TrustOpsUtils.sanitizeForClient(incoming)
    };
  }

  function buildDuplicatePreviewIndex_(rows, fingerprintFn) {
    var index = {};
    (rows || []).forEach(function (row) {
      var fingerprint = fingerprintFn(row);
      if (!TrustOpsUtils.normalizeText(fingerprint)) return;
      index[String(fingerprint)] = row;
    });
    return index;
  }

  function collectLegacyDuplicatePreviews_(source) {
    var state = buildImportState_();
    var duplicates = [];
    var projectIndex = buildDuplicatePreviewIndex_(state.projects, legacyProjectFingerprint_);
    var userIndex = buildDuplicatePreviewIndex_(state.users, legacyUserFingerprint_);
    var tagIndex = buildDuplicatePreviewIndex_(state.tags, legacyTagFingerprint_);
    var categoryIndex = buildDuplicatePreviewIndex_(state.categories, legacyCategoryFingerprint_);
    var taskIndex = buildDuplicatePreviewIndex_(state.tasks, legacyTaskFingerprint_);
    var timeEntryIndex = buildDuplicatePreviewIndex_(state.timeEntries, legacyTimeEntryFingerprint_);
    var payPeriodIndex = buildDuplicatePreviewIndex_(state.payPeriods, legacyPayPeriodFingerprint_);
    var paySummaryIndex = buildDuplicatePreviewIndex_(state.paySummaries, legacyPaySummaryFingerprint_);

    readLegacyRows_(source, LEGACY_SHEETS.PROJECTS).forEach(function (row) {
      var fingerprint = legacyProjectFingerprint_(row);
      if (fingerprint && projectIndex[String(fingerprint)]) {
        duplicates.push(duplicatePreviewEntry_("project", fingerprint, projectIndex[String(fingerprint)], row, row["Project Name"] || row.Project || row.Name || ""));
      }
    });
    readLegacyRows_(source, LEGACY_SHEETS.USERS).forEach(function (row) {
      var fingerprint = legacyUserFingerprint_(row);
      if (fingerprint && userIndex[String(fingerprint)]) {
        duplicates.push(duplicatePreviewEntry_("user", fingerprint, userIndex[String(fingerprint)], row, row["Full Name"] || row.Email || row.User || ""));
      }
    });
    readLegacyRows_(source, LEGACY_SHEETS.TAGS).forEach(function (row) {
      var fingerprint = legacyTagFingerprint_(row);
      if (fingerprint && tagIndex[String(fingerprint)]) {
        duplicates.push(duplicatePreviewEntry_("tag", fingerprint, tagIndex[String(fingerprint)], row, row.Tag || row["Tag Name"] || row.Name || ""));
      }
    });
    readLegacyRows_(source, LEGACY_SHEETS.TIME_CATEGORIES).forEach(function (row) {
      var fingerprint = legacyCategoryFingerprint_(row);
      if (fingerprint && categoryIndex[String(fingerprint)]) {
        duplicates.push(duplicatePreviewEntry_("category", fingerprint, categoryIndex[String(fingerprint)], row, row.Category || row["Category"] || ""));
      }
    });
    readLegacyRows_(source, LEGACY_SHEETS.ASSIGNMENT_BOARD).forEach(function (row) {
      var fingerprint = legacyTaskFingerprint_(row);
      if (fingerprint && taskIndex[String(fingerprint)]) {
        duplicates.push(duplicatePreviewEntry_("task", fingerprint, taskIndex[String(fingerprint)], row, row.Task || row.Title || ""));
      }
    });
    readLegacyRows_(source, LEGACY_SHEETS.IMPORTED_TASKS).forEach(function (row) {
      var fingerprint = legacyTaskFingerprint_(row);
      if (fingerprint && taskIndex[String(fingerprint)]) {
        duplicates.push(duplicatePreviewEntry_("task", fingerprint, taskIndex[String(fingerprint)], row, row.Task || row.Title || ""));
      }
    });
    readLegacyRows_(source, LEGACY_SHEETS.TIME_LOG).forEach(function (row) {
      var fingerprint = legacyTimeEntryFingerprint_(row);
      if (fingerprint && timeEntryIndex[String(fingerprint)]) {
        duplicates.push(duplicatePreviewEntry_("timeEntry", fingerprint, timeEntryIndex[String(fingerprint)], row, row["Task / Category"] || row.Task || row.Title || ""));
      }
    });
    readLegacyRows_(source, LEGACY_SHEETS.PAY_SUMMARY).forEach(function (row) {
      var fingerprint = legacyPaySummaryFingerprint_(row);
      if (fingerprint && paySummaryIndex[String(fingerprint)]) {
        duplicates.push(duplicatePreviewEntry_("paySummary", fingerprint, paySummaryIndex[String(fingerprint)], row, row["User Name"] || row.User || ""));
      }
    });
    readLegacyRows_(source, LEGACY_SHEETS.PAY_SUMMARY).forEach(function (row) {
      var periodFingerprint = legacyPayPeriodFingerprint_(row);
      if (periodFingerprint && payPeriodIndex[String(periodFingerprint)]) {
        duplicates.push(duplicatePreviewEntry_("payPeriod", periodFingerprint, payPeriodIndex[String(periodFingerprint)], row, row["Pay Period"] || row["Pay Period Label"] || ""));
      }
    });
    return duplicates;
  }

  function taskKeyCandidates_(title, projectName, dueDate) {
    var normalizedTitle = TrustOpsUtils.normalizeKey(title);
    var normalizedProject = TrustOpsUtils.normalizeKey(projectName);
    var normalizedDue = TrustOpsUtils.normalizeText(dueDate);
    var keys = [];
    if (normalizedTitle && normalizedProject && normalizedDue) keys.push(normalizedTitle + "|" + normalizedProject + "|" + normalizedDue);
    if (normalizedTitle && normalizedProject) keys.push(normalizedTitle + "|" + normalizedProject);
    if (normalizedTitle && normalizedDue) keys.push(normalizedTitle + "|" + normalizedDue);
    if (normalizedTitle) keys.push(normalizedTitle);
    return keys;
  }

  function legacyTaskSearchKeys_(row) {
    var taskText = TrustOpsUtils.normalizeText(row.Task || row.Title || row["Task / Category"]);
    var projectName = TrustOpsUtils.normalizeText(row.Project || row["Project Name"] || row["Default Project"]);
    var dueDate = normalizeLegacyDate_(row["Due Date"] || row.Due || row["Due"]);
    var keys = taskKeyCandidates_(taskText, projectName, dueDate);
    if (taskText.indexOf(":") !== -1) {
      var parts = taskText.split(":");
      var left = TrustOpsUtils.normalizeText(parts[0]);
      var right = TrustOpsUtils.normalizeText(parts.slice(1).join(":"));
      if (left && right) {
        keys = keys.concat(taskKeyCandidates_(right, left, dueDate));
        keys = keys.concat(taskKeyCandidates_(right, projectName, dueDate));
      }
    }
    return keys;
  }

  function addTaskLookup_(maps, task, aliases) {
    (aliases || []).forEach(function (alias) {
      if (!TrustOpsUtils.normalizeText(alias)) return;
      maps.tasksByKey[String(alias)] = task;
    });
  }

  function resolveProject_(context, maps, projectName, fallbackDescription) {
    var normalizedName = TrustOpsUtils.normalizeText(projectName);
    if (!normalizedName) return null;
    var key = TrustOpsUtils.normalizeKey(normalizedName);
    if (maps.projectsByName[key]) return maps.projectsByName[key];
    var saved = TrustOpsProjectService.saveProject(context, {
      "Project Name": normalizedName,
      "Description": fallbackDescription || "Imported from legacy data.",
      "Status": "Not Started",
      "Active": true
    });
    maps.projectsByName[key] = saved;
    return saved;
  }

  function resolveUser_(context, maps, row) {
    var email = TrustOpsUtils.normalizeEmail(row.Email || row.email || row["Email Address"]);
    var fullName = TrustOpsUtils.normalizeText(row["Full Name"] || row.Full || row.User || row.UserName || row.Name || row["User"]);
    var firstName = TrustOpsUtils.normalizeText(row["First"] || row.First || row["First Name"] || (fullName.split(/\s+/)[0] || ""));
    var lastName = TrustOpsUtils.normalizeText(row["Last"] || row.Last || row["Last Name"] || "");
    var existing = email ? maps.usersByEmail[email] : null;
    if (!existing && fullName) {
      existing = maps.usersByName[TrustOpsUtils.normalizeKey(fullName)] || null;
    }
    var fingerprint = email || TrustOpsUtils.normalizeKey(fullName);
    if (existing && duplicateDecisionFor_(maps, "user", fingerprint) === "keep") {
      return existing;
    }
    var salary = TrustOpsUtils.toNumber(row.Salary || row["Salary"]);
    var weeklyPay = TrustOpsUtils.toNumber(row["Weekly Pay"] || row.WeeklyPay || row["Bi-Weekly Pay"]);
    var payType = "None";
    var salaryAmount = 0;
    var salaryFrequency = "";
    if (salary > 0) {
      payType = "Salary";
      salaryAmount = salary;
      salaryFrequency = "Annual";
    } else if (weeklyPay > 0) {
      payType = "Salary";
      salaryAmount = weeklyPay;
      salaryFrequency = "Per Pay Period";
    }
    var baseRecord = {
      "First Name": firstName || "Imported",
      "Last Name": lastName,
      "Full Name": fullName || firstName || "Imported User",
      "Email": email || ("legacy-" + TrustOpsUtils.makeId("usr").slice(4) + "@legacy.local"),
      "Role": existing ? existing.Role : TrustOpsConfig.ROLES.USER,
      "Active": true,
      "Profile Color": colorFromText_(fullName || email || firstName),
      "Theme Mode": "System",
      "Google Profile Photo URL": "",
      "Profile Image URL": "",
      "Profile Image File ID": "",
      "Pay Type": payType,
      "Hourly Rate": 0,
      "Salary Amount": salaryAmount,
      "Salary Frequency": salaryFrequency,
      "Track Time": true,
      "Track Pay": payType !== "None",
      "Manager User ID": ""
    };
    if (existing) {
      var updated = TrustOpsUserService.saveUser(context, {
        "User ID": existing["User ID"],
        "First Name": baseRecord["First Name"],
        "Last Name": baseRecord["Last Name"],
        "Full Name": baseRecord["Full Name"],
        "Email": baseRecord["Email"],
        "Role": existing.Role,
        "Active": true,
        "Profile Color": baseRecord["Profile Color"],
        "Theme Mode": baseRecord["Theme Mode"],
        "Google Profile Photo URL": existing["Google Profile Photo URL"] || "",
        "Profile Image URL": existing["Profile Image URL"] || "",
        "Profile Image File ID": existing["Profile Image File ID"] || "",
        "Pay Type": baseRecord["Pay Type"],
        "Hourly Rate": baseRecord["Hourly Rate"],
        "Salary Amount": baseRecord["Salary Amount"],
        "Salary Frequency": baseRecord["Salary Frequency"],
        "Track Time": baseRecord["Track Time"],
        "Track Pay": baseRecord["Track Pay"],
        "Manager User ID": existing["Manager User ID"] || ""
      });
      maps.usersByEmail[TrustOpsUtils.normalizeEmail(updated.Email)] = updated;
      maps.usersByName[TrustOpsUtils.normalizeKey(updated["Full Name"])] = updated;
      return updated;
    }
    var saved = TrustOpsUserService.saveUser(context, {
      "First Name": baseRecord["First Name"],
      "Last Name": baseRecord["Last Name"],
      "Full Name": baseRecord["Full Name"],
      "Email": baseRecord["Email"],
      "Role": baseRecord["Role"],
      "Active": true,
      "Profile Color": baseRecord["Profile Color"],
      "Theme Mode": baseRecord["Theme Mode"],
      "Google Profile Photo URL": baseRecord["Google Profile Photo URL"],
      "Profile Image URL": baseRecord["Profile Image URL"],
      "Profile Image File ID": baseRecord["Profile Image File ID"],
      "Pay Type": baseRecord["Pay Type"],
      "Hourly Rate": baseRecord["Hourly Rate"],
      "Salary Amount": baseRecord["Salary Amount"],
      "Salary Frequency": baseRecord["Salary Frequency"],
      "Track Time": baseRecord["Track Time"],
      "Track Pay": baseRecord["Track Pay"],
      "Manager User ID": baseRecord["Manager User ID"]
    });
    maps.usersByEmail[TrustOpsUtils.normalizeEmail(saved.Email)] = saved;
    maps.usersByName[TrustOpsUtils.normalizeKey(saved["Full Name"])] = saved;
    return saved;
  }

  function resolveTag_(context, maps, tagValue) {
    var tagName = tagValue && typeof tagValue === "object" ? (tagValue.Tag || tagValue["Tag Name"] || tagValue.Name || "") : tagValue;
    var normalized = TrustOpsUtils.normalizeText(tagName);
    if (!normalized) return null;
    var key = TrustOpsUtils.normalizeKey(normalized);
    var incomingColor = tagValue && typeof tagValue === "object" ? TrustOpsUtils.normalizeText(tagValue.Color || tagValue.color || "") : "";
    var incomingDescription = tagValue && typeof tagValue === "object" ? TrustOpsUtils.normalizeText(tagValue.Description || tagValue.description || "") : "";
    if (maps.tagsByName[key]) {
      if (duplicateDecisionFor_(maps, "tag", key) === "keep") {
        return maps.tagsByName[key];
      }
      var updated = TrustOpsTagService.saveTag(context, {
        "Tag ID": maps.tagsByName[key]["Tag ID"],
        tag: normalized,
        color: incomingColor || colorFromText_(normalized),
        description: incomingDescription || maps.tagsByName[key].Description || "",
        active: true
      });
      maps.tagsByName[key] = updated;
      return updated;
    }
    var saved = TrustOpsTagService.saveTag(context, {
      tag: normalized,
      color: incomingColor || colorFromText_(normalized),
      description: incomingDescription || ""
    });
    maps.tagsByName[key] = saved;
    return saved;
  }

  function resolveCategoryProject_(context, maps, row) {
    var categoryName = TrustOpsUtils.normalizeText(row.Category || row["Category"]);
    var defaultProjectName = TrustOpsUtils.normalizeText(row["Default Project"] || row["Default Project Name"] || row["Project"]);
    var defaultProject = resolveProject_(context, maps, defaultProjectName || "General", "Imported from legacy time categories.");
    return {
      categoryName: categoryName,
      defaultProject: defaultProject
    };
  }

  function upsertProject_(context, maps, row) {
    var projectName = TrustOpsUtils.normalizeText(row["Project Name"] || row.Project || row.Name);
    if (!projectName) return null;
    var key = TrustOpsUtils.normalizeKey(projectName);
    var existing = maps.projectsByName[key];
    if (existing && duplicateDecisionFor_(maps, "project", key) === "keep") {
      return existing;
    }
    var now = TrustOpsUtils.nowIso();
    var record = {
      "Project Name": projectName,
      "Description": TrustOpsUtils.normalizeText(row.Description || row["Description"]) || "",
      "Status": normalizeLegacyProjectStatus_(row),
      "Active": row.Active === undefined ? !TrustOpsUtils.toBoolean(row.Archived) : TrustOpsUtils.toBoolean(row.Active),
      "Created At": existing ? existing["Created At"] : now,
      "Updated At": now,
      "Archived": TrustOpsUtils.toBoolean(row.Archived)
    };
    if (existing) {
      var savedExisting = TrustOpsSheetService.updateById(TrustOpsConfig.SHEETS.PROJECTS, existing["Project ID"], record);
      maps.projectsByName[key] = savedExisting;
      TrustOpsAuditService.log(context, "LEGACY_PROJECT_UPDATED", "Project", savedExisting["Project ID"], existing, savedExisting, "");
      return savedExisting;
    }
    var saved = TrustOpsSheetService.appendRecord(TrustOpsConfig.SHEETS.PROJECTS, record);
    maps.projectsByName[key] = saved;
    TrustOpsAuditService.log(context, "LEGACY_PROJECT_CREATED", "Project", saved["Project ID"], null, saved, "");
    return saved;
  }

  function upsertCategory_(context, maps, row) {
    var categoryName = TrustOpsUtils.normalizeText(row.Category || row["Category"]);
    if (!categoryName) return null;
    var key = TrustOpsUtils.normalizeKey(categoryName);
    var existing = maps.categoriesByName[key];
    if (existing && duplicateDecisionFor_(maps, "category", key) === "keep") {
      return existing;
    }
    var projectInfo = resolveCategoryProject_(context, maps, row);
    var now = TrustOpsUtils.nowIso();
    var record = {
      "Category": categoryName,
      "Default Project ID": projectInfo.defaultProject ? projectInfo.defaultProject["Project ID"] : "",
      "Default Project": projectInfo.defaultProject ? projectInfo.defaultProject["Project Name"] : "",
      "Active": row.Active === undefined ? !TrustOpsUtils.toBoolean(row.Archived) : TrustOpsUtils.toBoolean(row.Active),
      "Created At": existing ? existing["Created At"] : now,
      "Updated At": now,
      "Archived": existing ? TrustOpsUtils.toBoolean(existing.Archived) : false
    };
    if (existing) {
      var savedExisting = TrustOpsSheetService.updateById(TrustOpsConfig.SHEETS.TIME_CATEGORIES, existing["Category ID"], record);
      maps.categoriesByName[key] = savedExisting;
      TrustOpsAuditService.log(context, "LEGACY_CATEGORY_UPDATED", "Time Category", savedExisting["Category ID"], existing, savedExisting, "");
      return savedExisting;
    }
    var saved = TrustOpsSheetService.appendRecord(TrustOpsConfig.SHEETS.TIME_CATEGORIES, record);
    maps.categoriesByName[key] = saved;
    TrustOpsAuditService.log(context, "LEGACY_CATEGORY_CREATED", "Time Category", saved["Category ID"], null, saved, "");
    return saved;
  }

  function buildTaskRecord_(context, maps, row, existing) {
    var taskText = TrustOpsUtils.normalizeText(row.Task || row.Title || row["Title"]);
    var projectName = TrustOpsUtils.normalizeText(row.Project || row["Project Name"] || row["Default Project"]);
    if (taskText.indexOf(":") !== -1 && !projectName) {
      projectName = TrustOpsUtils.normalizeText(taskText.split(":")[0]);
      taskText = TrustOpsUtils.normalizeText(taskText.split(":").slice(1).join(":"));
    }
    var project = resolveProject_(context, maps, projectName || row["Project Name"] || "", "Imported from legacy tasks.");
    var assigneeRaw = row.Assignees || row.Assignee || row["Assignee"] || row["Assignee Surface Type"] || "";
    var assigneeNames = TrustOpsUtils.splitList(assigneeRaw);
    var resolvedAssignees = [];
    var resolvedAssigneeIds = [];
    assigneeNames.forEach(function (name) {
      var emailKey = TrustOpsUtils.normalizeEmail(name);
      var nameKey = TrustOpsUtils.normalizeKey(name);
      var user = maps.usersByEmail[emailKey] || maps.usersByName[nameKey];
      if (user && resolvedAssigneeIds.indexOf(user["User ID"]) === -1) {
        resolvedAssigneeIds.push(user["User ID"]);
        resolvedAssignees.push(user["Full Name"]);
      } else if (name && resolvedAssignees.indexOf(name) === -1) {
        resolvedAssignees.push(name);
      }
    });
    var tags = TrustOpsUtils.splitList(row.Tags || row.Tag || "");
    var normalizedTags = [];
    tags.forEach(function (tagName) {
      var tag = resolveTag_(context, maps, tagName);
      if (tag && normalizedTags.indexOf(tag.Tag) === -1) normalizedTags.push(tag.Tag);
    });
    var status = normalizeLegacyTaskStatus_(row.Status || row["Status"], existing && existing.Status);
    var archived = TrustOpsUtils.toBoolean(row.Archived) || status === "Archived" || TrustOpsUtils.toBoolean(row.Deleted) || TrustOpsUtils.toBoolean(row.Hidden);
    var dueDate = normalizeLegacyDate_(row["Due Date"] || row.Due || row["Due"]);
    var now = TrustOpsUtils.nowIso();
    return {
      "Title": taskText,
      "Notes": TrustOpsUtils.normalizeText(row.Notes || row.Note || "") || "",
      "Status": archived ? "Archived" : status,
      "Due Date": dueDate,
      "Assignees": resolvedAssignees.join(", "),
      "Assignee User IDs": resolvedAssigneeIds.join(", "),
      "Project ID": project ? project["Project ID"] : "",
      "Project Name": project ? project["Project Name"] : TrustOpsUtils.normalizeText(row.Project || row["Project Name"] || ""),
      "Priority": normalizeLegacyPriority_(row.Priority || row["Priority"]),
      "Tags": TrustOpsUtils.joinList(normalizedTags),
      "Created By User ID": existing ? existing["Created By User ID"] : context.userId,
      "Created At": existing ? existing["Created At"] : now,
      "Updated At": now,
      "Completed By User ID": archived || status === "Complete" ? (existing ? existing["Completed By User ID"] || context.userId : context.userId) : (existing ? existing["Completed By User ID"] : ""),
      "Completed At": archived || status === "Complete" ? (existing ? existing["Completed At"] || now : now) : (existing ? existing["Completed At"] : ""),
      "Source": TrustOpsUtils.normalizeText(row.Source || row["Source"]) || "Legacy Import",
      "External Google Task Mirror IDs": TrustOpsUtils.normalizeText(row["External Google Task Mirror IDs"] || row["Task ID"] || row["Task List ID"]) || "",
      "Chat Message Link": TrustOpsUtils.normalizeText(row["Chat Message Link"] || row["Original Chat Task Link"] || row["Task Link"]) || "",
      "Archived": archived
    };
  }

  function upsertTask_(context, maps, row, sourceLabel) {
    var aliases = legacyTaskSearchKeys_(row);
    var existing = null;
    var fingerprint = legacyTaskFingerprint_(row);
    for (var index = 0; index < aliases.length; index += 1) {
      if (maps.tasksByKey[String(aliases[index])]) {
        existing = maps.tasksByKey[String(aliases[index])];
        break;
      }
    }
    if (existing && duplicateDecisionFor_(maps, "task", fingerprint) === "keep") {
      return existing;
    }
    var record = buildTaskRecord_(context, maps, row, existing);
    record["Source"] = sourceLabel || record["Source"];
    if (!TrustOpsUtils.normalizeText(record["Title"])) return null;
    var saved;
    if (existing) {
      saved = TrustOpsSheetService.updateById(TrustOpsConfig.SHEETS.TASKS, existing["Task ID"], record);
      TrustOpsAuditService.log(context, "LEGACY_TASK_UPDATED", "Task", saved["Task ID"], existing, saved, sourceLabel || "");
    } else {
      saved = TrustOpsSheetService.appendRecord(TrustOpsConfig.SHEETS.TASKS, record);
      TrustOpsAuditService.log(context, "LEGACY_TASK_CREATED", "Task", saved["Task ID"], null, saved, sourceLabel || "");
    }
    addTaskLookup_(maps, saved, taskKeyCandidates_(saved.Title, saved["Project Name"], saved["Due Date"]));
    addTaskLookup_(maps, saved, [TrustOpsUtils.normalizeKey(saved.Title)]);
    if (saved["External Google Task Mirror IDs"]) {
      addTaskLookup_(maps, saved, [TrustOpsUtils.normalizeKey(saved["External Google Task Mirror IDs"])]);
    }
    return saved;
  }

  function parseTimeTaskLabel_(value) {
    var text = TrustOpsUtils.normalizeText(value);
    if (!text) return "";
    if (text.indexOf(":") === -1) return text;
    return TrustOpsUtils.normalizeText(text.split(":").slice(1).join(":")) || text;
  }

  function resolveTimeTask_(context, maps, row) {
    var taskLabel = parseTimeTaskLabel_(row.Task || row.Title || row["Task / Category"]);
    var projectName = TrustOpsUtils.normalizeText(row.Project || row["Project Name"]);
    var dueDate = normalizeLegacyDate_(row.Due || row["Due Date"]);
    var candidates = taskKeyCandidates_(taskLabel, projectName, dueDate);
    if (row.Task && TrustOpsUtils.normalizeText(row.Task).indexOf(":") !== -1) {
      var parts = TrustOpsUtils.normalizeText(row.Task).split(":");
      if (parts.length > 1) {
        candidates = candidates.concat(taskKeyCandidates_(TrustOpsUtils.normalizeText(parts.slice(1).join(":")), TrustOpsUtils.normalizeText(parts[0]), dueDate));
      }
    }
    for (var index = 0; index < candidates.length; index += 1) {
      var existing = maps.tasksByKey[String(candidates[index])];
      if (existing) return existing;
    }
    if (!TrustOpsUtils.normalizeText(taskLabel)) return null;
    return upsertTask_(context, maps, {
      Task: taskLabel,
      Project: projectName,
      "Due Date": dueDate,
      Status: "In Progress",
      Notes: "Imported placeholder task from legacy time log."
    }, "Legacy time log placeholder");
  }

  function resolveTimeUser_(context, maps, row) {
    var userName = TrustOpsUtils.normalizeText(row.User || row["User Name"] || row["Full Name"] || row.Assignee || row.Assignees);
    var email = TrustOpsUtils.normalizeEmail(row.Email || row["Email"]);
    if (email && maps.usersByEmail[email]) return maps.usersByEmail[email];
    if (userName && maps.usersByName[TrustOpsUtils.normalizeKey(userName)]) return maps.usersByName[TrustOpsUtils.normalizeKey(userName)];
    if (userName) {
      return resolveUser_(context, maps, {
        "Full Name": userName,
        Email: email || ("legacy-" + TrustOpsUtils.makeId("usr").slice(4) + "@legacy.local"),
        Salary: 0,
        "Weekly Pay": 0
      });
    }
    throw new Error("Unable to resolve legacy time-log user.");
  }

  function timeEntryKey_(record) {
    return [
      record["User ID"],
      record.Date,
      record["Entry Type"],
      record["Task ID"],
      record["Category ID"],
      record["Project ID"],
      record.Hours,
      record.Notes,
      record["Pay Period ID"]
    ].join("|");
  }

  function upsertTimeEntry_(context, maps, row) {
    var user = resolveTimeUser_(context, maps, row);
    var entryType = TrustOpsUtils.normalizeKey(row["Entry Type"]) === "general time" ? TrustOpsConfig.ENTRY_TYPES.GENERAL : TrustOpsConfig.ENTRY_TYPES.TASK;
    var dateValue = normalizeLegacyDate_(row.Date || row["Date"]);
    var hours = TrustOpsUtils.toNumber(row.Hours || row["Hours"]);
    var notes = TrustOpsUtils.normalizeText(row.Notes || row["Notes"] || "");
    var task = null;
    var category = null;
    var project = null;
    var taskOrCategory = "";
    if (entryType === TrustOpsConfig.ENTRY_TYPES.GENERAL) {
      var categoryName = TrustOpsUtils.normalizeText(row.Category || row["Category"] || row["Task / Category"]);
      category = maps.categoriesByName[TrustOpsUtils.normalizeKey(categoryName)] || null;
      if (!category && categoryName) {
        category = upsertCategory_(context, maps, { Category: categoryName, Project: row.Project || row["Project Name"] || "" });
      }
      if (!category) {
        category = upsertCategory_(context, maps, { Category: "Legacy General Time", Project: row.Project || row["Project Name"] || "General" });
      }
      project = category && category["Default Project ID"] ? maps.projectsByName[TrustOpsUtils.normalizeKey(category["Default Project"])] : null;
      if (!project && category && category["Default Project"]) {
        project = resolveProject_(context, maps, category["Default Project"], "Imported from legacy time categories.");
      }
      taskOrCategory = "[General] " + (category ? category.Category : categoryName || "Legacy General Time");
    } else {
      task = resolveTimeTask_(context, maps, row);
      if (!task) {
        throw new Error("Unable to resolve legacy task for time entry on " + dateValue + ".");
      }
      project = task["Project ID"] ? maps.projectsByName[TrustOpsUtils.normalizeKey(task["Project Name"])] || null : null;
      taskOrCategory = task.Title;
    }
    if (!project && TrustOpsUtils.normalizeText(row.Project || row["Project Name"])) {
      project = resolveProject_(context, maps, row.Project || row["Project Name"], "Imported from legacy time logs.");
    }
    var period = TrustOpsPayService.findPayPeriodForDate(dateValue);
    var record = {
      "Date": dateValue,
      "User ID": user["User ID"],
      "User Name": user["Full Name"],
      "Entry Type": entryType,
      "Task ID": task ? task["Task ID"] : "",
      "Category ID": category ? category["Category ID"] : "",
      "Task / Category": taskOrCategory,
      "Project ID": project ? project["Project ID"] : "",
      "Project Name": project ? project["Project Name"] : TrustOpsUtils.normalizeText(row.Project || row["Project Name"] || ""),
      "Hours": hours,
      "Notes": notes,
      "Pay Period ID": period["Pay Period ID"],
      "Pay Period Label": period["Pay Period Label"],
      "Created By User ID": context.userId,
      "Created At": TrustOpsUtils.nowIso(),
      "Updated By User ID": context.userId,
      "Updated At": TrustOpsUtils.nowIso(),
      "Locked": true,
      "Deleted": false
    };
    var key = timeEntryKey_(record);
    var existing = maps.timeEntriesByKey[String(key)];
    if (existing && duplicateDecisionFor_(maps, "timeEntry", key) === "keep") {
      return existing;
    }
    var saved;
    if (existing) {
      saved = TrustOpsSheetService.updateById(TrustOpsConfig.SHEETS.TIME_ENTRIES, existing["Time Entry ID"], record);
      TrustOpsAuditService.log(context, "LEGACY_TIME_ENTRY_UPDATED", "Time Entry", saved["Time Entry ID"], existing, saved, "");
    } else {
      saved = TrustOpsSheetService.appendRecord(TrustOpsConfig.SHEETS.TIME_ENTRIES, record);
      TrustOpsAuditService.log(context, "LEGACY_TIME_ENTRY_CREATED", "Time Entry", saved["Time Entry ID"], null, saved, "");
    }
    maps.timeEntriesByKey[String(timeEntryKey_(saved))] = saved;
    return saved;
  }

  function upsertPayPeriod_(context, maps, row) {
    var startDate = normalizeLegacyDate_(row["Start Pay Period"] || row["Start Date"] || row["Start"]);
    var endDate = normalizeLegacyDate_(row["End Pay Period"] || row["End Date"] || row["End"]);
    if (!startDate || !endDate) {
      var label = TrustOpsUtils.normalizeText(row["Pay Period"] || row["Pay Period Label"] || row.Label);
      var match = label.match(/(\d{1,2}-\d{1,2}-\d{2,4})\s*-\s*(\d{1,2}-\d{1,2}-\d{2,4})/);
      if (match) {
        startDate = normalizeLegacyDate_(match[1]);
        endDate = normalizeLegacyDate_(match[2]);
      }
    }
    if (!startDate || !endDate) return null;
    var periodId = "pay_" + startDate.replace(/-/g, "");
    var now = TrustOpsUtils.nowIso();
    var record = {
      "Pay Period ID": periodId,
      "Start Date": startDate,
      "End Date": endDate,
      "Pay Period Label": TrustOpsUtils.normalizeText(row["Pay Period"] || row["Pay Period Label"] || row.Label) || (TrustOpsUtils.formatDateLabel(startDate) + " - " + TrustOpsUtils.formatDateLabel(endDate)),
      "Status": TrustOpsConfig.PAY_PERIOD_STATUS.LOCKED,
      "Locked": true,
      "Locked By User ID": context.userId,
      "Locked At": now,
      "Created At": now,
      "Updated At": now
    };
    var existing = maps.payPeriodsByKey[String(periodId)];
    if (existing && duplicateDecisionFor_(maps, "payPeriod", String(periodId)) === "keep") {
      return existing;
    }
    var saved;
    if (existing) {
      saved = TrustOpsSheetService.updateById(TrustOpsConfig.SHEETS.PAY_PERIODS, existing["Pay Period ID"], record);
      TrustOpsAuditService.log(context, "LEGACY_PAY_PERIOD_UPDATED", "Pay Period", saved["Pay Period ID"], existing, saved, "");
    } else {
      saved = TrustOpsSheetService.appendRecord(TrustOpsConfig.SHEETS.PAY_PERIODS, record);
      TrustOpsAuditService.log(context, "LEGACY_PAY_PERIOD_CREATED", "Pay Period", saved["Pay Period ID"], null, saved, "");
    }
    maps.payPeriodsByKey[String(periodId)] = saved;
    return saved;
  }

  function summarySnapshotId_(payPeriodId, userId) {
    return "sum_" + payPeriodId + "_" + userId;
  }

  function upsertPaySummary_(context, maps, row) {
    var userName = TrustOpsUtils.normalizeText(row.User || row["User Name"] || row["Full Name"]);
    var user = resolveUser_(context, maps, {
      "Full Name": userName,
      Email: row.Email || row["Email"] || "",
      Salary: row.Salary || row["Salary"] || 0,
      "Weekly Pay": row["Weekly Pay"] || row["Bi-Weekly Pay"] || 0
    });
    var period = upsertPayPeriod_(context, maps, row);
    if (!period) {
      var label = TrustOpsUtils.normalizeText(row["Pay Period"] || row["Pay Period Label"] || "");
      if (!label) return null;
      period = TrustOpsPayService.findPayPeriodForDate(normalizeLegacyDate_(row["Start Pay Period"] || row["Start Date"] || row["Pay Period"]));
    }
    var totalHours = TrustOpsUtils.toNumber(row["Total Hours"] || row["Total"] || row["Hours"]);
    var grossPay = TrustOpsUtils.toNumber(row["Bi-Weekly Pay"] || row["Gross Pay"] || row["Pay"]);
    var hourlyRate = TrustOpsUtils.toNumber(row["Hourly Rate"] || row["Rate"]);
    var salaryAmount = TrustOpsUtils.toNumber(row["Salary"] || row["Salary Amount"] || row["Bi-Weekly Pay"]);
    var additionalHours = TrustOpsUtils.toNumber(row["Additional Hours"] || row["Additional"]);
    var balance = TrustOpsUtils.toNumber(row["Balance"] || 0);
    var paid = TrustOpsUtils.normalizeText(row.Paid || row["Paid"]);
    var status = TrustOpsUtils.normalizeText(row.Status || row["Status"]);
    var snapshot = {
      "Pay Summary ID": summarySnapshotId_(period["Pay Period ID"], user["User ID"]),
      "Pay Period ID": period["Pay Period ID"],
      "User ID": user["User ID"],
      "User Name": user["Full Name"],
      "Total Hours": totalHours,
      "Pay Type": user["Pay Type"] || "None",
      "Hourly Rate": hourlyRate || TrustOpsUtils.toNumber(user["Hourly Rate"]),
      "Salary Amount": salaryAmount || TrustOpsUtils.toNumber(user["Salary Amount"]),
      "Effective Hourly Rate": TrustOpsUtils.toNumber(row["Effective Hourly Rate"] || row["Hourly Rate"]) || "",
      "Gross Pay": grossPay,
      "Adjustments": additionalHours,
      "Notes": [
        TrustOpsUtils.normalizeText(row.Notes || row["Notes"] || ""),
        status ? "Legacy Status: " + status : "",
        paid ? "Legacy Paid: " + paid : "",
        balance ? "Legacy Balance: " + balance : ""
      ].filter(Boolean).join(" | "),
      "Approved": TrustOpsUtils.normalizeKey(status) === "paid" || TrustOpsUtils.normalizeKey(paid) === "yes" || TrustOpsUtils.normalizeKey(paid) === "true",
      "Approved By": TrustOpsUtils.normalizeKey(status) === "paid" ? context.userId : "",
      "Approved At": TrustOpsUtils.normalizeKey(status) === "paid" ? TrustOpsUtils.nowIso() : "",
      "Snapshot": true,
      "Created At": TrustOpsUtils.nowIso(),
      "Updated At": TrustOpsUtils.nowIso()
    };
    var existing = maps.paySummariesByKey[String(snapshot["Pay Summary ID"])];
    if (existing && duplicateDecisionFor_(maps, "paySummary", String(snapshot["Pay Summary ID"])) === "keep") {
      return existing;
    }
    var saved;
    if (existing) {
      saved = TrustOpsSheetService.updateById(TrustOpsConfig.SHEETS.PAY_SUMMARIES, existing["Pay Summary ID"], snapshot);
      TrustOpsAuditService.log(context, "LEGACY_PAY_SUMMARY_UPDATED", "Pay Summary", saved["Pay Summary ID"], existing, saved, "");
    } else {
      saved = TrustOpsSheetService.appendRecord(TrustOpsConfig.SHEETS.PAY_SUMMARIES, snapshot);
      TrustOpsAuditService.log(context, "LEGACY_PAY_SUMMARY_CREATED", "Pay Summary", saved["Pay Summary ID"], null, saved, "");
    }
    maps.paySummariesByKey[String(snapshot["Pay Summary ID"])] = saved;
    return saved;
  }

  function importLegacyWorkbook(context, payload) {
    TrustOpsPermissionService.requireAllowed(
      TrustOpsPermissionService.canImportLegacyData(context),
      "You do not have permission to import legacy data."
    );
    var source = loadLegacySource_(payload || {});
    if (!source) throw new Error("A legacy spreadsheet ID or CSV bundle is required.");
    var importMode = TrustOpsUtils.normalizeKey(payload && (payload.importMode || payload.mode || payload.strategy));
    var overwrite = importMode === "overwrite";
    if (overwrite) {
      clearCanonicalData_();
    }
    var state = buildImportState_();
    var maps = createLookupMaps_(state);
    maps.importDecisions = payload.duplicateDecisions || {};
    var report = {
      sourceType: source.type,
      projects: { created: 0, updated: 0 },
      users: { created: 0, updated: 0 },
      tags: { created: 0, updated: 0 },
      categories: { created: 0, updated: 0 },
      tasks: { created: 0, updated: 0 },
      timeEntries: { created: 0, updated: 0 },
      payPeriods: { created: 0, updated: 0 },
      paySummaries: { created: 0, updated: 0 },
      importMode: overwrite ? "overwrite" : "append",
      warnings: []
    };
    var touchedProjectIds = [];

    readLegacyRows_(source, LEGACY_SHEETS.PROJECTS).forEach(function (row) {
      var saved = upsertProject_(context, maps, row);
      if (!saved) return;
      if (saved["Project ID"]) touchedProjectIds.push(saved["Project ID"]);
      if (state.projects.filter(function (item) { return String(item["Project ID"]) === String(saved["Project ID"]); })[0]) {
        report.projects.updated += 1;
      } else {
        report.projects.created += 1;
      }
    });

    readLegacyRows_(source, LEGACY_SHEETS.USERS).forEach(function (row) {
      var existingEmail = TrustOpsUtils.normalizeEmail(row.Email || row.email || row["Email Address"]);
      var existingName = TrustOpsUtils.normalizeKey(row["Full Name"] || row.Full || row.User || row.UserName || row.Name || row["User"]);
      var existedBefore = Boolean((existingEmail && maps.usersByEmail[existingEmail]) || (existingName && maps.usersByName[existingName]));
      var saved = resolveUser_(context, maps, row);
      if (existedBefore) {
        report.users.updated += 1;
      } else {
        report.users.created += 1;
      }
      if (!saved.Email) {
        report.warnings.push("A legacy user row was imported without an email address.");
      }
    });

    readLegacyRows_(source, LEGACY_SHEETS.TAGS).forEach(function (row) {
      var name = TrustOpsUtils.normalizeText(row.Tag || row["Tag Name"] || row.Name);
      if (!name) return;
      var key = TrustOpsUtils.normalizeKey(name);
      var existing = maps.tagsByName[key];
      var saved = resolveTag_(context, maps, row);
      if (existing) {
        report.tags.updated += 1;
      } else {
        report.tags.created += 1;
      }
      if (!saved) {
        report.warnings.push("Unable to import tag: " + name);
      }
    });
    report.tags.imported = report.tags.created + report.tags.updated;

    readLegacyRows_(source, LEGACY_SHEETS.PAY_SUMMARY).forEach(function (row) {
      var savedPeriod = upsertPayPeriod_(context, maps, row);
      if (savedPeriod) {
        if (state.payPeriods.filter(function (item) { return String(item["Pay Period ID"]) === String(savedPeriod["Pay Period ID"]); })[0]) {
          report.payPeriods.updated += 1;
        } else {
          report.payPeriods.created += 1;
        }
      }
    });

    readLegacyRows_(source, LEGACY_SHEETS.TIME_CATEGORIES).forEach(function (row) {
      var categoryName = TrustOpsUtils.normalizeText(row.Category || row["Category"]);
      if (!categoryName) return;
      var key = TrustOpsUtils.normalizeKey(categoryName);
      var existing = maps.categoriesByName[key];
      var saved = upsertCategory_(context, maps, row);
      if (existing) {
        report.categories.updated += 1;
      } else {
        report.categories.created += 1;
      }
      if (!saved) report.warnings.push("Unable to import time category: " + categoryName);
    });

    readLegacyRows_(source, LEGACY_SHEETS.ASSIGNMENT_BOARD).forEach(function (row) {
      var savedTask = upsertTask_(context, maps, row, "Legacy Assignment Board");
      if (!savedTask) return;
      if (state.tasks.filter(function (item) { return String(item["Task ID"]) === String(savedTask["Task ID"]); })[0]) {
        report.tasks.updated += 1;
      } else {
        report.tasks.created += 1;
      }
      if (savedTask["Project ID"]) touchedProjectIds.push(savedTask["Project ID"]);
    });

    readLegacyRows_(source, LEGACY_SHEETS.IMPORTED_TASKS).forEach(function (row) {
      var savedTask = upsertTask_(context, maps, row, "Legacy Imported Tasks");
      if (!savedTask) return;
      if (state.tasks.filter(function (item) { return String(item["Task ID"]) === String(savedTask["Task ID"]); })[0]) {
        report.tasks.updated += 1;
      } else {
        report.tasks.created += 1;
      }
      if (savedTask["Project ID"]) touchedProjectIds.push(savedTask["Project ID"]);
    });

    readLegacyRows_(source, LEGACY_SHEETS.TIME_LOG).forEach(function (row) {
      var savedEntry = upsertTimeEntry_(context, maps, row);
      if (!savedEntry) return;
      if (state.timeEntries.filter(function (item) { return String(item["Time Entry ID"]) === String(savedEntry["Time Entry ID"]); })[0]) {
        report.timeEntries.updated += 1;
      } else {
        report.timeEntries.created += 1;
      }
      if (savedEntry["Project ID"]) touchedProjectIds.push(savedEntry["Project ID"]);
    });

    readLegacyRows_(source, LEGACY_SHEETS.PAY_SUMMARY).forEach(function (row) {
      var savedSummary = upsertPaySummary_(context, maps, row);
      if (!savedSummary) return;
      if (state.paySummaries.filter(function (item) { return String(item["Pay Summary ID"]) === String(savedSummary["Pay Summary ID"]); })[0]) {
        report.paySummaries.updated += 1;
      } else {
        report.paySummaries.created += 1;
      }
    });

    if (touchedProjectIds.length) {
      TrustOpsProjectService.recomputeProjectStatuses(context, touchedProjectIds.join(","));
    }

    TrustOpsAuditService.log(
      context,
      "LEGACY_WORKBOOK_IMPORTED",
      "Migration",
      "Legacy Workbook",
      null,
      report,
      "Imported legacy workbook from " + source.type + " source."
    );
    return report;
  }

  function getLegacyMigrationPreview(context, payload) {
    TrustOpsPermissionService.requireAllowed(
      TrustOpsPermissionService.canImportLegacyData(context),
      "You do not have permission to preview legacy imports."
    );
    var source = loadLegacySource_(payload || {});
    if (!source) {
      return {
        sourceType: "current",
        assignmentBoardRows: getExistingSheetRows(TrustOpsConfig.SHEETS.LEGACY_ASSIGNMENT_BOARD).length,
        importedTaskRows: getExistingSheetRows(TrustOpsConfig.SHEETS.IMPORTED_TASKS).length,
        canonicalTasks: TrustOpsSheetService.readTable(TrustOpsConfig.SHEETS.TASKS).length,
        canonicalTimeEntries: TrustOpsSheetService.readTable(TrustOpsConfig.SHEETS.TIME_ENTRIES).length,
        duplicates: []
      };
    }
    return {
      sourceType: source.type,
      duplicates: collectLegacyDuplicatePreviews_(source),
      rows: {
        assignmentBoard: readLegacyRows_(source, LEGACY_SHEETS.ASSIGNMENT_BOARD).length,
        timeLog: readLegacyRows_(source, LEGACY_SHEETS.TIME_LOG).length,
        paySummary: readLegacyRows_(source, LEGACY_SHEETS.PAY_SUMMARY).length,
        projects: readLegacyRows_(source, LEGACY_SHEETS.PROJECTS).length,
        users: readLegacyRows_(source, LEGACY_SHEETS.USERS).length,
        categories: readLegacyRows_(source, LEGACY_SHEETS.TIME_CATEGORIES).length,
        tags: readLegacyRows_(source, LEGACY_SHEETS.TAGS).length,
        importedTasks: readLegacyRows_(source, LEGACY_SHEETS.IMPORTED_TASKS).length
      },
      canonical: {
        projects: TrustOpsSheetService.readTable(TrustOpsConfig.SHEETS.PROJECTS).length,
        users: TrustOpsSheetService.readTable(TrustOpsConfig.SHEETS.USERS).length,
        tasks: TrustOpsSheetService.readTable(TrustOpsConfig.SHEETS.TASKS).length,
        timeEntries: TrustOpsSheetService.readTable(TrustOpsConfig.SHEETS.TIME_ENTRIES).length,
        payPeriods: TrustOpsSheetService.readTable(TrustOpsConfig.SHEETS.PAY_PERIODS).length,
        paySummaries: TrustOpsSheetService.readTable(TrustOpsConfig.SHEETS.PAY_SUMMARIES).length
      }
    };
  }

  function migrateAssignmentBoardTasks(context) {
    TrustOpsPermissionService.requireAllowed(
      TrustOpsPermissionService.canManageSettings(context),
      "Only Owner/Admin can run migrations."
    );
    var rows = getExistingSheetRows(TrustOpsConfig.SHEETS.LEGACY_ASSIGNMENT_BOARD);
    var existingTitles = TrustOpsSheetService.readTable(TrustOpsConfig.SHEETS.TASKS).map(function (task) {
      return TrustOpsUtils.normalizeKey(task.Title + "|" + task["Due Date"]);
    });
    var migrated = 0;
    rows.forEach(function (row) {
      var title = row.Task || row.Title;
      if (!TrustOpsUtils.normalizeText(title)) return;
      var duplicateKey = TrustOpsUtils.normalizeKey(title + "|" + (row["Due Date"] || row.Due || ""));
      if (existingTitles.indexOf(duplicateKey) !== -1) return;
      TrustOpsTaskService.createTask(context, {
        title: title,
        notes: row.Notes || "",
        status: row.Status || "In Progress",
        dueDate: row["Due Date"] || row.Due || "",
        assignees: row.Assignees || row.Assignee || "",
        projectName: row.Project || "",
        priority: row.Priority || "Medium",
        tags: row.Tags || ""
      });
      migrated += 1;
    });
    TrustOpsAuditService.log(context, "MIGRATION_ASSIGNMENT_BOARD_TASKS", "Migration", "Assignment Board", null, { migrated: migrated }, "");
    return { migrated: migrated };
  }

  return {
    bootstrap: bootstrap,
    getMigrationPreview: getMigrationPreview,
    migrateAssignmentBoardTasks: migrateAssignmentBoardTasks,
    repairTaskAssigneeAssignments: repairTaskAssigneeAssignments,
    getLegacyMigrationPreview: getLegacyMigrationPreview,
    importLegacyWorkbook: importLegacyWorkbook
  };
})();
