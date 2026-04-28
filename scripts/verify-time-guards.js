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

function makeContext() {
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
    isNaN,
    setTimeout,
    clearTimeout
  };
  context.globalThis = context;
  context.self = context;
  context.window = context;
  context.TrustOpsUtils = {
    normalizeText,
    normalizeKey: (value) => normalizeText(value).toLowerCase(),
    normalizeOptionalLink: (value) => normalizeText(value),
    toBoolean,
    splitList: (value) => Array.isArray(value)
      ? value.map((item) => normalizeText(item)).filter(Boolean)
      : normalizeText(value).split(",").map((item) => item.trim()).filter(Boolean),
    requireValue(value, label) {
      if (!normalizeText(value)) {
        throw new Error(`${label} is required.`);
      }
      return value;
    },
    formatDateTime: (value) => normalizeText(value),
    formatDate: (value) => normalizeText(value),
    nowIso: () => "2026-04-27T12:00:00.000Z",
    parseDateTime: (value) => new Date(value),
    parseDate: (value) => new Date(value),
    hoursBetween: (start, end) => (new Date(end).getTime() - new Date(start).getTime()) / 3600000,
    toNumber: (value) => Number(value || 0),
    isBetweenInclusive: () => true,
    daysBetween: () => 0,
    addDays: (date, days) => {
      const next = new Date(date);
      next.setDate(next.getDate() + Number(days || 0));
      return next;
    },
    sanitizeForClient: (value) => value,
    recordsForClient: (value) => value,
    safeJson: (value) => JSON.stringify(value || {})
  };
  context.TrustOpsManagerPermissionService = {
    managerCan() {
      return false;
    }
  };
  const taskRows = {
    task_completed: {
      "Task ID": "task_completed",
      Title: "Completed task",
      Status: "Complete",
      Archived: false,
      "Created By User ID": "user-1",
      "Project ID": "project-1",
      "Child Task Count": 0
    },
    task_archived: {
      "Task ID": "task_archived",
      Title: "Archived task",
      Status: "Archived",
      Archived: true,
      "Created By User ID": "user-1",
      "Project ID": "project-1",
      "Child Task Count": 0
    }
  };
  context.TrustOpsAuthService = {
    getUserById(userId) {
      return {
        "User ID": userId,
        "Full Name": "Test User",
        Email: "user@example.com",
        Role: context.TrustOpsConfig.ROLES.USER,
        Active: true,
        "Track Time": true
      };
    }
  };
  context.TrustOpsSheetService = {
    findById(sheet, id) {
      if (sheet === context.TrustOpsConfig.SHEETS.TASKS) {
        return taskRows[id] || null;
      }
      if (sheet === context.TrustOpsConfig.SHEETS.PAY_PERIODS) {
        return {
          "Pay Period ID": "pay_1",
          "Pay Period Label": "Pay Period",
          "Start Date": "2026-04-27",
          "End Date": "2026-05-10",
          Locked: false,
          Status: "Open"
        };
      }
      if (sheet === context.TrustOpsConfig.SHEETS.USERS) {
        return null;
      }
      return null;
    },
    withLock(fn) {
      return fn();
    },
    appendRecord() {
      throw new Error("appendRecord should not be reached in the guard check.");
    },
    updateById() {
      throw new Error("updateById should not be reached in the guard check.");
    },
    readTable() {
      return [];
    },
    resetRequestCache() {},
    getSheet() {
      return null;
    },
    getHeaders() {
      return [];
    },
    findByColumn() {
      return [];
    }
  };
  context.TrustOpsTimeRequestService = {
    createRequest() {
      throw new Error("createRequest should not be reached in the guard check.");
    },
    listRequests() {
      return [];
    }
  };
  context.TrustOpsAuditService = {
    log() {}
  };
  context.TrustOpsPayService = {
    findPayPeriodForDate() {
      return {
        "Pay Period ID": "pay_1",
        "Pay Period Label": "Pay Period",
        "Start Date": "2026-04-27",
        "End Date": "2026-05-10",
        Locked: false,
        Status: "Open"
      };
    },
    isLocked() {
      return false;
    }
  };
  context.TrustOpsTaskService = {
    listIncompleteTasksForUser() {
      return [];
    }
  };
  return vm.createContext(context);
}

function expectThrows(fn, expectedMessage) {
  try {
    fn();
  } catch (error) {
    if (String(error.message || error) === expectedMessage) {
      return;
    }
    throw new Error(`Expected "${expectedMessage}", got "${error.message || error}"`);
  }
  throw new Error(`Expected "${expectedMessage}" to be thrown.`);
}

function main() {
  const context = makeContext();
  loadSource(context, "src/Config.js");
  loadSource(context, "src/PermissionService.js");
  loadSource(context, "src/TimeService.js");

  const completedTask = {
    userId: "user-1",
    entryType: "Task",
    taskId: "task_completed",
    date: "2026-04-27"
  };
  const archivedTask = {
    userId: "user-1",
    entryType: "Task",
    taskId: "task_archived",
    date: "2026-04-27"
  };

  expectThrows(() => context.TrustOpsTimeService.clockIn({ userId: "user-1", role: context.TrustOpsConfig.ROLES.USER }, completedTask), "Time cannot be added to a completed or archived task.");
  expectThrows(() => context.TrustOpsTimeService.clockIn({ userId: "user-1", role: context.TrustOpsConfig.ROLES.USER }, archivedTask), "Time cannot be added to a completed or archived task.");
  expectThrows(() => context.TrustOpsTimeService.clockTransfer({ userId: "user-1", role: context.TrustOpsConfig.ROLES.USER }, Object.assign({ punchSessionId: "punch_1" }, completedTask)), "Time cannot be added to a completed or archived task.");
  expectThrows(() => context.TrustOpsTimeService.clockTransfer({ userId: "user-1", role: context.TrustOpsConfig.ROLES.USER }, Object.assign({ punchSessionId: "punch_1" }, archivedTask)), "Time cannot be added to a completed or archived task.");

  console.log("time guard regression check passed");
}

main();
