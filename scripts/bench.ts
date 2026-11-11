// Hito 0: time the two-pass analysis of N games in Node worker_threads.
// Usage: npx tsx scripts/bench.ts <chesscom-games.json> <username> [workers] [pass1Nodes] [pass2Nodes] [flavor]
import fs from "node:fs";
import { analyzeGames, DEFAULT_SETTINGS } from "../src/core/analyze";
import { EnginePool } from "../src/core/engine";
import { normalizeChesscomGame } from "../src/core/sources";
import type { GameRecord } from "../src/core/types";
import { nodeTransport } from "./node-engine";

const [file, user, workers = "8", n1 = String(DEFAULT_SETTINGS.pass1Nodes), n2 = String(DEFAULT_SETTINGS.pass2Nodes), flavor = "lite-single"] = process.argv.slice(2);
const games = (JSON.parse(fs.readFileSync(file, "utf8")) as unknown[])
  .map((g) => normalizeChesscomGame(g as never, user))
  .filter((g): g is GameRecord => !!g);
const settings = { ...DEFAULT_SETTINGS, pass1Nodes: Number(n1), pass2Nodes: Number(n2), engineId: flavor };
const pool = new EnginePool(() => nodeTransport(flavor), Number(workers));
const t0 = performance.now();
await pool.start();
const tStart = performance.now();
let t1 = 0;
let last = "";
const res = await analyzeGames(games, {
  pool,
  settings,
  onProgress: (p) => {
    if (p.phase === "pass2" && !t1) t1 = performance.now();
    const line = `${p.phase} ${p.done}/${p.total}`;
    if (p.done % 500 === 0 && line !== last) { last = line; process.stderr.write(line + "\n"); }
  },
});
const t2 = performance.now();
pool.stop();
const positions = res.reduce((s, g) => s + g.evals.length, 0);
const deep = res.reduce((s, g) => s + Object.keys(g.deep).length, 0);
console.log(JSON.stringify({ games: res.length, positions, deepMoves: deep, workers: Number(workers), flavor, pass1Nodes: settings.pass1Nodes, pass2Nodes: settings.pass2Nodes,
  initMs: Math.round(tStart - t0), pass1s: +((t1 - tStart) / 1000).toFixed(1), pass2s: +((t2 - t1) / 1000).toFixed(1), totalS: +((t2 - tStart) / 1000).toFixed(1) }));
if (process.env.OUT) fs.writeFileSync(process.env.OUT, JSON.stringify(res));
