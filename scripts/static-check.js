const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

const requiredFiles = [
  "README.md",
  "package.json",
  ".env.example",
  ".clasp.example.json",
  "AGENTS.md",
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
  "src/TagService.js",
  "src/BoardViewService.js",
  "src/ManagerPermissionService.js",
  "src/TimeRequestService.js",
  "src/ChatService.js",
  "src/GoogleTasksService.js",
  "src/GmailService.js",
  "src/CalendarService.js",
  "src/Index.html",
  "docs/architecture.md",
  "docs/data-model.md",
  "docs/permissions.md",
  "docs/deployment.md",
  "docs/index.html",
  "docs/.nojekyll",
  ".github/workflows/clasp-sync.yml",
  "docs/roadmap.md",
  "docs/agents/backend-agent.md",
  "docs/agents/frontend-agent.md",
  "docs/agents/data-agent.md",
  "docs/agents/qa-agent.md",
  "docs/agents/release-agent.md",
  "docs/agents/performance-agent.md",
  "docs/agents/ux-ui-designer.md",
  "scripts/verify-auth-config.js",
  "scripts/verify-manager-permissions.js",
  "scripts/verify-sheet-service.js",
  "scripts/verify-time-guards.js"
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

for (const relativePath of ["package.json", ".clasp.example.json", "src/appsscript.json"]) {
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
for (const forbidden of ["window.open(", "launchGithubAuthPopup"]) {
  if (indexHtml.includes(forbidden)) {
    fail(`Index.html still includes obsolete auth popup code: ${forbidden}`);
  }
}

const scriptMatches = [...indexHtml.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)];
scriptMatches.forEach((match, index) => {
  try {
    new Function(match[1]);
  } catch (error) {
    fail(`Index.html inline script ${index + 1} has a JavaScript syntax error: ${error.message}`);
  }
});

const pagesIndexHtml = fs.readFileSync(path.join(root, "docs", "index.html"), "utf8");
for (const needle of ["Trust Ops Sign-In", "Google Sign-In", "google.accounts.id.renderButton"]) {
  if (!pagesIndexHtml.includes(needle)) {
    fail(`docs/index.html does not include expected text: ${needle}`);
  }
}

const pagesScriptMatches = [...pagesIndexHtml.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)];
pagesScriptMatches.forEach((match, index) => {
  try {
    new Function(match[1]);
  } catch (error) {
    fail(`docs/index.html inline script ${index + 1} has a JavaScript syntax error: ${error.message}`);
  }
});

const tmpInlinePath = path.join(root, "tmp-inline.js");
if (fs.existsSync(tmpInlinePath)) {
  fail("tmp-inline.js should not be tracked in the repository.");
}

const envExample = fs.readFileSync(path.join(root, ".env.example"), "utf8");
const envEntries = Object.fromEntries(
  envExample
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const separator = line.indexOf("=");
      return [line.slice(0, separator), line.slice(separator + 1)];
    })
);
[
  "TRUST_OPS_PRODUCTION_SCRIPT_ID",
  "TRUST_OPS_TESTING_SCRIPT_ID",
  "TRUST_OPS_WORKING_SCRIPT_ID",
  "GOOGLE_OAUTH_CLIENT_ID",
  "TRUST_OPS_GITHUB_PAGES_AUTH_URL"
].forEach((key) => {
  const value = envEntries[key] || "";
  if (!value || !value.startsWith("REPLACE_WITH_")) {
    fail(`.env.example must use obvious placeholder values for ${key}.`);
  }
});

const deploymentDoc = fs.readFileSync(path.join(root, "docs", "deployment.md"), "utf8");
if (!deploymentDoc.includes("same-page")) {
  fail("docs/deployment.md must describe the same-page GitHub auth bridge flow.");
}

if (!process.exitCode) {
  console.log("static-check passed");
}
