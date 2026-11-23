import { spawn } from "node:child_process";
import { PROJECT_ID } from "./env";

// The Auth emulator for .env.test's "demo-" project (npm run e2e:emulator).
// Started without --project, it signs tokens for another project, which the
// app's Admin SDK then rejects, and the setup can't delete its accounts.
const child = spawn("npx", ["firebase", "emulators:start", "--only", "auth", "--config", "e2e/firebase.json", "--project", PROJECT_ID || "demo-inkwell"], {
  stdio: "inherit",
});
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 0));
