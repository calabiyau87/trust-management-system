var TrustOpsBoardViewService = (function () {
  function canSeeView(context, view) {
    if (TrustOpsUtils.toBoolean(view.Archived)) return false;
    if (view.Visibility === TrustOpsConfig.VIEW_VISIBILITY.SHARED) return true;
    return String(view["Owner User ID"]) === String(context.userId);
  }

  function listBoardViews(context) {
    return TrustOpsUtils.recordsForClient(
      TrustOpsSheetService.readTable(TrustOpsConfig.SHEETS.BOARD_VIEWS).filter(function (view) {
        return canSeeView(context, view);
      })
    );
  }

  function saveBoardView(context, payload) {
    var visibility = payload.Visibility || payload.visibility || TrustOpsConfig.VIEW_VISIBILITY.PRIVATE;
    if (visibility === TrustOpsConfig.VIEW_VISIBILITY.SHARED) {
      TrustOpsPermissionService.requireAllowed(
        TrustOpsPermissionService.canManageBoardViews(context),
        "You do not have permission to create shared board views."
      );
    }
    var viewId = payload["Board View ID"] || payload.viewId || "";
    var existing = viewId ? TrustOpsSheetService.findById(TrustOpsConfig.SHEETS.BOARD_VIEWS, viewId) : null;
    if (existing && String(existing["Owner User ID"]) !== String(context.userId) && !TrustOpsPermissionService.canManageBoardViews(context)) {
      throw new Error("You do not have permission to edit this board view.");
    }
    var now = TrustOpsUtils.nowIso();
    var record = {
      "View Name": TrustOpsUtils.requireValue(payload["View Name"] || payload.viewName, "View name"),
      "Visibility": visibility,
      "Owner User ID": existing ? existing["Owner User ID"] : context.userId,
      "Filters JSON": TrustOpsUtils.safeJson(payload.filters || {}),
      "Grouping": payload.Grouping || payload.grouping || "",
      "Sort JSON": TrustOpsUtils.safeJson(payload.sort || {}),
      "Columns JSON": TrustOpsUtils.safeJson(payload.columns || {}),
      "Created At": existing ? existing["Created At"] : now,
      "Updated At": now,
      "Archived": existing ? TrustOpsUtils.toBoolean(existing.Archived) : false
    };
    var saved = existing
      ? TrustOpsSheetService.updateById(TrustOpsConfig.SHEETS.BOARD_VIEWS, viewId, record)
      : TrustOpsSheetService.appendRecord(TrustOpsConfig.SHEETS.BOARD_VIEWS, record);
    TrustOpsAuditService.log(context, existing ? "BOARD_VIEW_UPDATED" : "BOARD_VIEW_CREATED", "Board View", saved["Board View ID"], existing, saved, "");
    return TrustOpsUtils.sanitizeForClient(saved);
  }

  function archiveBoardView(context, viewId) {
    var existing = TrustOpsSheetService.findById(TrustOpsConfig.SHEETS.BOARD_VIEWS, viewId);
    if (!existing) throw new Error("Board view not found.");
    if (String(existing["Owner User ID"]) !== String(context.userId) && !TrustOpsPermissionService.canManageBoardViews(context)) {
      throw new Error("You do not have permission to delete this board view.");
    }
    var saved = TrustOpsSheetService.updateById(TrustOpsConfig.SHEETS.BOARD_VIEWS, viewId, {
      "Archived": true,
      "Updated At": TrustOpsUtils.nowIso()
    });
    TrustOpsAuditService.log(context, "BOARD_VIEW_ARCHIVED", "Board View", viewId, existing, saved, "");
    return TrustOpsUtils.sanitizeForClient(saved);
  }

  return {
    listBoardViews: listBoardViews,
    saveBoardView: saveBoardView,
    archiveBoardView: archiveBoardView
  };
})();
