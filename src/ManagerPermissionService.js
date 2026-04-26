var TrustOpsManagerPermissionService = (function () {
  var CAPABILITIES = [
    "Can Create Tasks",
    "Can Edit Tasks",
    "Can Delete Tasks",
    "Can Create Time For Others",
    "Can View All Time",
    "Can Edit Time Entries",
    "Can Delete Time Entries",
    "Can Approve Time Requests",
    "Can Lock Pay Periods",
    "Can Unlock Pay Periods",
    "Can View All Pay",
    "Can Manage Users",
    "Can Manage Projects",
    "Can Manage Time Categories",
    "Can Manage Tags",
    "Can Manage Organization",
    "Can Manage Board Views",
    "Can Manage Settings",
    "Can Change Profile Color",
    "Can Import Legacy Data"
  ];

  function defaultPermissions(preset, role) {
    var selectedPreset = preset || TrustOpsConfig.MANAGER_PRESETS.OPERATIONS;
    var permissions = {};
    CAPABILITIES.forEach(function (capability) {
      permissions[capability] = false;
    });
    if (role !== TrustOpsConfig.ROLES.MANAGER) {
      return permissions;
    }
    permissions["Can Create Tasks"] = true;
    permissions["Can Edit Tasks"] = true;
    permissions["Can Create Time For Others"] = true;
    permissions["Can Manage Projects"] = true;
    if (selectedPreset === TrustOpsConfig.MANAGER_PRESETS.ADMIN_LIKE) {
      CAPABILITIES.forEach(function (capability) {
        permissions[capability] = capability !== "Can Manage Users" && capability !== "Can Manage Settings" && capability !== "Can Manage Organization" && capability !== "Can Import Legacy Data";
      });
    } else if (selectedPreset === TrustOpsConfig.MANAGER_PRESETS.BASIC) {
      permissions["Can Edit Tasks"] = false;
      permissions["Can Manage Projects"] = false;
    }
    return permissions;
  }

  function parseOverrides(record) {
    var overrides = {};
    try {
      overrides = JSON.parse(record && record["Overrides JSON"] || "{}");
    } catch (error) {
      overrides = {};
    }
    return overrides || {};
  }

  function effectiveForUser(userId) {
    var user = TrustOpsAuthService.getUserById(userId);
    var rows = TrustOpsSheetService.readTable(TrustOpsConfig.SHEETS.MANAGER_PERMISSIONS);
    var record = rows.filter(function (row) {
      return String(row["User ID"]) === String(userId);
    })[0];
    var permissions = defaultPermissions(record && record.Preset, user && user.Role);
    if (record) {
      CAPABILITIES.forEach(function (capability) {
        if (TrustOpsUtils.normalizeText(record[capability])) {
          permissions[capability] = TrustOpsUtils.toBoolean(record[capability]);
        }
      });
      var overrides = parseOverrides(record);
      Object.keys(overrides).forEach(function (key) {
        if (CAPABILITIES.indexOf(key) !== -1) {
          permissions[key] = TrustOpsUtils.toBoolean(overrides[key]);
        }
      });
    }
    return {
      userId: userId,
      preset: record && record.Preset || TrustOpsConfig.MANAGER_PRESETS.OPERATIONS,
      permissions: permissions,
      record: record || null
    };
  }

  function userCan(context, capability) {
    if (!context) return false;
    return TrustOpsUtils.toBoolean(effectiveForUser(context.userId).permissions[capability]);
  }

  function managerCan(context, capability) {
    return userCan(context, capability);
  }

  function listManagerPermissions(context) {
    TrustOpsPermissionService.requireAllowed(
      TrustOpsPermissionService.isOwnerOrAdmin(context),
      "Only Owner/Admin can view user permissions."
    );
    return TrustOpsUtils.recordsForClient(TrustOpsSheetService.readTable(TrustOpsConfig.SHEETS.MANAGER_PERMISSIONS));
  }

  function listUserPermissions(context) {
    TrustOpsPermissionService.requireAllowed(
      TrustOpsPermissionService.isOwnerOrAdmin(context),
      "Only Owner/Admin can view user permissions."
    );
    var users = TrustOpsSheetService.readTable(TrustOpsConfig.SHEETS.USERS).filter(function (user) {
      return !TrustOpsUtils.toBoolean(user.Archived);
    });
    return users.map(function (user) {
      var effective = effectiveForUser(user["User ID"]);
      return {
        "User ID": user["User ID"],
        "User Name": user["Full Name"],
        "Role": user.Role,
        "Preset": effective.preset,
        "Manager Permission ID": effective.record ? effective.record["Manager Permission ID"] : "",
        "Permissions": effective.permissions
      };
    });
  }

  function saveUserPermissions(context, payload) {
    TrustOpsPermissionService.requireAllowed(
      TrustOpsPermissionService.isOwnerOrAdmin(context),
      "Only Owner/Admin can manage user permissions."
    );
    var userId = TrustOpsUtils.requireValue(payload.userId || payload["User ID"], "User");
    var user = TrustOpsAuthService.getUserById(userId);
    if (!user) throw new Error("User not found.");
    if (user.Role === TrustOpsConfig.ROLES.OWNER && !TrustOpsPermissionService.isOwner(context)) {
      throw new Error("Only Owner can change Owner user permissions.");
    }
    var existingRows = TrustOpsSheetService.findByColumn(TrustOpsConfig.SHEETS.MANAGER_PERMISSIONS, "User ID", userId);
    var existing = existingRows[0] || null;
    var record = {
      "User ID": userId,
      "Preset": payload.Preset || payload.preset || TrustOpsConfig.MANAGER_PRESETS.OPERATIONS,
      "Overrides JSON": TrustOpsUtils.safeJson(payload.overrides || {}),
      "Updated By User ID": context.userId,
      "Updated At": TrustOpsUtils.nowIso()
    };
    CAPABILITIES.forEach(function (capability) {
      if (payload[capability] !== undefined) {
        record[capability] = TrustOpsUtils.toBoolean(payload[capability]);
      } else if (payload.permissions && payload.permissions[capability] !== undefined) {
        record[capability] = TrustOpsUtils.toBoolean(payload.permissions[capability]);
      }
    });
    var saved = existing
      ? TrustOpsSheetService.updateById(TrustOpsConfig.SHEETS.MANAGER_PERMISSIONS, existing["Manager Permission ID"], record)
      : TrustOpsSheetService.appendRecord(TrustOpsConfig.SHEETS.MANAGER_PERMISSIONS, record);
    TrustOpsAuditService.log(context, existing ? "USER_PERMISSIONS_UPDATED" : "USER_PERMISSIONS_CREATED", "User Permissions", saved["Manager Permission ID"], existing, saved, "");
    return TrustOpsUtils.sanitizeForClient(saved);
  }

  function saveManagerPermissions(context, payload) {
    return saveUserPermissions(context, payload);
  }

  return {
    CAPABILITIES: CAPABILITIES,
    defaultPermissions: defaultPermissions,
    effectiveForUser: effectiveForUser,
    userCan: userCan,
    managerCan: managerCan,
    listManagerPermissions: listManagerPermissions,
    listUserPermissions: listUserPermissions,
    saveUserPermissions: saveUserPermissions,
    saveManagerPermissions: saveManagerPermissions
  };
})();
