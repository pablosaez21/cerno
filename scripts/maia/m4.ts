// M4 experiment: the Lichess Elo (Maia-3 input) that best explains a player's
// moves, overall and per phase, with a 95% bootstrap interval over games.
// Only blitz, moves with 30 s or more on the clock.
// Usage:
//   npx tsx scripts/maia/m4.ts <model.onnx> chesscom <games.json> <user> [out.json]
//   npx tsx scripts/maia/m4.ts <model.onnx> lichess <dir with <user>.ndjson files> [out.json]
import fs from "node:fs";
import path from "node:path";
import * as ort from "onnxruntime-web";
import { parseGameMoves } from "../../src/core/game";
import { CHESSCOM_TO_LICHESS_OFFSET, MAIA_MIN_CLOCK } from "../../src/core/level";
import { MaiaRunner, type MaiaQuery } from "../../src/core/maia-ort";
import { openingOf, phasesOf, type Phase } from "../../src/core/phase";
import { normalizeChesscomGame, normalizeLichessGame } from "../../src/core/sources";
import type { GameRecord } from "../../src/core/types";

const [model, kind, src, userOrOut, maybeOut] = process.argv.slice(2);
const GRID = Array.from({ length: 19 }, (_, i) => 800 + 100 * i);
const B = 500;

type Subject = { name: string; games: GameRecord[]; offset: number };
const subjects: Subject[] = [];
if (kind === "chesscom") {
  const games = (JSON.parse(fs.readFileSync(src, "utf8")) as unknown[]).map((g) => normalizeChesscomGame(g as never, userOrOut)).filter((g): g is GameRecord => !!g && g.timeClass === "blitz");
  subjects.push({ name: userOrOut, games, offset: CHESSCOM_TO_LICHESS_OFFSET });
} else {
  for (const f of fs.readdirSync(src).filter((f) => f.endsWith(".ndjson"))) {
    const name = path.basename(f, ".ndjson");
    const games = fs.readFileSync(path.join(src, f), "utf8").split("\n").filter((l) => l.trim()).map((l) => normalizeLichessGame(JSON.parse(l), name)).filter((g): g is GameRecord => !!g && g.timeClass === "blitz");
    subjects.push({ name, games, offset: 0 });
  }
}
const out = kind === "chesscom" ? maybeOut : userOrOut;
const runner = await MaiaRunner.create(ort, fs.readFileSync(model));

function argmax(tot: number[]): number {
  const k = tot.indexOf(Math.max(...tot));
  if (k === 0 || k === tot.length - 1) return GRID[k];
  const [y0, y1, y2] = [tot[k - 1], tot[k], tot[k + 1]];
  const a = (y0 - 2 * y1 + y2) / 2;
  return a < 0 ? GRID[k] + (100 * (y0 - y2)) / (4 * a) : GRID[k];
}

let seed = 2024;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const results = [];
for (const s of subjects) {
  type M = { game: string; phase: Phase; q: Omit<MaiaQuery, "eloSelf">; played: string; rating: number };
  const moves: M[] = [];
  for (const g of s.games) {
    const { startFen, plies } = parseGameMoves(g);
    const fens = [startFen, ...plies.map((p) => p.fenAfter)];
    const phases = phasesOf(startFen, plies, openingOf(plies).bookPlies);
    const me = g.playerColor;
    const opp = me === "white" ? "black" : "white";
    let clock = g.timeControl?.base;
    for (const p of plies) {
      if (p.color !== me) continue;
      const before = clock;
      if (p.clockAfter !== undefined) clock = p.clockAfter;
      if (before === undefined || before < MAIA_MIN_CLOCK || g[opp].rating === undefined || g[me].rating === undefined) continue;
      moves.push({ game: g.id, phase: phases[p.ply - 1], q: { fens: fens.slice(Math.max(0, p.ply - 8), p.ply), eloOppo: g[opp].rating! + s.offset }, played: p.uci, rating: g[me].rating! + s.offset });
    }
  }
  // Log-likelihood of every move at every grid Elo.
  const ll: number[][] = GRID.map(() => []);
  for (let k = 0; k < GRID.length; k++) {
    for (let i = 0; i < moves.length; i += 256) {
      const batch = moves.slice(i, i + 256);
      const preds = await runner.predict(batch.map((m) => ({ ...m.q, eloSelf: GRID[k] })));
      preds.forEach((p, j) => ll[k].push(Math.log(p.policy[batch[j].played] ?? 1e-9)));
    }
  }
  const games = [...new Set(moves.map((m) => m.game))];
  const estimate = (sel: (m: M) => boolean) => {
    const idx = moves.map((m, i) => (sel(m) ? i : -1)).filter((i) => i >= 0);
    if (idx.length < 30) return { moves: idx.length };
    const point = argmax(GRID.map((_, k) => idx.reduce((a, i) => a + ll[k][i], 0)));
    const boots: number[] = [];
    for (let b = 0; b < B; b++) {
      const w = new Map<string, number>();
      for (let i = 0; i < games.length; i++) {
        const g = games[Math.floor(rand() * games.length)];
        w.set(g, (w.get(g) ?? 0) + 1);
      }
      boots.push(argmax(GRID.map((_, k) => idx.reduce((a, i) => a + (w.get(moves[i].game) ?? 0) * ll[k][i], 0))));
    }
    boots.sort((a, b) => a - b);
    const ci = [boots[Math.floor(0.025 * B)], boots[Math.floor(0.975 * B)]].map(Math.round);
    return { moves: idx.length, elo: Math.round(point), ci95: ci, width: ci[1] - ci[0] };
  };
  const r = {
    subject: kind === "chesscom" ? s.name : `${s.name.slice(0, 3)}…`,
    games: games.length,
    meanRatingAsLichess: Math.round(moves.reduce((a, m) => a + m.rating, 0) / Math.max(1, moves.length)),
    overall: estimate(() => true),
    opening: estimate((m) => m.phase === "opening"),
    middlegame: estimate((m) => m.phase === "middlegame"),
    endgame: estimate((m) => m.phase === "endgame"),
  };
  results.push(r);
  console.log(JSON.stringify(r));
}
if (out) fs.writeFileSync(out, JSON.stringify(results, null, 1));
