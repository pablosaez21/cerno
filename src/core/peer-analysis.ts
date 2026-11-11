// Peer profile, orchestration: decision records for every move of both sides.
//  predictPeers: Maia-3 at five Elo levels (needs only the parsed games).
//  evaluatePeers: Stockfish on the candidate moves at the pass-1 budget (needs pass-1 evals).
import { evalKey, type AnalysisSettings, type AnalyzedGame, type EvalCache } from "./analyze";
import { fenOf, playLine } from "./chess";
import type { EnginePool } from "./engine";
import { eloForMaia, MAIA_MIN_CLOCK } from "./level";
import type { MaiaPrediction } from "./maia";
import type { MaiaQuery } from "./maia-ort";
import { openingOf, phasesOf, type Phase } from "./phase";
import { candidateSet, finishDecision, PEER_ELO_DELTAS, type Decision } from "./peers";
import type { Color, PositionEval } from "./types";
import { winPercentFor } from "./winprob";

export interface PeerSkeleton {
  gameId: string;
  ply: number;
  mover: "player" | "opponent";
  color: Color;
  moveNumber: number;
  phase: Phase;
  clockBefore?: number;
  timeSpent?: number;
  inScope: boolean;
  elo: number;
  eloOpp: number;
  fen: string;
  fens: string[];
  played: string;
  /** Maia predictions at each PEER_ELO_DELTAS level. */
  preds: MaiaPrediction[];
}

export interface PredictDeps {
  predict: (queries: MaiaQuery[]) => Promise<MaiaPrediction[]>;
  batchSize?: number;
  onProgress?: (p: { phase: "peers-maia"; done: number; total: number }) => void;
  signal?: AbortSignal;
}

/** Blitz games with both ratings known; every move of both sides. */
export function peerSkeletons(games: AnalyzedGame[]): Omit<PeerSkeleton, "preds">[] {
  const out: Omit<PeerSkeleton, "preds">[] = [];
  for (const { game, parsed } of games) {
    if (game.timeClass !== "blitz") continue;
    const eloW = eloForMaia(game.white.rating, game.source);
    const eloB = eloForMaia(game.black.rating, game.source);
    if (eloW === undefined || eloB === undefined || parsed.plies.length < 2) continue;
    const fens = [parsed.startFen, ...parsed.plies.map((p) => p.fenAfter)];
    const phases = phasesOf(parsed.startFen, parsed.plies, openingOf(parsed.plies).bookPlies);
    const last: Record<Color, number | undefined> = { white: game.timeControl?.base, black: game.timeControl?.base };
    for (const p of parsed.plies) {
      const before = last[p.color];
      if (p.clockAfter !== undefined) last[p.color] = p.clockAfter;
      const white = p.color === "white";
      out.push({
        gameId: game.id,
        ply: p.ply,
        mover: p.color === game.playerColor ? "player" : "opponent",
        color: p.color,
        moveNumber: p.moveNumber,
        phase: phases[p.ply - 1],
        clockBefore: before,
        timeSpent: p.timeSpent,
        inScope: before === undefined || before >= MAIA_MIN_CLOCK,
        elo: white ? eloW : eloB,
        eloOpp: white ? eloB : eloW,
        fen: p.fenBefore,
        fens: fens.slice(Math.max(0, p.ply - 8), p.ply),
        played: p.uci,
      });
    }
  }
  return out;
}

export async function predictPeers(games: AnalyzedGame[], deps: PredictDeps): Promise<PeerSkeleton[]> {
  const base = peerSkeletons(games);
  const batch = deps.batchSize ?? 256;
  const queries: MaiaQuery[] = [];
  for (const s of base) for (const d of PEER_ELO_DELTAS) queries.push({ fens: s.fens, eloSelf: s.elo + d, eloOppo: s.eloOpp });
  const preds: MaiaPrediction[] = [];
  for (let i = 0; i < queries.length; i += batch) {
    if (deps.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    preds.push(...(await deps.predict(queries.slice(i, i + batch))));
    deps.onProgress?.({ phase: "peers-maia", done: Math.min(i + batch, queries.length), total: queries.length });
  }
  const L = PEER_ELO_DELTAS.length;
  return base.map((s, i) => ({ ...s, preds: preds.slice(i * L, (i + 1) * L) }));
}

export interface EvaluateDeps {
  pool: EnginePool;
  cache?: EvalCache;
  settings: AnalysisSettings;
  onProgress?: (p: { phase: "peers-candidates"; done: number; total: number }) => void;
  signal?: AbortSignal;
  /** Called with the full predictions before they are dropped (style expectations). */
  onPolicies?: (d: Decision, preds: MaiaPrediction[]) => void;
}

/** Decision records from the skeletons and the pass-1 evals of each game. */
export async function evaluatePeers(skeletons: PeerSkeleton[], games: AnalyzedGame[], deps: EvaluateDeps): Promise<Decision[]> {
  const s = deps.settings;
  const key = (fen: string) => evalKey(s, s.pass1Nodes, 1, fen);
  const byGame = new Map(games.map((g) => [g.game.id, g]));
  const evals = new Map<string, PositionEval>();
  type Plan = { sk: PeerSkeleton; best: string; winPos: number; moves: string[]; inSet: boolean[]; afterFen: (string | undefined)[]; win: (number | undefined)[] };
  const plans: Plan[] = [];
  // Missing positions grouped by game: one engine keeps its hash across a game.
  const missingByGame = new Map<string, Set<string>>();
  for (const sk of skeletons) {
    const g = byGame.get(sk.gameId)!;
    const before = g.evals[sk.ply - 1];
    const best = before?.lines[0]?.pv[0];
    if (!best) continue; // No engine line: nothing to compare against.
    const winPos = winPercentFor(before.score, sk.color);
    const set = candidateSet(sk.preds, best);
    const moves = set.includes(sk.played) ? set : [...set, sk.played];
    const inSet = moves.map((m) => set.includes(m));
    const win: (number | undefined)[] = [];
    const afterFen: (string | undefined)[] = [];
    for (const m of moves) {
      if (m === best) {
        // The best move's value is the position's own eval: no extra search.
        win.push(winPos);
        afterFen.push(undefined);
      } else if (m === sk.played && g.evals[sk.ply]) {
        win.push(winPercentFor(g.evals[sk.ply].score, sk.color));
        afterFen.push(undefined);
      } else {
        const f = fenOf(playLine(sk.fen, [m]).positions[1]);
        win.push(undefined);
        afterFen.push(f);
      }
    }
    plans.push({ sk, best, winPos, moves, inSet, afterFen, win });
  }
  for (const p of plans) {
    for (const f of p.afterFen) {
      if (!f || evals.has(f)) continue;
      const c = await deps.cache?.getEval(key(f));
      if (c) evals.set(f, c);
      else {
        const set = missingByGame.get(p.sk.gameId) ?? new Set<string>();
        set.add(f);
        missingByGame.set(p.sk.gameId, set);
      }
    }
  }
  // Positions shared across games are searched once.
  const seen = new Set<string>();
  const tasks: string[][] = [];
  for (const set of missingByGame.values()) {
    const t = [...set].filter((f) => !seen.has(f));
    t.forEach((f) => seen.add(f));
    if (t.length) tasks.push(t);
  }
  let done = 0;
  await deps.pool.run(
    tasks,
    (fs) => fs.map((fen) => ({ fen, nodes: s.pass1Nodes, multiPv: 1 })),
    async (_t, req, ev) => {
      evals.set(req.fen, ev);
      await deps.cache?.setEval(key(req.fen), ev);
      deps.onProgress?.({ phase: "peers-candidates", done: ++done, total: seen.size });
    },
    deps.signal,
  );
  if (deps.signal?.aborted) throw new DOMException("Aborted", "AbortError");

  return plans.map((p) => {
    const { sk } = p;
    const win = p.win.map((w, i) => w ?? winPercentFor(evals.get(p.afterFen[i]!)!.score, sk.color));
    const mass = sk.preds.map((pred) => p.moves.reduce((a, m, i) => a + (p.inSet[i] ? (pred.policy[m] ?? 0) : 0), 0));
    const d = finishDecision({
      gameId: sk.gameId,
      ply: sk.ply,
      mover: sk.mover,
      color: sk.color,
      moveNumber: sk.moveNumber,
      phase: sk.phase,
      clockBefore: sk.clockBefore,
      timeSpent: sk.timeSpent,
      inScope: sk.inScope,
      elo: sk.elo,
      eloOpp: sk.eloOpp,
      fen: sk.fen,
      played: sk.played,
      engineBest: p.best,
      moves: p.moves,
      inSet: p.inSet,
      p: sk.preds.map((pred) => p.moves.map((m) => pred.policy[m] ?? 0)),
      mass,
      win,
      winPosition: p.winPos,
    });
    deps.onPolicies?.(d, sk.preds);
    return d;
  });
}
