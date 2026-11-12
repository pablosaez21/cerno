// Step 5 (V2-V4): external Lichess players. For each player: decisions of both
// sides (no pass 2), the overall gap to their opponents, and score minus the
// Elo-expected score. Pooled: shift of all movers against Maia at their real
// rating, by class, time control and Elo band. Between-player variance tau^2.
// Usage: npx tsx scripts/peers/external.ts <dir of <user>.ndjson> <model.onnx> <cacheDir> <outDir>
// Data stays local (research only).
import fs from "node:fs";
import path from "node:path";
import * as ort from "onnxruntime-web";
import { EnginePool } from "../../src/core/engine";
import { MaiaRunner } from "../../src/core/maia-ort";
import { ALL_CLASS, eloShift, PRIMARY_CLASSES, profileStats } from "../../src/core/peer-stats";
import type { Decision } from "../../src/core/peers";
import type { GameRecord } from "../../src/core/types";
import { FileCache, nodeTransport } from "../node-engine";
import { buildDecisions, loadGames } from "./build";

const [dir, model, cacheDir, outDir] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const cache = new FileCache(cacheDir);
const pool = new EnginePool(() => nodeTransport(), Number(process.env.WORKERS ?? 9));
await pool.start();
const runner = await MaiaRunner.create(ort, fs.readFileSync(model));
const users = fs.readdirSync(dir).filter((f) => f.endsWith(".ndjson")).map((f) => path.basename(f, ".ndjson"));
const all: { user: string; decisions: Decision[]; games: GameRecord[] }[] = [];
for (const user of users) {
  const file = path.join(outDir, `${user}.jsonl`);
  const games = loadGames("lichess", dir, user).filter((g) => g.timeClass === "blitz").slice(0, Number(process.env.MAXG ?? 50));
  let decisions: Decision[];
  if (fs.existsSync(file)) decisions = fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  else {
    const t = performance.now();
    decisions = (await buildDecisions(games, runner, pool, cache, { noPass2: true })).decisions;
    fs.writeFileSync(file, decisions.map((d) => JSON.stringify(d)).join("\n") + "\n");
    console.error(`${user.slice(0, 3)}… ${games.length} games, ${decisions.length} decisions, ${Math.round((performance.now() - t) / 1000)} s`);
  }
  all.push({ user, decisions, games });
}
pool.stop();
cache.flush();

// ---- Per player
const perPlayer = all.map(({ user, decisions, games }) => {
  const prof = profileStats(decisions);
  const used = new Set(decisions.map((d) => d.gameId));
  let score = 0, expected = 0, n = 0, rating = 0;
  for (const g of games) {
    if (!used.has(g.id)) continue;
    const me = g[g.playerColor].rating!, them = g[g.playerColor === "white" ? "black" : "white"].rating!;
    score += g.result === "win" ? 1 : g.result === "draw" ? 0.5 : 0;
    expected += 1 / (1 + 10 ** ((them - me) / 400));
    rating += me;
    n++;
  }
  return { user: `${user.slice(0, 3)}…`, games: n, rating: Math.round(rating / n), scoreMinusExpected: +((score - expected) / n).toFixed(3), overall: prof?.overall, classes: prof?.classes };
});
console.log("player  games rating  gap   sd  | score-expected");
for (const p of perPlayer) console.log(`${p.user.padEnd(6)} ${String(p.games).padStart(4)} ${String(p.rating).padStart(6)} ${String(p.overall?.gap).padStart(5)} ${String(p.overall?.sd).padStart(4)} | ${p.scoreMinusExpected}`);
const ok = perPlayer.filter((p) => p.overall?.gap !== undefined);
const corr = (xs: number[], ys: number[]) => {
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length;
  const c = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0);
  return c / Math.sqrt(xs.reduce((a, x) => a + (x - mx) ** 2, 0) * ys.reduce((a, y) => a + (y - my) ** 2, 0));
};
const v3 = corr(ok.map((p) => p.overall!.gap!), ok.map((p) => p.scoreMinusExpected));
console.log(`V3: correlation overall gap vs score-expected over ${ok.length} players: ${v3.toFixed(3)}`);

// ---- V4: tau^2
const variance = (xs: number[]) => { const m = xs.reduce((a, b) => a + b, 0) / xs.length; return xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1); };
const tauOverall = variance(ok.map((p) => p.overall!.gap!)) - ok.reduce((a, p) => a + p.overall!.sd! ** 2, 0) / ok.length;
console.log(`V4: tau^2 overall ${Math.round(tauOverall)} -> tau ${tauOverall > 0 ? Math.round(Math.sqrt(tauOverall)) : "none"}`);
const tauRows: Record<string, unknown>[] = [];
for (const def of PRIMARY_CLASSES) {
  const xs = ok.map((p) => p.classes!.find((c) => c.id === def.id)!).map((c, i) => ({ c, o: ok[i].overall! })).filter(({ c }) => !c.insufficient);
  if (xs.length < 5) continue;
  const shape = xs.map(({ c, o }) => c.gap! - o.gap!);
  const t2 = variance(shape) - xs.reduce((a, { c }) => a + c.sd! ** 2, 0) / xs.length;
  tauRows.push({ class: def.id, players: xs.length, tau2: Math.round(t2), tau: t2 > 0 ? Math.round(Math.sqrt(t2)) : null });
}
console.table(tauRows);

// ---- V2: pooled shift of all movers vs Maia at their real rating
const pooled: Decision[] = all.flatMap((a) => a.decisions.filter((d) => d.inScope));
const tcOf = new Map(all.flatMap((a) => a.games.map((g) => [g.id, g.timeControl ? `${g.timeControl.base}+${g.timeControl.increment}` : "?"] as const)));
function shiftSe(ds: Decision[]) {
  const sum = (xs: Decision[]) => [0, 1, 2, 3, 4].map((k) => xs.reduce((a, d) => a + d.lq[k], 0));
  const point = eloShift(sum(ds)).shift;
  const byGame = new Map<string, Decision[]>();
  for (const d of ds) byGame.set(d.gameId, [...(byGame.get(d.gameId) ?? []), d]);
  const gs = [...byGame.values()];
  let seed = 7;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const bs: number[] = [];
  for (let b = 0; b < 300; b++) bs.push(eloShift(sum(Array.from({ length: gs.length }, () => gs[Math.floor(rand() * gs.length)]).flat())).shift);
  const m = bs.reduce((a, x) => a + x, 0) / bs.length;
  return { n: ds.length, shift: Math.round(point), se: Math.round(Math.sqrt(bs.reduce((a, x) => a + (x - m) ** 2, 0) / bs.length)) };
}
const v2: Record<string, unknown>[] = [];
for (const def of [ALL_CLASS, ...PRIMARY_CLASSES]) v2.push({ group: def.id, ...shiftSe(pooled.filter(def.test)) });
for (const tc of [...new Set(pooled.map((d) => tcOf.get(d.gameId)!))].sort()) {
  const ds = pooled.filter((d) => tcOf.get(d.gameId) === tc);
  if (ds.length >= 300) v2.push({ group: `tc:${tc}`, ...shiftSe(ds) });
}
for (const [lo, hi] of [[0, 1400], [1400, 1800], [1800, 2200], [2200, 4000]]) v2.push({ group: `elo:${lo}-${hi}`, ...shiftSe(pooled.filter((d) => d.elo >= lo && d.elo < hi)) });
// Mismatched pairings: lower vs higher rated mover when the difference is above 300.
v2.push({ group: "mismatch:mover lower by >300", ...shiftSe(pooled.filter((d) => d.eloOpp - d.elo > 300)) });
v2.push({ group: "mismatch:mover higher by >300", ...shiftSe(pooled.filter((d) => d.elo - d.eloOpp > 300)) });
console.table(v2);
fs.writeFileSync(path.join(outDir, "summary.json"), JSON.stringify({ perPlayer, v3, tauOverall, tauRows, v2 }, null, 1));
