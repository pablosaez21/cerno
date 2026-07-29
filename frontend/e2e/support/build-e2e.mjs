import { spawn } from "node:child_process";
import { cpSync, existsSync } from "node:fs";
import path from "node:path";

const npmCli = process.env.npm_execpath;
if (!npmCli) {
  throw new Error("npm_execpath is required to run the E2E production build.");
}

const buildCode = await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [npmCli, "run", "build"], {
    env: {
      ...process.env,
      NEXT_PUBLIC_API_BASE_URL: "http://127.0.0.1:8100",
      NEXT_TELEMETRY_DISABLED: "1",
    },
    shell: false,
    stdio: "inherit",
  });

  child.once("error", reject);
  child.once("exit", (code) => resolve(code ?? 1));
});

if (buildCode !== 0) {
  process.exitCode = buildCode;
} else {
  const standaloneRoot = path.resolve(".next", "standalone");
  cpSync(path.resolve(".next", "static"), path.join(standaloneRoot, ".next", "static"), {
    recursive: true,
  });

  const publicRoot = path.resolve("public");
  if (existsSync(publicRoot)) {
    cpSync(publicRoot, path.join(standaloneRoot, "public"), { recursive: true });
  }
}
