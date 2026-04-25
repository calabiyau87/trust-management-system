var TrustOpsProjectService = (function () {
  function listProjects(includeArchived) {
    return TrustOpsUtils.recordsForClient(
      TrustOpsSheetService.readTable(TrustOpsConfig.SHEETS.PROJECTS)
        .filter(function (project) {
          return includeArchived || !TrustOpsUtils.toBoolean(project.Archived);
        })
        .sort(function (a, b) {
          return String(a["Project Name"]).localeCompare(String(b["Project Name"]));
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

  function normalizeProjectStatus(status, fallback) {
    var allowed = TrustOpsConfig.PROJECT_STATUSES;
    var text = TrustOpsUtils.normalizeText(status);
    if (allowed.indexOf(text) !== -1) return text;
    return fallback || "Not Started";
  }

  function tasksForProject(projectId) {
    return TrustOpsSheetService.readTable(TrustOpsConfig.SHEETS.TASKS).filter(function (task) {
      if (TrustOpsUtils.toBoolean(task.Archived) || task.Status === "Archived") return false;
      return String(task["Project ID"] || "") === String(projectId || "");
    });
  }

  function derivedProjectStatus(project) {
    if (!project) return "Not Started";
    if (TrustOpsUtils.toBoolean(project.Archived)) return "Archived";
    if (!TrustOpsUtils.toBoolean(project.Active)) return "Archived";
    if (TrustOpsUtils.normalizeText(project.Status) === "Holding") return "Holding";
    var projectTasks = tasksForProject(project["Project ID"]);
    if (!projectTasks.length) return "Not Started";
    var activeTasks = projectTasks.filter(function (task) {
      return task.Status !== "Archived";
    });
    if (!activeTasks.length) return "Not Started";
    if (activeTasks.every(function (task) {
      return task.Status === "Complete";
    })) {
      return "Completed";
    }
    return "In Progress";
  }

  function recomputeProjectStatuses(context, projectIds) {
    var projects = TrustOpsSheetService.readTable(TrustOpsConfig.SHEETS.PROJECTS);
    var normalizedIds = TrustOpsUtils.splitList(projectIds).map(String);
    var touched = [];
    projects.forEach(function (project) {
      if (normalizedIds.length && normalizedIds.indexOf(String(project["Project ID"])) === -1) return;
      var nextStatus = derivedProjectStatus(project);
      if (String(project.Status) === String(nextStatus)) return;
      var saved = TrustOpsSheetService.updateById(TrustOpsConfig.SHEETS.PROJECTS, project["Project ID"], {
        "Status": nextStatus,
        "Updated At": TrustOpsUtils.nowIso()
      });
      TrustOpsAuditService.log(context || { userId: "" }, "PROJECT_STATUS_RECALCULATED", "Project", project["Project ID"], project, saved, nextStatus);
      touched.push(saved);
    });
    return touched;
  }

  function saveProject(context, payload) {
    TrustOpsPermissionService.requireAllowed(
      TrustOpsPermissionService.canManageProjects(context),
      "Only Owner/Admin/Manager can manage projects."
    );
    var projectId = payload["Project ID"] || payload.projectId || "";
    var existing = projectId ? TrustOpsSheetService.findById(TrustOpsConfig.SHEETS.PROJECTS, projectId) : null;
    var now = TrustOpsUtils.nowIso();
    var requestedStatus = payload.Status || payload.status || "";
    var record = {
      "Project Name": TrustOpsUtils.requireValue(payload["Project Name"] || payload.projectName, "Project name"),
      "Description": payload.Description || payload.description || "",
      "Status": normalizeProjectStatus(
        TrustOpsUtils.normalizeText(requestedStatus) === "Holding" ? "Holding" : "",
        existing ? derivedProjectStatus(existing) : "Not Started"
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
    recomputeProjectStatuses(context, saved["Project ID"]);
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
    recomputeProjectStatuses(context, projectId);
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

  function projectEntriesForRange(context, range) {
    var canViewAll = TrustOpsPermissionService.canViewTimeEntries(context, "__all__");
    return TrustOpsSheetService.readTable(TrustOpsConfig.SHEETS.TIME_ENTRIES).filter(function (entry) {
      if (TrustOpsUtils.toBoolean(entry.Deleted)) return false;
      if (!canViewAll && String(entry["User ID"]) !== String(context.userId)) return false;
      if (range.payPeriod) {
        return String(entry["Pay Period ID"]) === String(range.payPeriod["Pay Period ID"]);
      }
      return TrustOpsUtils.isBetweenInclusive(entry.Date, range.startDate, range.endDate);
    });
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

  function buildProjectSummary(project, tasks, entries) {
    var projectId = project["Project ID"];
    var projectTasks = (tasks || []).filter(function (task) {
      return String(task["Project ID"]) === String(projectId);
    });
    var activeTasks = projectTasks.filter(function (task) {
      return task.Status !== "Archived";
    });
    var completedTasks = activeTasks.filter(function (task) {
      return task.Status === "Complete";
    });
    var projectEntries = (entries || []).filter(function (entry) {
      return String(entry["Project ID"] || "") === String(projectId);
    });
    var assigneeIds = {};
    projectTasks.forEach(function (task) {
      TrustOpsUtils.splitList(task["Assignee User IDs"]).forEach(function (userId) {
        assigneeIds[String(userId)] = true;
      });
    });
    return {
      "Project ID": projectId,
      "Project Name": project["Project Name"],
      "Status": project.Status || derivedProjectStatus(project),
      "Active": project.Active,
      "Archived": project.Archived,
      "Task Count": activeTasks.length,
      "Completed Task Count": completedTasks.length,
      "Progress Percent": activeTasks.length ? Math.round((completedTasks.length / activeTasks.length) * 100) : 0,
      "Total Hours": Math.round(
        projectEntries.reduce(function (sum, entry) {
          return sum + TrustOpsUtils.toNumber(entry.Hours);
        }, 0) * 100
      ) / 100,
      "User Count": Object.keys(assigneeIds).length,
      "Open Task Count": Math.max(0, activeTasks.length - completedTasks.length)
    };
  }

  function projectDetail(project, tasks, entries, range) {
    var projectId = project["Project ID"];
    var projectTasks = (tasks || []).filter(function (task) {
      return String(task["Project ID"]) === String(projectId);
    });
    var projectEntries = (entries || []).filter(function (entry) {
      return String(entry["Project ID"] || "") === String(projectId);
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
    projectTasks.forEach(function (task) {
      TrustOpsUtils.splitList(task["Assignee User IDs"]).forEach(function (userId) {
        projectAssignees[String(userId)] = true;
      });
    });
    return {
      project: TrustOpsUtils.sanitizeForClient(project),
      range: range,
      tasks: TrustOpsUtils.recordsForClient(projectTasks),
      entries: TrustOpsUtils.recordsForClient(projectEntries),
      summary: buildProjectSummary(project, tasks, entries),
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
    var projects = TrustOpsSheetService.readTable(TrustOpsConfig.SHEETS.PROJECTS).filter(function (project) {
      return includeArchived || !TrustOpsUtils.toBoolean(project.Archived);
    });
    var tasks = TrustOpsTaskService.listTasks(context, {});
    var entries = projectEntriesForRange(context, range);
    var summaries = projects.map(function (project) {
      return buildProjectSummary(project, tasks, entries);
    });
    var filteredSummaries = projectId
      ? summaries.filter(function (project) {
          return String(project["Project ID"]) === String(projectId);
        })
      : summaries;
    var selectedProject = projectId
      ? projectDetail(
          projects.filter(function (project) {
            return String(project["Project ID"]) === String(projectId);
          })[0] || null,
          tasks,
          entries,
          range
        )
      : null;
    var scopedSummaries = projectId ? filteredSummaries : summaries;
    var scopedEntries = projectId
      ? entries.filter(function (entry) {
          return String(entry["Project ID"] || "") === String(projectId);
        })
      : entries;
    var scopedTasks = scopedSummaries.reduce(function (sum, project) {
      return sum + project["Task Count"];
    }, 0);
    var scopedCompleted = scopedSummaries.reduce(function (sum, project) {
      return sum + project["Completed Task Count"];
    }, 0);
    return {
      range: range,
      includeArchived: includeArchived,
      projectId: projectId,
      summary: {
        projectCount: scopedSummaries.length,
        totalProjectCount: summaries.length,
        taskCount: scopedTasks,
        completedTaskCount: scopedCompleted,
        completionPercent: scopedTasks ? Math.round((scopedCompleted / scopedTasks) * 100) : 0,
        totalHours: Math.round(
          scopedEntries.reduce(function (sum, entry) {
            return sum + TrustOpsUtils.toNumber(entry.Hours);
          }, 0) * 100
        ) / 100
      },
      projects: filteredSummaries,
      selectedProject: selectedProject
    };
  }

  function getProjectDetail(context, projectId, filters) {
    var payload = filters || {};
    var range = resolveProjectRange(payload);
    var project = TrustOpsSheetService.findById(TrustOpsConfig.SHEETS.PROJECTS, projectId);
    if (!project) throw new Error("Project not found.");
    var tasks = TrustOpsTaskService.listTasks(context, {});
    var entries = projectEntriesForRange(context, range);
    return projectDetail(project, tasks, entries, range);
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
