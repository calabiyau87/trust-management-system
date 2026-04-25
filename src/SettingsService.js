var TrustOpsSettingsService = (function () {
  function listSettings(context) {
    TrustOpsPermissionService.requireAllowed(
      TrustOpsPermissionService.canManageSettings(context),
      "Only Owner/Admin can view settings."
    );
    return TrustOpsUtils.recordsForClient(TrustOpsSheetService.readTable(TrustOpsConfig.SHEETS.SETTINGS));
  }

  function getSetting(key, fallback) {
    var matches = TrustOpsSheetService.findByColumn(TrustOpsConfig.SHEETS.SETTINGS, "Setting Key", key);
    if (!matches.length) return fallback;
    var value = matches[0]["Setting Value"];
    return TrustOpsUtils.normalizeText(value) ? value : fallback;
  }

  function parseJsonSetting(key, fallback) {
    var value = getSetting(key, "");
    if (!TrustOpsUtils.normalizeText(value)) return fallback;
    try {
      var parsed = JSON.parse(value);
      return parsed || fallback;
    } catch (error) {
      return fallback;
    }
  }

  function normalizeHexColor(value, fallback) {
    var text = TrustOpsUtils.normalizeText(value);
    if (/^#[0-9a-fA-F]{6}$/.test(text)) return text.toLowerCase();
    return fallback || "";
  }

  function getTaskStatusColors() {
    var defaults = TrustOpsConfig.DEFAULT_TASK_STATUS_COLORS;
    var configured = parseJsonSetting("TASK_STATUS_COLORS_JSON", {});
    var colors = {};
    TrustOpsConfig.TASK_STATUSES.forEach(function (status) {
      colors[status] = normalizeHexColor(configured[status], defaults[status]);
    });
    return colors;
  }

  function getClientVisualSettings() {
    return {
      taskStatusColors: getTaskStatusColors()
    };
  }

  function saveSetting(context, payload) {
    TrustOpsPermissionService.requireAllowed(
      TrustOpsPermissionService.canManageSettings(context),
      "Only Owner/Admin can manage settings."
    );
    var key = TrustOpsUtils.requireValue(payload["Setting Key"] || payload.key, "Setting key");
    var existing = TrustOpsSheetService.findById(TrustOpsConfig.SHEETS.SETTINGS, key);
    var record = {
      "Setting Value": payload["Setting Value"] || payload.value || "",
      "Description": payload.Description || payload.description || "",
      "Updated At": TrustOpsUtils.nowIso()
    };
    var saved = existing
      ? TrustOpsSheetService.updateById(TrustOpsConfig.SHEETS.SETTINGS, key, record)
      : TrustOpsSheetService.appendRecord(TrustOpsConfig.SHEETS.SETTINGS, {
          "Setting Key": key,
          "Setting Value": record["Setting Value"],
          "Description": record.Description,
          "Updated At": record["Updated At"]
        });
    TrustOpsAuditService.log(context, existing ? "SETTING_UPDATED" : "SETTING_CREATED", "Setting", key, existing, saved, "");
    return TrustOpsUtils.sanitizeForClient(saved);
  }

  return {
    listSettings: listSettings,
    getSetting: getSetting,
    getClientVisualSettings: getClientVisualSettings,
    getTaskStatusColors: getTaskStatusColors,
    saveSetting: saveSetting
  };
})();
