const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

const requiredFiles = [
  "README.md",
  "package.json",
  ".clasp.json",
  "src/appsscript.json",
  "src/Code.js",
  "src/Config.js",
  "src/Utils.js",
  "src/SheetService.js",
  "src/AuthService.js",
  "src/PermissionService.js",
  "src/AuditService.js",
  "src/UserService.js",
  "src/ProjectService.js",
  "src/TaskService.js",
  "src/TimeService.js",
  "src/PayService.js",
  "src/SettingsService.js",
  "src/MigrationService.js",
  "src/ChatService.js",
  "src/GoogleTasksService.js",
  "src/GmailService.js",
  "src/CalendarService.js",
  "src/Index.html",
  "docs/architecture.md",
  "docs/data-model.md",
  "docs/permissions.md",
  "docs/deployment.md",
  "docs/roadmap.md"
];

function fail(message) {
  console.error(`static-check failed: ${message}`);
  process.exitCode = 1;
}

for (const relativePath of requiredFiles) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) {
    fail(`missing required file ${relativePath}`);
  }
}

for (const relativePath of ["package.json", ".clasp.json", "src/appsscript.json"]) {
  try {
    JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
  } catch (error) {
    fail(`${relativePath} is not valid JSON: ${error.message}`);
  }
}

const jsFiles = fs
  .readdirSync(path.join(root, "src"))
  .filter((name) => name.endsWith(".js"))
  .map((name) => path.join(root, "src", name));

for (const file of jsFiles) {
  const source = fs.readFileSync(file, "utf8");
  try {
    new Function(source);
  } catch (error) {
    fail(`${path.relative(root, file)} has a JavaScript syntax error: ${error.message}`);
  }
}

const indexHtml = fs.readFileSync(path.join(root, "src", "Index.html"), "utf8");
for (const needle of ["google.script.run", "Assignment Board", "Time Tracker", "Pay Summary"]) {
  if (!indexHtml.includes(needle)) {
    fail(`Index.html does not include expected text: ${needle}`);
  }
}

if (!process.exitCode) {
  console.log("static-check passed");
}
