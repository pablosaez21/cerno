// Peer profile, statistics: quality-Elo shift, control with the opponents of the
// same games, game bootstrap, Benjamini-Hochberg and evidence grades.
// Port of the planner's reference implementation (ref_profile.py); the numbers
// must match it within tolerance on the reference data.
import { DELTA_ZERO, PEER_ELO_DELTAS, type Decision } from "./peers";
import { rng } from "./review";

export const BOOTSTRAP_RESAMPLES = 1000;
export const BOOTSTRAP_SEED = 20261111;
/** False-discovery level within the primary family. */
export const BH_Q = 0.1;
/** Minimum decisions per side and games to report a class. */
export const MIN_CLASS_DECISIONS = 150;
export const MIN_CLASS_GAMES = 20;
/** Minimum blitz games in scope to compute a profile at all. */
export const MIN_PROFILE_GAMES = 30;
/**
 * The game bootstrap under-states the spread of the gap: on 300 synthetic players
 * per setting (V1, scripts/peers/simulate.ts) the null SD across players was 1.10
 * to 1.29 times the bootstrap SD (median 1.16 over classes with >= 900 decisions),
 * and the overall test gave p < 0.05 for 7.3% of null players. Bootstrap deviations
 * around the point gap are widened, per class, by max(1, measured ratio) before SD,
 * intervals and grades (one global 1.15 over-widened endgame and cost power:
 * 0.72 instead of 0.81 on a planted -300 endgame gap). Unmeasured classes use 1.15.
 */
export const SD_INFLATION: Record<string, number> = {
  all: 1.16,
  "phase:opening": 1.13,
  "phase:middlegame": 1.1,
  "phase:endgame": 1,
  "standing:ahead": 1,
  "standing:level": 1.29,
  "standing:behind": 1,
  "demand:forcing": 1.12,
  "demand:pawn": 1.16,
  "demand:piece": 1.17,
  "choice:one_good": 1,
  "choice:several_good": 1.16,
};
export const SD_INFLATION_DEFAULT = 1.15;
/** 80% power at two-sided 0.05: 0.84 + 1.96. */
export const POWER_FACTOR = 2.8;

const X = PEER_ELO_DELTAS as readonly number[];

/** Elo shift maximising the summed log-likelihood: local 3-point parabola, edge points returned as is. */
export function eloShift(totals: number[]): { shift: number; atEdge: boolean } {
  let k = 0;
  for (let i = 1; i < totals.length; i++) if (totals[i] > totals[k]) k = i;
  if (k === 0 || k === totals.length - 1) return { shift: X[k], atEdge: true };
  const [y0, y1, y2] = [totals[k - 1], totals[k], totals[k + 1]];
  const a = (y0 - 2 * y1 + y2) / 2;
  const step = X[k + 1] - X[k];
  return { shift: a < 0 ? X[k] + (step * (y0 - y2)) / (4 * a) : X[k], atEdge: false };
}

export type Grade = "A" | "B" | "C";

export interface ClassStat {
  id: string;
  family: string;
  decisions: number;
  opponentDecisions: number;
  games: number;
  insufficient?: boolean;
  player?: number;
  opponents?: number;
  gap?: number;
  sd?: number;
  z?: number;
  p?: number;
  q?: number;
  ci80?: [number, number];
  ci95?: [number, number];
  atEdge?: boolean;
  grade?: Grade;
  direction?: "weaker" | "stronger";
  detectableGap?: number;
  gamesToConfirm?: number;
  /** Style shift gap (within-quality choices), same bootstrap. */
  style?: { gap: number; sd: number; ci95: [number, number] };
  cost: { lossPerGame: number; errorsPer100: number; opponentsLossPerGame: number; opponentsErrorsPer100: number };
}

export interface ClassDef {
  id: string;
  family: string;
  test: (d: Decision) => boolean;
}

export const PRIMARY_CLASSES: ClassDef[] = [
  { id: "phase:opening", family: "phase", test: (d) => d.phase === "opening" },
  { id: "phase:middlegame", family: "phase", test: (d) => d.phase === "middlegame" },
  { id: "phase:endgame", family: "phase", test: (d) => d.phase === "endgame" },
  { id: "standing:ahead", family: "standing", test: (d) => d.winRef >= 65 },
  { id: "standing:level", family: "standing", test: (d) => d.winRef > 35 && d.winRef < 65 },
  { id: "standing:behind", family: "standing", test: (d) => d.winRef <= 35 },
  { id: "demand:forcing", family: "demand", test: (d) => d.demand === "forcing" },
  { id: "demand:pawn", family: "demand", test: (d) => d.demand === "pawn" },
  { id: "demand:piece", family: "demand", test: (d) => d.demand === "piece" },
  { id: "choice:one_good", family: "choice", test: (d) => d.oneGood },
  { id: "choice:several_good", family: "choice", test: (d) => !d.oneGood },
];
export const ALL_CLASS: ClassDef = { id: "all", family: "all", test: () => true };

/** Descriptive classes: no grades. */
export const SECONDARY_CLASSES: ClassDef[] = [
  { id: "moves:1-10", family: "moves", test: (d) => d.moveNumber <= 10 },
  { id: "moves:11-20", family: "moves", test: (d) => d.moveNumber > 10 && d.moveNumber <= 20 },
  { id: "moves:21-30", family: "moves", test: (d) => d.moveNumber > 20 && d.moveNumber <= 30 },
  { id: "moves:31+", family: "moves", test: (d) => d.moveNumber > 30 },
];

export const CLOCK_CLASSES: ClassDef[] = [
  { id: "clock:>=60", family: "clock", test: (d) => (d.clockBefore ?? Infinity) >= 60 },
  { id: "clock:30-60", family: "clock", test: (d) => d.clockBefore !== undefined && d.clockBefore >= 30 && d.clockBefore < 60 },
  { id: "clock:<30", family: "clock", test: (d) => d.clockBefore !== undefined && d.clockBefore < 30 },
];

/** The resamples of game indices, shared by every class and both sides. */
export function bootstrapIndices(games: number, resamples = BOOTSTRAP_RESAMPLES, seed = BOOTSTRAP_SEED): Int32Array[] {
  const rand = rng(seed);
  const out: Int32Array[] = [];
  for (let b = 0; b < resamples; b++) {
    const idx = new Int32Array(games);
    for (let i = 0; i < games; i++) idx[i] = Math.floor(rand() * games);
    out.push(idx);
  }
  return out;
}

/** numpy.percentile with linear interpolation. */
export function percentile(sorted: number[], q: number): number {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * (q / 100);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function std(xs: number[]): number {
  const m = xs.reduce((a, x) => a + x, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / xs.length);
}

export function normalCdf(z: number): number {
  // Abramowitz-Stegun 7.1.26 on erf, |error| < 1.5e-7.
  const t = 1 / (1 + 0.3275911 * (Math.abs(z) / Math.SQRT2));
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
  return z >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}

export function benjaminiHochberg(ps: number[]): number[] {
  const m = ps.length;
  const order = ps.map((p, i) => [p, i] as const).sort((a, b) => a[0] - b[0]);
  const q = new Array<number>(m);
  let prev = 1;
  for (let rank = m; rank >= 1; rank--) {
    const [p, i] = order[rank - 1];
    prev = Math.min(prev, (p * m) / rank);
    q[i] = prev;
  }
  return q;
}

export function gamesToConfirm(games: number, z: number): number | undefined {
  if (Math.abs(z) < 0.5) return undefined;
  return Math.min(2000, Math.ceil(games * (POWER_FACTOR / Math.abs(z)) ** 2));
}

interface SideSums {
  q: Float64Array[]; // per game, per level: summed lq
  s: Float64Array[]; // per game, per level: summed ls
  n: number;
  games: Set<number>;
  loss: number;
  errors: number;
}

const L = PEER_ELO_DELTAS.length;
function emptySide(G: number): SideSums {
  return { q: Array.from({ length: G }, () => new Float64Array(L)), s: Array.from({ length: G }, () => new Float64Array(L)), n: 0, games: new Set(), loss: 0, errors: 0 };
}

function totalsOf(rows: Float64Array[], idx?: Int32Array): number[] {
  const t = new Array<number>(L).fill(0);
  if (idx) for (const g of idx) for (let d = 0; d < L; d++) t[d] += rows[g][d];
  else for (const r of rows) for (let d = 0; d < L; d++) t[d] += r[d];
  return t;
}

/**
 * Per-class statistics. `decisions` must already be filtered to the population
 * of interest (in-scope for the primary family). `gameIds` fixes the game order.
 */
export function classStat(def: ClassDef, decisions: Decision[], gameIds: string[], boot: Int32Array[], opts: { minDecisions?: number; minGames?: number } = {}): ClassStat {
  const G = gameIds.length;
  const gi = new Map(gameIds.map((g, i) => [g, i]));
  const P = emptySide(G);
  const R = emptySide(G);
  for (const d of decisions) {
    if (!def.test(d)) continue;
    const side = d.mover === "player" ? P : R;
    const g = gi.get(d.gameId)!;
    for (let k = 0; k < L; k++) {
      side.q[g][k] += d.lq[k];
      side.s[g][k] += d.ls[k];
    }
    side.n++;
    side.games.add(g);
    if (d.playedLoss >= 5) side.loss += d.playedLoss;
    if (d.playedLoss >= 10) side.errors++;
  }
  const r2 = (x: number) => Math.round(x * 100) / 100;
  const base: ClassStat = {
    id: def.id,
    family: def.family,
    decisions: P.n,
    opponentDecisions: R.n,
    games: P.games.size,
    cost: {
      lossPerGame: r2(P.loss / G),
      errorsPer100: r2((100 * P.errors) / Math.max(1, P.n)),
      opponentsLossPerGame: r2(R.loss / G),
      opponentsErrorsPer100: r2((100 * R.errors) / Math.max(1, R.n)),
    },
  };
  const minD = opts.minDecisions ?? MIN_CLASS_DECISIONS;
  const minG = opts.minGames ?? MIN_CLASS_GAMES;
  if (P.n < minD || R.n < minD || P.games.size < minG) return { ...base, insufficient: true };
  const ep = eloShift(totalsOf(P.q));
  const er = eloShift(totalsOf(R.q));
  const gaps: number[] = [];
  const sGaps: number[] = [];
  let skipped = 0;
  for (const idx of boot) {
    const tp = totalsOf(P.q, idx);
    const tr = totalsOf(R.q, idx);
    if (tp.every((x) => x === 0) || tr.every((x) => x === 0)) {
      skipped++;
      continue;
    }
    gaps.push(eloShift(tp).shift - eloShift(tr).shift);
    sGaps.push(eloShift(totalsOf(P.s, idx)).shift - eloShift(totalsOf(R.s, idx)).shift);
  }
  if (skipped > 0.05 * boot.length) return { ...base, insufficient: true };
  const gap = ep.shift - er.shift;
  const styleGap = eloShift(totalsOf(P.s)).shift - eloShift(totalsOf(R.s)).shift;
  const factor = SD_INFLATION[def.id] ?? SD_INFLATION_DEFAULT;
  const widen = (xs: number[], centre: number) => xs.map((x) => centre + factor * (x - centre));
  const wide = widen(gaps, gap);
  const sd = std(wide);
  const z = sd > 0 ? gap / sd : 0;
  const p = 2 * (1 - normalCdf(Math.abs(z)));
  const sorted = [...wide].sort((a, b) => a - b);
  const sWide = widen(sGaps, styleGap);
  const sSorted = [...sWide].sort((a, b) => a - b);
  return {
    ...base,
    player: Math.round(ep.shift),
    opponents: Math.round(er.shift),
    gap: Math.round(gap),
    sd: Math.round(sd),
    z: Math.round(z * 100) / 100,
    p: Math.round(p * 10000) / 10000,
    ci80: [Math.round(percentile(sorted, 10)), Math.round(percentile(sorted, 90))],
    ci95: [Math.round(percentile(sorted, 2.5)), Math.round(percentile(sorted, 97.5))],
    atEdge: ep.atEdge || er.atEdge,
    direction: gap < 0 ? "weaker" : "stronger",
    detectableGap: Math.round(POWER_FACTOR * sd),
    gamesToConfirm: gamesToConfirm(G, z),
    style: { gap: Math.round(styleGap), sd: Math.round(std(sWide)), ci95: [Math.round(percentile(sSorted, 2.5)), Math.round(percentile(sSorted, 97.5))] },
  };
}

/** Grades: A confirmed (BH q <= 0.10, or p <= 0.05 for the single overall test), B suggestive (80% CI excludes 0), C within noise. */
export function gradeClasses(overall: ClassStat, primary: ClassStat[]): void {
  const tested = primary.filter((c) => !c.insufficient);
  const qs = benjaminiHochberg(tested.map((c) => c.p!));
  tested.forEach((c, i) => (c.q = Math.round(qs[i] * 10000) / 10000));
  for (const c of [overall, ...tested]) {
    if (c.insufficient) continue;
    const confirmed = c === overall ? c.p! <= 0.05 : c.q! <= BH_Q;
    const [lo, hi] = c.ci80!;
    c.grade = confirmed && !c.atEdge ? "A" : lo > 0 || hi < 0 ? "B" : "C";
  }
}

export interface ProfileStats {
  games: number;
  overall: ClassStat;
  classes: ClassStat[];
  secondary: ClassStat[];
  clock: ClassStat[];
}

/** The whole profile from decision records of both sides. */
export function profileStats(decisions: Decision[], opts: { resamples?: number; seed?: number } = {}): ProfileStats | undefined {
  const gameIds = [...new Set(decisions.map((d) => d.gameId))].sort();
  const inScope = decisions.filter((d) => d.inScope);
  const scopeGames = new Set(inScope.filter((d) => d.mover === "player").map((d) => d.gameId)).size;
  if (scopeGames < MIN_PROFILE_GAMES) return undefined;
  const boot = bootstrapIndices(gameIds.length, opts.resamples, opts.seed);
  const overall = classStat(ALL_CLASS, inScope, gameIds, boot);
  const classes = PRIMARY_CLASSES.map((c) => classStat(c, inScope, gameIds, boot));
  gradeClasses(overall, classes);
  const secondary = SECONDARY_CLASSES.map((c) => classStat(c, inScope, gameIds, boot));
  const clock = CLOCK_CLASSES.map((c) => classStat(c, decisions, gameIds, boot, { minDecisions: 50, minGames: 10 }));
  return { games: gameIds.length, overall, classes, secondary, clock };
}

export { DELTA_ZERO };
