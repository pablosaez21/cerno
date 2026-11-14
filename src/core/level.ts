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
/** 95% bootstrap interval of the offset, and the mean Chess.com rating it was measured at (one reference player). */
export const CHESSCOM_TO_LICHESS_OFFSET_CI95: [number, number] = [313, 399];
export const CHESSCOM_OFFSET_REFERENCE_RATING = 1453;

export type EloSource = "chesscom" | "lichess" | "pgn";

/** What is added to a source rating to get the Lichess Elo Maia is asked with. PGN ratings are taken as given. */
export function maiaEloOffset(source: EloSource): number {
  return source === "chesscom" ? CHESSCOM_TO_LICHESS_OFFSET : 0;
}

/**
 * The scale every Elo is shown on: the one of the games' source. Inside the
 * analysis and the report every Elo is Maia's (Lichess); `shownElo` is the only
 * way back.
 */
export interface EloScale {
  shown: EloSource;
  /** Maia's Elo (Lichess) = shown Elo + this. */
  maiaOffset: number;
  maiaOffsetCi95?: [number, number];
  /** Mean rating, on the shown scale, of the one player the offset was measured on. */
  measuredAt?: number;
}

export function eloScale(source: EloSource): EloScale {
  if (source !== "chesscom") return { shown: source, maiaOffset: 0 };
  return { shown: source, maiaOffset: CHESSCOM_TO_LICHESS_OFFSET, maiaOffsetCi95: CHESSCOM_TO_LICHESS_OFFSET_CI95, measuredAt: CHESSCOM_OFFSET_REFERENCE_RATING };
}

/** Maia's Elo (Lichess) back on the scale of the games' source: the Elo the user sees. */
export function shownElo(maiaElo: number, source: EloSource): number {
  return maiaElo - maiaEloOffset(source);
}

export type OutOfScope = "clock" | "time_class" | "no_rating" | "no_model";

export function eloForMaia(rating: number | undefined, source: EloSource): number | undefined {
  if (rating === undefined) return undefined;
  return rating + maiaEloOffset(source);
}

export function outOfScope(input: { clockBefore?: number; timeClass: TimeClass; ratingKnown: boolean }): OutOfScope | undefined {
  if (input.timeClass !== "blitz") return "time_class";
  if (!input.ratingKnown) return "no_rating";
  if (input.clockBefore !== undefined && input.clockBefore < MAIA_MIN_CLOCK) return "clock";
  return undefined;
}
