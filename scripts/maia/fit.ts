// M0.3 / M0.4: how well Maia-3 predicts real moves in Chess.com games, for the
// player and for their opponents (control group), and which Elo offset
// (Lichess = Chess.com + offset) makes the real moves most likely.
// Only blitz games. Every move is kept with its clock bucket (Maia-3 was trained
// without moves under 30 s and does not see the clock); the summary printed here
// uses 30 s or more, and `out.json` stores per-move log-likelihoods for
// scripts/maia/analyze-fit.ts (bootstrap intervals, clock buckets).
// Usage: npx tsx scripts/maia/fit.ts <games.json> <user> <model.onnx> <history|repeat> <offsets,comma> [out.json]
import fs from "node:fs";
import * as ort from "onnxruntime-web";
import { parseGameMoves } from "../../src/core/game";
import { MaiaRunner, type MaiaQuery } from "../../src/core/maia-ort";
import { normalizeChesscomGame } from "../../src/core/sources";
import type { GameRecord } from "../../src/core/types";

const [file, user, model, mode, offsetsArg, out] = process.argv.slice(2);
const offsets = offsetsArg.split(",").map(Number);
const MIN_CLOCK = 30;
const games = (JSON.parse(fs.readFileSync(file, "utf8")) as unknown[])
  .map((g) => normalizeChesscomGame(g as never, user))
  .filter((g): g is GameRecord => !!g && g.timeClass === "blitz");

interface Pos { fens: string[]; played: string; mover: "player" | "rival"; eloSelf: number; eloOppo: number; ply: number; game: string; clock: number }
const positions: Pos[] = [];
for (const g of games) {
  const { startFen, plies } = parseGameMoves(g);
  const fens = [startFen, ...plies.map((p) => p.fenAfter)];
  const lastClock: Record<string, number | undefined> = { white: g.timeControl?.base, black: g.timeControl?.base };
  for (const p of plies) {
    const clockBefore = lastClock[p.color];
    if (p.clockAfter !== undefined) lastClock[p.color] = p.clockAfter;
    if (clockBefore === undefined) continue;
    const me = g[p.color].rating ?? 1500;
    const them = g[p.color === "white" ? "black" : "white"].rating ?? 1500;
    const hist = fens.slice(Math.max(0, p.ply - 8), p.ply); // up to the position before the move
    positions.push({ fens: mode === "history" ? hist : [hist[hist.length - 1]], played: p.uci, mover: p.color === g.playerColor ? "player" : "rival", eloSelf: me, eloOppo: them, ply: p.ply, game: g.id, clock: clockBefore });
  }
}
const runner = await MaiaRunner.create(ort, fs.readFileSync(model));
const results: Record<string, unknown>[] = [];
const perMove: { offset: number; ll: number[]; top1: number[] }[] = [];
for (const off of offsets) {
  const t0 = performance.now();
  const acc = { player: { n: 0, top1: 0, p: 0, ll: 0, n10: 0, top1_10: 0 }, rival: { n: 0, top1: 0, p: 0, ll: 0, n10: 0, top1_10: 0 } };
  const ll: number[] = [];
  const hit: number[] = [];
  for (let i = 0; i < positions.length; i += 256) {
    const batch = positions.slice(i, i + 256);
    const preds = await runner.predict(batch.map((q): MaiaQuery => ({ fens: q.fens, eloSelf: q.eloSelf + off, eloOppo: q.eloOppo + off })));
    preds.forEach((pr, k) => {
      const q = batch[k];
      const p = pr.policy[q.played] ?? 1e-9;
      const best = Object.entries(pr.policy).reduce((x, y) => (y[1] > x[1] ? y : x))[0];
      ll.push(+Math.log(p).toFixed(5));
      hit.push(best === q.played ? 1 : 0);
      if (q.clock < MIN_CLOCK) return;
      const a = acc[q.mover];
      a.n++; a.p += p; a.ll += Math.log(p); if (best === q.played) a.top1++;
      if (q.ply > 20) { a.n10++; if (best === q.played) a.top1_10++; }
    });
  }
  const r = { offset: off, mode, seconds: +((performance.now() - t0) / 1000).toFixed(1),
    ...Object.fromEntries(Object.entries(acc).map(([k, a]) => [k, { positions: a.n, top1: +(a.top1 / a.n * 100).toFixed(2), top1After10: +(a.top1_10 / a.n10 * 100).toFixed(2), meanP: +(a.p / a.n).toFixed(4), meanLogLik: +(a.ll / a.n).toFixed(4) }])) };
  results.push(r);
  perMove.push({ offset: off, ll, top1: hit });
  console.log(JSON.stringify(r));
}
if (out) {
  const meta = positions.map((q) => ({ game: q.game, mover: q.mover, clock: q.clock, ply: q.ply, elo: q.eloSelf }));
  fs.writeFileSync(out, JSON.stringify({ games: games.length, positions: positions.length, results, meta, perMove }));
}
