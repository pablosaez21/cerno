// Worker count and time estimate for each load mode, shown on the cover before an analysis.
// Both are measurements on this device, not fixed figures: a few seconds of Stockfish give the
// nodes per second with 1, 2, 3… workers (efficiency cores make that far from linear), which picks
// the default count (softPoolSize); every finished analysis replaces the estimate's speed with the
// one it really had.
import { poolSizeFor, type LoadMode } from "@/core/engine";

/** Load mode selected on the cover until the user picks one. */
export const DEFAULT_LOAD: LoadMode = "soft";

/** Stockfish nodes per new game, all stages (passes 1 and 2, peer candidates). Measured on
 *  pablosae's 100 blitz games: ~1,550 M nodes. A finished analysis replaces it with the user's own. */
export const NODES_PER_GAME = 15_500_000;
/** Download, engine start and the last stages, which barely depend on the game count (same run: 264 s
 *  in total against 253 s of searching at the calibrated speed). */
export const FIXED_S = 11;
/** Without WebGPU, Maia runs on the processor after Stockfish: ~4.2 s per game on an Apple M5 whose
 *  engine searches ~680 k nodes/s per worker (25 games, Chromium), scaled by this device's speed. */
export const MAIA_CPU_S_PER_GAME = 4.2;
const REF_NPS_PER_WORKER = 680_000;
/** A whole analysis runs slower than the short calibration (stage tails with idle workers, Maia
 *  alongside, the page drawing): 0.69 and 0.67 of it with 9 and 5 workers, 30 games, Apple M5,
 *  Chromium. Used until this device has finished an analysis of its own. */
export const CALIB_EFFICIENCY = 0.68;

export interface Pace {
  /** navigator.hardwareConcurrency when measured: a different count means another machine or setting. */
  cores: number;
  /** Nodes per second with N workers (keyed by N) in the short calibration. */
  calib: Record<number, number>;
  /** Set once the calibration has gone from 1 worker up to where they slow down (calibrateRamp). */
  ramp?: boolean;
  /** Nodes per second with N workers over a whole analysis (tails, Maia alongside, the page drawing). */
  run: Record<number, number>;
  /** Stockfish nodes per new game in this user's last analysis. */
  nodesPerGame?: number;
}

export interface ModeEstimate {
  workers: number;
  /** Seconds for `games` new games; undefined until measured. */
  secs?: number;
}

export function estimateSecs(games: number, nps: number, nodesPerGame = NODES_PER_GAME, maiaOnCpu = false, workers = 1): number {
  const maia = maiaOnCpu ? games * MAIA_CPU_S_PER_GAME * (REF_NPS_PER_WORKER / (nps / workers)) : 0;
  return FIXED_S + (games * nodesPerGame) / nps + maia;
}

/** Speed with N workers: a whole analysis with N if there was one, else the calibration
 *  corrected by how far whole analyses fell from it on this device. */
export function npsFor(pace: Pace, workers: number): number | undefined {
  if (pace.run[workers]) return pace.run[workers];
  const c = pace.calib[workers];
  if (!c) return undefined;
  const ratios = Object.keys(pace.run).filter((k) => pace.calib[+k]).map((k) => pace.run[+k] / pace.calib[+k]);
  return c * (ratios.length ? ratios.reduce((a, b) => a + b, 0) / ratios.length : CALIB_EFFICIENCY);
}

export function estimates(pace: Pace | undefined, cores: number | undefined, games: number, maiaOnCpu = false): Record<LoadMode, ModeEstimate> {
  const out = {} as Record<LoadMode, ModeEstimate>;
  for (const mode of ["soft", "full"] as LoadMode[]) {
    const mine = pace && pace.cores === cores ? pace : undefined;
    const workers = poolSizeFor(mode, cores, mine?.ramp ? mine.calib : undefined);
    const nps = mine ? npsFor(mine, workers) : undefined;
    out[mode] = { workers, secs: nps ? estimateSecs(games, nps, pace?.nodesPerGame, maiaOnCpu, workers) : undefined };
  }
  return out;
}

const fresh = (pace: Pace | undefined, cores: number): Pace => (pace && pace.cores === cores ? pace : { cores, calib: {}, run: {} });

export function calibrated(pace: Pace | undefined, cores: number, nps: Record<number, number>, ramp = false): Pace {
  const base = fresh(pace, cores);
  // A new ramp replaces the old figures: mixing two sessions would bend the curve that picks the count.
  return { ...base, calib: ramp ? nps : { ...base.calib, ...nps }, ramp: ramp || base.ramp };
}

/** Worker count for a load mode on this device, from its calibration when there is one. */
export function workersFor(mode: LoadMode, pace: Pace | undefined, cores: number): number {
  const mine = pace && pace.cores === cores && pace.ramp ? pace : undefined;
  return poolSizeFor(mode, cores, mine?.calib);
}

/** What an analysis teaches: its real speed, if enough new games were searched to trust it. */
export function learn(pace: Pace | undefined, cores: number, run: { workers: number; nodes: number; stockfishMs: number; freshGames: number }): Pace | undefined {
  if (run.freshGames < 10 || run.stockfishMs <= 0 || run.nodes <= 0) return pace;
  const base = fresh(pace, cores);
  return { ...base, run: { ...base.run, [run.workers]: Math.round(run.nodes / (run.stockfishMs / 1000)) }, nodesPerGame: Math.round(run.nodes / run.freshGames) };
}

/** "~6 min", "~40 s": rounded, since it is an estimate. */
export function formatSecs(s: number): string {
  if (s < 60) return `~${Math.max(10, Math.round(s / 10) * 10)} s`;
  return `~${Math.round(s / 60)} min`;
}
