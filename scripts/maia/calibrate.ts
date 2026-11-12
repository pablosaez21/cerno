// Calibration of pGood on the opponents (real players of the same level):
// in a random sample of their moves (blitz, 30 s or more on the clock), compare
// Maia's pGood with how often they actually played a good move (loss < 5).
// Also prints the per-position engine cost of the candidate evaluation.
// Usage: npx tsx scripts/maia/calibrate.ts <games.json> <user> <model.onnx> <sfCacheDir> <sampleSize> [out.json]
import fs from "node:fs";
import * as ort from "onnxruntime-web";
import { DEFAULT_SETTINGS, evalKey } from "../../src/core/analyze";
import { playLine, fenOf } from "../../src/core/chess";
import { EnginePool } from "../../src/core/engine";
import { parseGameMoves } from "../../src/core/game";
import { candidatesToEvaluate, CHESSCOM_TO_LICHESS_OFFSET, goodMass, MAIA_MIN_CLOCK } from "../../src/core/level";
import { MaiaRunner } from "../../src/core/maia-ort";
import { normalizeChesscomGame } from "../../src/core/sources";
import type { GameRecord, PositionEval } from "../../src/core/types";
import { winPercentFor } from "../../src/core/winprob";
import { FileCache, nodeTransport } from "../node-engine";

const [file, user, model, cacheDir, sizeArg, out] = process.argv.slice(2);
// Same budget and cache keys as the browser level analysis (pass-1 nodes).
const CANDIDATE_NODES = DEFAULT_SETTINGS.pass1Nodes;
const games = (JSON.parse(fs.readFileSync(file, "utf8")) as unknown[]).map((g) => normalizeChesscomGame(g as never, user)).filter((g): g is GameRecord => !!g && g.timeClass === "blitz");

type S = { game: string; fens: string[]; played: string; color: "white" | "black"; elo: number; oppo: number };
const all: S[] = [];
for (const g of games) {
  const { startFen, plies } = parseGameMoves(g);
  const fens = [startFen, ...plies.map((p) => p.fenAfter)];
  const last: Record<string, number | undefined> = { white: g.timeControl?.base, black: g.timeControl?.base };
  for (const p of plies) {
    const before = last[p.color];
    if (p.clockAfter !== undefined) last[p.color] = p.clockAfter;
    if (p.color === g.playerColor || before === undefined || before < MAIA_MIN_CLOCK) continue;
    const opp = p.color === "white" ? "black" : "white";
    all.push({ game: g.id, fens: fens.slice(Math.max(0, p.ply - 8), p.ply), played: p.uci, color: p.color, elo: (g[p.color].rating ?? 1500) + CHESSCOM_TO_LICHESS_OFFSET, oppo: (g[opp].rating ?? 1500) + CHESSCOM_TO_LICHESS_OFFSET });
  }
}
let seed = 99;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const sample = all.map((s) => ({ s, r: rand() })).sort((a, b) => a.r - b.r).slice(0, Number(sizeArg)).map((x) => x.s);

const runner = await MaiaRunner.create(ort, fs.readFileSync(model));
const preds: import("../../src/core/maia").MaiaPrediction[] = [];
for (let i = 0; i < sample.length; i += 256) preds.push(...(await runner.predict(sample.slice(i, i + 256).map((s) => ({ fens: s.fens, eloSelf: s.elo, eloOppo: s.oppo })))));

const cache = new FileCache(cacheDir);
const pool = new EnginePool(() => nodeTransport(), 9);
await pool.start();
const key = (fen: string) => evalKey(DEFAULT_SETTINGS, CANDIDATE_NODES, 1, fen);
const evalOf = new Map<string, PositionEval>();
const todo = new Set<string>();
const jobs = sample.map((s, i) => {
  const fen = s.fens[s.fens.length - 1];
  const moves = [...new Set([s.played, ...candidatesToEvaluate(preds[i], new Set())])];
  const after = moves.map((u) => fenOf(playLine(fen, [u]).positions[1]));
  for (const f of [fen, ...after]) todo.add(f);
  return { fen, moves, after };
});
const pending = [];
for (const f of todo) {
  const c = await cache.getEval(key(f));
  if (c) evalOf.set(f, c);
  else pending.push(f);
}
const t0 = performance.now();
await pool.run(pending.map((f) => [f]), (fs_) => fs_.map((fen) => ({ fen, nodes: CANDIDATE_NODES, multiPv: 1 })), async (_t, req, ev) => {
  evalOf.set(req.fen, ev);
  await cache.setEval(key(req.fen), ev);
});
const engineSeconds = (performance.now() - t0) / 1000;
pool.stop();
cache.flush();

const rows = sample.map((s, i) => {
  const j = jobs[i];
  const before = winPercentFor(evalOf.get(j.fen)!.score, s.color);
  const losses = new Map<string, number>();
  j.moves.forEach((u, k) => losses.set(u, Math.max(0, before - winPercentFor(evalOf.get(j.after[k])!.score, s.color))));
  const { pGood, pUnevaluated } = goodMass(preds[i], losses);
  return { game: s.game, pGood, pUnevaluated, good: losses.get(s.played)! < 5 ? 1 : 0, pPlayed: preds[i].policy[s.played] ?? 0 };
});
const bins = [0, 0.3, 0.5, 0.7, 0.85, 1.0001];
const table = bins.slice(0, -1).map((lo, k) => {
  const r = rows.filter((x) => x.pGood >= lo && x.pGood < bins[k + 1]);
  return { bin: `${lo}-${Math.min(1, bins[k + 1])}`, n: r.length, meanPGood: r.length ? +(r.reduce((s, x) => s + x.pGood, 0) / r.length).toFixed(3) : null, observedGood: r.length ? +(r.reduce((s, x) => s + x.good, 0) / r.length).toFixed(3) : null };
});
const summary = { positions: rows.length, enginePositions: pending.length, engineSeconds: +engineSeconds.toFixed(1), candidateNodes: CANDIDATE_NODES, meanPGood: +(rows.reduce((s, x) => s + x.pGood, 0) / rows.length).toFixed(3), observedGood: +(rows.reduce((s, x) => s + x.good, 0) / rows.length).toFixed(3), meanUnevaluated: +(rows.reduce((s, x) => s + x.pUnevaluated, 0) / rows.length).toFixed(3), table };
console.log(JSON.stringify(summary, null, 1));
if (out) fs.writeFileSync(out, JSON.stringify({ summary, rows }));
