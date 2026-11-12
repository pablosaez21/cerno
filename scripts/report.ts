// Analyse games in Node and write the report. Engine results are cached on disk,
// so re-running after a labelling change costs seconds.
// Usage: npx tsx scripts/report.ts <chesscom-games.json> <username> <cacheDir> [out.json] [maia.onnx]
// DECISIONS=<file.jsonl> reuses peer decisions built by scripts/peers/build.ts instead of running Maia.
import fs from "node:fs";
import * as ort from "onnxruntime-web";
import { analyzeGames, DEFAULT_SETTINGS } from "../src/core/analyze";
import { EnginePool } from "../src/core/engine";
import { MaiaRunner } from "../src/core/maia-ort";
import { evaluatePeers, predictPeers } from "../src/core/peer-analysis";
import type { Decision } from "../src/core/peers";
import { buildReport, type PeerInput } from "../src/core/report";
import { normalizeChesscomGame } from "../src/core/sources";
import type { GameRecord } from "../src/core/types";
import { FileCache, nodeTransport } from "./node-engine";

const [file, user, cacheDir, out, maiaModel] = process.argv.slice(2);
const games = (JSON.parse(fs.readFileSync(file, "utf8")) as unknown[])
  .map((g) => normalizeChesscomGame(g as never, user))
  .filter((g): g is GameRecord => !!g);
const cache = new FileCache(cacheDir);
const pool = new EnginePool(() => nodeTransport(), 9);
await pool.start();
const t0 = performance.now();
const log = (p: { phase: string; done: number; total: number }) => p.done % 2000 === 0 && process.stderr.write(`${p.phase} ${p.done}/${p.total}\n`);
const analyzed = await analyzeGames(games, { pool, cache, onProgress: log });
const t1 = performance.now();
let peers: PeerInput | undefined;
if (process.env.DECISIONS) {
  const decisions = fs.readFileSync(process.env.DECISIONS, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as Decision);
  peers = { decisions, model: "maia3-5m", mode: "full" };
} else if (maiaModel) {
  const runner = await MaiaRunner.create(ort, fs.readFileSync(maiaModel));
  const sk = await predictPeers(analyzed, { predict: (q) => runner.predict(q), onProgress: log });
  const decisions = await evaluatePeers(sk, analyzed, { pool, cache, settings: DEFAULT_SETTINGS, onProgress: log });
  peers = { decisions, model: "maia3-5m", mode: "full" };
  console.log(`peer analysis ${((performance.now() - t1) / 1000).toFixed(1)} s`);
}
pool.stop();
cache.flush();
const report = buildReport(analyzed, user, DEFAULT_SETTINGS, peers);
if (out) fs.writeFileSync(out, JSON.stringify(report, null, 1));
console.log(`analysis ${((performance.now() - t0) / 1000).toFixed(1)} s, games ${report.sample.games}, moves ${report.sample.playerMoves}`);
