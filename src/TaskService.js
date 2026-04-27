var TrustOpsTaskService = (function () {
  function isArchivedRecord(record) {
    return TrustOpsUtils.toBoolean(record && record.Archived) || TrustOpsUtils.normalizeText(record && record.Status) === "Archived";
  }

  function readProjects() {
    return TrustOpsSheetService.readTable(TrustOpsConfig.SHEETS.PROJECTS);
  }

  function readTasks() {
    return TrustOpsSheetService.readTable(TrustOpsConfig.SHEETS.TASKS);
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
    return {
      projects: projects,
      allById: allById,
      activeProjects: activeProjects,
      activeById: activeById,
      visibleProjects: Object.keys(visibleById).map(function (key) {
        return visibleById[key];
      }),
      visibleById: visibleById
    };
  }

  function buildVisibleTaskContext(includeArchivedProjects) {
    var projectContext = visibleProjectsContext(includeArchivedProjects);
    var tasks = readTasks().filter(function (task) {
      return !isArchivedRecord(task);
    });
    var allById = mapById(tasks, "Task ID");
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
    return {
      projects: projectContext.projects,
      projectsById: projectContext.allById,
      visibleProjects: projectContext.visibleProjects,
      visibleProjectsById: projectContext.visibleById,
      tasks: tasks,
      tasksById: allById,
      visibleTasks: visibleTasks,
      visibleTasksById: visibleById,
      childrenByParentId: childrenByParentId
    };
  }

  function resolveAssignees(assigneeUserIds, assigneeNames, usersOverride) {
    var users = usersOverride || TrustOpsUserService.listActiveUsers();
    var ids = TrustOpsUtils.splitList(assigneeUserIds);
    var names = TrustOpsUtils.splitList(assigneeNames);
    names.forEach(function (name) {
      var match = users.filter(function (user) {
        return (
          TrustOpsUtils.normalizeKey(user["First Name"]) === TrustOpsUtils.normalizeKey(name) ||
          TrustOpsUtils.normalizeKey(user["Full Name"]) === TrustOpsUtils.normalizeKey(name) ||
          TrustOpsUtils.normalizeEmail(user.Email) === TrustOpsUtils.normalizeEmail(name)
        );
      })[0];
      if (match && ids.indexOf(match["User ID"]) === -1) ids.push(match["User ID"]);
    });
    var resolvedUsers = users.filter(function (user) {
      return ids.indexOf(user["User ID"]) !== -1;
    });
    return {
      ids: resolvedUsers.map(function (user) {
        return user["User ID"];
      }),
      names: resolvedUsers.map(function (user) {
        return user["Full Name"];
      })
    };
  }

  function taskHasChildren(taskId) {
    return readTasks().some(function (task) {
      return TrustOpsUtils.normalizeOptionalLink(task["Parent Task ID"]) === String(taskId || "");
    });
  }

  function projectHasChildren(projectId) {
    return readProjects().some(function (project) {
      return TrustOpsUtils.normalizeOptionalLink(project["Parent Project ID"]) === String(projectId || "");
    });
  }

  function projectDisplayNameForTask(project, projectContext) {
    if (!project) return "";
    var parentId = TrustOpsUtils.normalizeOptionalLink(project["Parent Project ID"]);
    var parent = parentId
      ? projectContext.allById[String(parentId)] || projectContext.visibleById[String(parentId)] || null
      : null;
    return parent ? parent["Project Name"] + " / " + project["Project Name"] : project["Project Name"];
  }

  function decorateTask(context, task, hierarchy) {
    var output = TrustOpsUtils.sanitizeForClient(task);
    var children = (hierarchy.childrenByParentId[task["Task ID"]] || []).slice();
    var childCount = children.length;
    var completedChildCount = children.filter(function (child) {
      return TrustOpsUtils.normalizeText(child.Status) === "Complete";
    }).length;
    var projectId = TrustOpsUtils.normalizeText(task["Project ID"]);
    var project = projectId
      ? hierarchy.visibleProjectsById[String(projectId)] || hierarchy.projectsById[String(projectId)] || null
      : null;
    var parentTask = TrustOpsUtils.normalizeOptionalLink(task["Parent Task ID"])
      ? hierarchy.visibleTasksById[String(task["Parent Task ID"])] || hierarchy.tasksById[String(task["Parent Task ID"])] || null
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
    output.Status = effectiveStatus;
    output["Parent Task ID"] = TrustOpsUtils.normalizeOptionalLink(task["Parent Task ID"]);
    output["Parent Task Title"] = parentTask ? parentTask.Title : task["Parent Task Title"] || "";
    output["Project Display Name"] = projectDisplayNameForTask(
      project,
      hierarchy.projectsById ? { allById: hierarchy.projectsById, visibleById: hierarchy.visibleProjectsById } : { allById: {}, visibleById: {} }
    ) || task["Project Name"] || "";
    output["Child Task Count"] = childCount;
    output["Completed Child Task Count"] = completedChildCount;
    output["Has Children"] = childCount > 0;
    output["Hierarchy Level"] = TrustOpsUtils.normalizeOptionalLink(task["Parent Task ID"]) ? 1 : 0;
    output["Progress Percent"] = progressPercent;
    output["Display Name"] = TrustOpsUtils.normalizeOptionalLink(task["Parent Task ID"]) && parentTask ? parentTask.Title + " / " + task.Title : task.Title;
    output._permissions = {
      canAddTime: TrustOpsPermissionService.canAddTimeToTask(context, task, context.userId),
      canEdit: TrustOpsPermissionService.canEditTask(context, task),
      canComplete: TrustOpsPermissionService.canCompleteTask(context, task),
      canDelete: TrustOpsPermissionService.canDeleteTask(context, task)
    };
    return output;
  }

  function validateTaskHierarchy(context, payload, existing) {
    var hasParentField = Object.prototype.hasOwnProperty.call(payload || {}, "Parent Task ID") ||
      Object.prototype.hasOwnProperty.call(payload || {}, "parentTaskId");
    var existingParentTaskId = existing ? TrustOpsUtils.normalizeOptionalLink(existing["Parent Task ID"]) : "";
    var parentTaskId = TrustOpsUtils.normalizeOptionalLink(payload["Parent Task ID"] || payload.parentTaskId);
    if (existing && !hasParentField) {
      parentTaskId = existingParentTaskId;
    }
    var parentTask = parentTaskId ? TrustOpsSheetService.findById(TrustOpsConfig.SHEETS.TASKS, parentTaskId) : null;
    if (existing && String(parentTaskId) !== String(existingParentTaskId)) {
      TrustOpsPermissionService.requireAllowed(
        TrustOpsPermissionService.isPrivileged(context),
        "Only Owner/Admin/Manager can create, reparent, or unparent subtasks."
      );
    }
    if (parentTaskId) {
      if (!parentTask) throw new Error("Parent task not found.");
      if (isArchivedRecord(parentTask)) throw new Error("Parent task is archived.");
      if (existing && String(existing["Task ID"]) === String(parentTaskId)) {
        throw new Error("A task cannot be its own parent.");
      }
      if (existing && taskHasChildren(existing["Task ID"])) {
        throw new Error("Tasks with subtasks cannot become subtasks themselves.");
      }
      if (TrustOpsUtils.normalizeOptionalLink(parentTask["Parent Task ID"])) {
        throw new Error("Subtasks cannot be nested more than one level deep.");
      }
    }
    return parentTask;
  }

  function buildTaskRecord(context, payload, existing) {
    var now = TrustOpsUtils.nowIso();
    var hierarchy = buildVisibleTaskContext(false);
    var parentTask = validateTaskHierarchy(context, payload || {}, existing || null);
    var parentTaskId = parentTask ? parentTask["Task ID"] : "";
    var projectId = parentTask ? parentTask["Project ID"] || "" : (payload["Project ID"] || payload.projectId || "");
    var project = projectId ? hierarchy.projectsById[String(projectId)] || null : null;
    if (parentTask) {
      project = parentTask["Project ID"] ? hierarchy.projectsById[String(parentTask["Project ID"])] || null : null;
    }
    var assignees = resolveAssignees(
      payload["Assignee User IDs"] || payload.assigneeUserIds || [],
      payload.Assignees || payload.assignees || []
    );
    var tags = TrustOpsUtils.splitList(payload.Tags || payload.tags || "");
    var normalizedTags = tags.map(function (tagName) {
      var existingTag = TrustOpsTagService.findTagByName(tagName);
      if (!existingTag && TrustOpsPermissionService.canManageTags(context)) {
        existingTag = TrustOpsTagService.saveTag(context, { tag: tagName });
      }
      return existingTag ? existingTag.Tag : tagName;
    });
    return {
      "Title": TrustOpsUtils.requireValue(payload.Title || payload.title, "Task title"),
      "Notes": payload.Notes || payload.notes || "",
      "Status": payload.Status || payload.status || "In Progress",
      "Due Date": TrustOpsUtils.formatDate(payload["Due Date"] || payload.dueDate),
      "Assignees": assignees.names.join(", "),
      "Assignee User IDs": assignees.ids.join(", "),
      "Project ID": projectId,
      "Project Name": project ? project["Project Name"] : payload["Project Name"] || payload.projectName || "",
      "Parent Task ID": parentTaskId,
      "Parent Task Title": parentTask ? parentTask.Title : "",
      "Priority": payload.Priority || payload.priority || "Medium",
      "Tags": TrustOpsUtils.joinList(normalizedTags),
      "Created By User ID": existing ? existing["Created By User ID"] : context.userId,
      "Created At": existing ? existing["Created At"] : now,
      "Updated At": now,
      "Completed By User ID": existing ? existing["Completed By User ID"] : "",
      "Completed At": existing ? existing["Completed At"] : "",
      "Source": existing ? existing.Source || "App" : "App",
      "External Google Task Mirror IDs": existing ? existing["External Google Task Mirror IDs"] : "",
      "Chat Message Link": existing ? existing["Chat Message Link"] : "",
      "Archived": existing ? TrustOpsUtils.toBoolean(existing.Archived) : false
    };
  }

  function refreshRelatedProjectStatuses(context, record, existing) {
    var projectIds = {};
    if (existing && TrustOpsUtils.normalizeOptionalLink(existing["Project ID"])) {
      projectIds[String(existing["Project ID"])] = true;
    }
    if (record && TrustOpsUtils.normalizeOptionalLink(record["Project ID"])) {
      projectIds[String(record["Project ID"])] = true;
    }
    Object.keys(projectIds).forEach(function (projectId) {
      var project = TrustOpsSheetService.findById(TrustOpsConfig.SHEETS.PROJECTS, projectId);
      var parentProjectId = project ? TrustOpsUtils.normalizeOptionalLink(project["Parent Project ID"]) : "";
      if (parentProjectId) {
        projectIds[String(parentProjectId)] = true;
      }
    });
    var list = Object.keys(projectIds);
    if (list.length) {
      TrustOpsProjectService.recomputeProjectStatuses(context, list.join(","));
    }
  }

  function recomputeTaskStatuses(context, taskIds) {
    var hierarchy = buildVisibleTaskContext(false);
    var touched = [];
    TrustOpsUtils.splitList(taskIds).map(String).forEach(function (taskId) {
      var task = hierarchy.visibleTasksById[taskId] || TrustOpsSheetService.findById(TrustOpsConfig.SHEETS.TASKS, taskId);
      if (!task || isArchivedRecord(task)) return;
      var children = hierarchy.childrenByParentId[taskId] || [];
      if (!children.length) return;
      var completed = children.filter(function (child) {
        return TrustOpsUtils.normalizeText(child.Status) === "Complete";
      }).length;
      var nextStatus = completed === children.length ? "Complete" : "In Progress";
      var patch = {
        "Status": nextStatus,
        "Updated At": TrustOpsUtils.nowIso()
      };
      if (nextStatus === "Complete") {
        patch["Completed By User ID"] = task["Completed By User ID"] || (context ? context.userId : "");
        patch["Completed At"] = task["Completed At"] || TrustOpsUtils.nowIso();
      } else {
        patch["Completed By User ID"] = "";
        patch["Completed At"] = "";
      }
      if (String(task.Status) === String(nextStatus) &&
          String(task["Completed By User ID"] || "") === String(patch["Completed By User ID"] || "") &&
          String(task["Completed At"] || "") === String(patch["Completed At"] || "")) {
        return;
      }
      var saved = TrustOpsSheetService.updateById(TrustOpsConfig.SHEETS.TASKS, taskId, patch);
      TrustOpsAuditService.log(context || { userId: "" }, "TASK_STATUS_RECALCULATED", "Task", taskId, task, saved, "");
      touched.push(saved);
    });
    return touched;
  }

  function refreshRelatedTaskStatuses(context, record, existing) {
    var taskIds = {};
    if (existing && TrustOpsUtils.normalizeText(existing["Task ID"])) {
      taskIds[String(existing["Task ID"])] = true;
    }
    if (record && TrustOpsUtils.normalizeText(record["Task ID"])) {
      taskIds[String(record["Task ID"])] = true;
    }
    if (existing && TrustOpsUtils.normalizeOptionalLink(existing["Parent Task ID"])) {
      taskIds[String(existing["Parent Task ID"])] = true;
    }
    if (record && TrustOpsUtils.normalizeOptionalLink(record["Parent Task ID"])) {
      taskIds[String(record["Parent Task ID"])] = true;
    }
    recomputeTaskStatuses(context, Object.keys(taskIds).join(","));
  }

  function createTask(context, payload) {
    TrustOpsPermissionService.requireAllowed(
      TrustOpsPermissionService.canCreateTask(context),
      "You do not have permission to create tasks."
    );
    var record = buildTaskRecord(context, payload || {}, null);
    var saved = TrustOpsSheetService.appendRecord(TrustOpsConfig.SHEETS.TASKS, record);
    TrustOpsAuditService.log(context, "TASK_CREATED", "Task", saved["Task ID"], null, saved, "");
    refreshRelatedTaskStatuses(context, saved, null);
    refreshRelatedProjectStatuses(context, saved, null);
    return decorateTask(context, saved, buildVisibleTaskContext(false));
  }

  function updateTask(context, payload) {
    var taskId = payload["Task ID"] || payload.taskId;
    var existing = TrustOpsSheetService.findById(TrustOpsConfig.SHEETS.TASKS, taskId);
    if (!existing) throw new Error("Task not found.");
    TrustOpsPermissionService.requireAllowed(
      TrustOpsPermissionService.canEditTask(context, existing),
      "Only Owner/Admin/Manager can edit tasks."
    );
    var record = buildTaskRecord(context, payload || {}, existing);
    var saved = TrustOpsSheetService.updateById(TrustOpsConfig.SHEETS.TASKS, taskId, record);
    TrustOpsAuditService.log(context, "TASK_UPDATED", "Task", taskId, existing, saved, "");
    refreshRelatedTaskStatuses(context, saved, existing);
    refreshRelatedProjectStatuses(context, saved, existing);
    return decorateTask(context, saved, buildVisibleTaskContext(false));
  }

  function completeTask(context, taskId) {
    var existing = TrustOpsSheetService.findById(TrustOpsConfig.SHEETS.TASKS, taskId);
    if (!existing) throw new Error("Task not found.");
    TrustOpsPermissionService.requireAllowed(
      TrustOpsPermissionService.canCompleteTask(context, existing),
      "Only Owner/Admin/Manager can complete tasks."
    );
    var hierarchy = buildVisibleTaskContext(false);
    var decorated = decorateTask(context, existing, hierarchy);
    if (Number(decorated["Child Task Count"] || 0) > 0 &&
        Number(decorated["Completed Child Task Count"] || 0) !== Number(decorated["Child Task Count"] || 0)) {
      throw new Error("Complete all subtasks before marking this parent task complete.");
    }
    var saved = TrustOpsSheetService.updateById(TrustOpsConfig.SHEETS.TASKS, taskId, {
      "Status": "Complete",
      "Completed By User ID": context.userId,
      "Completed At": TrustOpsUtils.nowIso(),
      "Updated At": TrustOpsUtils.nowIso()
    });
    TrustOpsAuditService.log(context, "TASK_COMPLETED", "Task", taskId, existing, saved, "");
    refreshRelatedTaskStatuses(context, saved, existing);
    refreshRelatedProjectStatuses(context, saved, existing);
    return decorateTask(context, saved, buildVisibleTaskContext(false));
  }

  function archiveTask(context, taskId) {
    var existing = TrustOpsSheetService.findById(TrustOpsConfig.SHEETS.TASKS, taskId);
    if (!existing) throw new Error("Task not found.");
    TrustOpsPermissionService.requireAllowed(
      TrustOpsPermissionService.canDeleteTask(context, existing),
      "You do not have permission to delete this task."
    );
    var saved = TrustOpsSheetService.updateById(TrustOpsConfig.SHEETS.TASKS, taskId, {
      "Archived": true,
      "Status": "Archived",
      "Updated At": TrustOpsUtils.nowIso()
    });
    TrustOpsAuditService.log(context, "TASK_ARCHIVED", "Task", taskId, existing, saved, "");
    refreshRelatedTaskStatuses(context, saved, existing);
    refreshRelatedProjectStatuses(context, saved, existing);
    return decorateTask(context, saved, buildVisibleTaskContext(false));
  }

  function listTasks(context, filters) {
    TrustOpsPermissionService.requireAllowed(TrustOpsPermissionService.canViewBoard(context), "You cannot view tasks.");
    var payload = filters || {};
    var search = TrustOpsUtils.normalizeKey(payload.search);
    var hierarchy = buildVisibleTaskContext(false);
    var decorated = hierarchy.visibleTasks.map(function (task) {
      return decorateTask(context, task, hierarchy);
    });
    var filtered = decorated.filter(function (task) {
      if (payload.status && task.Status !== payload.status) return false;
      if (payload.projectId && !taskMatchesProjectFilter(task, payload.projectId, hierarchy)) return false;
      if (payload.priority && task.Priority !== payload.priority) return false;
      if (payload.assigneeUserId && TrustOpsUtils.splitList(task["Assignee User IDs"]).indexOf(payload.assigneeUserId) === -1) return false;
      if (search) {
        var haystack = [
          task.Title,
          task["Display Name"],
          task["Parent Task Title"],
          task.Notes,
          task.Status,
          task.Assignees,
          task["Project Name"],
          task["Project Display Name"],
          task.Priority,
          task.Tags
        ]
          .join(" ")
          .toLowerCase();
        if (haystack.indexOf(search) === -1) return false;
      }
      return true;
    });
    filtered.sort(function (a, b) {
      var dueA = a["Due Date"] || "9999-12-31";
      var dueB = b["Due Date"] || "9999-12-31";
      if (dueA !== dueB) return dueA < dueB ? -1 : 1;
      if (String(a["Parent Task ID"] || "") !== String(b["Parent Task ID"] || "")) {
        return String(a["Parent Task ID"] || "").localeCompare(String(b["Parent Task ID"] || ""));
      }
      return String(a["Display Name"] || a.Title).localeCompare(String(b["Display Name"] || b.Title));
    });
    return filtered;
  }

  function taskMatchesProjectFilter(task, projectId, hierarchy) {
    var selectedProjectId = String(projectId || "");
    if (!selectedProjectId) return true;
    if (String(task["Project ID"] || "") === selectedProjectId) return true;
    var project = hierarchy.projectsById[String(task["Project ID"] || "")];
    if (project && TrustOpsUtils.normalizeOptionalLink(project["Parent Project ID"]) === selectedProjectId) return true;
    return false;
  }

  function listIncompleteTasksForUser(context, userId) {
    var targetUserId = userId || context.userId;
    var hierarchy = buildVisibleTaskContext(false);
    return hierarchy.visibleTasks
      .map(function (task) {
        return decorateTask(context, task, hierarchy);
      })
      .filter(function (task) {
        if (task.Status === "Complete" || task.Status === "Archived") return false;
        if (TrustOpsPermissionService.isPrivileged(context)) return true;
        return TrustOpsUtils.splitList(task["Assignee User IDs"]).indexOf(String(targetUserId)) !== -1;
      });
  }

  return {
    listTasks: listTasks,
    createTask: createTask,
    updateTask: updateTask,
    completeTask: completeTask,
    archiveTask: archiveTask,
    listIncompleteTasksForUser: listIncompleteTasksForUser,
    resolveAssignees: resolveAssignees
  };
})();
