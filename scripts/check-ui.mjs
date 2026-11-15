// Checks two behaviours of the Folio interface in real browser engines (Chromium and WebKit) against
// the built app (`npm run build`, then `node scripts/serve-out.mjs`):
//  1. Export → PDF in the dark theme: the page never changes theme (while the book is typeset, at
//     print, after it, whether or not "afterprint" arrives) and the print book is still paper.
//  2. «a tope» on the cover asks first: cancel keeps the default, confirm selects it, and a new visit
//     starts at the default again.
// The export needs a saved study: pass one (`STUDY=file.json node scripts/measure-stalls.mjs …` saves it).
// Usage: node scripts/check-ui.mjs <study.json> [baseUrl]
import { readFileSync } from "node:fs";
import { chromium, webkit } from "@playwright/test";

const [studyFile, base = "http://localhost:4173"] = process.argv.slice(2);
if (!studyFile) throw new Error("usage: node scripts/check-ui.mjs <study.json> [baseUrl]");
const study = JSON.parse(readFileSync(studyFile, "utf8"));
let failed = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` (${detail})` : ""}`);
  if (!ok) failed++;
};

async function seed(page) {
  await page.goto(base + "/");
  await page.waitForFunction(() => window.CernoApp);
  await page.evaluate((st) => new Promise((res) => {
    const r = indexedDB.open("cerno", 4);
    r.onupgradeneeded = () => { for (const s of ["evals", "games", "meta", "maia", "peers"]) if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s); };
    r.onsuccess = () => { const tx = r.result.transaction("meta", "readwrite"); tx.objectStore("meta").put(st, "folio"); tx.oncomplete = () => { r.result.close(); res(); }; };
  }), study);
}

for (const [name, type] of [["chromium", chromium], ["webkit", webkit]]) {
  const browser = await type.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.on("pageerror", (e) => check(`${name}: no page error`, false, e.message));
  await seed(page);
  await page.goto(base + "/#/contents");
  await page.reload();
  await page.waitForFunction(() => window.F && window.F.exportPdf && window.CERNO_DATA);
  await page.evaluate(() => window.F.themeTo("dark"));
  // The theme change fades: wait until the colour settles.
  await page.waitForFunction(() => { const c = getComputedStyle(document.body).backgroundColor; const same = c === window.__lastBg; window.__lastBg = c; return same && c !== "rgb(245, 239, 227)"; }, null, { polling: 300 });
  const look = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const dark = await look();

  // 1. Export, with print stubbed (the dialog cannot open headless): sample the theme throughout.
  await page.evaluate(() => {
    window.__seen = new Set();
    const t = setInterval(() => window.__seen.add(getComputedStyle(document.body).backgroundColor), 4);
    window.__stop = () => clearInterval(t);
    window.print = () => {
      window.__seen.add(getComputedStyle(document.body).backgroundColor);
      const page = document.querySelector("#pv-book .pv-page");
      window.__paper = page && getComputedStyle(page).backgroundColor;
    };
  });
  await page.evaluate(() => window.F.exportPdf(() => {}));
  const seen = await page.evaluate(() => { window.__stop(); return [...window.__seen]; });
  check(`${name}: theme kept while typesetting and printing`, seen.length === 1 && seen[0] === dark, seen.join(", "));
  check(`${name}: the print book is paper`, (await page.evaluate(() => window.__paper)) === "rgb(245, 239, 227)", await page.evaluate(() => window.__paper));
  check(`${name}: theme kept without "afterprint"`, (await look()) === dark);
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  check(`${name}: book removed after "afterprint"`, !(await page.evaluate(() => !!document.getElementById("pv-book"))));
  check(`${name}: theme kept after "afterprint"`, (await look()) === dark);

  // 2. «a tope» asks first.
  const cover = async () => {
    await page.goto(base + "/#/");
    await page.reload();
    await page.waitForSelector("[data-load]");
  };
  const pressed = () => page.evaluate(() => document.querySelector("[data-load][aria-pressed=true]")?.dataset.load);
  await cover();
  check(`${name}: the cover starts at the default`, (await pressed()) === "soft");
  await page.click("[data-load=full]");
  await page.waitForSelector("dialog.xp-ask[open]");
  const text = await page.textContent("dialog.xp-ask .xp-q");
  check(`${name}: «a tope» opens the warning`, !!text, text);
  await page.click("dialog.xp-ask button[value=no]");
  await page.waitForTimeout(100);
  check(`${name}: cancel keeps the default`, (await pressed()) === "soft" && !(await page.$("dialog.xp-ask")));
  await page.click("[data-load=full]");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(100);
  check(`${name}: Escape keeps the default`, (await pressed()) === "soft" && !(await page.$("dialog.xp-ask")));
  await page.click("[data-load=full]");
  await page.click("dialog.xp-ask button[value=yes]");
  await page.waitForTimeout(100);
  check(`${name}: confirm selects «a tope»`, (await pressed()) === "full");
  await page.click("#cu").catch(() => {});
  await page.evaluate(() => { const u = document.querySelector("#cu"); if (u) u.value = ""; });
  await cover();
  check(`${name}: a new visit starts at the default`, (await pressed()) === "soft");
  await browser.close();
}
console.log(failed ? `${failed} failed` : "all passed");
process.exit(failed ? 1 : 0);
