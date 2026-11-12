// V6: calibration of the normalised pGood (good-move probability over the
// evaluated candidate set) on the opponents' real moves: predicted vs observed
// share of good moves (pass-1 loss < 5), by bin.
// Usage: npx tsx scripts/maia/calibrate.ts <decisions.jsonl> [sample=1200]
import fs from "node:fs";
import type { Decision } from "../../src/core/peers";
import { goodShare } from "../../src/core/profile";
import { rng } from "../../src/core/review";

const [file, sizeArg = "1200"] = process.argv.slice(2);
const all = fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as Decision).filter((d) => d.mover === "opponent" && d.inScope);
const rand = rng(99);
const sample = all.map((d) => ({ d, r: rand() })).sort((a, b) => a.r - b.r).slice(0, Number(sizeArg)).map((x) => x.d);
const rows = sample.map((d) => ({ pGood: goodShare(d, 2), good: d.playedLoss < 5 ? 1 : 0, mass: d.mass[2] }));
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const bins = [0, 0.3, 0.5, 0.7, 0.85, 1.0001];
const table = bins.slice(0, -1).map((lo, k) => {
  const r = rows.filter((x) => x.pGood >= lo && x.pGood < bins[k + 1]);
  const obs = r.length ? mean(r.map((x) => x.good)) : NaN;
  const se = r.length ? Math.sqrt((obs * (1 - obs)) / r.length) : NaN;
  return { bin: `${lo}-${Math.min(1, bins[k + 1])}`, n: r.length, predicted: +mean(r.map((x) => x.pGood)).toFixed(3), observed: +obs.toFixed(3), se: +se.toFixed(3) };
});
const pred = mean(rows.map((x) => x.pGood));
const obs = mean(rows.map((x) => x.good));
console.log(JSON.stringify({ n: rows.length, predicted: +pred.toFixed(3), observed: +obs.toFixed(3), meanEvaluatedMass: +mean(rows.map((x) => x.mass)).toFixed(3) }));
console.table(table);
