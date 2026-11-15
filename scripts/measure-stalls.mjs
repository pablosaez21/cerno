// Runs one analysis through the Folio app in headless Chromium (channel "chromium": real GPU and
// the Compute Pressure API) and prints, per phase, the frames, the frames later than 50 ms, the
// longest one, the page's long tasks and the CPU pressure states seen; then the run's timings and
// the wait screen's «Copiar diagnóstico» text. It loads the CPU for minutes: an analysis.
// Usage: node scripts/measure-stalls.mjs <baseUrl> <soft|full> <games> [chesscom-user]
//        STUDY=file.json also saves the finished study (to compare two builds).
import { writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const [base = "http://localhost:4173", load = "soft", n = "100", user = "pablosae"] = process.argv.slice(2);
const browser = await chromium.launch({
  headless: true,
  channel: "chromium",
  args: ["--disable-renderer-backgrounding", "--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows"],
});
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
await ctx.addInitScript(() => {
  const phase = () => {
    const L = window.CernoApp && window.CernoApp.live;
    if (!L || L.status !== "running") return L ? L.status : "boot";
    return ["fetch", "model", "pass1", "pass2", "maia", "cand", "ladder", "book"].filter((k) => L.stages[k] && L.stages[k].state === "run").join("+") || "between";
  };
  const S = (window.__stalls = { by: {}, pressure: {} });
  const rec = (k) => (S.by[k] ??= { frames: 0, over50: 0, max: 0, ms: 0, longTasks: 0, longMax: 0 });
  let last = 0;
  const loop = (t) => {
    if (last && !document.hidden) {
      const d = t - last;
      const r = rec(phase());
      r.frames++;
      r.ms += d;
      if (d > 50) r.over50++;
      if (d > r.max) r.max = Math.round(d);
    }
    last = t;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  new PerformanceObserver((l) => l.getEntries().forEach((e) => { const r = rec(phase()); r.longTasks++; r.longMax = Math.max(r.longMax, Math.round(e.duration)); })).observe({ type: "longtask" });
  try {
    new PressureObserver((rs) => rs.forEach((x) => { const p = (S.pressure[phase()] ??= {}); p[x.state] = (p[x.state] || 0) + 1; })).observe("cpu", { sampleInterval: 1000 });
  } catch {
    // No Compute Pressure API: no states.
  }
});
const page = await ctx.newPage();
page.on("pageerror", (e) => console.error("pageerror", e.message));
await page.goto(base + "/");
await page.waitForFunction(() => window.CernoApp && window.F);
console.log("calibration", await page.evaluate(() => window.CernoApp.calibrate().then(() => localStorage.getItem("cerno.pace"))));
await page.evaluate(({ load, n, user }) => {
  window.CernoApp.start({ src: "chesscom", user, n: +n, timeClasses: ["blitz", "rapid"], load });
  location.hash = "#/analysing";
}, { load, n, user });
const t0 = Date.now();
for (;;) {
  await page.waitForTimeout(15000);
  const s = await page.evaluate(() => {
    const L = window.CernoApp.live;
    return { status: L.status, workers: L.workers, limit: L.limit, stages: Object.entries(L.stages).filter(([, v]) => v.state === "run").map(([k, v]) => `${k} ${v.done}/${v.total}`).join(" ") };
  });
  console.error(Math.round((Date.now() - t0) / 1000) + "s", JSON.stringify(s));
  if (s.status !== "running") break;
}
if (process.env.STUDY) {
  const study = await page.evaluate(() => new Promise((res) => { const r = indexedDB.open("cerno"); r.onsuccess = () => { const q = r.result.transaction("meta").objectStore("meta").get("folio"); q.onsuccess = () => res(q.result); }; }));
  writeFileSync(process.env.STUDY, JSON.stringify(study));
}
const out = await page.evaluate(() => ({ stalls: window.__stalls, timings: window.__cernoRun && window.__cernoRun.timings, diagnostic: window.CernoApp.diagnostic ? window.CernoApp.diagnostic() : "" }));
for (const [k, v] of Object.entries(out.stalls.by)) console.log(`${k}: ${(v.ms / 1000).toFixed(0)} s · ${v.frames} frames · ${v.over50} over 50 ms · max ${v.max} ms · long tasks ${v.longTasks} (max ${v.longMax} ms) · ${JSON.stringify(out.stalls.pressure[k] || {})}`);
console.log(JSON.stringify(out.timings));
if (out.diagnostic) console.log("\n" + out.diagnostic);
await browser.close();
