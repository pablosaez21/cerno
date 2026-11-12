// Peer profile: decision records -> the report's `profile` section, and the
// per-move Maia fields of judged errors.
// Population: Lichess blitz players of the same Elo according to Maia-3.
// Control: the player's opponents in the same games.
import { ALL_CLASS, BOOTSTRAP_RESAMPLES, BOOTSTRAP_SEED, CLOCK_CLASSES, eloShift, PRIMARY_CLASSES, profileStats, SECONDARY_CLASSES, type ClassStat, type ProfileStats } from "./peer-stats";
import { PEER_COVERAGE, PEER_ELO_DELTAS, PEER_MAX_MOVES, type Decision } from "./peers";

/** Index of the +200 and +400 levels in PEER_ELO_DELTAS. */
const L0 = 2;
const LP200 = 3;
const LP400 = 4;
const LM400 = 0;

/** Loss cap when computing expected losses (one blunder must not dominate). */
export const EXPECTED_LOSS_CAP = 30;
/** Opponents' full-likelihood shift above this means Maia's Elo scale is off for these games. */
export const OFFSET_WARNING = 150;
/** Share of the player's decisions in games with a rating gap above 300 that triggers a warning. */
export const MISMATCH_SHARE = 0.2;
/** A judged error is `next_level` when players 400 Elo higher find a good move this much more often (top 30% of the reference player's errors). */
export const LEARNABILITY_TAG = 0.1;
/** Level labels on normalised pGood. */
export const LEVEL_THRESHOLDS = { belowLevel: 0.7, hard: 0.3 } as const;
export const EVIDENCE_CAP = 50;

export interface EvidenceRef {
  gameId: string;
  ply: number;
}

export interface ProfileClass extends ClassStat {
  nextLevel: { gainPerGame: number; share: number };
  evidence: EvidenceRef[];
}

export interface PairedStat {
  id: string;
  games: number;
  /** Player minus opponent, per game. */
  mean: number;
  se: number;
  z: number;
}

export interface Profile {
  population: "lichess_blitz";
  control: "opponents_same_games";
  games: number;
  decisions: { player: number; opponents: number };
  settings: { deltas: number[]; coverage: number; maxMoves: number; bootstrap: number; seed: number };
  mismatchedShare: number;
  warnings: string[];
  overall: ProfileClass;
  classes: ProfileClass[];
  secondary: ProfileClass[];
  clock: { paired: PairedStat[]; classes: ProfileClass[]; experimental: true };
  /** Filled by later steps (style traits, repertoire). */
  style: unknown[];
  repertoire: unknown[];
}

/** Probability, at a level, of a good move among the evaluated set, normalised by the set's mass. */
export function goodShare(d: Decision, level: number): number {
  let good = 0;
  d.moves.forEach((_, i) => {
    if (d.inSet[i] && d.cat[i] === 0) good += d.p[level][i];
  });
  return d.mass[level] > 0 ? good / d.mass[level] : 0;
}

/** Expected loss at a level over the evaluated set, normalised, losses capped. */
export function expectedLossAt(d: Decision, level: number): number {
  let e = 0;
  d.moves.forEach((_, i) => {
    if (d.inSet[i]) e += d.p[level][i] * Math.min(d.loss[i], EXPECTED_LOSS_CAP);
  });
  return d.mass[level] > 0 ? e / d.mass[level] : 0;
}

export type LevelTag = "below_level" | "hard";

export interface PeerFields {
  model: string;
  /** Mover's Elo on Maia's scale and the opponent's. */
  eloSelf: number;
  eloOppo: number;
  pPlayed: number;
  /** Probability of a good move for players of this Elo, over the evaluated moves. */
  pGood: number;
  /** Share of Maia's probability that the evaluated moves cover. */
  pEvaluated: number;
  /** Same at +200 and +400 Elo. */
  pGoodNext: number;
  pGoodPlus400: number;
  learnability: number;
  /** log p(+400) - log p(-400) of the move played: negative = stronger players abandon it. */
  eloTrend: number;
  level?: LevelTag;
  nextLevel: boolean;
  avoidableLoss: number;
  nextLevelLoss: number;
}

export function peerFields(d: Decision, judgedLoss: number, model: string): PeerFields {
  const ip = d.moves.indexOf(d.played);
  const pGood = goodShare(d, L0);
  const pGoodNext = goodShare(d, LP200);
  const pGoodPlus400 = goodShare(d, LP400);
  const r = (x: number, k = 4) => Math.round(x * 10 ** k) / 10 ** k;
  return {
    model,
    eloSelf: d.elo,
    eloOppo: d.eloOpp,
    pPlayed: r(d.p[L0][ip]),
    pGood: r(pGood),
    pEvaluated: r(d.mass[L0]),
    pGoodNext: r(pGoodNext),
    pGoodPlus400: r(pGoodPlus400),
    learnability: r(pGoodPlus400 - pGood),
    eloTrend: r(Math.log(Math.max(d.p[LP400][ip], 1e-9)) - Math.log(Math.max(d.p[LM400][ip], 1e-9)), 3),
    level: pGood >= LEVEL_THRESHOLDS.belowLevel ? "below_level" : pGood <= LEVEL_THRESHOLDS.hard ? "hard" : undefined,
    nextLevel: pGoodPlus400 - pGood >= LEARNABILITY_TAG,
    avoidableLoss: r(judgedLoss * pGood, 2),
    nextLevelLoss: r(judgedLoss * pGoodNext, 2),
  };
}

/**
 * Shift of the opponents with the full move likelihood (which move, not only how
 * good). About 0 when the Elo conversion is right for these games.
 */
export function opponentsTotalShift(decisions: Decision[]): number {
  const tot = PEER_ELO_DELTAS.map(() => 0);
  for (const d of decisions) {
    if (d.mover !== "opponent" || !d.inScope) continue;
    const ip = d.moves.indexOf(d.played);
    d.p.forEach((pd, k) => {
      tot[k] += d.inSet[ip] ? Math.log(Math.max(pd[ip], 1e-9)) : Math.log(Math.max(1 - d.mass[k], 1e-6));
    });
  }
  return Math.round(eloShift(tot).shift);
}

function paired(id: string, values: Map<string, { p?: number; o?: number }>): PairedStat {
  const diffs = [...values.values()].filter((v) => v.p !== undefined && v.o !== undefined).map((v) => v.p! - v.o!);
  const n = diffs.length;
  const mean = n ? diffs.reduce((a, b) => a + b, 0) / n : 0;
  const sd = n > 1 ? Math.sqrt(diffs.reduce((a, x) => a + (x - mean) ** 2, 0) / (n - 1)) : 0;
  const se = n ? sd / Math.sqrt(n) : 0;
  const r = (x: number) => Math.round(x * 100) / 100;
  return { id, games: n, mean: r(mean), se: r(se), z: se > 0 ? r(mean / se) : 0 };
}

/** Clock, descriptive: player minus opponent in the same game. A clock finding needs |z| >= 3. */
export function pairedClock(decisions: Decision[]): PairedStat[] {
  const out: PairedStat[] = [];
  for (const n of [10, 20, 30, 40]) {
    const m = new Map<string, { p?: number; o?: number }>();
    for (const d of decisions) {
      if (d.moveNumber !== n || d.clockBefore === undefined) continue;
      const e = m.get(d.gameId) ?? {};
      e[d.mover === "player" ? "p" : "o"] = d.clockBefore;
      m.set(d.gameId, e);
    }
    out.push(paired(`clock_at_move_${n}`, m));
  }
  for (const phase of ["opening", "middlegame", "endgame"] as const) {
    const acc = new Map<string, { p: number[]; o: number[] }>();
    for (const d of decisions) {
      if (d.phase !== phase || d.timeSpent === undefined) continue;
      const e = acc.get(d.gameId) ?? { p: [], o: [] };
      e[d.mover === "player" ? "p" : "o"].push(d.timeSpent);
      acc.set(d.gameId, e);
    }
    const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined);
    out.push(paired(`time_per_move_${phase}`, new Map([...acc].map(([g, v]) => [g, { p: mean(v.p), o: mean(v.o) }]))));
  }
  const fast = new Map<string, { p: number[]; o: number[] }>();
  for (const d of decisions) {
    if (d.timeSpent === undefined) continue;
    const e = fast.get(d.gameId) ?? { p: [], o: [] };
    e[d.mover === "player" ? "p" : "o"].push(d.timeSpent < 1.5 ? 1 : 0);
    fast.set(d.gameId, e);
  }
  const share = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined);
  out.push(paired("share_moves_under_1_5s", new Map([...fast].map(([g, v]) => [g, { p: share(v.p), o: share(v.o) }]))));
  return out;
}

function withExtras(c: ClassStat, test: (d: Decision) => boolean, decisions: Decision[], games: number, judged: Set<string>, allClocks = false): ProfileClass {
  const mine = decisions.filter((d) => d.mover === "player" && (allClocks || d.inScope) && test(d));
  let gain = 0;
  let expected = 0;
  for (const d of mine) {
    const e0 = expectedLossAt(d, L0);
    gain += e0 - expectedLossAt(d, LP200);
    expected += e0;
  }
  const key = (d: Decision) => `${d.gameId}#${d.ply}`;
  const evidence = mine
    .filter((d) => d.playedLoss >= 10)
    .sort((a, b) => Number(judged.has(key(b))) - Number(judged.has(key(a))) || b.playedLoss * goodShare(b, LP200) - a.playedLoss * goodShare(a, LP200))
    .slice(0, EVIDENCE_CAP)
    .map((d) => ({ gameId: d.gameId, ply: d.ply }));
  const r = (x: number) => Math.round(x * 100) / 100;
  return { ...c, nextLevel: { gainPerGame: r(gain / games), share: expected > 0 ? r(gain / expected) : 0 }, evidence };
}

/** Builds the profile. `judged` holds `${gameId}#${ply}` of moves verified by pass 2. */
export function buildProfile(decisions: Decision[], judged: Set<string> = new Set(), stats: ProfileStats | undefined = profileStats(decisions)): Profile | undefined {
  if (!stats) return undefined;
  const G = stats.games;
  const player = decisions.filter((d) => d.mover === "player" && d.inScope);
  const mismatched = player.filter((d) => Math.abs(d.elo - d.eloOpp) > 300).length / Math.max(1, player.length);
  const warnings: string[] = [];
  if (mismatched > MISMATCH_SHARE) warnings.push("mismatched_pairings");
  if (G < 60) warnings.push("few_games");
  const ext = (c: ClassStat, defs: { id: string; test: (d: Decision) => boolean }[], allClocks = false) =>
    withExtras(c, defs.find((d) => d.id === c.id)!.test, decisions, G, judged, allClocks);
  return {
    population: "lichess_blitz",
    control: "opponents_same_games",
    games: G,
    decisions: { player: player.length, opponents: decisions.filter((d) => d.mover === "opponent" && d.inScope).length },
    settings: { deltas: [...PEER_ELO_DELTAS], coverage: PEER_COVERAGE, maxMoves: PEER_MAX_MOVES, bootstrap: BOOTSTRAP_RESAMPLES, seed: BOOTSTRAP_SEED },
    mismatchedShare: Math.round(mismatched * 1000) / 1000,
    warnings,
    overall: ext(stats.overall, [ALL_CLASS]),
    classes: stats.classes.map((c) => ext(c, PRIMARY_CLASSES)),
    secondary: stats.secondary.map((c) => ext(c, SECONDARY_CLASSES)),
    clock: { paired: pairedClock(decisions), classes: stats.clock.map((c) => ext(c, CLOCK_CLASSES, true)), experimental: true },
    style: [],
    repertoire: [],
  };
}

