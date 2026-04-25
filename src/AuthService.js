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

  return {
    getActiveEmail: getActiveEmail,
    getUserByEmail: getUserByEmail,
    getUserById: getUserById,
    requireAuthorizedUser: requireAuthorizedUser,
    getOptionalUserContext: getOptionalUserContext,
    requireBootstrapAllowed: requireBootstrapAllowed
  };
})();
