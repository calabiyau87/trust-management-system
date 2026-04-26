var TrustOpsProjectService = (function () {
  function isArchivedRecord(record) {
    return TrustOpsUtils.toBoolean(record && record.Archived) || TrustOpsUtils.normalizeText(record && record.Status) === "Archived";
  }

  function readProjects() {
    return TrustOpsSheetService.readTable(TrustOpsConfig.SHEETS.PROJECTS);
  }

  function readTasks() {
    return TrustOpsSheetService.readTable(TrustOpsConfig.SHEETS.TASKS);
  }

  function readEntries() {
    return TrustOpsSheetService.readTable(TrustOpsConfig.SHEETS.TIME_ENTRIES);
  }

  function mapById(records, idField) {
    return (records || []).reduce(function (acc, record) {
      var id = String(record[idField] || "");
      if (id) acc[id] = record;
      return acc;
    }, {});
  }

  function visibleProjectsContext(includeArchived) {
    var projects = readProjects();
    var allById = mapById(projects, "Project ID");
    var activeProjects = projects.filter(function (project) {
      return includeArchived || !isArchivedRecord(project);
    });
    var activeById = mapById(activeProjects, "Project ID");
    var visibleById = {};
    activeProjects.forEach(function (project) {
      var projectId = String(project["Project ID"] || "");
      var parentId = TrustOpsUtils.normalizeOptionalLink(project["Parent Project ID"]);
      if (!parentId) {
        visibleById[projectId] = project;
        return;
      }
      if (includeArchived) {
        visibleById[projectId] = project;
        return;
      }
      var parent = allById[parentId];
      if (!parent || isArchivedRecord(parent)) {
        visibleById[projectId] = project;
        return;
      }
      if (activeById[parentId]) visibleById[projectId] = project;
    });
    var visibleProjects = Object.keys(visibleById).map(function (key) {
      return visibleById[key];
    });
    var childProjectsByParentId = {};
    visibleProjects.forEach(function (project) {
      var parentId = TrustOpsUtils.normalizeOptionalLink(project["Parent Project ID"]);
      if (!parentId || !visibleById[parentId]) return;
      childProjectsByParentId[parentId] = childProjectsByParentId[parentId] || [];
      childProjectsByParentId[parentId].push(project);
    });
    return {
      projects: projects,
      allById: allById,
      activeProjects: activeProjects,
      activeById: activeById,
      visibleProjects: visibleProjects,
      visibleById: visibleById,
      childProjectsByParentId: childProjectsByParentId
    };
  }

  function buildTaskSummaryContext(projectContext) {
    var tasks = readTasks().filter(function (task) {
      return !isArchivedRecord(task);
    });
    var allById = mapById(tasks, "Task ID");
    function projectDisplayNameForTask(projectId) {
      var project = projectContext.allById[String(projectId || "")] || null;
      if (!project) return "";
      var parentId = TrustOpsUtils.normalizeOptionalLink(project["Parent Project ID"]);
      var parent = parentId ? projectContext.allById[String(parentId)] || null : null;
      return parent ? parent["Project Name"] + " / " + project["Project Name"] : project["Project Name"];
    }
    var projectVisibleTasks = tasks.filter(function (task) {
      var projectId = TrustOpsUtils.normalizeText(task["Project ID"]);
      if (!projectId) return true;
      return Boolean(projectContext.visibleById[projectId]);
    });
    var projectVisibleById = mapById(projectVisibleTasks, "Task ID");
    var visibleTasks = projectVisibleTasks.filter(function (task) {
      var parentId = TrustOpsUtils.normalizeOptionalLink(task["Parent Task ID"]);
      if (!parentId) return true;
      if (!allById[parentId]) return true;
      return Boolean(projectVisibleById[parentId]);
    });
    var visibleById = mapById(visibleTasks, "Task ID");
    var childrenByParentId = {};
    visibleTasks.forEach(function (task) {
      var parentId = TrustOpsUtils.normalizeOptionalLink(task["Parent Task ID"]);
      if (!parentId || !visibleById[parentId]) return;
      childrenByParentId[parentId] = childrenByParentId[parentId] || [];
      childrenByParentId[parentId].push(task);
    });
    var decorated = visibleTasks.map(function (task) {
      var children = (childrenByParentId[task["Task ID"]] || []).slice();
      var childCount = children.length;
      var completedChildCount = children.filter(function (child) {
        return TrustOpsUtils.normalizeText(child.Status) === "Complete";
      }).length;
      var parentTask = TrustOpsUtils.normalizeOptionalLink(task["Parent Task ID"])
        ? visibleById[String(task["Parent Task ID"])] || allById[String(task["Parent Task ID"])] || null
        : null;
      var isLeaf = childCount === 0;
      var progressPercent = isLeaf
        ? (TrustOpsUtils.normalizeText(task.Status) === "Complete" ? 100 : 0)
        : Math.round((completedChildCount / childCount) * 100);
      var effectiveStatus = isLeaf
        ? TrustOpsUtils.normalizeText(task.Status) || "In Progress"
        : completedChildCount === childCount && childCount > 0
          ? "Complete"
          : "In Progress";
      if (TrustOpsUtils.normalizeText(task.Status) === "Archived") effectiveStatus = "Archived";
      return {
        "Task ID": task["Task ID"],
        "Title": task.Title,
        "Notes": task.Notes,
        "Status": effectiveStatus,
        "Due Date": task["Due Date"],
        "Assignees": task.Assignees,
        "Assignee User IDs": task["Assignee User IDs"],
        "Project ID": task["Project ID"],
        "Project Name": task["Project Name"],
        "Project Display Name": projectDisplayNameForTask(task["Project ID"]) || task["Project Name"],
        "Parent Task ID": task["Parent Task ID"] || "",
        "Parent Task Title": parentTask ? parentTask.Title : task["Parent Task Title"] || "",
        "Priority": task.Priority,
        "Tags": task.Tags,
        "Created By User ID": task["Created By User ID"],
        "Created At": task["Created At"],
        "Updated At": task["Updated At"],
        "Completed By User ID": task["Completed By User ID"],
        "Completed At": task["Completed At"],
        "Source": task.Source,
        "External Google Task Mirror IDs": task["External Google Task Mirror IDs"],
        "Chat Message Link": task["Chat Message Link"],
        "Archived": task.Archived,
        "Child Task Count": childCount,
        "Completed Child Task Count": completedChildCount,
        "Has Children": childCount > 0,
        "Hierarchy Level": TrustOpsUtils.normalizeOptionalLink(task["Parent Task ID"]) ? 1 : 0,
        "Progress Percent": progressPercent,
        "Display Name": TrustOpsUtils.normalizeOptionalLink(task["Parent Task ID"]) && parentTask ? parentTask.Title + " / " + task.Title : task.Title
      };
    });
    return {
      tasks: tasks,
      allById: allById,
      visibleTasks: decorated,
      visibleById: mapById(decorated, "Task ID"),
      childrenByParentId: childrenByParentId
    };
  }

  function normalizeProjectStatus(status, fallback) {
    var allowed = TrustOpsConfig.PROJECT_STATUSES;
    var text = TrustOpsUtils.normalizeText(status);
    if (allowed.indexOf(text) !== -1) return text;
    return fallback || "Not Started";
  }

  function projectScopeIds(project, projectContext) {
    var projectId = String(project["Project ID"] || "");
    var scope = {};
    scope[projectId] = true;
    (projectContext.childProjectsByParentId[projectId] || []).forEach(function (child) {
      scope[String(child["Project ID"])] = true;
    });
    return Object.keys(scope);
  }

  function leafTasksForScope(tasks, scopeIds) {
    var scopeMap = {};
    scopeIds.forEach(function (id) {
      scopeMap[String(id)] = true;
    });
    return (tasks || []).filter(function (task) {
      return scopeMap[String(task["Project ID"] || "")] && Number(task["Child Task Count"] || 0) === 0;
    });
  }

  function buildProjectSummary(project, projectContext, taskContext, entries) {
    var projectId = project["Project ID"];
    var scopeIds = projectScopeIds(project, projectContext);
    var scopeMap = {};
    scopeIds.forEach(function (id) {
      scopeMap[String(id)] = true;
    });
    var scopeTasks = (taskContext.visibleTasks || []).filter(function (task) {
      return scopeMap[String(task["Project ID"] || "")];
    });
    var leafTasks = leafTasksForScope(scopeTasks, scopeIds);
    var projectEntries = (entries || []).filter(function (entry) {
      return scopeMap[String(entry["Project ID"] || "")];
    });
    var assigneeIds = {};
    scopeTasks.forEach(function (task) {
      TrustOpsUtils.splitList(task["Assignee User IDs"]).forEach(function (userId) {
        assigneeIds[String(userId)] = true;
      });
    });
    var completedLeafTasks = leafTasks.filter(function (task) {
      return TrustOpsUtils.normalizeText(task.Status) === "Complete";
    });
    var status = "Not Started";
    if (isArchivedRecord(project)) {
      status = "Archived";
    } else if (TrustOpsUtils.normalizeText(project.Status) === "Holding") {
      status = "Holding";
    } else if (leafTasks.length && completedLeafTasks.length === leafTasks.length) {
      status = "Completed";
    } else if (leafTasks.length) {
      status = "In Progress";
    }
    return {
      "Project ID": projectId,
      "Project Name": project["Project Name"],
      "Display Name": TrustOpsUtils.normalizeOptionalLink(project["Parent Project ID"]) && projectContext.allById[String(TrustOpsUtils.normalizeOptionalLink(project["Parent Project ID"]))]
        ? projectContext.allById[String(TrustOpsUtils.normalizeOptionalLink(project["Parent Project ID"]))]['Project Name'] + " / " + project["Project Name"]
        : project["Project Name"],
      "Parent Project ID": TrustOpsUtils.normalizeOptionalLink(project["Parent Project ID"]),
      "Parent Project Name": TrustOpsUtils.normalizeOptionalLink(project["Parent Project ID"]) && projectContext.allById[String(TrustOpsUtils.normalizeOptionalLink(project["Parent Project ID"]))]
        ? projectContext.allById[String(TrustOpsUtils.normalizeOptionalLink(project["Parent Project ID"]))]["Project Name"]
        : project["Parent Project Name"] || "",
      "Child Project Count": (projectContext.childProjectsByParentId[projectId] || []).length,
      "Direct Task Count": scopeTasks.filter(function (task) {
        return String(task["Project ID"] || "") === String(projectId);
      }).length,
      "Task Count": leafTasks.length,
      "Completed Task Count": completedLeafTasks.length,
      "Progress Percent": leafTasks.length ? Math.round((completedLeafTasks.length / leafTasks.length) * 100) : 0,
      "Status": status,
      "Active": project.Active,
      "Archived": project.Archived,
      "Total Hours": Math.round(
        projectEntries.reduce(function (sum, entry) {
          return sum + TrustOpsUtils.toNumber(entry.Hours);
        }, 0) * 100
      ) / 100,
      "User Count": Object.keys(assigneeIds).length,
      "Open Task Count": Math.max(0, leafTasks.length - completedLeafTasks.length),
      "Hierarchy Level": TrustOpsUtils.normalizeOptionalLink(project["Parent Project ID"]) ? 1 : 0
    };
  }

  function groupHours(entries, keyFn, labelFn) {
    var grouped = {};
    (entries || []).forEach(function (entry) {
      var key = keyFn(entry) || "Unassigned";
      grouped[key] = grouped[key] || { label: labelFn(entry) || key, hours: 0 };
      grouped[key].hours += TrustOpsUtils.toNumber(entry.Hours);
    });
    return Object.keys(grouped)
      .sort(function (a, b) {
        return String(grouped[a].label).localeCompare(String(grouped[b].label));
      })
      .map(function (key) {
        return {
          key: key,
          label: grouped[key].label,
          hours: Math.round(grouped[key].hours * 100) / 100
        };
      });
  }

  function projectEntriesForRange(context, range, projectContext, scopeIds) {
    var canViewAll = TrustOpsPermissionService.canViewTimeEntries(context, "__all__");
    var scopeMap = {};
    (scopeIds || []).forEach(function (id) {
      scopeMap[String(id)] = true;
    });
    var visibleProjectMap = projectContext ? projectContext.visibleById : {};
    return readEntries().filter(function (entry) {
      if (TrustOpsUtils.toBoolean(entry.Deleted)) return false;
      if (!canViewAll && String(entry["User ID"]) !== String(context.userId)) return false;
      var projectId = String(entry["Project ID"] || "");
      if (projectId && !visibleProjectMap[projectId]) return false;
      if (scopeIds && scopeIds.length && !scopeMap[projectId]) return false;
      if (range.payPeriod) {
        return String(entry["Pay Period ID"]) === String(range.payPeriod["Pay Period ID"]);
      }
      return TrustOpsUtils.isBetweenInclusive(entry.Date, range.startDate, range.endDate);
    });
  }

  function derivedProjectStatus(project, taskContext) {
    if (!project) return "Not Started";
    if (isArchivedRecord(project)) return "Archived";
    if (!TrustOpsUtils.toBoolean(project.Active)) return "Archived";
    if (TrustOpsUtils.normalizeText(project.Status) === "Holding") return "Holding";
    var summary = buildProjectSummary(project, visibleProjectsContext(false), taskContext, []);
    return summary.Status;
  }

  function projectHasChildren(projectId) {
    return readProjects().some(function (project) {
      return TrustOpsUtils.normalizeOptionalLink(project["Parent Project ID"]) === String(projectId || "");
    });
  }

  function validateProjectHierarchy(context, payload, existing) {
    var hasParentField = Object.prototype.hasOwnProperty.call(payload || {}, "Parent Project ID") ||
      Object.prototype.hasOwnProperty.call(payload || {}, "parentProjectId");
    var existingParentProjectId = existing ? TrustOpsUtils.normalizeOptionalLink(existing["Parent Project ID"]) : "";
    var parentProjectId = TrustOpsUtils.normalizeOptionalLink(payload["Parent Project ID"] || payload.parentProjectId);
    if (existing && !hasParentField) {
      parentProjectId = existingParentProjectId;
    }
    var parentProject = parentProjectId ? TrustOpsSheetService.findById(TrustOpsConfig.SHEETS.PROJECTS, parentProjectId) : null;
    if (existing && String(parentProjectId) !== String(existingParentProjectId)) {
      TrustOpsPermissionService.requireAllowed(
        TrustOpsPermissionService.canManageProjects(context),
        "Only Owner/Admin/Manager can create, reparent, or unparent subprojects."
      );
    }
    if (!parentProjectId) return null;
    TrustOpsPermissionService.requireAllowed(
      TrustOpsPermissionService.canManageProjects(context),
      "Only Owner/Admin/Manager can create or reparent subprojects."
    );
    if (!parentProject) throw new Error("Parent project not found.");
    if (isArchivedRecord(parentProject)) throw new Error("Parent project is archived.");
    if (existing && String(existing["Project ID"]) === String(parentProjectId)) {
      throw new Error("A project cannot be its own parent.");
    }
    if (existing && projectHasChildren(existing["Project ID"])) {
      throw new Error("Projects with subprojects cannot become subprojects themselves.");
    }
    if (TrustOpsUtils.normalizeOptionalLink(parentProject["Parent Project ID"])) {
      throw new Error("Subprojects cannot be nested more than one level deep.");
    }
    return parentProject;
  }

  function listProjects(includeArchived) {
    var projectContext = visibleProjectsContext(includeArchived);
    var taskContext = buildTaskSummaryContext(projectContext);
    var summaries = projectContext.visibleProjects.map(function (project) {
      return buildProjectSummary(project, projectContext, taskContext, []);
    });
    summaries.sort(function (a, b) {
      return String(a["Display Name"]).localeCompare(String(b["Display Name"]));
    });
    return TrustOpsUtils.recordsForClient(summaries);
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
    var parentProject = validateProjectHierarchy(context, payload || {}, existing);
    var requestedStatus = payload.Status || payload.status || "";
    var taskContext = buildTaskSummaryContext(visibleProjectsContext(false));
    var record = {
      "Project Name": TrustOpsUtils.requireValue(payload["Project Name"] || payload.projectName, "Project name"),
      "Description": payload.Description || payload.description || "",
      "Parent Project ID": parentProject ? parentProject["Project ID"] : "",
      "Parent Project Name": parentProject ? parentProject["Project Name"] : "",
      "Status": normalizeProjectStatus(
        TrustOpsUtils.normalizeText(requestedStatus) === "Holding" ? "Holding" : "",
        existing ? derivedProjectStatus(existing, taskContext) : "Not Started"
      ),
      "Active": payload.Active === undefined ? true : TrustOpsUtils.toBoolean(payload.Active),
      "Created At": existing ? existing["Created At"] : now,
      "Updated At": now,
      "Archived": existing ? TrustOpsUtils.toBoolean(existing.Archived) : false
    };
    if (TrustOpsUtils.normalizeText(requestedStatus) === "Holding") {
      record.Status = "Holding";
    } else if (!existing) {
      record.Status = "Not Started";
    }
    var saved = existing
      ? TrustOpsSheetService.updateById(TrustOpsConfig.SHEETS.PROJECTS, projectId, record)
      : TrustOpsSheetService.appendRecord(TrustOpsConfig.SHEETS.PROJECTS, record);
    TrustOpsAuditService.log(context, existing ? "PROJECT_UPDATED" : "PROJECT_CREATED", "Project", saved["Project ID"], existing, saved, "");
    recomputeProjectStatuses(context, [
      saved["Project ID"],
      existing && existing["Parent Project ID"],
      saved["Parent Project ID"]
    ].join(","));
    return TrustOpsUtils.sanitizeForClient(TrustOpsSheetService.findById(TrustOpsConfig.SHEETS.PROJECTS, saved["Project ID"]));
  }

  function saveCategory(context, payload) {
    TrustOpsPermissionService.requireAllowed(
      TrustOpsPermissionService.canManageTimeCategories(context),
      "You do not have permission to manage time categories."
    );
    var categoryId = payload["Category ID"] || payload.categoryId || "";
    var existing = categoryId ? TrustOpsSheetService.findById(TrustOpsConfig.SHEETS.TIME_CATEGORIES, categoryId) : null;
    var newProjectId = payload["Default Project ID"] || payload.defaultProjectId || "";
    var oldProjectId = existing ? existing["Default Project ID"] || "" : "";
    var project = newProjectId ? TrustOpsSheetService.findById(TrustOpsConfig.SHEETS.PROJECTS, newProjectId) : null;
    var now = TrustOpsUtils.nowIso();
    var record = {
      "Category": TrustOpsUtils.requireValue(payload.Category || payload.category, "Category"),
      "Default Project ID": newProjectId,
      "Default Project": project ? project["Project Name"] : payload["Default Project"] || payload.defaultProject || "",
      "Active": payload.Active === undefined ? true : TrustOpsUtils.toBoolean(payload.Active),
      "Created At": existing ? existing["Created At"] : now,
      "Updated At": now,
      "Archived": existing ? TrustOpsUtils.toBoolean(existing.Archived) : false
    };
    if (existing && oldProjectId !== newProjectId && TrustOpsUtils.toBoolean(payload.previewOnly)) {
      var historical = TrustOpsSheetService.readTable(TrustOpsConfig.SHEETS.TIME_ENTRIES).filter(function (entry) {
        if (TrustOpsUtils.toBoolean(entry.Deleted)) return false;
        return String(entry["Category ID"]) === String(categoryId) && String(entry["Project ID"] || "") === String(oldProjectId || "");
      });
      if (historical.length) {
        return {
          requiresBackfill: true,
          historicalEntryCount: historical.length,
          categoryId: categoryId,
          oldDefaultProjectId: oldProjectId,
          newDefaultProjectId: newProjectId,
          categoryName: record["Category"]
        };
      }
    }
    var saved = existing
      ? TrustOpsSheetService.updateById(TrustOpsConfig.SHEETS.TIME_CATEGORIES, categoryId, record)
      : TrustOpsSheetService.appendRecord(TrustOpsConfig.SHEETS.TIME_CATEGORIES, record);
    if (existing && oldProjectId !== newProjectId && TrustOpsUtils.toBoolean(payload.backfillExistingEntries)) {
      TrustOpsTimeService.backfillCategoryDefaultProject(context, saved["Category ID"], oldProjectId, newProjectId);
    }
    TrustOpsAuditService.log(context, existing ? "CATEGORY_UPDATED" : "CATEGORY_CREATED", "Time Category", saved["Category ID"], existing, saved, "");
    return TrustOpsUtils.sanitizeForClient(saved);
  }

  function recomputeProjectStatuses(context, projectIds) {
    var hierarchy = visibleProjectsContext(true);
    var taskContext = buildTaskSummaryContext(hierarchy);
    var touched = {};
    TrustOpsUtils.splitList(projectIds).map(String).forEach(function (projectId) {
      if (!projectId) return;
      touched[projectId] = true;
      var project = hierarchy.allById[projectId];
      var parentProjectId = project ? TrustOpsUtils.normalizeOptionalLink(project["Parent Project ID"]) : "";
      if (parentProjectId) {
        touched[String(parentProjectId)] = true;
      }
    });
    var now = TrustOpsUtils.nowIso();
    var updated = [];
    Object.keys(touched).forEach(function (projectId) {
      var project = hierarchy.allById[projectId];
      if (!project || isArchivedRecord(project)) return;
      var nextStatus = derivedProjectStatus(project, taskContext);
      if (String(project.Status) === String(nextStatus)) return;
      var saved = TrustOpsSheetService.updateById(TrustOpsConfig.SHEETS.PROJECTS, projectId, {
        "Status": nextStatus,
        "Updated At": now
      });
      TrustOpsAuditService.log(context || { userId: "" }, "PROJECT_STATUS_RECALCULATED", "Project", projectId, project, saved, nextStatus);
      updated.push(saved);
    });
    return updated;
  }

  function archiveProject(context, projectId) {
    TrustOpsPermissionService.requireAllowed(
      TrustOpsPermissionService.canManageProjects(context),
      "You do not have permission to delete projects."
    );
    var existing = TrustOpsSheetService.findById(TrustOpsConfig.SHEETS.PROJECTS, projectId);
    if (!existing) throw new Error("Project not found.");
    var saved = TrustOpsSheetService.updateById(TrustOpsConfig.SHEETS.PROJECTS, projectId, {
      "Active": false,
      "Archived": true,
      "Status": "Archived",
      "Updated At": TrustOpsUtils.nowIso()
    });
    TrustOpsAuditService.log(context, "PROJECT_ARCHIVED", "Project", projectId, existing, saved, "");
    recomputeProjectStatuses(context, [projectId, TrustOpsUtils.normalizeOptionalLink(existing["Parent Project ID"])].join(","));
    return TrustOpsUtils.sanitizeForClient(saved);
  }

  function unarchiveProject(context, projectId) {
    TrustOpsPermissionService.requireAllowed(
      TrustOpsPermissionService.canManageProjects(context),
      "You do not have permission to restore projects."
    );
    var existing = TrustOpsSheetService.findById(TrustOpsConfig.SHEETS.PROJECTS, projectId);
    if (!existing) throw new Error("Project not found.");
    var saved = TrustOpsSheetService.updateById(TrustOpsConfig.SHEETS.PROJECTS, projectId, {
      "Active": true,
      "Archived": false,
      "Updated At": TrustOpsUtils.nowIso()
    });
    recomputeProjectStatuses(context, [projectId, TrustOpsUtils.normalizeOptionalLink(existing["Parent Project ID"])].join(","));
    var refreshed = TrustOpsSheetService.findById(TrustOpsConfig.SHEETS.PROJECTS, projectId);
    TrustOpsAuditService.log(context, "PROJECT_UNARCHIVED", "Project", projectId, existing, refreshed, "");
    return TrustOpsUtils.sanitizeForClient(refreshed);
  }

  function resolveProjectRange(payload) {
    var mode = payload.rangeMode || payload.range || "";
    var period = null;
    if (!mode && payload.payPeriodId) mode = "period:" + payload.payPeriodId;
    if (!mode) mode = "current";
    if (mode === "current") {
      period = TrustOpsPayService.getCurrentPayPeriod();
    } else if (mode === "last") {
      var current = TrustOpsPayService.getCurrentPayPeriod();
      var periodDays = TrustOpsUtils.toNumber(
        TrustOpsSettingsService.getSetting("DEFAULT_PAY_PERIOD_DAYS", TrustOpsConfig.PAY_PERIOD_DAYS)
      ) || TrustOpsConfig.PAY_PERIOD_DAYS;
      period = TrustOpsPayService.findPayPeriodForDate(TrustOpsUtils.addDays(current["Start Date"], -periodDays));
    } else if (String(mode).indexOf("period:") === 0) {
      period = TrustOpsSheetService.findById(TrustOpsConfig.SHEETS.PAY_PERIODS, String(mode).slice(7));
      if (!period) throw new Error("Pay period not found.");
    }
    if (period) {
      return {
        mode: mode,
        label: period["Pay Period Label"],
        startDate: period["Start Date"],
        endDate: period["End Date"],
        payPeriod: period,
        locked: TrustOpsPayService.isLocked(period)
      };
    }
    if (mode === "custom") {
      var startDate = TrustOpsUtils.formatDate(payload.startDate || payload["Start Date"]);
      var endDate = TrustOpsUtils.formatDate(payload.endDate || payload["End Date"]);
      TrustOpsUtils.requireValue(startDate, "Start date");
      TrustOpsUtils.requireValue(endDate, "End date");
      return {
        mode: mode,
        label: TrustOpsUtils.formatDateLabel(startDate) + " - " + TrustOpsUtils.formatDateLabel(endDate),
        startDate: startDate,
        endDate: endDate,
        payPeriod: null,
        locked: false
      };
    }
    throw new Error("Unsupported project dashboard range.");
  }

  function buildProjectDetailNode(project, projectContext, tasks, entries, range) {
    var projectId = project["Project ID"];
    var scopeIds = projectScopeIds(project, projectContext);
    var scopeMap = {};
    scopeIds.forEach(function (id) {
      scopeMap[String(id)] = true;
    });
    var projectTasks = (tasks || []).filter(function (task) {
      return String(task["Project ID"] || "") === String(projectId);
    });
    var projectEntries = (entries || []).filter(function (entry) {
      return scopeMap[String(entry["Project ID"] || "")];
    });
    projectEntries.sort(function (a, b) {
      if (a.Date === b.Date) return String(a["Task / Category"]).localeCompare(String(b["Task / Category"]));
      return String(a.Date).localeCompare(String(b.Date));
    });
    var totalHours = projectEntries.reduce(function (sum, entry) {
      return sum + TrustOpsUtils.toNumber(entry.Hours);
    }, 0);
    var dayCount = Math.max(1, TrustOpsUtils.daysBetween(range.startDate, range.endDate) + 1);
    var projectAssignees = {};
    (tasks || []).filter(function (task) {
      return scopeMap[String(task["Project ID"] || "")];
    }).forEach(function (task) {
      TrustOpsUtils.splitList(task["Assignee User IDs"]).forEach(function (userId) {
        projectAssignees[String(userId)] = true;
      });
    });
    var childProjects = (projectContext.childProjectsByParentId[projectId] || []).map(function (childProject) {
      return buildProjectDetailNode(childProject, projectContext, tasks, entries, range);
    });
    return {
      project: TrustOpsUtils.sanitizeForClient(project),
      range: range,
      tasks: TrustOpsUtils.recordsForClient(projectTasks),
      childProjects: childProjects,
      entries: TrustOpsUtils.recordsForClient(projectEntries),
      summary: buildProjectSummary(project, projectContext, { visibleTasks: tasks }, entries),
      taskTotals: groupHours(
        projectEntries.filter(function (entry) {
          return entry["Entry Type"] === TrustOpsConfig.ENTRY_TYPES.TASK;
        }),
        function (entry) {
          return entry["Task ID"] || entry["Task / Category"];
        },
        function (entry) {
          return entry["Task / Category"];
        }
      ),
      userTotals: groupHours(
        projectEntries,
        function (entry) {
          return entry["User ID"] || entry["User Name"];
        },
        function (entry) {
          return entry["User Name"] || "Unknown user";
        }
      ),
      categoryTotals: groupHours(
        projectEntries.filter(function (entry) {
          return entry["Entry Type"] === TrustOpsConfig.ENTRY_TYPES.GENERAL;
        }),
        function (entry) {
          return entry["Category ID"] || entry["Task / Category"];
        },
        function (entry) {
          return entry["Task / Category"];
        }
      ),
      metrics: {
        totalHours: Math.round(totalHours * 100) / 100,
        averageHoursPerWeek: Math.round((totalHours / Math.max(1, dayCount / 7)) * 100) / 100,
        entryCount: projectEntries.length,
        taskCount: projectTasks.length,
        userCount: Object.keys(projectAssignees).length
      }
    };
  }

  function getProjectDashboard(context, filters) {
    var payload = filters || {};
    var range = resolveProjectRange(payload);
    var includeArchived = TrustOpsUtils.toBoolean(payload.includeArchived);
    var projectId = payload.projectId || "";
    var projectContext = visibleProjectsContext(includeArchived);
    var tasks = TrustOpsTaskService.listTasks(context, {});
    var entries = projectEntriesForRange(context, range, projectContext);
    var summaries = projectContext.visibleProjects.map(function (project) {
      return buildProjectSummary(project, projectContext, { visibleTasks: tasks }, entries);
    });
    summaries.sort(function (a, b) {
      return String(a["Display Name"]).localeCompare(String(b["Display Name"]));
    });
    var filteredSummaries = projectId
      ? summaries.filter(function (project) {
      return String(project["Project ID"]) === String(projectId);
        })
      : summaries;
    var selectedProject = projectId
      ? buildProjectDetailNode(
          projectContext.allById[String(projectId)] || null,
          projectContext,
          tasks,
          entries,
          range
        )
      : null;
    var allLeafTasks = tasks.filter(function (task) {
      return Number(task["Child Task Count"] || 0) === 0;
    });
    var visibleEntries = entries;
    var summary = projectId && selectedProject
      ? {
          projectCount: 1,
          totalProjectCount: summaries.length,
          taskCount: selectedProject.summary["Task Count"],
          completedTaskCount: selectedProject.summary["Completed Task Count"],
          completionPercent: selectedProject.summary["Progress Percent"],
          totalHours: selectedProject.summary["Total Hours"]
        }
      : {
          projectCount: summaries.length,
          totalProjectCount: summaries.length,
          taskCount: allLeafTasks.length,
          completedTaskCount: allLeafTasks.filter(function (task) {
            return TrustOpsUtils.normalizeText(task.Status) === "Complete";
          }).length,
          completionPercent: allLeafTasks.length ? Math.round((allLeafTasks.filter(function (task) {
            return TrustOpsUtils.normalizeText(task.Status) === "Complete";
          }).length / allLeafTasks.length) * 100) : 0,
          totalHours: Math.round(
            visibleEntries.reduce(function (sum, entry) {
              return sum + TrustOpsUtils.toNumber(entry.Hours);
            }, 0) * 100
          ) / 100
        };
    return {
      range: range,
      includeArchived: includeArchived,
      projectId: projectId,
      summary: summary,
      projects: filteredSummaries,
      selectedProject: selectedProject
    };
  }

  function getProjectDetail(context, projectId, filters) {
    var payload = filters || {};
    var range = resolveProjectRange(payload);
    var projectContext = visibleProjectsContext(TrustOpsUtils.toBoolean(payload.includeArchived));
    var project = projectContext.allById[String(projectId)];
    if (!project) throw new Error("Project not found.");
    var tasks = TrustOpsTaskService.listTasks(context, {});
    var entries = projectEntriesForRange(context, range, projectContext);
    return buildProjectDetailNode(project, projectContext, tasks, entries, range);
  }

  function archiveCategory(context, categoryId) {
    TrustOpsPermissionService.requireAllowed(
      TrustOpsPermissionService.canManageTimeCategories(context),
      "You do not have permission to delete time categories."
    );
    var existing = TrustOpsSheetService.findById(TrustOpsConfig.SHEETS.TIME_CATEGORIES, categoryId);
    if (!existing) throw new Error("Time category not found.");
    var saved = TrustOpsSheetService.updateById(TrustOpsConfig.SHEETS.TIME_CATEGORIES, categoryId, {
      "Active": false,
      "Archived": true,
      "Updated At": TrustOpsUtils.nowIso()
    });
    TrustOpsAuditService.log(context, "CATEGORY_ARCHIVED", "Time Category", categoryId, existing, saved, "");
    return TrustOpsUtils.sanitizeForClient(saved);
  }

  return {
    listProjects: listProjects,
    listCategories: listCategories,
    saveProject: saveProject,
    saveCategory: saveCategory,
    archiveProject: archiveProject,
    unarchiveProject: unarchiveProject,
    archiveCategory: archiveCategory,
    recomputeProjectStatuses: recomputeProjectStatuses,
    getProjectDashboard: getProjectDashboard,
    getProjectDetail: getProjectDetail
  };
})();
