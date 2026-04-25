var TrustOpsUserService = (function () {
  function publicUser(user) {
    return {
      "User ID": user["User ID"],
      "First Name": user["First Name"],
      "Last Name": user["Last Name"],
      "Full Name": user["Full Name"],
      "Email": user.Email,
      "Role": user.Role,
      "Active": user.Active,
      "Track Time": user["Track Time"],
      "Track Pay": user["Track Pay"]
    };
  }

  function listUsers(context, includeArchived) {
    var users = TrustOpsSheetService.readTable(TrustOpsConfig.SHEETS.USERS).filter(function (user) {
      return includeArchived || !TrustOpsUtils.toBoolean(user.Archived);
    });
    if (TrustOpsPermissionService.canManageUsers(context)) {
      return TrustOpsUtils.recordsForClient(users);
    }
    return users
      .filter(function (user) {
        return TrustOpsUtils.toBoolean(user.Active);
      })
      .map(publicUser);
  }

  function listActiveUsers() {
    return TrustOpsSheetService.readTable(TrustOpsConfig.SHEETS.USERS)
      .filter(function (user) {
        return TrustOpsUtils.toBoolean(user.Active) && !TrustOpsUtils.toBoolean(user.Archived);
      })
      .map(publicUser);
  }

  function buildUserRecord(payload, existing) {
    var now = TrustOpsUtils.nowIso();
    var firstName = TrustOpsUtils.normalizeText(payload["First Name"] || payload.firstName);
    var lastName = TrustOpsUtils.normalizeText(payload["Last Name"] || payload.lastName);
    var fullName = TrustOpsUtils.normalizeText(payload["Full Name"] || payload.fullName || [firstName, lastName].filter(Boolean).join(" "));
    var email = TrustOpsUtils.normalizeEmail(payload.Email || payload.email);
    TrustOpsUtils.requireValue(firstName, "First name");
    TrustOpsUtils.requireValue(fullName, "Full name");
    TrustOpsUtils.requireValue(email, "Email");
    return {
      "First Name": firstName,
      "Last Name": lastName,
      "Full Name": fullName,
      "Email": email,
      "Role": payload.Role || payload.role || TrustOpsConfig.ROLES.USER,
      "Active": payload.Active === undefined ? true : TrustOpsUtils.toBoolean(payload.Active),
      "Pay Type": payload["Pay Type"] || payload.payType || "None",
      "Hourly Rate": TrustOpsUtils.toNumber(payload["Hourly Rate"] || payload.hourlyRate),
      "Salary Amount": TrustOpsUtils.toNumber(payload["Salary Amount"] || payload.salaryAmount),
      "Salary Frequency": payload["Salary Frequency"] || payload.salaryFrequency || "",
      "Track Time": payload["Track Time"] === undefined ? true : TrustOpsUtils.toBoolean(payload["Track Time"]),
      "Track Pay": payload["Track Pay"] === undefined ? false : TrustOpsUtils.toBoolean(payload["Track Pay"]),
      "Manager User ID": payload["Manager User ID"] || payload.managerUserId || "",
      "Created At": existing ? existing["Created At"] : now,
      "Updated At": now,
      "Archived": existing ? TrustOpsUtils.toBoolean(existing.Archived) : false
    };
  }

  function saveUser(context, payload) {
    TrustOpsPermissionService.requireAllowed(
      TrustOpsPermissionService.canManageUsers(context),
      "Only Owner/Admin can manage users."
    );
    var userId = payload["User ID"] || payload.userId || "";
    var existing = userId ? TrustOpsSheetService.findById(TrustOpsConfig.SHEETS.USERS, userId) : null;
    var record = buildUserRecord(payload || {}, existing);
    if (record.Role === TrustOpsConfig.ROLES.OWNER && !TrustOpsPermissionService.isOwner(context)) {
      throw new Error("Only Owner can assign the Owner role.");
    }
    var duplicate = TrustOpsAuthService.getUserByEmail(record.Email);
    if (duplicate && duplicate["User ID"] !== userId) {
      throw new Error("A user already exists for " + record.Email + ".");
    }
    var saved = existing
      ? TrustOpsSheetService.updateById(TrustOpsConfig.SHEETS.USERS, userId, record)
      : TrustOpsSheetService.appendRecord(TrustOpsConfig.SHEETS.USERS, record);
    TrustOpsAuditService.log(context, existing ? "USER_UPDATED" : "USER_CREATED", "User", saved["User ID"], existing, saved, "");
    return TrustOpsUtils.sanitizeForClient(saved);
  }

  function archiveUser(context, userId) {
    TrustOpsPermissionService.requireAllowed(
      TrustOpsPermissionService.canManageUsers(context),
      "Only Owner/Admin can archive users."
    );
    var existing = TrustOpsSheetService.findById(TrustOpsConfig.SHEETS.USERS, userId);
    if (!existing) throw new Error("User not found.");
    var saved = TrustOpsSheetService.updateById(TrustOpsConfig.SHEETS.USERS, userId, {
      "Active": false,
      "Archived": true,
      "Updated At": TrustOpsUtils.nowIso()
    });
    TrustOpsAuditService.log(context, "USER_ARCHIVED", "User", userId, existing, saved, "");
    return TrustOpsUtils.sanitizeForClient(saved);
  }

  return {
    listUsers: listUsers,
    listActiveUsers: listActiveUsers,
    saveUser: saveUser,
    archiveUser: archiveUser
  };
})();
