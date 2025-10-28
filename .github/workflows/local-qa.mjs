import { execSync } from "node:child_process";

const run = (command, options = {}) => {
  execSync(command, { stdio: "inherit", ...options });
};

console.log("Running Gold Shore local QA checks…");
run("npm run process-images");
run("npm --workspace apps/web install", { env: { ...process.env, CI: "" } });
run("npm --workspace apps/web run build", { env: { ...process.env, CI: "" } });

console.log("\n⚑ Manual step: run 'npm run qa:lighthouse' to execute Lighthouse locally.");
