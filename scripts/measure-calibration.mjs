// Runs the cover's calibration (calibrateRamp) several times, each in a fresh browser context, and
// prints the nodes per second per worker count, what each added worker adds (in units of one worker)
// and the default worker count it gives. A few seconds of Stockfish per run.
// Usage: node scripts/measure-calibration.mjs [baseUrl] [runs]
import { chromium } from "@playwright/test";

const [base = "http://localhost:4173", runs = "3"] = process.argv.slice(2);
const browser = await chromium.launch({ headless: true, channel: "chromium" });
for (let i = 0; i < +runs; i++) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(base + "/");
  await page.waitForFunction(() => window.CernoApp);
  const t0 = Date.now();
  const [pace, loads] = await page.evaluate(() => window.CernoApp.calibrate().then(() => [JSON.parse(localStorage.getItem("cerno.pace")), window.CernoApp.loads(100)]));
  const c = pace.calib;
  const one = Math.max(c[1], (c[2] ?? 0) / 2);
  const curve = Object.keys(c).map((n) => `${n}: ${(c[n] / 1e6).toFixed(2)} M${n > 1 ? ` (+${((c[n] - c[n - 1]) / one).toFixed(2)})` : ""}`).join(" · ");
  console.log(`${Date.now() - t0} ms · ${curve} → ${loads.soft.workers} workers`);
  await ctx.close();
}
await browser.close();
