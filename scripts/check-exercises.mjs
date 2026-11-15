// Offline browser verification of the shipped Folio scripts; no server or
// network. Usage: node scripts/check-exercises.mjs <folio-data.json> [screenshot-dir]
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { chromium, webkit } from "@playwright/test";

const [file, screenshots] = process.argv.slice(2);
if (!file) throw new Error("usage: node scripts/check-exercises.mjs <folio-data.json> [screenshot-dir]");
const saved = JSON.parse(fs.readFileSync(file, "utf8"));
const data = saved.data ?? saved;
const host = fs.readFileSync("src/folio/host.ts", "utf8");
const scripts = JSON.parse(host.match(/FOLIO_SCRIPTS = (\[[^;]+\])/)[1]);
const shell = '<aside id="ribbon" class="ribbon"></aside><div class="shell"><header id="runhead" class="runhead"></header><div id="deskhead" class="desk-head"></div><main id="main" tabindex="-1"></main><footer id="colophon"></footer></div><nav id="dock" class="dock"></nav>';
const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/folio/styles.css"><link rel="stylesheet" href="/folio/figurines.css"></head><body>${shell}${scripts.map((s) => `<script src="/folio/${s}"></script>`).join("")}<script>addEventListener('hashchange',()=>F.render());F.render();</script></body></html>`;
const ex = Object.entries(data.exercises).flatMap(([category, xs]) => xs.map((x, i) => ({ ...x, route: `/exercises/${category}/${i + 1}` }))).find((x) => x.explanation?.played.facts.some((f) => f.kind === "hanging"));
assert.ok(ex, "study must contain an explained hanging-piece exercise");
if (screenshots) fs.mkdirSync(screenshots, { recursive: true });

for (const [name, type] of [["chromium", chromium], ["webkit", webkit]]) {
  const browser = await type.launch({ headless: true });
  try {
    for (const width of [1440, 768, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: "reduce" });
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.route("**/*", async (route) => {
        const url = new URL(route.request().url());
        if (url.origin !== "http://cerno.test") return route.abort();
        if (url.pathname === "/") return route.fulfill({ contentType: "text/html", body: html });
        const local = path.resolve("public", "." + url.pathname);
        if (!local.startsWith(path.resolve("public") + path.sep) || !fs.existsSync(local)) return route.fulfill({ status: 404, body: "" });
        const contentType = local.endsWith(".js") ? "text/javascript" : local.endsWith(".css") ? "text/css" : local.endsWith(".svg") ? "image/svg+xml" : "application/octet-stream";
        return route.fulfill({ contentType, body: fs.readFileSync(local) });
      });
      await page.addInitScript((data) => { window.CERNO_DATA = data; }, data);
      await page.goto(`http://cerno.test/?lang=es&motion=reduced#${ex.route}`);
      const why = page.locator("[data-explanation]");
      await page.locator("[data-reveal]").waitFor();
      assert.equal(await why.isVisible(), false, "no spoiler controls before solving");
      assert.equal(await page.locator("[data-reveal]").evaluate((el) => el.scrollWidth <= el.clientWidth), true, "solution label fits");
      await page.locator("[data-reveal]").press("Enter");
      assert.equal(await why.isVisible(), true);
      assert.equal(await why.locator("[data-why-line]").count(), 2);
      await page.locator('[data-why-line="played"]').click();
      await page.locator('[data-why-step="next"]').click();
      const actual = await page.evaluate(() => window.F.boards[0].fen);
      const expected = await page.evaluate((x) => window.CernoBoard.applyUci(x.fen, x.played.uci), ex);
      assert.equal(actual, expected, "played line starts with the move from the game");
      await page.locator('[data-why-step="prev"]').click();
      assert.equal(await page.evaluate(() => window.F.boards[0].fen), ex.fen);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "no horizontal page overflow");
      if (screenshots) await page.locator("#main").screenshot({ path: path.join(screenshots, `${name}-${width}.png`) });
      await page.reload();
      assert.equal(await why.isVisible(), true, "revealed state survives reload");
      assert.deepEqual(errors, [], "no browser errors");
      console.log(`ok ${name} ${width}px: hidden until reveal, both lines, manual steps, saved state, no overflow`);
      await page.close();
    }
  } finally { await browser.close(); }
}
