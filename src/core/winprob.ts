// Win probability, as Lichess computes it (scalachess `WinPercent`):
//   winningChances(cp) = 2 / (1 + exp(-0.00368208 * cp)) - 1, cp capped to ±1000
//   winPercent = 50 + 50 * winningChances
// Mate is treated as the capped value, which gives 0 or 100 within rounding;
// we use exactly 0 and 100 so a decided position cannot lose more.
import type { Color, Score } from "./types";

const MULTIPLIER = -0.00368208;
const CP_CEILING = 1000;

export function winningChances(cp: number): number {
  const capped = Math.max(-CP_CEILING, Math.min(CP_CEILING, cp));
  const wc = 2 / (1 + Math.exp(MULTIPLIER * capped)) - 1;
  return Math.max(-1, Math.min(1, wc));
}

/** Win percentage in [0, 100] for White. */
export function winPercentWhite(score: Score): number {
  if ("mate" in score) return score.mate > 0 ? 100 : 0;
  return 50 + 50 * winningChances(score.cp);
}

export function winPercentFor(score: Score, color: Color): number {
  const w = winPercentWhite(score);
  return color === "white" ? w : 100 - w;
}

/**
 * Judgement thresholds on the drop of win percentage for the mover.
 * Lichess (`lila/modules/tree/src/main/Advice.scala`) uses deltas of
 * winningChances of .1/.2/.3, i.e. 5/10/15 points of win percentage.
 */
export const THRESHOLDS = { inaccuracy: 5, mistake: 10, blunder: 15 } as const;

export type Judgement = "inaccuracy" | "mistake" | "blunder";

export function judge(loss: number): Judgement | undefined {
  if (loss >= THRESHOLDS.blunder) return "blunder";
  if (loss >= THRESHOLDS.mistake) return "mistake";
  if (loss >= THRESHOLDS.inaccuracy) return "inaccuracy";
  return undefined;
}

/**
 * Per-move accuracy, Lichess `AccuracyPercent.fromWinPercents`:
 *   103.1668 * exp(-0.04354 * (before - after)) - 3.1669 (+1 uncertainty bonus), clamped.
 */
export function moveAccuracy(winBefore: number, winAfter: number): number {
  if (winAfter >= winBefore) return 100;
  const raw = 103.1668100711649 * Math.exp(-0.04354415386753951 * (winBefore - winAfter)) - 3.166924740191411;
  return Math.max(0, Math.min(100, raw + 1));
}

/**
 * Game accuracy per colour, Lichess `AccuracyPercent.gameAccuracy`: the mean of a
 * volatility-weighted mean and a harmonic mean of move accuracies.
 * `whitePercents[i]` is White's win percentage after ply i (index 0 = start).
 */
export function gameAccuracy(whitePercents: number[]): { white?: number; black?: number } {
  const n = whitePercents.length;
  if (n < 2) return {};
  const windowSize = Math.max(2, Math.min(8, Math.floor((n - 1) / 10)));
  const windows: number[][] = [];
  const first = whitePercents.slice(0, windowSize);
  for (let i = 0; i < Math.min(windowSize, n) - 2; i++) windows.push(first);
  for (let i = 0; i + windowSize <= n; i++) windows.push(whitePercents.slice(i, i + windowSize));
  const weights = windows.map((w) => Math.max(0.5, Math.min(12, stdev(w))));
  const per: Record<"white" | "black", { acc: number; w: number }[]> = { white: [], black: [] };
  for (let i = 0; i + 1 < n && i < weights.length; i++) {
    const color = i % 2 === 0 ? "white" : "black";
    const prev = whitePercents[i];
    const next = whitePercents[i + 1];
    const acc = color === "white" ? moveAccuracy(prev, next) : moveAccuracy(100 - prev, 100 - next);
    per[color].push({ acc, w: weights[i] });
  }
  const summarise = (xs: { acc: number; w: number }[]) => {
    if (!xs.length) return undefined;
    const weighted = xs.reduce((s, x) => s + x.acc * x.w, 0) / xs.reduce((s, x) => s + x.w, 0);
    const harmonic = xs.length / xs.reduce((s, x) => s + 1 / Math.max(x.acc, 1e-9), 0);
    return (weighted + harmonic) / 2;
  };
  return { white: summarise(per.white), black: summarise(per.black) };
}

function stdev(xs: number[]): number {
  const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
  return Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / xs.length);
}
