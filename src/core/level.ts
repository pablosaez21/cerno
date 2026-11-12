// Scope and Elo scale for Maia-3. Maia-3 describes a population (Lichess blitz
// players of a given Elo), not the player. It does not see the clock and was
// trained without moves made with less than 30 s, so those moves get no per-move
// level fields.
import type { TimeClass } from "./types";

/** Moves made with less than this on the clock are out of Maia-3's per-move scope. */
export const MAIA_MIN_CLOCK = 30;

/**
 * Lichess Elo fed to Maia = Chess.com rating + offset. Measured on the 96 blitz
 * games of the reference player: the offset that makes the opponents' real moves
 * (30 s or more) most likely is +360, 95% bootstrap interval [+313, +399], at a
 * mean Chess.com rating of 1453 (scripts/maia/fit.ts, analyze-fit.ts). The peer
 * profile compares with the opponents, so an offset error moves both sides alike;
 * `level.opponentsTotalShift` checks it per user.
 */
export const CHESSCOM_TO_LICHESS_OFFSET = 360;

export type OutOfScope = "clock" | "time_class" | "no_rating" | "no_model";

export function eloForMaia(rating: number | undefined, source: "chesscom" | "lichess" | "pgn"): number | undefined {
  if (rating === undefined) return undefined;
  return source === "chesscom" ? rating + CHESSCOM_TO_LICHESS_OFFSET : rating;
}

export function outOfScope(input: { clockBefore?: number; timeClass: TimeClass; ratingKnown: boolean }): OutOfScope | undefined {
  if (input.timeClass !== "blitz") return "time_class";
  if (!input.ratingKnown) return "no_rating";
  if (input.clockBefore !== undefined && input.clockBefore < MAIA_MIN_CLOCK) return "clock";
  return undefined;
}
