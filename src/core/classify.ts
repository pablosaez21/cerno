// Per-move judgement and labelling, and per-game patterns. Pure functions over
// AnalyzedGame: no engine calls here.
import type { AnalyzedGame } from "./analyze";
import { positionKey, sanOf } from "./chess";
import { endgameType, openingOf, phasesOf, type EndgameType, type OpeningInfo, type Phase } from "./phase";
import { tacticEvidence, type Motif, type TacticTag } from "./tactics";
import type { Color, GameRecord, Score } from "./types";
import { gameAccuracy, judge, THRESHOLDS, winPercentFor, winPercentWhite, type Judgement } from "./winprob";

export type Category = "tactics" | "openings" | "endgames" | "strategy";
export const CATEGORIES: Category[] = ["tactics", "openings", "endgames", "strategy"];

export type ClockTag = "time_trouble" | "fast_critical";

/** Clock left at or below this is time trouble: max(10 s, 10% of base). */
export function timeTroubleLimit(base: number | undefined): number {
  return Math.max(10, (base ?? 0) * 0.1);
}

/** A position is critical when the best move is this much better than the second. */
export const CRITICAL_GAP = 10;

export interface MoveAnalysis {
  gameId: string;
  ply: number;
  moveNumber: number;
  color: Color;
  fenBefore: string;
  played: { uci: string; san: string };
  best?: { uci: string; san: string };
  /** Best line from fenBefore (UCI), for the exercise solution. */
  bestLine: string[];
  /** Opponent's best reply line after the played move (UCI). */
  refutation: string[];
  winBefore: number;
  winAfter: number;
  /** Win percentage lost by the move, from the player's side, >= 0. */
  loss: number;
  judgement?: Judgement;
  /** Win % gap between the best and second-best move, when MultiPV ran. */
  bestGap?: number;
  /** True when pass 2 (deeper, MultiPV) confirmed this move. */
  deep: boolean;
  phase: Phase;
  /** Set when phase is endgame. */
  endgameType?: EndgameType;
  clockBefore?: number;
  timeSpent?: number;
  /** Main category, only for judged moves. */
  category?: Category;
  tactic?: { tag: TacticTag; motifs: Motif[]; material?: number; mateIn?: number; line: string[] };
  clockTags: ClockTag[];
  /** Same position and same move judged bad in another game. */
  repeated?: boolean;
}

export type GamePattern =
  | "drift" // lost slowly: no blunder, a sum of smaller errors
  | "advantage_not_converted" // reached a winning position, did not win; lost outside the endgame
  | "winning_endgame_not_converted" // same, with the decisive loss in the endgame
  | "equal_endgame_lost" // entered the endgame level and lost
  | "lost_with_time_left" // lost (not on time) with half or more of the base time left
  | "lost_on_time";

/** Win % from which a position counts as winning for "not converted". */
export const WINNING = 85;
/** Endgame entry counts as level inside this band. */
export const LEVEL_BAND: [number, number] = [35, 65];

export interface GameAnalysis {
  game: GameRecord;
  opening: OpeningInfo;
  /** Ply where the opening phase ends (inclusive). */
  openingEnd: number;
  /** Player's win % at the end of the opening phase. */
  winAfterOpening?: number;
  moves: MoveAnalysis[];
  patterns: { pattern: GamePattern; ply?: number; value?: number }[];
  /** The player's move that decided a lost game (or a drawn won game), if any. */
  decisivePly?: number;
  accuracy?: number;
  playerMoves: number;
}

function scoreOf(game: AnalyzedGame, positionIndex: number): Score {
  return game.evals[positionIndex].score;
}

export function classifyGame(a: AnalyzedGame): GameAnalysis {
  const { game, parsed } = a;
  const me = game.playerColor;
  const opening = openingOf(parsed.plies);
  const phases = phasesOf(parsed.startFen, parsed.plies, opening.bookPlies);
  const firstNonOpening = phases.findIndex((p) => p !== "opening");
  const openingEnd = firstNonOpening < 0 ? parsed.plies.length : firstNonOpening;

  // Player's clock before each of their moves.
  const clockBefore = new Map<number, number | undefined>();
  let last = game.timeControl?.base;
  for (const p of parsed.plies) {
    if (p.color !== me) continue;
    clockBefore.set(p.ply, last);
    if (p.clockAfter !== undefined) last = p.clockAfter;
  }
  const spent = parsed.plies.filter((p) => p.color === me && p.timeSpent !== undefined).map((p) => p.timeSpent!);
  const medianSpent = median(spent);

  const moves: MoveAnalysis[] = [];
  for (const p of parsed.plies) {
    if (p.color !== me) continue;
    const deep = a.deep[p.ply];
    const beforeScore = deep?.before.score ?? scoreOf(a, p.ply - 1);
    const afterScore = deep?.after.score ?? scoreOf(a, p.ply);
    const bestLine = deep?.before.lines[0]?.pv ?? a.evals[p.ply - 1].lines[0]?.pv ?? [];
    const playedIsBest = bestLine[0] === p.uci;
    const winBefore = winPercentFor(beforeScore, me);
    let winAfter = winPercentFor(afterScore, me);
    if (playedIsBest) winAfter = Math.max(winAfter, winBefore);
    const loss = Math.max(0, winBefore - winAfter);
    const judgement = deep ? judge(loss) : undefined; // Only pass-2 moves are judged.
    const lines = deep?.before.lines ?? [];
    const bestGap = lines.length > 1 ? winPercentFor(lines[0].score, me) - winPercentFor(lines[1].score, me) : undefined;
    const phase = phases[p.ply - 1];
    const m: MoveAnalysis = {
      gameId: game.id,
      ply: p.ply,
      moveNumber: p.moveNumber,
      color: me,
      fenBefore: p.fenBefore,
      played: { uci: p.uci, san: p.san },
      best: bestLine[0] ? { uci: bestLine[0], san: sanOf(p.fenBefore, bestLine[0]) ?? bestLine[0] } : undefined,
      bestLine,
      refutation: deep?.after.lines[0]?.pv ?? [],
      winBefore,
      winAfter,
      loss,
      judgement,
      bestGap,
      deep: !!deep,
      phase,
      endgameType: phase === "endgame" ? endgameType(p.fenBefore) : undefined,
      clockBefore: clockBefore.get(p.ply),
      timeSpent: p.timeSpent,
      clockTags: [],
    };
    if (judgement && deep) {
      const t = tacticEvidence({
        fenBefore: p.fenBefore,
        played: p.uci,
        color: me,
        bestLine,
        bestScore: deep.before.score,
        refutation: m.refutation,
        afterScore: deep.after.score,
      });
      if (t) m.tactic = t;
      m.category = t ? "tactics" : phase === "opening" ? "openings" : phase === "endgame" ? "endgames" : "strategy";
      const limit = timeTroubleLimit(game.timeControl?.base);
      const inTrouble = m.clockBefore !== undefined && m.clockBefore <= limit;
      if (inTrouble) m.clockTags.push("time_trouble");
      if (
        !inTrouble &&
        judgement !== "inaccuracy" &&
        bestGap !== undefined &&
        bestGap >= CRITICAL_GAP &&
        p.timeSpent !== undefined &&
        medianSpent !== undefined &&
        p.timeSpent <= Math.min(10, 0.5 * medianSpent)
      ) {
        m.clockTags.push("fast_critical");
      }
    }
    moves.push(m);
  }

  // Win % for the player after every ply (index 0 = start), pass-2 where available.
  const curve: number[] = [winPercentFor(scoreOf(a, 0), me)];
  for (const p of parsed.plies) {
    const d = a.deep[p.ply];
    curve.push(winPercentFor(d ? d.after.score : scoreOf(a, p.ply), me));
  }

  const patterns: GameAnalysis["patterns"] = [];
  const judged = moves.filter((m) => m.judgement);
  const isLoss = game.result === "loss";
  const finalPoints = game.result === "win" ? 100 : game.result === "draw" ? 50 : 0;

  // Advantage not converted: the player reached WINNING after the opening and did not win.
  let peakPly: number | undefined;
  let peak = 0;
  for (let i = Math.min(openingEnd, curve.length - 1); i < curve.length; i++) {
    if (curve[i] >= WINNING && curve[i] > peak) {
      peak = curve[i];
      peakPly = i;
    }
  }
  let decisivePly: number | undefined;
  if (peakPly !== undefined && game.result !== "win") {
    const after = judged.filter((m) => m.ply > peakPly!);
    const worst = maxBy(after, (m) => m.loss);
    if (worst) {
      decisivePly = worst.ply;
      patterns.push({
        pattern: worst.phase === "endgame" ? "winning_endgame_not_converted" : "advantage_not_converted",
        ply: worst.ply,
        value: peak - finalPoints,
      });
    }
  }
  if (isLoss && decisivePly === undefined) {
    const worst = maxBy(judged.filter((m) => m.judgement !== "inaccuracy"), (m) => m.loss);
    decisivePly = worst?.ply;
  }

  // Equal endgame lost.
  const firstEnd = parsed.plies.findIndex((_, i) => phases[i] === "endgame");
  if (isLoss && firstEnd >= 0) {
    const w = curve[firstEnd];
    if (w >= LEVEL_BAND[0] && w <= LEVEL_BAND[1]) {
      const worst = maxBy(judged.filter((m) => m.phase === "endgame"), (m) => m.loss);
      if (worst) patterns.push({ pattern: "equal_endgame_lost", ply: worst.ply, value: w });
    }
  }

  // Drift: lost with no blunder, from a playable position after the opening.
  const winAfterOpening = curve[Math.min(openingEnd, curve.length - 1)];
  if (isLoss && winAfterOpening >= 40 && !moves.some((m) => m.loss >= THRESHOLDS.blunder) && judged.length) {
    patterns.push({ pattern: "drift", value: moves.reduce((s, m) => s + m.loss, 0) });
  }

  // Clock patterns.
  const lastOwn = [...parsed.plies].reverse().find((p) => p.color === me && p.clockAfter !== undefined);
  if (isLoss && game.termination === "timeout") patterns.push({ pattern: "lost_on_time" });
  else if (isLoss && game.timeControl && lastOwn?.clockAfter !== undefined && lastOwn.clockAfter >= 0.5 * game.timeControl.base) {
    patterns.push({ pattern: "lost_with_time_left", value: lastOwn.clockAfter });
  }

  const whiteCurve = [winPercentWhite(scoreOf(a, 0)), ...parsed.plies.map((p) => winPercentWhite(a.deep[p.ply]?.after.score ?? scoreOf(a, p.ply)))];
  const acc = gameAccuracy(whiteCurve)[me];

  return {
    game,
    opening,
    openingEnd,
    winAfterOpening,
    moves,
    patterns,
    decisivePly,
    accuracy: acc,
    playerMoves: moves.length,
  };
}

/**
 * Marks moves played in the same position with the same move in two or more
 * games and judged bad each time. Opening-phase repeats move to "openings"
 * even when the error is tactical: it is a repertoire problem.
 */
export function markRepeated(games: GameAnalysis[]): void {
  const groups = new Map<string, MoveAnalysis[]>();
  for (const g of games) {
    for (const m of g.moves) {
      if (!m.judgement) continue;
      const k = `${positionKey(m.fenBefore)}|${m.played.uci}`;
      groups.set(k, [...(groups.get(k) ?? []), m]);
    }
  }
  for (const ms of groups.values()) {
    if (new Set(ms.map((m) => m.gameId)).size < 2) continue;
    for (const m of ms) {
      m.repeated = true;
      if (m.phase === "opening") m.category = "openings";
    }
  }
}

function median(xs: number[]): number | undefined {
  if (!xs.length) return undefined;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function maxBy<T>(xs: T[], f: (x: T) => number): T | undefined {
  let best: T | undefined;
  for (const x of xs) if (!best || f(x) > f(best)) best = x;
  return best;
}
