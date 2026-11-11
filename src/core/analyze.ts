// Two-pass engine analysis of a set of games.
//   Pass 1: every distinct position once, with a small node budget. The eval
//           after a move is the eval before the next one.
//   Pass 2: only the player's moves that lose win probability in pass 1, with
//           a larger budget and MultiPV, before and after the move.
import { positionKey } from "./chess";
import type { AnalyseRequest, EnginePool } from "./engine";
import { parseGameMoves, type ParsedGame } from "./game";
import type { GameRecord, PositionEval } from "./types";
import { winPercentFor } from "./winprob";

export interface AnalysisSettings {
  pass1Nodes: number;
  pass2Nodes: number;
  multiPv: number;
  /** Pass-1 loss (win %) from which a player move is re-analysed. */
  candidateLoss: number;
  /** Identifies engine + net. Part of the cache key. */
  engineId: string;
}

export const DEFAULT_SETTINGS: AnalysisSettings = {
  pass1Nodes: 60_000,
  pass2Nodes: 500_000,
  multiPv: 3,
  candidateLoss: 4,
  engineId: "sf19-lite",
};

/** Bump when the stored shape of AnalyzedGame changes. */
export const ANALYSIS_VERSION = 1;

export interface EvalCache {
  getEval(key: string): Promise<PositionEval | undefined>;
  setEval(key: string, ev: PositionEval): Promise<void>;
  getGame(key: string): Promise<AnalyzedGame | undefined>;
  setGame(key: string, game: AnalyzedGame): Promise<void>;
}

export interface DeepEval {
  before: PositionEval;
  after: PositionEval;
}

export interface AnalyzedGame {
  game: GameRecord;
  parsed: ParsedGame;
  /** Pass-1 eval per position: index 0 = start, i = after ply i. */
  evals: PositionEval[];
  /** Pass-2 evals keyed by ply. */
  deep: Record<number, DeepEval>;
}

export interface Progress {
  phase: "pass1" | "pass2" | "done";
  done: number;
  total: number;
  /** Games served from cache without engine work. */
  cachedGames: number;
}

const evalKey = (s: AnalysisSettings, nodes: number, multiPv: number, fen: string) =>
  `${s.engineId}|${nodes}|${multiPv}|${positionKey(fen)}`;
export const gameKey = (s: AnalysisSettings, id: string) =>
  `${ANALYSIS_VERSION}|${s.engineId}|${s.pass1Nodes}|${s.pass2Nodes}|${s.multiPv}|${s.candidateLoss}|${id}`;

export async function analyzeGames(
  games: GameRecord[],
  deps: {
    pool: EnginePool;
    cache?: EvalCache;
    settings?: AnalysisSettings;
    onProgress?: (p: Progress) => void;
    signal?: AbortSignal;
  },
): Promise<AnalyzedGame[]> {
  const s = deps.settings ?? DEFAULT_SETTINGS;
  const cache = deps.cache;
  const results = new Map<string, AnalyzedGame>();
  const pending: { game: GameRecord; parsed: ParsedGame; evals: (PositionEval | undefined)[] }[] = [];

  for (const game of games) {
    const cached = await cache?.getGame(gameKey(s, game.id));
    if (cached) {
      results.set(game.id, { ...cached, game });
      continue;
    }
    let parsed: ParsedGame;
    try {
      parsed = parseGameMoves(game);
    } catch {
      continue; // Unreadable PGN: skipped, reported by the caller as missing.
    }
    if (!parsed.plies.length) continue;
    pending.push({ game, parsed, evals: [] });
  }
  const cachedGames = results.size;

  // ---- Pass 1
  const fensOf = (p: (typeof pending)[number]) => [p.parsed.startFen, ...p.parsed.plies.map((x) => x.fenAfter)];
  let total1 = 0;
  for (const p of pending) {
    const fens = fensOf(p);
    for (let i = 0; i < fens.length; i++) {
      p.evals[i] = await cache?.getEval(evalKey(s, s.pass1Nodes, 1, fens[i]));
      if (!p.evals[i]) total1++;
    }
  }
  let done1 = 0;
  deps.onProgress?.({ phase: "pass1", done: 0, total: total1, cachedGames });
  await deps.pool.run(
    pending,
    (p) =>
      fensOf(p)
        .map((fen, i) => ({ fen, i }))
        .filter(({ i }) => !p.evals[i])
        .map(({ fen }) => ({ fen, nodes: s.pass1Nodes, multiPv: 1 })),
    async (p, req, ev) => {
      const fens = fensOf(p);
      fens.forEach((fen, i) => {
        if (fen === req.fen && !p.evals[i]) p.evals[i] = ev;
      });
      await cache?.setEval(evalKey(s, s.pass1Nodes, 1, req.fen), ev);
      done1++;
      deps.onProgress?.({ phase: "pass1", done: done1, total: total1, cachedGames });
    },
    deps.signal,
  );
  if (deps.signal?.aborted) throw new DOMException("Aborted", "AbortError");

  // ---- Pass 2
  type Job = { p: (typeof pending)[number]; requests: AnalyseRequest[]; deep: Record<number, Partial<DeepEval>> };
  const jobs: Job[] = [];
  let total2 = 0;
  for (const p of pending) {
    const job: Job = { p, requests: [], deep: {} };
    for (const ply of p.parsed.plies) {
      if (ply.color !== p.game.playerColor) continue;
      const before = p.evals[ply.ply - 1]!;
      const after = p.evals[ply.ply]!;
      const loss = winPercentFor(before.score, ply.color) - winPercentFor(after.score, ply.color);
      if (loss < s.candidateLoss) continue;
      const reqBefore = { fen: ply.fenBefore, nodes: s.pass2Nodes, multiPv: s.multiPv };
      const reqAfter = { fen: ply.fenAfter, nodes: s.pass2Nodes, multiPv: 1 };
      const d: Partial<DeepEval> = {};
      d.before = await cache?.getEval(evalKey(s, reqBefore.nodes, reqBefore.multiPv, reqBefore.fen));
      d.after = await cache?.getEval(evalKey(s, reqAfter.nodes, reqAfter.multiPv, reqAfter.fen));
      if (!d.before) job.requests.push(reqBefore);
      if (!d.after) job.requests.push(reqAfter);
      job.deep[ply.ply] = d;
    }
    total2 += job.requests.length;
    jobs.push(job);
  }
  let done2 = 0;
  deps.onProgress?.({ phase: "pass2", done: 0, total: total2, cachedGames });
  await deps.pool.run(
    jobs.filter((j) => j.requests.length),
    (j) => j.requests,
    async (j, req, ev) => {
      for (const [plyStr, d] of Object.entries(j.deep)) {
        const ply = j.p.parsed.plies[Number(plyStr) - 1];
        if (req.multiPv === s.multiPv && ply.fenBefore === req.fen && !d.before) d.before = ev;
        else if (req.multiPv === 1 && ply.fenAfter === req.fen && !d.after) d.after = ev;
      }
      await cache?.setEval(evalKey(s, req.nodes, req.multiPv, req.fen), ev);
      done2++;
      deps.onProgress?.({ phase: "pass2", done: done2, total: total2, cachedGames });
    },
    deps.signal,
  );
  if (deps.signal?.aborted) throw new DOMException("Aborted", "AbortError");

  for (const j of jobs) {
    const analyzed: AnalyzedGame = {
      game: j.p.game,
      parsed: j.p.parsed,
      evals: j.p.evals as PositionEval[],
      deep: j.deep as Record<number, DeepEval>,
    };
    results.set(j.p.game.id, analyzed);
    await cache?.setGame(gameKey(s, j.p.game.id), analyzed);
  }
  deps.onProgress?.({ phase: "done", done: 1, total: 1, cachedGames });
  return games.map((g) => results.get(g.id)).filter((g): g is AnalyzedGame => !!g);
}
