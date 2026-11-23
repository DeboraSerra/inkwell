import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { APP_ENV, E2E_PORT } from "./env";

// The app as the browser tests see it, for checking by hand (npm run e2e:serve):
// a clean build into .next-e2e, then next start on port 3100, with .env.test's
// variables only. Start the emulator first (npm run e2e:emulator), then make the
// test user with npm run e2e:user.

const env = { ...process.env, ...APP_ENV };

const run = (command: string, args: string[]) =>
  new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: "inherit" });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${command} ${args.join(" ")} exited with ${code}`))));
  });

rmSync(".next-e2e", { recursive: true, force: true });
await run("npm", ["run", "build"]);
await run("npx", ["next", "start", "--port", String(E2E_PORT)]);
