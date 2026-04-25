var TrustOpsAuditService = (function () {
  function log(context, action, entityType, entityId, beforeValue, afterValue, notes) {
    var actor = context || { userId: "", email: "" };
    return TrustOpsSheetService.appendRecord(TrustOpsConfig.SHEETS.AUDIT_LOG, {
      "Timestamp": TrustOpsUtils.nowIso(),
      "Actor User ID": actor.userId || "",
      "Actor Email": actor.email || "",
      "Action": action,
      "Entity Type": entityType,
      "Entity ID": entityId || "",
      "Before JSON": TrustOpsUtils.safeJson(beforeValue || {}),
      "After JSON": TrustOpsUtils.safeJson(afterValue || {}),
      "Notes": notes || ""
    });
  }

  return {
    log: log
  };
})();
