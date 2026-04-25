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
    TAGS: "Tags",
    PAY_PERIODS: "Pay Periods",
    PAY_SUMMARIES: "Pay Summaries",
    AUDIT_LOG: "Audit Log",
    SETTINGS: "Settings",
    BOARD_VIEWS: "Board Views",
    MANAGER_PERMISSIONS: "Manager Permissions",
    TIME_EDIT_REQUESTS: "Time Edit Requests",
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
      "Profile Color",
      "Theme Mode",
      "Google Profile Photo URL",
      "Profile Image URL",
      "Profile Image File ID",
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
  TABLES[SHEETS.TAGS] = {
    idColumn: "Tag ID",
    columns: [
      "Tag ID",
      "Tag",
      "Color",
      "Description",
      "Active",
      "Created By User ID",
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
      "Effective Hourly Rate",
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
  TABLES[SHEETS.BOARD_VIEWS] = {
    idColumn: "Board View ID",
    columns: [
      "Board View ID",
      "View Name",
      "Visibility",
      "Owner User ID",
      "Filters JSON",
      "Grouping",
      "Sort JSON",
      "Columns JSON",
      "Created At",
      "Updated At",
      "Archived"
    ]
  };
  TABLES[SHEETS.MANAGER_PERMISSIONS] = {
    idColumn: "Manager Permission ID",
    columns: [
      "Manager Permission ID",
      "User ID",
      "Preset",
      "Overrides JSON",
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
      "Can Manage Board Views",
      "Can Manage Settings",
      "Can Change Profile Color",
      "Updated By User ID",
      "Updated At"
    ]
  };
  TABLES[SHEETS.TIME_EDIT_REQUESTS] = {
    idColumn: "Time Edit Request ID",
    columns: [
      "Time Edit Request ID",
      "Request Type",
      "Status",
      "Requested By User ID",
      "Requested By Name",
      "Target User ID",
      "Time Entry ID",
      "Pay Period ID",
      "Pay Period Label",
      "Before JSON",
      "After JSON",
      "Reason",
      "Decision Notes",
      "Decided By User ID",
      "Decided At",
      "Created At",
      "Updated At"
    ]
  };

  var TASK_STATUSES = ["In Progress", "Complete", "Blocked", "Waiting", "Archived"];
  var PROJECT_STATUSES = ["Not Started", "In Progress", "Holding", "Completed", "Archived"];
  var PRIORITIES = ["Low", "Medium", "High", "Urgent"];
  var ENTRY_TYPES = {
    TASK: "Task",
    GENERAL: "General Time"
  };
  var PAY_PERIOD_STATUS = {
    OPEN: "Open",
    LOCKED: "Locked"
  };
  var REQUEST_STATUS = {
    PENDING: "Pending",
    APPROVED: "Approved",
    REJECTED: "Rejected"
  };
  var REQUEST_TYPES = {
    CREATE: "Create",
    EDIT: "Edit",
    DELETE: "Delete"
  };
  var VIEW_VISIBILITY = {
    PRIVATE: "Private",
    SHARED: "Shared"
  };
  var MANAGER_PRESETS = {
    BASIC: "Basic",
    OPERATIONS: "Operations",
    ADMIN_LIKE: "Admin Like"
  };

  var THEME_MODES = ["System", "Light", "Dark"];

  var DEFAULT_TASK_STATUS_COLORS = {
    "In Progress": "#647181",
    "Complete": "#2f7351",
    "Blocked": "#a23a3a",
    "Waiting": "#9a6a16",
    "Archived": "#647181"
  };

  var DEFAULT_PROJECT_STATUS_COLORS = {
    "Not Started": "#647181",
    "In Progress": "#1f6f68",
    "Holding": "#9a6a16",
    "Completed": "#2f7351",
    "Archived": "#647181"
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
    PROJECT_STATUSES: PROJECT_STATUSES,
    PRIORITIES: PRIORITIES,
    ENTRY_TYPES: ENTRY_TYPES,
    PAY_PERIOD_STATUS: PAY_PERIOD_STATUS,
    REQUEST_STATUS: REQUEST_STATUS,
    REQUEST_TYPES: REQUEST_TYPES,
    VIEW_VISIBILITY: VIEW_VISIBILITY,
    MANAGER_PRESETS: MANAGER_PRESETS,
    THEME_MODES: THEME_MODES,
    DEFAULT_TASK_STATUS_COLORS: DEFAULT_TASK_STATUS_COLORS,
    DEFAULT_PROJECT_STATUS_COLORS: DEFAULT_PROJECT_STATUS_COLORS,
    DEFAULT_TIME_CATEGORIES: DEFAULT_TIME_CATEGORIES,
    PAY_PERIOD_DAYS: 14,
    PAY_PERIOD_ANCHOR_DATE: "2026-04-26",
    getSpreadsheetId: getSpreadsheetId
  };
})();
