import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const playwrightCli = require.resolve("@playwright/test/cli");
const tempRoot = await mkdtemp(path.join(tmpdir(), "cerno-e2e-"));
let exitCode = 1;

console.log(`E2E temporary data: ${tempRoot}`);

try {
  exitCode = await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [playwrightCli, "test", ...process.argv.slice(2)],
      {
        env: {
          ...process.env,
          CERNO_E2E_TEMP_ROOT: tempRoot,
        },
        shell: false,
        stdio: "inherit",
      },
    );
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
} finally {
  await new Promise((resolve) => setTimeout(resolve, 250));
  await rm(tempRoot, {
    force: true,
    maxRetries: 10,
    recursive: true,
    retryDelay: 100,
  });
}

process.exitCode = exitCode;
