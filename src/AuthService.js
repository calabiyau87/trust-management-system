var TrustOpsAuthService = (function () {
  function getActiveEmail() {
    var email = "";
    try {
      email = Session.getActiveUser().getEmail();
    } catch (error) {
      email = "";
    }
    return TrustOpsUtils.normalizeEmail(email);
  }

  function getEffectiveEmail() {
    var email = "";
    try {
      email = Session.getEffectiveUser().getEmail();
    } catch (error) {
      email = "";
    }
    return TrustOpsUtils.normalizeEmail(email);
  }

  function getTemporaryUserKey() {
    try {
      return Session.getTemporaryActiveUserKey();
    } catch (error) {
      return "";
    }
  }

  function getUserByEmail(email) {
    var normalizedEmail = TrustOpsUtils.normalizeEmail(email);
    if (!normalizedEmail) return null;
    var users = TrustOpsSheetService.readTable(TrustOpsConfig.SHEETS.USERS);
    return users.filter(function (user) {
      return TrustOpsUtils.normalizeEmail(user.Email) === normalizedEmail && !TrustOpsUtils.toBoolean(user.Archived);
    })[0] || null;
  }

  function getUserById(userId) {
    if (!TrustOpsUtils.normalizeText(userId)) return null;
    return TrustOpsSheetService.findById(TrustOpsConfig.SHEETS.USERS, userId);
  }

  function requireAuthorizedUser() {
    var email = getActiveEmail();
    if (!email) {
      throw new Error("Unable to determine the signed-in Google account.");
    }
    var user = getUserByEmail(email);
    if (!user) {
      throw new Error("This Google account is not authorized for Trust Ops: " + email);
    }
    if (!TrustOpsUtils.toBoolean(user.Active)) {
      throw new Error("This Trust Ops user is inactive: " + email);
    }
    return {
      userId: user["User ID"],
      email: TrustOpsUtils.normalizeEmail(user.Email),
      firstName: user["First Name"] || "",
      fullName: user["Full Name"] || user.Email,
      role: user.Role || TrustOpsConfig.ROLES.USER,
      user: TrustOpsUtils.sanitizeForClient(user)
    };
  }

  function getOptionalUserContext() {
    try {
      return requireAuthorizedUser();
    } catch (error) {
      return null;
    }
  }

  function requireBootstrapAllowed(ownerEmail) {
    var activeEmail = getActiveEmail();
    var normalizedOwner = TrustOpsUtils.normalizeEmail(ownerEmail);
    if (!activeEmail || activeEmail !== normalizedOwner) {
      throw new Error("Bootstrap owner email must match the signed-in Google account.");
    }
    var existingContext = getOptionalUserContext();
    if (existingContext && !TrustOpsPermissionService.canManageSettings(existingContext)) {
      throw new Error("Only Owner/Admin can re-run setup after bootstrap.");
    }
  }

  function diagnoseUserAccess(context, email) {
    TrustOpsPermissionService.requireAllowed(
      TrustOpsPermissionService.canManageUsers(context),
      "Only users with user-management permission can diagnose access."
    );
    var normalizedEmail = TrustOpsUtils.normalizeEmail(email);
    var user = getUserByEmail(normalizedEmail);
    return {
      searchedEmail: email || "",
      normalizedEmail: normalizedEmail,
      found: Boolean(user),
      active: user ? TrustOpsUtils.toBoolean(user.Active) : false,
      archived: user ? TrustOpsUtils.toBoolean(user.Archived) : false,
      role: user ? user.Role : "",
      userId: user ? user["User ID"] : "",
      exactStoredEmail: user ? user.Email : "",
      issue: !normalizedEmail
        ? "No email provided."
        : !user
          ? "No active user row matches this normalized email."
          : !TrustOpsUtils.toBoolean(user.Active)
            ? "User exists but is inactive."
            : TrustOpsUtils.toBoolean(user.Archived)
              ? "User exists but is archived."
              : ""
    };
  }

  function getPublicAuthDiagnostic() {
    var activeEmail = getActiveEmail();
    var effectiveEmail = getEffectiveEmail();
    var diagnostic = {
      activeEmail: activeEmail,
      effectiveEmail: effectiveEmail,
      temporaryUserKey: getTemporaryUserKey(),
      spreadsheetConfigured: Boolean(TrustOpsConfig.getSpreadsheetId()),
      userLookupAttempted: false,
      userFound: false,
      userActive: false,
      userArchived: false,
      userRole: "",
      userId: "",
      storedEmail: "",
      sheetAccessOk: false,
      sheetAccessError: "",
      issue: ""
    };
    if (!activeEmail) {
      diagnostic.issue = "Apps Script did not expose the signed-in user's email to Session.getActiveUser().getEmail().";
      return diagnostic;
    }
    try {
      diagnostic.userLookupAttempted = true;
      var user = getUserByEmail(activeEmail);
      diagnostic.sheetAccessOk = true;
      diagnostic.userFound = Boolean(user);
      if (user) {
        diagnostic.userActive = TrustOpsUtils.toBoolean(user.Active);
        diagnostic.userArchived = TrustOpsUtils.toBoolean(user.Archived);
        diagnostic.userRole = user.Role || "";
        diagnostic.userId = user["User ID"] || "";
        diagnostic.storedEmail = user.Email || "";
      }
      diagnostic.issue = !user
        ? "No Users row matches the signed-in email."
        : !diagnostic.userActive
          ? "The matching Users row is inactive."
          : diagnostic.userArchived
            ? "The matching Users row is archived."
            : "";
    } catch (error) {
      diagnostic.sheetAccessError = error.message || String(error);
      diagnostic.issue = "The signed-in user could not read the configured spreadsheet.";
    }
    return diagnostic;
  }

  function getGoogleProfile() {
    try {
      var response = UrlFetchApp.fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: {
          Authorization: "Bearer " + ScriptApp.getOAuthToken()
        },
        muteHttpExceptions: true
      });
      if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) {
        return {};
      }
      var profile = JSON.parse(response.getContentText() || "{}");
      return {
        name: profile.name || "",
        picture: profile.picture || "",
        email: TrustOpsUtils.normalizeEmail(profile.email || "")
      };
    } catch (error) {
      return {};
    }
  }

  return {
    getActiveEmail: getActiveEmail,
    getEffectiveEmail: getEffectiveEmail,
    getTemporaryUserKey: getTemporaryUserKey,
    getUserByEmail: getUserByEmail,
    getUserById: getUserById,
    requireAuthorizedUser: requireAuthorizedUser,
    getOptionalUserContext: getOptionalUserContext,
    requireBootstrapAllowed: requireBootstrapAllowed,
    diagnoseUserAccess: diagnoseUserAccess,
    getPublicAuthDiagnostic: getPublicAuthDiagnostic,
    getGoogleProfile: getGoogleProfile
  };
})();
