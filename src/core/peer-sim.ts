// Synthetic players for validating the peer statistics (V1): on real decision
// records, redraw the quality category of each move from Maia's category
// probabilities at a planted Elo shift, and rebuild the quality log-likelihoods.
import { categoryProbs, PEER_ELO_DELTAS, type Decision, type QualityCat } from "./peers";

const X = PEER_ELO_DELTAS as readonly number[];

/** Category probabilities at an arbitrary shift: linear interpolation between grid levels. */
export function probsAt(pi: number[][], shift: number): number[] {
  if (shift <= X[0]) return pi[0];
  if (shift >= X[X.length - 1]) return pi[X.length - 1];
  let k = 0;
  while (X[k + 1] < shift) k++;
  const t = (shift - X[k]) / (X[k + 1] - X[k]);
  return pi[k].map((p, c) => p * (1 - t) + pi[k + 1][c] * t);
}

function draw(probs: number[], u: number): QualityCat {
  const total = probs.reduce((a, b) => a + b, 0);
  let acc = 0;
  for (let c = 0; c < probs.length; c++) {
    acc += probs[c] / total;
    if (u < acc) return c as QualityCat;
  }
  return (probs.length - 1) as QualityCat;
}

/**
 * Same decisions, new observed categories: the player's drawn at `planted(d)`
 * (Elo shift), the opponents' at 0. Style log-likelihoods are zeroed.
 */
export function simulate(decisions: Decision[], planted: (d: Decision) => number, rand: () => number): Decision[] {
  return decisions.map((d) => {
    const pi = categoryProbs(d);
    const shift = d.mover === "player" ? planted(d) : 0;
    const cat = draw(probsAt(pi, shift), rand());
    return { ...d, observed: cat, lq: pi.map((row) => Math.log(Math.max(row[cat], 1e-9))), ls: d.ls.map(() => 0) };
  });
}
