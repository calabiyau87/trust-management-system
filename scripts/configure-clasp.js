const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const claspPath = path.join(root, ".clasp.json");

function normalizeBranchName(value) {
  return String(value || "").trim();
}

function parseEnvFile(contents) {
  const values = {};
  const lines = String(contents || "").split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const equalsIndex = line.indexOf("=");
    if (equalsIndex === -1) {
      continue;
    }

    const key = line.slice(0, equalsIndex).trim();
    if (!key) {
      continue;
    }

    let value = line.slice(equalsIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    values[key] = value;
  }

  return values;
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  try {
    return parseEnvFile(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    return {};
  }
}

function loadLocalEnv() {
  const envFiles = [
    path.join(root, ".env"),
    path.join(root, ".env.local")
  ];

  for (const filePath of envFiles) {
    const values = loadEnvFile(filePath);
    for (const [key, value] of Object.entries(values)) {
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  }
}

function branchFromArgs(argv) {
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--branch" && argv[index + 1]) {
      return normalizeBranchName(argv[index + 1]);
    }

    if (arg.startsWith("--branch=")) {
      return normalizeBranchName(arg.slice("--branch=".length));
    }
  }

  return "";
}

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

function resolveBranch(argv = process.argv.slice(2)) {
  const argBranch = branchFromArgs(argv);
  if (argBranch) {
    return argBranch;
  }

  const explicitBranch = normalizeBranchName(process.env.TRUST_OPS_BRANCH || process.env.GITHUB_REF_NAME);
  if (explicitBranch) {
    return explicitBranch;
  }

  return currentBranch();
}

function resolveTarget(branch) {
  if (branch === "main") {
    return {
      envName: "TRUST_OPS_PRODUCTION_SCRIPT_ID",
      targetName: "production"
    };
  }

  if (branch === "testing") {
    return {
      envName: "TRUST_OPS_TESTING_SCRIPT_ID",
      targetName: "testing"
    };
  }

  return {
    envName: "TRUST_OPS_WORKING_SCRIPT_ID",
    targetName: "working"
  };
}

function main(argv = process.argv.slice(2)) {
  loadLocalEnv();

  const branch = resolveBranch(argv);
  const { envName, targetName } = resolveTarget(branch);
  const scriptId = String(process.env[envName] || "").trim();

  if (!scriptId) {
    console.error(`Missing ${envName}.`);
    console.error(`Set the ${targetName} Apps Script scriptId before pushing/deploying from branch '${branch || "(unknown)"}'.`);
    process.exit(1);
  }

  const config = {
    scriptId,
    rootDir: "src"
  };

  fs.writeFileSync(claspPath, `${JSON.stringify(config, null, 2)}\n`);
  console.log(`Configured .clasp.json for ${targetName} branch '${branch || "(unknown)"}'.`);
}

if (require.main === module) {
  main();
}

module.exports = {
  branchFromArgs,
  currentBranch,
  main,
  loadEnvFile,
  loadLocalEnv,
  normalizeBranchName,
  parseEnvFile,
  resolveBranch,
  resolveTarget
};
