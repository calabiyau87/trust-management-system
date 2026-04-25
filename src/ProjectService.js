var TrustOpsProjectService = (function () {
  function listProjects(includeArchived) {
    return TrustOpsUtils.recordsForClient(
      TrustOpsSheetService.readTable(TrustOpsConfig.SHEETS.PROJECTS).filter(function (project) {
        return includeArchived || !TrustOpsUtils.toBoolean(project.Archived);
      })
    );
  }

  function listCategories(includeArchived) {
    return TrustOpsUtils.recordsForClient(
      TrustOpsSheetService.readTable(TrustOpsConfig.SHEETS.TIME_CATEGORIES).filter(function (category) {
        return includeArchived || !TrustOpsUtils.toBoolean(category.Archived);
      })
    );
  }

  function saveProject(context, payload) {
    TrustOpsPermissionService.requireAllowed(
      TrustOpsPermissionService.canManageProjects(context),
      "Only Owner/Admin/Manager can manage projects."
    );
    var projectId = payload["Project ID"] || payload.projectId || "";
    var existing = projectId ? TrustOpsSheetService.findById(TrustOpsConfig.SHEETS.PROJECTS, projectId) : null;
    var now = TrustOpsUtils.nowIso();
    var record = {
      "Project Name": TrustOpsUtils.requireValue(payload["Project Name"] || payload.projectName, "Project name"),
      "Description": payload.Description || payload.description || "",
      "Status": payload.Status || payload.status || "Active",
      "Active": payload.Active === undefined ? true : TrustOpsUtils.toBoolean(payload.Active),
      "Created At": existing ? existing["Created At"] : now,
      "Updated At": now,
      "Archived": existing ? TrustOpsUtils.toBoolean(existing.Archived) : false
    };
    var saved = existing
      ? TrustOpsSheetService.updateById(TrustOpsConfig.SHEETS.PROJECTS, projectId, record)
      : TrustOpsSheetService.appendRecord(TrustOpsConfig.SHEETS.PROJECTS, record);
    TrustOpsAuditService.log(context, existing ? "PROJECT_UPDATED" : "PROJECT_CREATED", "Project", saved["Project ID"], existing, saved, "");
    return TrustOpsUtils.sanitizeForClient(saved);
  }

  function saveCategory(context, payload) {
    TrustOpsPermissionService.requireAllowed(
      TrustOpsPermissionService.canManageSettings(context),
      "Only Owner/Admin can manage time categories."
    );
    var categoryId = payload["Category ID"] || payload.categoryId || "";
    var existing = categoryId ? TrustOpsSheetService.findById(TrustOpsConfig.SHEETS.TIME_CATEGORIES, categoryId) : null;
    var projectId = payload["Default Project ID"] || payload.defaultProjectId || "";
    var project = projectId ? TrustOpsSheetService.findById(TrustOpsConfig.SHEETS.PROJECTS, projectId) : null;
    var now = TrustOpsUtils.nowIso();
    var record = {
      "Category": TrustOpsUtils.requireValue(payload.Category || payload.category, "Category"),
      "Default Project ID": projectId,
      "Default Project": project ? project["Project Name"] : payload["Default Project"] || payload.defaultProject || "",
      "Active": payload.Active === undefined ? true : TrustOpsUtils.toBoolean(payload.Active),
      "Created At": existing ? existing["Created At"] : now,
      "Updated At": now,
      "Archived": existing ? TrustOpsUtils.toBoolean(existing.Archived) : false
    };
    var saved = existing
      ? TrustOpsSheetService.updateById(TrustOpsConfig.SHEETS.TIME_CATEGORIES, categoryId, record)
      : TrustOpsSheetService.appendRecord(TrustOpsConfig.SHEETS.TIME_CATEGORIES, record);
    TrustOpsAuditService.log(context, existing ? "CATEGORY_UPDATED" : "CATEGORY_CREATED", "Time Category", saved["Category ID"], existing, saved, "");
    return TrustOpsUtils.sanitizeForClient(saved);
  }

  return {
    listProjects: listProjects,
    listCategories: listCategories,
    saveProject: saveProject,
    saveCategory: saveCategory
  };
})();
