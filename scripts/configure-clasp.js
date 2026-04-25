const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const claspPath = path.join(root, ".clasp.json");

function currentBranch() {
  try {
    return execFileSync("git", ["branch", "--show-current"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch (error) {
    try {
      const head = fs.readFileSync(path.join(root, ".git", "HEAD"), "utf8").trim();
      const prefix = "ref: refs/heads/";
      return head.startsWith(prefix) ? head.slice(prefix.length) : "";
    } catch (headError) {
      return "";
    }
  }
}

const branch = currentBranch();
const isProductionBranch = branch === "main";
const envName = isProductionBranch ? "TRUST_OPS_PRODUCTION_SCRIPT_ID" : "TRUST_OPS_TESTING_SCRIPT_ID";
const scriptId = String(process.env[envName] || "").trim();

if (!scriptId) {
  console.error(`Missing ${envName}.`);
  console.error(
    isProductionBranch
      ? "Set the production Apps Script scriptId before pushing/deploying from main."
      : `Set the testing Apps Script scriptId before pushing/deploying from branch '${branch || "(unknown)"}'.`
  );
  process.exit(1);
}

const config = {
  scriptId,
  rootDir: "src"
};

fs.writeFileSync(claspPath, `${JSON.stringify(config, null, 2)}\n`);
console.log(`Configured .clasp.json for ${isProductionBranch ? "production" : "testing"} branch '${branch || "(unknown)"}'.`);
