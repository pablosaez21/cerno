// M0.2: Maia-3 speed in Chromium on the player's positions (30 s or more on
// the clock) of the last report in /lab. Uses a persistent profile so the
// Stockfish analysis is done once.
// Usage: node scripts/maia/measure-browser.mjs <profileDir> <chesscom-user> [baseUrl]
import { chromium } from "@playwright/test";

const [profile, user, base = "http://localhost:4173"] = process.argv.slice(2);
const ctx = await chromium.launchPersistentContext(profile, {
  // Headless Chromium only has a software WebGPU adapter (SwiftShader); HEADED=1 uses the real GPU.
  headless: !process.env.HEADED,
  args: ["--enable-unsafe-webgpu", "--enable-features=WebGPU"],
  viewport: { width: 1200, height: 900 },
});
const page = await ctx.newPage();
page.on("pageerror", (e) => console.error("pageerror", e.message));
await page.goto(`${base}/lab`);
console.log("webgpu adapter:", await page.evaluate(async () => !!(navigator.gpu && (await navigator.gpu.requestAdapter()))));
if (!(await page.getByRole("button", { name: "Medir" }).isVisible().catch(() => false))) {
  await page.getByLabel("Usuario").fill(user);
  await page.getByRole("button", { name: "Analizar" }).click();
  await page.getByTestId("timings").waitFor({ timeout: 20 * 60 * 1000 });
}
const configs = [
  ["maia3-5m", false, 64, false], ["maia3-5m", false, 256, false], ["maia3-5m", true, 64, false], ["maia3-5m", true, 256, false],
  ["maia3-23m", false, 128, false], ["maia3-23m", true, 128, false],
  ["maia3-5m", false, 128, true], ["maia3-5m", true, 128, true],
];
for (const [model, gpu, batch, load] of configs) {
  await page.getByLabel("Modelo Maia").selectOption(model);
  const g = page.getByLabel("WebGPU si hay");
  if ((await g.isChecked()) !== gpu) await g.click();
  await page.getByLabel("Lote Maia").fill(String(batch));
  const l = page.getByLabel("con Stockfish en marcha");
  if ((await l.isChecked()) !== load) await l.click();
  const before = (await page.getByTestId("maia-bench").textContent()).split("\n").filter(Boolean).length;
  await page.getByRole("button", { name: "Medir" }).click();
  await page.waitForFunction((n) => document.querySelector('[data-testid="maia-bench"]').textContent.split("\n").filter(Boolean).length > n, before, { timeout: 15 * 60 * 1000 });
  console.log((await page.getByTestId("maia-bench").textContent()).split("\n").filter(Boolean).at(-1));
}
await ctx.close();
