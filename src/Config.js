var TrustOpsConfig = (function () {
  var ROLES = {
    OWNER: "Owner",
    ADMIN: "Admin",
    MANAGER: "Manager",
    USER: "User"
  };

  var SHEETS = {
    USERS: "Users",
    PROJECTS: "Projects",
    TASKS: "Tasks",
    TIME_ENTRIES: "Time Entries",
    TIME_CATEGORIES: "Time Categories",
    PAY_PERIODS: "Pay Periods",
    PAY_SUMMARIES: "Pay Summaries",
    AUDIT_LOG: "Audit Log",
    SETTINGS: "Settings",
    IMPORTED_TASKS: "Imported Tasks",
    LEGACY_ASSIGNMENT_BOARD: "Assignment Board"
  };

  var TABLES = {};
  TABLES[SHEETS.USERS] = {
    idColumn: "User ID",
    columns: [
      "User ID",
      "First Name",
      "Last Name",
      "Full Name",
      "Email",
      "Role",
      "Active",
      "Pay Type",
      "Hourly Rate",
      "Salary Amount",
      "Salary Frequency",
      "Track Time",
      "Track Pay",
      "Manager User ID",
      "Created At",
      "Updated At",
      "Archived"
    ]
  };
  TABLES[SHEETS.PROJECTS] = {
    idColumn: "Project ID",
    columns: [
      "Project ID",
      "Project Name",
      "Description",
      "Status",
      "Active",
      "Created At",
      "Updated At",
      "Archived"
    ]
  };
  TABLES[SHEETS.TASKS] = {
    idColumn: "Task ID",
    columns: [
      "Task ID",
      "Title",
      "Notes",
      "Status",
      "Due Date",
      "Assignees",
      "Assignee User IDs",
      "Project ID",
      "Project Name",
      "Priority",
      "Tags",
      "Created By User ID",
      "Created At",
      "Updated At",
      "Completed By User ID",
      "Completed At",
      "Source",
      "External Google Task Mirror IDs",
      "Chat Message Link",
      "Archived"
    ]
  };
  TABLES[SHEETS.TIME_ENTRIES] = {
    idColumn: "Time Entry ID",
    columns: [
      "Time Entry ID",
      "Date",
      "User ID",
      "User Name",
      "Entry Type",
      "Task ID",
      "Category ID",
      "Task / Category",
      "Project ID",
      "Project Name",
      "Hours",
      "Notes",
      "Pay Period ID",
      "Pay Period Label",
      "Created By User ID",
      "Created At",
      "Updated By User ID",
      "Updated At",
      "Locked",
      "Deleted"
    ]
  };
  TABLES[SHEETS.TIME_CATEGORIES] = {
    idColumn: "Category ID",
    columns: [
      "Category ID",
      "Category",
      "Default Project ID",
      "Default Project",
      "Active",
      "Created At",
      "Updated At",
      "Archived"
    ]
  };
  TABLES[SHEETS.PAY_PERIODS] = {
    idColumn: "Pay Period ID",
    columns: [
      "Pay Period ID",
      "Start Date",
      "End Date",
      "Pay Period Label",
      "Status",
      "Locked",
      "Locked By User ID",
      "Locked At",
      "Created At",
      "Updated At"
    ]
  };
  TABLES[SHEETS.PAY_SUMMARIES] = {
    idColumn: "Pay Summary ID",
    columns: [
      "Pay Summary ID",
      "Pay Period ID",
      "User ID",
      "User Name",
      "Total Hours",
      "Pay Type",
      "Hourly Rate",
      "Salary Amount",
      "Gross Pay",
      "Adjustments",
      "Notes",
      "Approved",
      "Approved By",
      "Approved At",
      "Snapshot",
      "Created At",
      "Updated At"
    ]
  };
  TABLES[SHEETS.AUDIT_LOG] = {
    idColumn: "Audit ID",
    columns: [
      "Audit ID",
      "Timestamp",
      "Actor User ID",
      "Actor Email",
      "Action",
      "Entity Type",
      "Entity ID",
      "Before JSON",
      "After JSON",
      "Notes"
    ]
  };
  TABLES[SHEETS.SETTINGS] = {
    idColumn: "Setting Key",
    columns: ["Setting Key", "Setting Value", "Description", "Updated At"]
  };

  var TASK_STATUSES = ["In Progress", "Complete", "Blocked", "Waiting", "Archived"];
  var PRIORITIES = ["Low", "Medium", "High", "Urgent"];
  var ENTRY_TYPES = {
    TASK: "Task",
    GENERAL: "General Time"
  };
  var PAY_PERIOD_STATUS = {
    OPEN: "Open",
    LOCKED: "Locked"
  };

  var DEFAULT_TIME_CATEGORIES = [
    "Drive Time",
    "Meeting",
    "Phone Call",
    "Bookkeeping",
    "Property Visit",
    "Errands/Supplies",
    "General Admin"
  ];

  function getSpreadsheetId() {
    var configuredId = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
    return configuredId || "";
  }

  return {
    APP_NAME: "Trust Ops",
    ROLES: ROLES,
    SHEETS: SHEETS,
    TABLES: TABLES,
    TASK_STATUSES: TASK_STATUSES,
    PRIORITIES: PRIORITIES,
    ENTRY_TYPES: ENTRY_TYPES,
    PAY_PERIOD_STATUS: PAY_PERIOD_STATUS,
    DEFAULT_TIME_CATEGORIES: DEFAULT_TIME_CATEGORIES,
    PAY_PERIOD_DAYS: 14,
    PAY_PERIOD_ANCHOR_DATE: "2026-04-26",
    getSpreadsheetId: getSpreadsheetId
  };
})();
