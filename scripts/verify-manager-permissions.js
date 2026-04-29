const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");

function loadSource(context, relativePath) {
  const source = fs.readFileSync(path.join(root, relativePath), "utf8");
  vm.runInContext(source, context, { filename: relativePath });
}

function normalizeText(value) {
  return String(value == null ? "" : value).trim();
}

function toBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const text = normalizeText(value).toLowerCase();
  return text === "true" || text === "yes" || text === "1";
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function expect(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function makeContext() {
  const usersById = {
    owner_1: { "User ID": "owner_1", "Full Name": "Owner User", Role: "Owner", Archived: false },
    admin_1: { "User ID": "admin_1", "Full Name": "Admin User", Role: "Admin", Archived: false },
    mgr_1: { "User ID": "mgr_1", "Full Name": "Manager User", Role: "Manager", Archived: false },
    user_1: { "User ID": "user_1", "Full Name": "Regular User", Role: "User", Archived: false }
  };
  const readCounts = {};
  let managerPermissionRows = [];
  const context = {
    console,
    Date,
    JSON,
    Math,
    Number,
    String,
    Boolean,
    Array,
    Object,
    RegExp,
    parseInt,
    parseFloat,
    isNaN
  };
  context.globalThis = context;
  context.self = context;
  context.window = context;
  context.__setManagerPermissionRows = function (rows) {
    managerPermissionRows = clone(rows);
  };
  context.__readCounts = readCounts;
  context.TrustOpsUtils = {
    clone,
    normalizeText,
    toBoolean,
    safeJson: (value) => JSON.stringify(value || {}),
    requireValue(value, label) {
      if (!normalizeText(value)) {
        throw new Error(label + " is required.");
      }
      return value;
    },
    nowIso() {
      return "2026-04-28T12:00:00.000Z";
    },
    recordsForClient: (value) => value,
    sanitizeForClient: (value) => value
  };
  context.TrustOpsAuthService = {
    getUserById(userId) {
      return usersById[userId] || null;
    }
  };
  context.TrustOpsSheetService = {
    readTable(sheetName) {
      readCounts[sheetName] = (readCounts[sheetName] || 0) + 1;
      if (sheetName === context.TrustOpsConfig.SHEETS.MANAGER_PERMISSIONS) {
        return clone(managerPermissionRows);
      }
      if (sheetName === context.TrustOpsConfig.SHEETS.USERS) {
        return Object.keys(usersById).map((key) => clone(usersById[key]));
      }
      return [];
    },
    findByColumn() {
      return [];
    },
    updateById() {
      throw new Error("updateById is not expected in this regression check.");
    },
    appendRecord() {
      throw new Error("appendRecord is not expected in this regression check.");
    }
  };
  context.TrustOpsPermissionService = {
    isOwnerOrAdmin(contextValue) {
      return contextValue && (contextValue.role === "Owner" || contextValue.role === "Admin");
    },
    isOwner(contextValue) {
      return contextValue && contextValue.role === "Owner";
    },
    requireAllowed(allowed, message) {
      if (!allowed) {
        throw new Error(message || "Not allowed.");
      }
    }
  };
  context.TrustOpsAuditService = {
    log() {}
  };
  return vm.createContext(context);
}

function main() {
  const context = makeContext();
  loadSource(context, "src/Config.js");
  loadSource(context, "src/ManagerPermissionService.js");

  const userDefaults = context.TrustOpsManagerPermissionService.effectiveForUser("user_1");
  expect(userDefaults.permissions["Can Manage Own Tasks"] === true, "Regular user defaults should keep Can Manage Own Tasks.");
  expect(userDefaults.permissions["Can Create Tasks"] === false, "Regular user defaults should not grant Can Create Tasks.");

  const ownerDefaults = context.TrustOpsManagerPermissionService.effectiveForUser("owner_1");
  expect(ownerDefaults.permissions["Can Manage Users"] === false, "Owner defaults in manager-permission rows should stay false.");

  const adminDefaults = context.TrustOpsManagerPermissionService.effectiveForUser("admin_1");
  expect(adminDefaults.permissions["Can Manage Settings"] === false, "Admin defaults in manager-permission rows should stay false.");

  const managerDefaults = context.TrustOpsManagerPermissionService.effectiveForUser("mgr_1");
  expect(managerDefaults.permissions["Can Create Tasks"] === true, "Manager defaults should grant Can Create Tasks.");
  expect(managerDefaults.permissions["Can Edit Tasks"] === true, "Manager defaults should grant Can Edit Tasks.");
  expect(managerDefaults.permissions["Can Create Time For Others"] === true, "Manager defaults should grant Can Create Time For Others.");
  expect(managerDefaults.permissions["Can Manage Projects"] === true, "Manager defaults should grant Can Manage Projects.");

  context.__setManagerPermissionRows([
    {
      "Manager Permission ID": "perm_1",
      "User ID": "mgr_1",
      Preset: context.TrustOpsConfig.MANAGER_PRESETS.BASIC,
      "Overrides JSON": JSON.stringify({
        "Can Approve Time Requests": true
      }),
      "Can View All Time": "true"
    }
  ]);
  context.TrustOpsManagerPermissionService.resetRequestCache();
  const overridden = context.TrustOpsManagerPermissionService.effectiveForUser("mgr_1");
  expect(overridden.preset === context.TrustOpsConfig.MANAGER_PRESETS.BASIC, "Preset did not round-trip from the manager permission row.");
  expect(overridden.permissions["Can Edit Tasks"] === false, "Basic preset should disable Can Edit Tasks.");
  expect(overridden.permissions["Can Manage Projects"] === false, "Basic preset should disable Can Manage Projects.");
  expect(overridden.permissions["Can View All Time"] === true, "Explicit column override should enable Can View All Time.");
  expect(overridden.permissions["Can Approve Time Requests"] === true, "Overrides JSON should enable Can Approve Time Requests.");

  const permissionSheet = context.TrustOpsConfig.SHEETS.MANAGER_PERMISSIONS;
  const readsAfterFirstLookup = context.__readCounts[permissionSheet];
  context.TrustOpsManagerPermissionService.managerCan({ userId: "mgr_1" }, "Can View All Time");
  context.TrustOpsManagerPermissionService.managerCan({ userId: "mgr_1" }, "Can Approve Time Requests");
  expect(
    context.__readCounts[permissionSheet] === readsAfterFirstLookup,
    "Repeated managerCan calls for the same user should reuse the request cache."
  );

  context.TrustOpsManagerPermissionService.resetRequestCache();
  context.TrustOpsManagerPermissionService.managerCan({ userId: "mgr_1" }, "Can View All Time");
  expect(
    context.__readCounts[permissionSheet] === readsAfterFirstLookup + 1,
    "resetRequestCache should force a fresh permission-table read."
  );

  console.log("manager permission regression check passed");
}

main();
