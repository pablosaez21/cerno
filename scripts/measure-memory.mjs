// Memory of a real analysis in WebKit, as a phone would run it: the page's content process
// footprint (macOS `footprint`, which counts the WASM heaps of Stockfish and onnxruntime) every
// 1.5 s, with the stage the analysis is in. iPhone viewport and user agent, `cores` reported cores.
// macOS only. Fresh profile, so nothing comes from the cache.
//   node scripts/measure-memory.mjs <url> <chesscom-user> [games=25] [cores=6] [seconds=90]
import { devices, webkit } from "@playwright/test";
import { execSync } from "node:child_process";

const [url = "http://localhost:4173", user, games = "25", cores = "6", seconds = "90"] = process.argv.slice(2);
if (!user) throw new Error("usage: node scripts/measure-memory.mjs <url> <chesscom-user> [games] [cores] [seconds]");
const contentPids = () => new Set(execSync("pgrep -f WebContent || true").toString().split(/\s+/).filter(Boolean));
const before = contentPids();
const browser = await webkit.launch();
const ctx = await browser.newContext({ ...devices["iPhone 15 Pro"] });
await ctx.addInitScript((c) => Object.defineProperty(Navigator.prototype, "hardwareConcurrency", { get: () => c }), +cores);
const page = await ctx.newPage();
await page.goto(url);
await page.waitForFunction(() => window.CernoApp);
// Let the cover's calibration finish: it is not part of the analysis.
await page.waitForTimeout(12_000);
const pids = [...contentPids()].filter((p) => !before.has(p));
const mb = () =>
  pids
    .map((p) => {
      try {
        const m = execSync(`footprint -p ${p} 2>/dev/null`).toString().match(/phys_footprint:\s*([\d.]+)\s*(\w+)/);
        return m ? +m[1] * (m[2].startsWith("G") ? 1024 : m[2].startsWith("K") ? 1 / 1024 : 1) : 0;
      } catch {
        return 0;
      }
    })
    .reduce((a, b) => a + b, 0);
console.log(`before the analysis: ${Math.round(mb())} MB`);
await page.evaluate(([user, n]) => window.CernoApp.start({ src: "chesscom", user, n, timeClasses: ["blitz", "rapid"] }), [user, +games]);
let peak = 0;
const t0 = Date.now();
while (Date.now() - t0 < +seconds * 1000) {
  await page.waitForTimeout(1500);
  const m = mb();
  peak = Math.max(peak, m);
  const s = await page.evaluate(() => {
    const l = window.CernoApp.live;
    const run = Object.entries(l.stages).filter(([, v]) => v.state === "run").map(([k]) => k).join("+");
    return { status: l.status, run, workers: l.workers, backend: l.backend };
  });
  console.log(`${((Date.now() - t0) / 1000).toFixed(0)} s  ${Math.round(m)} MB  ${s.status} ${s.run} workers=${s.workers} maia=${s.backend ?? "-"}`);
  if (s.status !== "running") break;
}
console.log(`peak: ${Math.round(peak)} MB`);
await browser.close();
