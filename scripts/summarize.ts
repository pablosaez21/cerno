// Prints the main numbers of a report and the sanity check against Chess.com
// accuracies. Usage: npx tsx scripts/summarize.ts <report.json>
import fs from "node:fs";
import type { Report } from "../src/core/report";

const r = JSON.parse(fs.readFileSync(process.argv[2], "utf8")) as Report;
console.log("sample", r.sample);
console.table(Object.fromEntries(Object.entries(r.categories).map(([k, v]) => [k, { share: v.winLossShare, per100: v.errorsPer100, ...v.counts, decided: v.decidedGames }])));
console.log("clock", r.clock);
console.table(r.findings.map((f) => ({ id: f.id.slice(0, 70), occ: f.occurrences, games: f.games, winLoss: f.winLoss, impact: f.impact })));
console.log("recommendations", r.recommendations.map((x) => `${x.rank}. ${x.findingId} -> ${x.prescription.methods.join("+")} [${x.prescription.themes.join(",")}]`));
console.table(r.openings.slice(0, 10).map((o) => ({ family: o.family, color: o.color, games: o.games, score: o.score, exit: o.avgWinAfterOpening, book: o.avgBookExitMove, errs: o.openingErrors })));

// Sanity check: our Lichess-style accuracy vs Chess.com's, where present.
const pairs = r.games.filter((g) => g.accuracy !== undefined && g.sourceAccuracy !== undefined).map((g) => [g.accuracy!, g.sourceAccuracy!]);
if (pairs.length > 2) {
  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const xs = pairs.map((p) => p[0]);
  const ys = pairs.map((p) => p[1]);
  const mx = mean(xs);
  const my = mean(ys);
  const cov = pairs.reduce((s, [x, y]) => s + (x - mx) * (y - my), 0);
  const sx = Math.sqrt(xs.reduce((s, x) => s + (x - mx) ** 2, 0));
  const sy = Math.sqrt(ys.reduce((s, y) => s + (y - my) ** 2, 0));
  console.log(`accuracy correlation (Pearson) over ${pairs.length} games: ${(cov / (sx * sy)).toFixed(3)}; mean ours ${mx.toFixed(1)}, Chess.com ${my.toFixed(1)}`);
}
const tags: Record<string, number> = {};
r.errors.forEach((e) => { const k = `${e.category}/${e.tactic?.tag ?? "-"}`; tags[k] = (tags[k] ?? 0) + 1; });
console.log("errors by category/tag", tags);
