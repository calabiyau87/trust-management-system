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

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function expect(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function makeContext() {
  const calls = {
    ensureAllSheets: 0,
    sheetReset: 0,
    managerReset: 0
  };
  let lastTemplate = null;
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
    URL,
    encodeURIComponent,
    decodeURIComponent,
    parseInt,
    parseFloat,
    isNaN
  };
  context.globalThis = context;
  context.self = context;
  context.window = context;
  context.__calls = calls;
  context.__lastTemplate = function () {
    return lastTemplate;
  };
  context.TrustOpsUtils = {
    normalizeText,
    sanitizeForClient: (value) => value,
    clone,
    toBoolean(value) {
      const text = normalizeText(value).toLowerCase();
      return value === true || value === 1 || text === "true" || text === "yes" || text === "1";
    }
  };
  context.TrustOpsAuthService = {
    getGoogleClientId() {
      return "client-id.apps.googleusercontent.com";
    },
    getGithubPagesAuthUrl() {
      return "https://example.github.io/trust-management-system/";
    },
    requireAuthorizedUser(token) {
      context.__lastAuthToken = token;
      return {
        userId: "usr_1",
        email: "user@example.com",
        fullName: "Example User",
        role: "Owner",
        user: {
          "User ID": "usr_1",
          "Full Name": "Example User",
          Email: "user@example.com",
          Role: "Owner",
          "Google Profile Photo URL": ""
        },
        googleProfile: {
          email: "user@example.com",
          name: "Example User",
          picture: "https://example.com/avatar.png"
        }
      };
    }
  };
  context.TrustOpsSheetService = {
    resetRequestCache() {
      calls.sheetReset += 1;
    },
    ensureAllSheets() {
      calls.ensureAllSheets += 1;
    }
  };
  context.TrustOpsManagerPermissionService = {
    CAPABILITIES: ["Can Manage Things"],
    PERMISSION_GROUPS: [
      {
        key: "admin",
        label: "Administration",
        capabilities: ["Can Manage Things"]
      }
    ],
    resetRequestCache() {
      calls.managerReset += 1;
    },
    listManagerPermissions() {
      return [{ "Manager Permission ID": "perm_1" }];
    },
    listUserPermissions() {
      return [{ "User ID": "usr_1" }];
    }
  };
  context.TrustOpsPermissionService = {
    getClientPermissions() {
      return { canManageSettings: true };
    },
    isOwnerOrAdmin() {
      return true;
    },
    canManageSettings() {
      return true;
    }
  };
  context.TrustOpsUserService = {
    listUsers() {
      return [{ "User ID": "usr_1", Email: "user@example.com" }];
    }
  };
  context.TrustOpsProjectService = {
    listProjects() {
      return [{ "Project ID": "prj_1" }];
    },
    listCategories() {
      return [{ "Category ID": "cat_1" }];
    },
    getProjectDashboard() {
      return { totals: { projects: 1 } };
    }
  };
  context.TrustOpsTagService = {
    listTags() {
      return [{ "Tag ID": "tag_1" }];
    }
  };
  context.TrustOpsBoardViewService = {
    listBoardViews() {
      return [{ "Board View ID": "view_1" }];
    }
  };
  context.TrustOpsPayService = {
    getCurrentPayPeriod() {
      return { "Pay Period ID": "pay_1" };
    },
    listPayPeriods() {
      return [{ "Pay Period ID": "pay_1" }];
    },
    listActivePayUsers() {
      return [{ "User ID": "usr_1" }];
    },
    getPaySummary() {
      return { totals: { hours: 8 } };
    }
  };
  context.TrustOpsTaskService = {
    listTasks() {
      return [{ "Task ID": "tsk_1" }];
    }
  };
  context.TrustOpsTimeService = {
    getTrackerData() {
      return { entries: [] };
    }
  };
  context.TrustOpsTimeRequestService = {
    listRequests() {
      return [{ "Time Edit Request ID": "req_1" }];
    }
  };
  context.TrustOpsSettingsService = {
    listSettings() {
      return [{ "Setting Key": "ORGANIZATION_NAME", "Setting Value": "Trust Ops Org" }];
    },
    getOrganizationName() {
      return "Trust Ops Org";
    },
    getClientVisualSettings() {
      return { accent: "#235d57" };
    }
  };
  context.ScriptApp = {
    getService() {
      return {
        getUrl() {
          return "https://script.google.com/macros/u/1/s/AKfycb-test/exec?usp=drivesdk#ignored";
        }
      };
    }
  };
  context.HtmlService = {
    XFrameOptionsMode: {
      ALLOWALL: "ALLOWALL"
    },
    createTemplateFromFile(name) {
      lastTemplate = {
        __name: name,
        googleClientId: "",
        githubAuthUrl: "",
        webAppUrl: "",
        initialAuthToken: "",
        evaluate() {
          const response = {
            title: "",
            xFrameOptionsMode: "",
            setTitle(title) {
              this.title = title;
              return this;
            },
            setXFrameOptionsMode(mode) {
              this.xFrameOptionsMode = mode;
              return this;
            }
          };
          response.__template = this;
          return response;
        }
      };
      return lastTemplate;
    }
  };
  return vm.createContext(context);
}

function main() {
  const context = makeContext();
  loadSource(context, "src/Config.js");
  loadSource(context, "src/Code.js");

  const canonicalUrl = context.canonicalizeWebAppUrl_("https://script.google.com/macros/u/1/s/AKfycb-test/exec?usp=drivesdk#ignored");
  expect(
    canonicalUrl === "https://script.google.com/macros/s/AKfycb-test/exec",
    `canonicalizeWebAppUrl_ returned ${canonicalUrl}`
  );

  const rendered = context.doGet({
    parameter: {
      trust_ops_token: " token-123 "
    }
  });
  const template = context.__lastTemplate();
  expect(template, "doGet did not create an HTML template.");
  expect(template.googleClientId === "client-id.apps.googleusercontent.com", "doGet did not pass the Google client ID.");
  expect(template.githubAuthUrl === "https://example.github.io/trust-management-system/", "doGet did not pass the GitHub Pages auth URL.");
  expect(template.webAppUrl === "https://script.google.com/macros/s/AKfycb-test/exec", "doGet did not canonicalize the web app URL.");
  expect(template.initialAuthToken === "token-123", "doGet did not normalize the initial auth token.");
  expect(rendered.title === "Trust Ops", "doGet did not set the HTML title.");
  expect(rendered.xFrameOptionsMode === "ALLOWALL", "doGet did not set the XFrame options mode.");

  const initialData = context.getInitialData();
  expect(initialData.organizationName === "Trust Ops Org", "getInitialData returned the wrong organization name.");
  expect(
    Object.prototype.hasOwnProperty.call(initialData.constants, "permissionGroups"),
    "getInitialData.constants.permissionGroups is missing."
  );
  expect(
    !Object.prototype.hasOwnProperty.call(initialData, "permissionGroups"),
    "getInitialData still exposes top-level permissionGroups."
  );
  expect(initialData.googleProfile.picture === "https://example.com/avatar.png", "getInitialData lost the Google profile picture.");
  expect(initialData.currentUser["Google Profile Photo URL"] === "https://example.com/avatar.png", "getInitialData did not backfill the Google profile picture.");

  const refreshed = context.refreshAppData({
    taskFilters: { status: "In Progress" },
    timeFilters: { userId: "usr_1" },
    payFilters: { userId: "usr_1" },
    projectFilters: { rangeMode: "current" }
  });
  expect(refreshed.organizationName === "Trust Ops Org", "refreshAppData returned the wrong organization name.");
  expect(
    !Object.prototype.hasOwnProperty.call(refreshed, "permissionGroups"),
    "refreshAppData still exposes top-level permissionGroups."
  );
  expect(context.__calls.ensureAllSheets === 1, `ensureAllSheets was called ${context.__calls.ensureAllSheets} times.`);
  expect(context.__calls.sheetReset >= 3, `Sheet cache reset ran ${context.__calls.sheetReset} times, expected at least 3.`);
  expect(context.__calls.managerReset >= 3, `Manager permission cache reset ran ${context.__calls.managerReset} times, expected at least 3.`);

  console.log("auth/config regression check passed");
}

main();
