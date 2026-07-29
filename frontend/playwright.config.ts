import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const frontendRoot = process.cwd();
const repositoryRoot = path.resolve(frontendRoot, "..");
const e2eTempRoot =
  process.env.CERNO_E2E_TEMP_ROOT ??
  mkdtempSync(path.join(tmpdir(), "cerno-e2e-"));

function firstExecutable(
  configured: string | undefined,
  candidates: string[],
  fallback: string,
): string {
  if (configured) return configured;
  return candidates.find((candidate) => existsSync(candidate)) ?? fallback;
}

const python = firstExecutable(
  process.env.E2E_PYTHON,
  [
    path.join(repositoryRoot, "venv", "Scripts", "python.exe"),
    path.join(repositoryRoot, ".venv", "Scripts", "python.exe"),
    path.join(repositoryRoot, "venv", "bin", "python"),
    path.join(repositoryRoot, ".venv", "bin", "python"),
  ],
  process.platform === "win32" ? "python" : "python3",
);

const stockfish = firstExecutable(
  process.env.TEST_STOCKFISH_PATH ?? process.env.STOCKFISH_PATH,
  [
    path.join(repositoryRoot, "engines", "stockfish.exe"),
    "/usr/games/stockfish",
    "/usr/bin/stockfish",
  ],
  "stockfish",
);

function quote(value: string): string {
  return `"${value.replaceAll('"', '\\"')}"`;
}

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
  ],
  outputDir: "test-results",
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: "node e2e/support/lichess-fixture-server.mjs",
      cwd: frontendRoot,
      url: "http://127.0.0.1:4300/health",
      timeout: 15_000,
      reuseExistingServer: false,
    },
    {
      command: `${quote(python)} -m uvicorn app.main:app --host 127.0.0.1 --port 8100`,
      cwd: repositoryRoot,
      url: "http://127.0.0.1:8100/health",
      timeout: 60_000,
      reuseExistingServer: false,
      env: {
        ...process.env,
        BACKEND_CORS_ORIGINS: "http://127.0.0.1:3100",
        CHROMA_PATH: path.join(e2eTempRoot, "chroma"),
        FRONTEND_ORIGIN: "http://127.0.0.1:3100",
        LICHESS_API_BASE_URL: "http://127.0.0.1:4300",
        MAX_GAMES_PER_ANALYSIS: "1",
        MAX_STOCKFISH_DEPTH: "1",
        OPENAI_API_KEY: "",
        PYTHONUNBUFFERED: "1",
        STOCKFISH_PATH: stockfish,
      },
    },
    {
      command: "node .next/standalone/server.js",
      cwd: frontendRoot,
      url: "http://127.0.0.1:3100",
      timeout: 60_000,
      reuseExistingServer: false,
      env: {
        ...process.env,
        HOSTNAME: "127.0.0.1",
        NEXT_PUBLIC_API_BASE_URL: "http://127.0.0.1:8100",
        NEXT_TELEMETRY_DISABLED: "1",
        PORT: "3100",
      },
    },
  ],
});
