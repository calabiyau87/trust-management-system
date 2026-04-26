var TrustOpsAuthService = (function () {
  function getGoogleClientId() {
    return TrustOpsUtils.normalizeText(
      PropertiesService.getScriptProperties().getProperty("GOOGLE_OAUTH_CLIENT_ID") ||
      PropertiesService.getScriptProperties().getProperty("GOOGLE_CLIENT_ID") ||
      ""
    );
  }

  function getGithubPagesAuthUrl() {
    return TrustOpsUtils.normalizeText(
      PropertiesService.getScriptProperties().getProperty("TRUST_OPS_GITHUB_PAGES_AUTH_URL") ||
      PropertiesService.getScriptProperties().getProperty("GITHUB_PAGES_AUTH_URL") ||
      ""
    );
  }

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
      return TrustOpsUtils.normalizeEmail(user.Email) === normalizedEmail;
    })[0] || null;
  }

  function getUserById(userId) {
    if (!TrustOpsUtils.normalizeText(userId)) return null;
    return TrustOpsSheetService.findById(TrustOpsConfig.SHEETS.USERS, userId);
  }

  function verifyGoogleIdToken(authToken) {
    var token = TrustOpsUtils.normalizeText(authToken);
    if (!token) {
      throw new Error("Google Sign-In is required.");
    }
    var clientId = getGoogleClientId();
    if (!clientId) {
      throw new Error("Google OAuth client ID is not configured.");
    }
    var response = UrlFetchApp.fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(token), {
      muteHttpExceptions: true
    });
    if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) {
      throw new Error("Google Sign-In token could not be verified.");
    }
    var claims = {};
    try {
      claims = JSON.parse(response.getContentText() || "{}");
    } catch (error) {
      throw new Error("Google Sign-In token could not be verified.");
    }
    var audience = TrustOpsUtils.normalizeText(claims.aud);
    var issuer = TrustOpsUtils.normalizeText(claims.iss);
    var email = TrustOpsUtils.normalizeEmail(claims.email);
    if (audience !== clientId) {
      throw new Error("Google Sign-In token was issued for the wrong client.");
    }
    if (issuer !== "accounts.google.com" && issuer !== "https://accounts.google.com") {
      throw new Error("Google Sign-In token was issued by an unexpected provider.");
    }
    if (!TrustOpsUtils.toBoolean(claims.email_verified)) {
      throw new Error("Google account email is not verified.");
    }
    if (!email) {
      throw new Error("Google Sign-In did not return an email address.");
    }
    claims.email = email;
    claims.aud = audience;
    claims.iss = issuer;
    return claims;
  }

  function requireAuthorizedUser(authToken) {
    var claims = verifyGoogleIdToken(authToken);
    var user = getUserByEmail(claims.email);
    if (!user) {
      throw new Error("This Google account is not authorized for Trust Ops: " + claims.email);
    }
    if (TrustOpsUtils.toBoolean(user.Archived)) {
      throw new Error("This Trust Ops user is archived: " + claims.email);
    }
    if (!TrustOpsUtils.toBoolean(user.Active)) {
      throw new Error("This Trust Ops user is inactive: " + claims.email);
    }
    return {
      userId: user["User ID"],
      email: TrustOpsUtils.normalizeEmail(user.Email),
      firstName: user["First Name"] || "",
      fullName: user["Full Name"] || user.Email,
      role: user.Role || TrustOpsConfig.ROLES.USER,
      user: TrustOpsUtils.sanitizeForClient(user),
      googleProfile: {
        email: claims.email,
        name: claims.name || "",
        picture: claims.picture || "",
        givenName: claims.given_name || "",
        familyName: claims.family_name || ""
      },
      authClaims: {
        sub: claims.sub || "",
        aud: claims.aud || "",
        iss: claims.iss || ""
      }
    };
  }

  function getOptionalUserContext() {
    try {
      var email = getActiveEmail();
      if (!email) return null;
      var user = getUserByEmail(email);
      if (!user || !TrustOpsUtils.toBoolean(user.Active) || TrustOpsUtils.toBoolean(user.Archived)) {
        return null;
      }
      return {
        userId: user["User ID"],
        email: TrustOpsUtils.normalizeEmail(user.Email),
        firstName: user["First Name"] || "",
        fullName: user["Full Name"] || user.Email,
        role: user.Role || TrustOpsConfig.ROLES.USER,
        user: TrustOpsUtils.sanitizeForClient(user)
      };
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
          ? "No user row matches this normalized email."
          : TrustOpsUtils.toBoolean(user.Archived)
            ? "User exists but is archived."
            : !TrustOpsUtils.toBoolean(user.Active)
              ? "User exists but is inactive."
              : ""
    };
  }

  function getPublicAuthDiagnostic(authToken) {
    var diagnostic = {
      clientIdConfigured: Boolean(getGoogleClientId()),
      tokenProvided: Boolean(TrustOpsUtils.normalizeText(authToken)),
      tokenVerified: false,
      email: "",
      audience: "",
      issuer: "",
      subject: "",
      userLookupAttempted: false,
      userFound: false,
      userActive: false,
      userArchived: false,
      userRole: "",
      userId: "",
      storedEmail: "",
      issue: ""
    };
    if (!diagnostic.tokenProvided) {
      diagnostic.issue = "No Google ID token was supplied.";
      return diagnostic;
    }
    try {
      var claims = verifyGoogleIdToken(authToken);
      diagnostic.tokenVerified = true;
      diagnostic.email = claims.email || "";
      diagnostic.audience = claims.aud || "";
      diagnostic.issuer = claims.iss || "";
      diagnostic.subject = claims.sub || "";
      diagnostic.userLookupAttempted = true;
      var user = getUserByEmail(claims.email);
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
        : diagnostic.userArchived
          ? "The matching Users row is archived."
          : !diagnostic.userActive
            ? "The matching Users row is inactive."
            : "";
    } catch (error) {
      diagnostic.issue = error.message || String(error);
    }
    return diagnostic;
  }

  function getGoogleProfile(authToken) {
    try {
      var profile = verifyGoogleIdToken(authToken);
      return {
        name: profile.name || "",
        picture: profile.picture || "",
        email: TrustOpsUtils.normalizeEmail(profile.email || ""),
        givenName: profile.given_name || "",
        familyName: profile.family_name || ""
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
    getGoogleClientId: getGoogleClientId,
    getGithubPagesAuthUrl: getGithubPagesAuthUrl,
    verifyGoogleIdToken: verifyGoogleIdToken,
    requireAuthorizedUser: requireAuthorizedUser,
    getOptionalUserContext: getOptionalUserContext,
    requireBootstrapAllowed: requireBootstrapAllowed,
    diagnoseUserAccess: diagnoseUserAccess,
    getPublicAuthDiagnostic: getPublicAuthDiagnostic,
    getGoogleProfile: getGoogleProfile
  };
})();
