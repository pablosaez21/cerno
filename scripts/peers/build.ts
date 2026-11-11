// Builds the peer decision records (both sides, Maia-3 at five levels, candidate
// moves at the pass-1 budget) and writes them as JSON lines.
// Usage: npx tsx scripts/peers/build.ts chesscom <games.json> <user> <model.onnx> <cacheDir> <out.jsonl>
//        npx tsx scripts/peers/build.ts lichess <dir> <user> <model.onnx> <cacheDir> <out.jsonl>   (reads <dir>/<user>.ndjson)
// MAXG=n limits the games (most recent first).
import fs from "node:fs";
import path from "node:path";
import * as ort from "onnxruntime-web";
import { analyzeGames, DEFAULT_SETTINGS } from "../../src/core/analyze";
import { EnginePool } from "../../src/core/engine";
import { MaiaRunner } from "../../src/core/maia-ort";
import { evaluatePeers, predictPeers } from "../../src/core/peer-analysis";
import { normalizeChesscomGame, normalizeLichessGame } from "../../src/core/sources";
import type { GameRecord } from "../../src/core/types";
import { FileCache, nodeTransport } from "../node-engine";

export function loadGames(kind: string, src: string, user: string): GameRecord[] {
  if (kind === "chesscom") {
    return (JSON.parse(fs.readFileSync(src, "utf8")) as unknown[]).map((g) => normalizeChesscomGame(g as never, user)).filter((g): g is GameRecord => !!g);
  }
  return fs
    .readFileSync(path.join(src, `${user}.ndjson`), "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => normalizeLichessGame(JSON.parse(l), user))
    .filter((g): g is GameRecord => !!g);
}

/**
 * Pass 1 (+ pass 2 unless `noPass2`), Maia at five levels, candidate searches.
 * The caller owns the pool and the cache.
 */
export async function buildDecisions(games: GameRecord[], runner: MaiaRunner, pool: EnginePool, cache: FileCache, opts: { noPass2?: boolean } = {}) {
  const settings = opts.noPass2 ? { ...DEFAULT_SETTINGS, candidateLoss: Infinity } : DEFAULT_SETTINGS;
  const log = (p: { phase: string; done: number; total: number }) => p.done % 2000 === 0 && process.stderr.write(`${p.phase} ${p.done}/${p.total}\n`);
  const t0 = performance.now();
  const analyzed = await analyzeGames(games, { pool, cache, settings, onProgress: log });
  cache.flush();
  const t1 = performance.now();
  const sk = await predictPeers(analyzed, { predict: (q) => runner.predict(q), onProgress: log });
  const t2 = performance.now();
  const decisions = await evaluatePeers(sk, analyzed, { pool, cache, settings, onProgress: log });
  cache.flush();
  const t3 = performance.now();
  return { analyzed, decisions, seconds: { stockfish: Math.round((t1 - t0) / 1000), maia: Math.round((t2 - t1) / 1000), candidates: Math.round((t3 - t2) / 1000) } };
}

async function main() {
  const [kind, src, user, model, cacheDir, out] = process.argv.slice(2);
  const games = loadGames(kind, src, user).slice(0, Number(process.env.MAXG ?? 100000));
  const cache = new FileCache(cacheDir);
  const pool = new EnginePool(() => nodeTransport(), Number(process.env.WORKERS ?? 9));
  await pool.start();
  const runner = await MaiaRunner.create(ort, fs.readFileSync(model));
  const { analyzed, decisions, seconds } = await buildDecisions(games, runner, pool, cache);
  pool.stop();
  fs.writeFileSync(out, decisions.map((d) => JSON.stringify(d)).join("\n") + "\n");
  const inScope = decisions.filter((d) => d.inScope);
  const side = (m: string) => inScope.filter((d) => d.mover === m);
  const tail = (xs: typeof decisions) => +(xs.filter((d) => d.observed === 4).length / xs.length).toFixed(4);
  console.log(
    JSON.stringify({
      games: analyzed.length,
      decisions: { player: side("player").length, opponents: side("opponent").length, playerAll: decisions.filter((d) => d.mover === "player").length, opponentsAll: decisions.filter((d) => d.mover === "opponent").length },
      tailShare: { player: tail(side("player")), opponents: tail(side("opponent")) },
      meanSetSize: +(inScope.reduce((a, d) => a + d.inSet.filter(Boolean).length, 0) / inScope.length).toFixed(3),
      seconds,
    }),
  );
}

if (process.argv[1]?.endsWith("build.ts")) await main();
