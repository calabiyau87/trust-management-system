var TrustOpsMigrationService = (function () {
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

  function seedSettings() {
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

  function bootstrap(spreadsheetId, ownerEmail) {
    TrustOpsAuthService.requireBootstrapAllowed(ownerEmail);
    TrustOpsSheetService.setSpreadsheetId(spreadsheetId);
    TrustOpsSheetService.ensureAllSheets();
    seedSettings();
    var owner = seedOwner(ownerEmail);
    seedCategories();
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

  function getMigrationPreview(context) {
    TrustOpsPermissionService.requireAllowed(
      TrustOpsPermissionService.canManageSettings(context),
      "Only Owner/Admin can preview migrations."
    );
    return {
      assignmentBoardRows: getExistingSheetRows(TrustOpsConfig.SHEETS.LEGACY_ASSIGNMENT_BOARD).length,
      importedTaskRows: getExistingSheetRows(TrustOpsConfig.SHEETS.IMPORTED_TASKS).length,
      canonicalTasks: TrustOpsSheetService.readTable(TrustOpsConfig.SHEETS.TASKS).length,
      canonicalTimeEntries: TrustOpsSheetService.readTable(TrustOpsConfig.SHEETS.TIME_ENTRIES).length
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
    migrateAssignmentBoardTasks: migrateAssignmentBoardTasks
  };
})();
