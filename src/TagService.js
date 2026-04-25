var TrustOpsTagService = (function () {
  function listTags(includeArchived) {
    return TrustOpsUtils.recordsForClient(
      TrustOpsSheetService.readTable(TrustOpsConfig.SHEETS.TAGS).filter(function (tag) {
        return includeArchived || !TrustOpsUtils.toBoolean(tag.Archived);
      })
    );
  }

  function findTagByName(tagName) {
    var normalized = TrustOpsUtils.normalizeKey(tagName);
    return TrustOpsSheetService.readTable(TrustOpsConfig.SHEETS.TAGS).filter(function (tag) {
      return TrustOpsUtils.normalizeKey(tag.Tag) === normalized && !TrustOpsUtils.toBoolean(tag.Archived);
    })[0] || null;
  }

  function saveTag(context, payload) {
    TrustOpsPermissionService.requireAllowed(
      TrustOpsPermissionService.canManageTags(context),
      "You do not have permission to manage tags."
    );
    var tagId = payload["Tag ID"] || payload.tagId || "";
    var existing = tagId ? TrustOpsSheetService.findById(TrustOpsConfig.SHEETS.TAGS, tagId) : null;
    var tagName = TrustOpsUtils.requireValue(payload.Tag || payload.tag, "Tag");
    var duplicate = findTagByName(tagName);
    if (duplicate && duplicate["Tag ID"] !== tagId) {
      throw new Error("That tag already exists.");
    }
    var now = TrustOpsUtils.nowIso();
    var record = {
      "Tag": tagName,
      "Color": payload.Color || payload.color || "",
      "Description": payload.Description || payload.description || "",
      "Active": payload.Active === undefined ? true : TrustOpsUtils.toBoolean(payload.Active),
      "Created By User ID": existing ? existing["Created By User ID"] : context.userId,
      "Created At": existing ? existing["Created At"] : now,
      "Updated At": now,
      "Archived": existing ? TrustOpsUtils.toBoolean(existing.Archived) : false
    };
    var saved = existing
      ? TrustOpsSheetService.updateById(TrustOpsConfig.SHEETS.TAGS, tagId, record)
      : TrustOpsSheetService.appendRecord(TrustOpsConfig.SHEETS.TAGS, record);
    TrustOpsAuditService.log(context, existing ? "TAG_UPDATED" : "TAG_CREATED", "Tag", saved["Tag ID"], existing, saved, "");
    return TrustOpsUtils.sanitizeForClient(saved);
  }

  function archiveTag(context, tagId) {
    TrustOpsPermissionService.requireAllowed(
      TrustOpsPermissionService.canManageTags(context),
      "You do not have permission to delete tags."
    );
    var existing = TrustOpsSheetService.findById(TrustOpsConfig.SHEETS.TAGS, tagId);
    if (!existing) throw new Error("Tag not found.");
    var saved = TrustOpsSheetService.updateById(TrustOpsConfig.SHEETS.TAGS, tagId, {
      "Active": false,
      "Archived": true,
      "Updated At": TrustOpsUtils.nowIso()
    });
    TrustOpsAuditService.log(context, "TAG_ARCHIVED", "Tag", tagId, existing, saved, "");
    return TrustOpsUtils.sanitizeForClient(saved);
  }

  function seedFromTaskTags(context) {
    var created = 0;
    var seen = {};
    TrustOpsSheetService.readTable(TrustOpsConfig.SHEETS.TASKS).forEach(function (task) {
      TrustOpsUtils.splitList(task.Tags).forEach(function (tagName) {
        var key = TrustOpsUtils.normalizeKey(tagName);
        if (!key || seen[key] || findTagByName(tagName)) return;
        seen[key] = true;
        saveTag(context, { tag: tagName });
        created += 1;
      });
    });
    return { created: created };
  }

  return {
    listTags: listTags,
    findTagByName: findTagByName,
    saveTag: saveTag,
    archiveTag: archiveTag,
    seedFromTaskTags: seedFromTaskTags
  };
})();
