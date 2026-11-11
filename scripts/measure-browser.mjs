// Hito 0 in a real browser: runs /lab against a username with an empty cache
// and prints the timings the page reports.
// Usage: node scripts/measure-browser.mjs <chesscom-user> [games] [baseUrl]
import { chromium } from "@playwright/test";

const [user, games = "100", base = "http://localhost:4173"] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();
page.on("pageerror", (e) => console.error("pageerror", e.message));
await page.goto(`${base}/lab`);
console.log("hardwareConcurrency", await page.evaluate(() => navigator.hardwareConcurrency));
await page.getByLabel("Usuario").fill(user);
await page.getByLabel("Partidas").fill(games);
await page.getByRole("button", { name: "Analizar" }).click();
const t0 = Date.now();
const timer = setInterval(async () => console.error(Math.round((Date.now() - t0) / 1000) + "s", await page.getByTestId("progress").textContent()), 30000);
await page.getByTestId("timings").waitFor({ timeout: 30 * 60 * 1000 });
clearInterval(timer);
console.log(await page.getByTestId("timings").textContent());
await browser.close();
