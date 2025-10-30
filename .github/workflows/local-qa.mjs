import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const run = (command, options = {}) => {
  execSync(command, { stdio: "inherit", ...options });
};

console.log("Running Gold Shore local QA checks…");
run("npm run process-images");

const workspaceName = "apps/web";
const workspacePath = join(process.cwd(), workspaceName);
const hasWebWorkspace = existsSync(workspacePath);

if (hasWebWorkspace) {
  const env = { ...process.env, CI: "" };
  run(`npm --workspace ${workspaceName} install`, { env });
  run(`npm --workspace ${workspaceName} run build`, { env });
} else {
  console.warn(
    `Skipping ${workspaceName} checks because workspace directory was not found.`,
  );
}

console.log("\n⚑ Manual step: run 'npm run qa:lighthouse' to execute Lighthouse locally.");
