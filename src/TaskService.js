var TrustOpsTaskService = (function () {
  function activeTasks() {
    return TrustOpsSheetService.readTable(TrustOpsConfig.SHEETS.TASKS).filter(function (task) {
      return !TrustOpsUtils.toBoolean(task.Archived) && task.Status !== "Archived";
    });
  }

  function resolveAssignees(assigneeUserIds, assigneeNames) {
    var users = TrustOpsUserService.listActiveUsers();
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

  function decorateTask(context, task) {
    var output = TrustOpsUtils.sanitizeForClient(task);
    output._permissions = {
      canAddTime: TrustOpsPermissionService.canAddTimeToTask(context, task, context.userId),
      canEdit: TrustOpsPermissionService.canEditTask(context, task),
      canComplete: TrustOpsPermissionService.canCompleteTask(context, task),
      canDelete: TrustOpsPermissionService.canDeleteTask(context, task)
    };
    return output;
  }

  function listTasks(context, filters) {
    TrustOpsPermissionService.requireAllowed(TrustOpsPermissionService.canViewBoard(context), "You cannot view tasks.");
    var payload = filters || {};
    var search = TrustOpsUtils.normalizeKey(payload.search);
    var tasks = activeTasks();
    tasks = tasks.filter(function (task) {
      if (payload.status && task.Status !== payload.status) return false;
      if (payload.projectId && task["Project ID"] !== payload.projectId) return false;
      if (payload.priority && task.Priority !== payload.priority) return false;
      if (payload.assigneeUserId && TrustOpsUtils.splitList(task["Assignee User IDs"]).indexOf(payload.assigneeUserId) === -1) return false;
      if (search) {
        var haystack = [
          task.Title,
          task.Notes,
          task.Status,
          task.Assignees,
          task["Project Name"],
          task.Priority,
          task.Tags
        ]
          .join(" ")
          .toLowerCase();
        if (haystack.indexOf(search) === -1) return false;
      }
      return true;
    });
    tasks.sort(function (a, b) {
      var dueA = a["Due Date"] || "9999-12-31";
      var dueB = b["Due Date"] || "9999-12-31";
      if (dueA !== dueB) return dueA < dueB ? -1 : 1;
      return String(a.Priority).localeCompare(String(b.Priority));
    });
    return tasks.map(function (task) {
      return decorateTask(context, task);
    });
  }

  function buildTaskRecord(context, payload, existing) {
    var now = TrustOpsUtils.nowIso();
    var projectId = payload["Project ID"] || payload.projectId || "";
    var project = projectId ? TrustOpsSheetService.findById(TrustOpsConfig.SHEETS.PROJECTS, projectId) : null;
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
    var projectIds = [];
    if (existing && TrustOpsUtils.normalizeText(existing["Project ID"])) {
      projectIds.push(existing["Project ID"]);
    }
    if (record && TrustOpsUtils.normalizeText(record["Project ID"])) {
      projectIds.push(record["Project ID"]);
    }
    if (projectIds.length) {
      TrustOpsProjectService.recomputeProjectStatuses(context, projectIds);
    }
  }

  function createTask(context, payload) {
    TrustOpsPermissionService.requireAllowed(
      TrustOpsPermissionService.canCreateTask(context),
      "You do not have permission to create tasks."
    );
    var record = buildTaskRecord(context, payload || {}, null);
    var saved = TrustOpsSheetService.appendRecord(TrustOpsConfig.SHEETS.TASKS, record);
    TrustOpsAuditService.log(context, "TASK_CREATED", "Task", saved["Task ID"], null, saved, "");
    refreshRelatedProjectStatuses(context, saved, null);
    return decorateTask(context, saved);
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
    refreshRelatedProjectStatuses(context, saved, existing);
    return decorateTask(context, saved);
  }

  function completeTask(context, taskId) {
    var existing = TrustOpsSheetService.findById(TrustOpsConfig.SHEETS.TASKS, taskId);
    if (!existing) throw new Error("Task not found.");
    TrustOpsPermissionService.requireAllowed(
      TrustOpsPermissionService.canCompleteTask(context, existing),
      "Only Owner/Admin/Manager can complete tasks."
    );
    var saved = TrustOpsSheetService.updateById(TrustOpsConfig.SHEETS.TASKS, taskId, {
      "Status": "Complete",
      "Completed By User ID": context.userId,
      "Completed At": TrustOpsUtils.nowIso(),
      "Updated At": TrustOpsUtils.nowIso()
    });
    TrustOpsAuditService.log(context, "TASK_COMPLETED", "Task", taskId, existing, saved, "");
    refreshRelatedProjectStatuses(context, saved, existing);
    return decorateTask(context, saved);
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
    refreshRelatedProjectStatuses(context, saved, existing);
    return decorateTask(context, saved);
  }

  function listIncompleteTasksForUser(context, userId) {
    var targetUserId = userId || context.userId;
    return activeTasks()
      .filter(function (task) {
        if (task.Status === "Complete" || task.Status === "Archived") return false;
        if (TrustOpsPermissionService.isPrivileged(context)) return true;
        return TrustOpsUtils.splitList(task["Assignee User IDs"]).indexOf(String(targetUserId)) !== -1;
      })
      .map(function (task) {
        return decorateTask(context, task);
      });
  }

  return {
    listTasks: listTasks,
    createTask: createTask,
    updateTask: updateTask,
    completeTask: completeTask,
    archiveTask: archiveTask,
    listIncompleteTasksForUser: listIncompleteTasksForUser
  };
})();
