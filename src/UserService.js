var TrustOpsUserService = (function () {
  function publicUser(user) {
    return {
      "User ID": user["User ID"],
      "First Name": user["First Name"],
      "Last Name": user["Last Name"],
      "Full Name": user["Full Name"],
      "Email": user.Email,
      "Profile Color": user["Profile Color"],
      "Theme Mode": user["Theme Mode"],
      "Google Profile Photo URL": user["Google Profile Photo URL"],
      "Profile Image URL": user["Profile Image URL"],
      "Profile Image File ID": user["Profile Image File ID"],
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

  function normalizeThemeMode(value, fallback) {
    var mode = TrustOpsUtils.normalizeText(value || fallback || "System");
    return TrustOpsConfig.THEME_MODES.indexOf(mode) === -1 ? "System" : mode;
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
    var payType = payload["Pay Type"] || payload.payType || existing && existing["Pay Type"] || "None";
    var hourlyRateValue = payload["Hourly Rate"] !== undefined ? payload["Hourly Rate"] : payload.hourlyRate !== undefined ? payload.hourlyRate : existing && existing["Hourly Rate"];
    var salaryAmountValue = payload["Salary Amount"] !== undefined ? payload["Salary Amount"] : payload.salaryAmount !== undefined ? payload.salaryAmount : existing && existing["Salary Amount"];
    var salaryFrequency = payload["Salary Frequency"] || payload.salaryFrequency || existing && existing["Salary Frequency"] || "";
    var trackPay = payload["Track Pay"] === undefined ? existing ? TrustOpsUtils.toBoolean(existing["Track Pay"]) : false : TrustOpsUtils.toBoolean(payload["Track Pay"]);
    var trackTime = payload["Track Time"] === undefined ? existing ? TrustOpsUtils.toBoolean(existing["Track Time"]) : true : TrustOpsUtils.toBoolean(payload["Track Time"]);
    if (trackPay) trackTime = true;
    if (payType === "Hourly") {
      salaryAmountValue = 0;
      salaryFrequency = "";
    } else if (payType === "Salary") {
      hourlyRateValue = 0;
    } else {
      hourlyRateValue = 0;
      salaryAmountValue = 0;
      salaryFrequency = "";
    }
    TrustOpsUtils.requireValue(firstName, "First name");
    TrustOpsUtils.requireValue(fullName, "Full name");
    TrustOpsUtils.requireValue(email, "Email");
    return {
      "First Name": firstName,
      "Last Name": lastName,
      "Full Name": fullName,
      "Email": email,
      "Profile Color": TrustOpsUtils.normalizeHexColor(payload["Profile Color"] || payload.profileColor, existing && existing["Profile Color"] || ""),
      "Theme Mode": normalizeThemeMode(payload["Theme Mode"] || payload.themeMode, existing && existing["Theme Mode"]),
      "Google Profile Photo URL": payload["Google Profile Photo URL"] || payload.googleProfilePhotoUrl || existing && existing["Google Profile Photo URL"] || "",
      "Profile Image URL": payload["Profile Image URL"] || payload.profileImageUrl || existing && existing["Profile Image URL"] || "",
      "Profile Image File ID": payload["Profile Image File ID"] || payload.profileImageFileId || existing && existing["Profile Image File ID"] || "",
      "Role": payload.Role || payload.role || TrustOpsConfig.ROLES.USER,
      "Active": payload.Active === undefined ? true : TrustOpsUtils.toBoolean(payload.Active),
      "Pay Type": payType,
      "Hourly Rate": TrustOpsUtils.toNumber(hourlyRateValue),
      "Salary Amount": TrustOpsUtils.toNumber(salaryAmountValue),
      "Salary Frequency": salaryFrequency,
      "Track Time": trackTime,
      "Track Pay": trackPay,
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
    if (existing && existing.Role === TrustOpsConfig.ROLES.OWNER && !TrustOpsPermissionService.isOwner(context)) {
      throw new Error("Only Owner can change Owner user records.");
    }
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
    var output = TrustOpsUtils.sanitizeForClient(saved);
    if (TrustOpsPermissionService.isOwnerOrAdmin(context)) {
      try {
        shareSpreadsheetWithUser(context, saved["User ID"]);
      } catch (error) {
        output.shareError = error.message || String(error);
        TrustOpsAuditService.log(context, "SPREADSHEET_SHARE_FAILED", "User", saved["User ID"], null, { email: saved.Email, error: output.shareError }, output.shareError);
      }
    }
    return output;
  }

  function updateProfile(context, payload) {
    var userId = payload.userId || payload["User ID"] || context.userId;
    TrustOpsPermissionService.requireAllowed(
      TrustOpsPermissionService.canEditProfile(context, userId),
      "You do not have permission to edit this profile."
    );
    var existing = TrustOpsSheetService.findById(TrustOpsConfig.SHEETS.USERS, userId);
    if (!existing) throw new Error("User not found.");
    var firstName = TrustOpsUtils.normalizeText(payload.firstName || payload["First Name"] || existing["First Name"]);
    var lastName = TrustOpsUtils.normalizeText(payload.lastName || payload["Last Name"] || existing["Last Name"]);
    var fullName = TrustOpsUtils.normalizeText(payload.fullName || payload["Full Name"] || [firstName, lastName].filter(Boolean).join(" "));
    var patch = {
      "First Name": TrustOpsUtils.requireValue(firstName, "First name"),
      "Last Name": lastName,
      "Full Name": TrustOpsUtils.requireValue(fullName, "Full name"),
      "Updated At": TrustOpsUtils.nowIso()
    };
    if (payload.themeMode !== undefined || payload["Theme Mode"] !== undefined) {
      patch["Theme Mode"] = normalizeThemeMode(payload.themeMode || payload["Theme Mode"], existing["Theme Mode"]);
    }
    if (payload.profileColor !== undefined || payload["Profile Color"] !== undefined) {
      TrustOpsPermissionService.requireAllowed(
        TrustOpsPermissionService.canChangeProfileColor(context, userId),
        "You do not have permission to change this profile color."
      );
      patch["Profile Color"] = TrustOpsUtils.normalizeHexColor(payload.profileColor || payload["Profile Color"], existing["Profile Color"] || "");
    }
    if (payload.googleProfilePhotoUrl !== undefined || payload["Google Profile Photo URL"] !== undefined) {
      patch["Google Profile Photo URL"] = payload.googleProfilePhotoUrl || payload["Google Profile Photo URL"] || "";
    }
    var saved = TrustOpsSheetService.updateById(TrustOpsConfig.SHEETS.USERS, userId, patch);
    TrustOpsAuditService.log(context, "PROFILE_UPDATED", "User", userId, existing, saved, "");
    return TrustOpsUtils.sanitizeForClient(saved);
  }

  function shareSpreadsheetWithUser(context, userId) {
    TrustOpsPermissionService.requireAllowed(
      TrustOpsPermissionService.isOwnerOrAdmin(context),
      "Only Owner/Admin can share spreadsheet access."
    );
    var user = TrustOpsSheetService.findById(TrustOpsConfig.SHEETS.USERS, userId);
    if (!user) throw new Error("User not found.");
    var email = TrustOpsUtils.requireValue(user.Email, "User email");
    var spreadsheetId = TrustOpsConfig.getSpreadsheetId();
    TrustOpsUtils.requireValue(spreadsheetId, "Spreadsheet ID");
    var file = DriveApp.getFileById(spreadsheetId);
    file.addEditor(email);
    var result = {
      userId: userId,
      email: email,
      shared: true,
      sharedAt: TrustOpsUtils.nowIso()
    };
    TrustOpsAuditService.log(context, "SPREADSHEET_SHARED_WITH_USER", "User", userId, null, result, "");
    return result;
  }

  function uploadProfileImage(context, payload) {
    var userId = payload.userId || payload["User ID"] || context.userId;
    TrustOpsPermissionService.requireAllowed(
      TrustOpsPermissionService.canEditProfile(context, userId),
      "You do not have permission to edit this profile."
    );
    var existing = TrustOpsSheetService.findById(TrustOpsConfig.SHEETS.USERS, userId);
    if (!existing) throw new Error("User not found.");
    var dataUrl = TrustOpsUtils.requireValue(payload.dataUrl || payload.imageDataUrl, "Image data");
    var match = String(dataUrl).match(/^data:([^;]+);base64,(.+)$/);
    if (!match) throw new Error("Profile image must be uploaded as a data URL.");
    var mimeType = match[1];
    if (["image/png", "image/jpeg", "image/gif", "image/webp"].indexOf(mimeType) === -1) {
      throw new Error("Profile image must be PNG, JPEG, GIF, or WebP.");
    }
    var bytes = Utilities.base64Decode(match[2]);
    if (bytes.length > 2 * 1024 * 1024) {
      throw new Error("Profile image must be 2 MB or smaller.");
    }
    var extension = mimeType === "image/jpeg" ? "jpg" : mimeType.split("/")[1];
    var fileName = "trust-ops-profile-" + userId + "." + extension;
    var file = DriveApp.createFile(Utilities.newBlob(bytes, mimeType, fileName));
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    var imageUrl = "https://drive.google.com/uc?export=view&id=" + file.getId();
    var saved = TrustOpsSheetService.updateById(TrustOpsConfig.SHEETS.USERS, userId, {
      "Profile Image File ID": file.getId(),
      "Profile Image URL": imageUrl,
      "Updated At": TrustOpsUtils.nowIso()
    });
    TrustOpsAuditService.log(context, "PROFILE_IMAGE_UPLOADED", "User", userId, existing, saved, file.getId());
    return TrustOpsUtils.sanitizeForClient(saved);
  }

  function removeProfileImage(context, userId) {
    var targetUserId = userId || context.userId;
    TrustOpsPermissionService.requireAllowed(
      TrustOpsPermissionService.canEditProfile(context, targetUserId),
      "You do not have permission to edit this profile."
    );
    var existing = TrustOpsSheetService.findById(TrustOpsConfig.SHEETS.USERS, targetUserId);
    if (!existing) throw new Error("User not found.");
    var fileId = existing["Profile Image File ID"];
    if (TrustOpsUtils.normalizeText(fileId)) {
      try {
        DriveApp.getFileById(fileId).setTrashed(true);
      } catch (error) {
        // Continue clearing the record even if the file is already gone.
      }
    }
    var saved = TrustOpsSheetService.updateById(TrustOpsConfig.SHEETS.USERS, targetUserId, {
      "Profile Image URL": "",
      "Profile Image File ID": "",
      "Updated At": TrustOpsUtils.nowIso()
    });
    TrustOpsAuditService.log(context, "PROFILE_IMAGE_REMOVED", "User", targetUserId, existing, saved, fileId || "");
    return TrustOpsUtils.sanitizeForClient(saved);
  }

  function archiveUser(context, userId) {
    TrustOpsPermissionService.requireAllowed(
      TrustOpsPermissionService.canManageUsers(context),
      "Only Owner/Admin can archive users."
    );
    var existing = TrustOpsSheetService.findById(TrustOpsConfig.SHEETS.USERS, userId);
    if (!existing) throw new Error("User not found.");
    if (existing.Role === TrustOpsConfig.ROLES.OWNER && !TrustOpsPermissionService.isOwner(context)) {
      throw new Error("Only Owner can archive an Owner user.");
    }
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
    updateProfile: updateProfile,
    shareSpreadsheetWithUser: shareSpreadsheetWithUser,
    uploadProfileImage: uploadProfileImage,
    removeProfileImage: removeProfileImage,
    archiveUser: archiveUser
  };
})();
