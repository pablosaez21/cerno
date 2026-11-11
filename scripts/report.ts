// Analyse games in Node and write the report. Engine results are cached on disk,
// so re-running after a labelling change costs seconds.
// Usage: npx tsx scripts/report.ts <chesscom-games.json> <username> <cacheDir> [out.json] [maia.onnx]
import fs from "node:fs";
import { analyzeGames, DEFAULT_SETTINGS } from "../src/core/analyze";
import { EnginePool } from "../src/core/engine";
import * as ort from "onnxruntime-web";
import { classifyGame } from "../src/core/classify";
import { analyzeLevels } from "../src/core/level-analysis";
import { MaiaRunner } from "../src/core/maia-ort";
import { buildReport } from "../src/core/report";
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
const analyzed = await analyzeGames(games, {
  pool,
  cache,
  onProgress: (p) => p.done % 1000 === 0 && process.stderr.write(`${p.phase} ${p.done}/${p.total}\n`),
});
const t1 = performance.now();
let level;
if (maiaModel) {
  const runner = await MaiaRunner.create(ort, fs.readFileSync(maiaModel));
  level = await analyzeLevels(analyzed, {
    predict: (q) => runner.predict(q),
    model: "maia3-5m",
    pool,
    cache,
    settings: DEFAULT_SETTINGS,
    judged: (g) => new Set(classifyGame(g).moves.filter((m) => m.judgement).map((m) => m.ply)),
    onProgress: (p) => p.done % 500 === 0 && process.stderr.write(`${p.phase} ${p.done}/${p.total}\n`),
  });
  console.log(`level analysis ${((performance.now() - t1) / 1000).toFixed(1)} s`);
}
pool.stop();
cache.flush();
const report = buildReport(analyzed, user, DEFAULT_SETTINGS, level);
if (out) fs.writeFileSync(out, JSON.stringify(report, null, 1));
console.log(`analysis ${((performance.now() - t0) / 1000).toFixed(1)} s, games ${report.sample.games}, moves ${report.sample.playerMoves}`);
