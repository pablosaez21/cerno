// Repertoire with Maia columns: opening positions the player reaches repeatedly,
// what he plays there, what it costs, and what Lichess blitz players 400 Elo
// lower and higher play there (Maia-3).
import { positionKey, sanOf } from "./chess";
import type { Decision } from "./peers";

/** A node is a position with the player to move reached in this many games... */
export const REPERTOIRE_MIN_GAMES = 3;
/** ...at or before this ply. */
export const REPERTOIRE_MAX_PLY = 24;

export interface RepertoireMove {
  uci: string;
  san: string;
  count: number;
  /** Mean pass-1 loss (win %), pass-2 loss when the move was judged. */
  meanLoss: number;
  pMinus400: number;
  p0: number;
  pPlus400: number;
  /** Played twice with mean loss >= 5, or three times with mean loss >= 3. */
  leak: boolean;
  /** Stronger players abandon it: p(+400) <= 0.6 x p(-400). */
  habitBelowLevel: boolean;
  evidence: { gameId: string; ply: number }[];
}

export interface RepertoireNode {
  fen: string;
  ply: number;
  games: number;
  /** Player's points per game from this node, 0..1. */
  score: number;
  moves: RepertoireMove[];
  favouritePlus400: { uci: string; san: string; p: number; loss: number };
  engineBest: { uci: string; san: string };
}

export function repertoire(decisions: Decision[], points: Map<string, number>, judgedLoss: Map<string, number> = new Map()): RepertoireNode[] {
  const groups = new Map<string, Decision[]>();
  for (const d of decisions) {
    if (d.mover !== "player" || d.ply > REPERTOIRE_MAX_PLY) continue;
    const k = positionKey(d.fen);
    groups.set(k, [...(groups.get(k) ?? []), d]);
  }
  const nodes: RepertoireNode[] = [];
  for (const ds of groups.values()) {
    const games = new Set(ds.map((d) => d.gameId));
    if (games.size < REPERTOIRE_MIN_GAMES) continue;
    const first = ds[0];
    const byMove = new Map<string, Decision[]>();
    for (const d of ds) byMove.set(d.played, [...(byMove.get(d.played) ?? []), d]);
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
    const r = (x: number, k = 3) => Math.round(x * 10 ** k) / 10 ** k;
    const moves: RepertoireMove[] = [...byMove.entries()].map(([uci, xs]) => {
      const lossOf = (d: Decision) => judgedLoss.get(`${d.gameId}#${d.ply}`) ?? d.playedLoss;
      const pOf = (d: Decision, level: number) => d.p[level][d.moves.indexOf(uci)];
      const meanLoss = mean(xs.map(lossOf));
      const pm = mean(xs.map((d) => pOf(d, 0)));
      const pp = mean(xs.map((d) => pOf(d, 4)));
      return {
        uci,
        san: sanOf(first.fen, uci) ?? uci,
        count: xs.length,
        meanLoss: r(meanLoss, 1),
        pMinus400: r(pm),
        p0: r(mean(xs.map((d) => pOf(d, 2)))),
        pPlus400: r(pp),
        leak: (xs.length >= 2 && meanLoss >= 5) || (xs.length >= 3 && meanLoss >= 3),
        habitBelowLevel: pp <= 0.6 * pm,
        evidence: xs.map((d) => ({ gameId: d.gameId, ply: d.ply })),
      };
    });
    // Favourite of players 400 Elo higher among the evaluated moves.
    let fav = 0;
    first.moves.forEach((_, i) => {
      if (first.inSet[i] && first.p[4][i] > first.p[4][fav]) fav = i;
    });
    nodes.push({
      fen: first.fen,
      ply: first.ply,
      games: games.size,
      score: r(mean([...games].map((g) => points.get(g) ?? 0)), 2),
      moves: moves.sort((a, b) => b.count - a.count),
      favouritePlus400: { uci: first.moves[fav], san: sanOf(first.fen, first.moves[fav]) ?? first.moves[fav], p: r(first.p[4][fav]), loss: r(first.loss[fav], 1) },
      engineBest: { uci: first.engineBest, san: sanOf(first.fen, first.engineBest) ?? first.engineBest },
    });
  }
  return nodes.sort((a, b) => a.ply - b.ply || b.games - a.games);
}
