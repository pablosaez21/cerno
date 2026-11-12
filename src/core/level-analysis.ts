// Level analysis (Maia-3): runs after the Stockfish passes.
//  - M2: for each judged move of the player in scope, pPlayed, pGood, level, avoidable loss.
//  - M3: on a random sample of the player's positions per phase, real loss vs
//    the loss a Lichess player of the same Elo would expect in those positions.
// Every move loss here is measured with the pass-1 budget (same cache), so the
// player's move and the candidates are judged the same way.
import { evalKey, type AnalysisSettings, type AnalyzedGame, type EvalCache } from "./analyze";
import { fenOf, playLine, positionKey } from "./chess";
import type { EnginePool } from "./engine";
import { candidatesToEvaluate, eloForMaia, expectedLoss, outOfScope, peerMetrics, type OutOfScope, type PeerMetrics } from "./level";
import type { MaiaPrediction } from "./maia";
import type { MaiaQuery } from "./maia-ort";
import { openingOf, phasesOf, type Phase } from "./phase";
import type { PositionEval } from "./types";
import { winPercentFor } from "./winprob";

/** Positions per phase sampled for M3. */
export const M3_SAMPLE_PER_PHASE = 150;

export interface LevelMove {
  ply: number;
  peer?: PeerMetrics;
  outOfScope?: OutOfScope;
}

export interface PhaseLevelSample {
  gameId: string;
  ply: number;
  phase: Phase;
  realLoss: number;
  expectedLoss: number;
  coverage: number;
}

export interface LevelData {
  model: string;
  /** Lichess Elo = Chess.com rating + this (0 for Lichess games). */
  eloOffset: number;
  /** Per game, per player ply, for every move of the player. */
  moves: Record<string, LevelMove[]>;
  phaseSamples: PhaseLevelSample[];
}

export interface MaiaCache {
  getMaia(key: string): Promise<MaiaPrediction | undefined>;
  setMaiaMany(entries: [string, MaiaPrediction][]): Promise<void>;
}

/** Cache key: model, both Elos and the history (positions without move counters). */
export function maiaKey(model: string, q: MaiaQuery): string {
  return `${model}|${q.eloSelf}|${q.eloOppo}|${q.fens.map((f) => positionKey(f)).join(">")}`;
}

export interface LevelDeps {
  predict: (queries: MaiaQuery[]) => Promise<MaiaPrediction[]>;
  maiaCache?: MaiaCache;
  model: string;
  pool: EnginePool;
  cache?: EvalCache;
  settings: AnalysisSettings;
  /** Player moves that are judged errors (from pass 2), by game. */
  judged: (g: AnalyzedGame) => Set<number>;
  onProgress?: (p: { phase: "maia" | "candidates"; done: number; total: number }) => void;
  batchSize?: number;
  signal?: AbortSignal;
  sampleSeed?: number;
}

interface Target {
  game: AnalyzedGame;
  ply: number;
  fens: string[];
  played: string;
  elo: number;
  oppo: number;
  m2: boolean;
  phase?: Phase;
}

/** Deterministic pseudo-random order from a string key. */
function hash(s: string, seed: number): number {
  let h = seed >>> 0;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 2654435761) >>> 0;
  return h;
}

export async function analyzeLevels(games: AnalyzedGame[], deps: LevelDeps): Promise<LevelData> {
  const s = deps.settings;
  const moves: Record<string, LevelMove[]> = {};
  const targets: Target[] = [];
  const phaseCandidates: Record<Phase, Target[]> = { opening: [], middlegame: [], endgame: [] };

  for (const g of games) {
    const { game, parsed } = g;
    const me = game.playerColor;
    const opp = me === "white" ? "black" : "white";
    const elo = eloForMaia(game[me].rating, game.source);
    const oppo = eloForMaia(game[opp].rating, game.source);
    const phases = phasesOf(parsed.startFen, parsed.plies, openingOf(parsed.plies).bookPlies);
    const fens = [parsed.startFen, ...parsed.plies.map((p) => p.fenAfter)];
    const judged = deps.judged(g);
    const list: LevelMove[] = [];
    let clock = game.timeControl?.base;
    for (const p of parsed.plies) {
      if (p.color !== me) continue;
      const before = clock;
      if (p.clockAfter !== undefined) clock = p.clockAfter;
      const oos = outOfScope({ clockBefore: before, timeClass: game.timeClass, ratingKnown: elo !== undefined && oppo !== undefined });
      list.push({ ply: p.ply, outOfScope: oos });
      if (oos) continue;
      const t: Target = { game: g, ply: p.ply, fens: fens.slice(Math.max(0, p.ply - 8), p.ply), played: p.uci, elo: elo!, oppo: oppo!, m2: judged.has(p.ply), phase: phases[p.ply - 1] };
      if (t.m2) targets.push(t);
      phaseCandidates[t.phase!].push(t);
    }
    moves[game.id] = list;
  }

  // M3 sample: a fixed pseudo-random subset per phase.
  const seed = deps.sampleSeed ?? 7;
  const sampleKeys = new Set<string>();
  for (const ph of Object.keys(phaseCandidates) as Phase[]) {
    const chosen = [...phaseCandidates[ph]].sort((a, b) => hash(`${a.game.game.id}#${a.ply}`, seed) - hash(`${b.game.game.id}#${b.ply}`, seed)).slice(0, M3_SAMPLE_PER_PHASE);
    for (const t of chosen) {
      sampleKeys.add(`${t.game.game.id}#${t.ply}`);
      if (!t.m2) targets.push(t);
    }
  }

  // Maia predictions.
  const batch = deps.batchSize ?? 128;
  const queries = targets.map((t): MaiaQuery => ({ fens: t.fens, eloSelf: t.elo, eloOppo: t.oppo }));
  const preds: MaiaPrediction[] = new Array(queries.length);
  const todo: number[] = [];
  for (let i = 0; i < queries.length; i++) {
    const c = await deps.maiaCache?.getMaia(maiaKey(deps.model, queries[i]));
    if (c) preds[i] = c;
    else todo.push(i);
  }
  for (let i = 0; i < todo.length; i += batch) {
    if (deps.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const idx = todo.slice(i, i + batch);
    const out = await deps.predict(idx.map((k) => queries[k]));
    idx.forEach((k, j) => (preds[k] = out[j]));
    await deps.maiaCache?.setMaiaMany(idx.map((k) => [maiaKey(deps.model, queries[k]), preds[k]]));
    deps.onProgress?.({ phase: "maia", done: Math.min(i + batch, todo.length), total: todo.length });
  }

  // Engine: the position and every move to judge, at the pass-1 budget.
  const key = (fen: string) => evalKey(s, s.pass1Nodes, 1, fen);
  const evals = new Map<string, PositionEval>();
  const plan = targets.map((t, i) => {
    const fen = t.fens[t.fens.length - 1];
    const ucis = [...new Set([t.played, ...candidatesToEvaluate(preds[i], new Set())])];
    return { fen, ucis, after: ucis.map((u) => fenOf(playLine(fen, [u]).positions[1])) };
  });
  const missing: string[] = [];
  for (const f of new Set(plan.flatMap((p) => [p.fen, ...p.after]))) {
    const c = await deps.cache?.getEval(key(f));
    if (c) evals.set(f, c);
    else missing.push(f);
  }
  let done = 0;
  // Group by 16 positions per task so workers share the load evenly.
  const tasks: string[][] = [];
  for (let i = 0; i < missing.length; i += 16) tasks.push(missing.slice(i, i + 16));
  await deps.pool.run(
    tasks,
    (fs) => fs.map((fen) => ({ fen, nodes: s.pass1Nodes, multiPv: 1 })),
    async (_t, req, ev) => {
      evals.set(req.fen, ev);
      await deps.cache?.setEval(key(req.fen), ev);
      deps.onProgress?.({ phase: "candidates", done: ++done, total: missing.length });
    },
    deps.signal,
  );
  if (deps.signal?.aborted) throw new DOMException("Aborted", "AbortError");

  const phaseSamples: PhaseLevelSample[] = [];
  targets.forEach((t, i) => {
    const color = t.game.game.playerColor;
    const p = plan[i];
    const before = winPercentFor(evals.get(p.fen)!.score, color);
    const losses = new Map<string, number>();
    p.ucis.forEach((u, k) => losses.set(u, Math.max(0, before - winPercentFor(evals.get(p.after[k])!.score, color))));
    const realLoss = losses.get(t.played)!;
    if (t.m2) {
      const entry = moves[t.game.game.id].find((m) => m.ply === t.ply)!;
      entry.peer = peerMetrics({ model: deps.model, pred: preds[i], losses, played: t.played, loss: realLoss, eloSelf: t.elo, eloOppo: t.oppo });
    }
    if (sampleKeys.has(`${t.game.game.id}#${t.ply}`)) {
      const e = expectedLoss(preds[i], losses);
      phaseSamples.push({ gameId: t.game.game.id, ply: t.ply, phase: t.phase!, realLoss, expectedLoss: e.expected, coverage: e.coverage });
    }
  });
  const offset = games[0]?.game.source === "chesscom" ? (eloForMaia(0, "chesscom") ?? 0) : 0;
  return { model: deps.model, eloOffset: offset, moves, phaseSamples };
}
