import { describe, expect, it } from "vitest";
import { CHESSCOM_TO_LICHESS_OFFSET, eloForMaia, eloScale, outOfScope, shownElo } from "../level";

describe("Maia scope and Elo scale", () => {
  it("puts fast moves, other time classes and unknown ratings out of scope", () => {
    expect(outOfScope({ clockBefore: 29.9, timeClass: "blitz", ratingKnown: true })).toBe("clock");
    expect(outOfScope({ clockBefore: 30, timeClass: "blitz", ratingKnown: true })).toBeUndefined();
    expect(outOfScope({ clockBefore: 300, timeClass: "rapid", ratingKnown: true })).toBe("time_class");
    expect(outOfScope({ clockBefore: 300, timeClass: "blitz", ratingKnown: false })).toBe("no_rating");
  });

  it("converts Chess.com ratings with the measured offset", () => {
    expect(eloForMaia(1450, "chesscom")).toBe(1450 + CHESSCOM_TO_LICHESS_OFFSET);
    expect(eloForMaia(1450, "lichess")).toBe(1450);
    expect(eloForMaia(1450, "pgn")).toBe(1450);
    expect(eloForMaia(undefined, "lichess")).toBeUndefined();
  });

  it("shows Maia's Elo back on the scale of the games' source", () => {
    for (const source of ["chesscom", "lichess", "pgn"] as const) expect(shownElo(eloForMaia(1463, source)!, source)).toBe(1463);
    expect(shownElo(1823, "chesscom")).toBe(1463);
    expect(shownElo(1823, "lichess")).toBe(1823);
    // Ladder points keep their spacing: a shift, never a rescale.
    expect(shownElo(1100, "chesscom") - shownElo(1000, "chesscom")).toBe(100);
    expect(eloScale("chesscom")).toEqual({ shown: "chesscom", maiaOffset: 360, maiaOffsetCi95: [313, 399], measuredAt: 1453 });
    expect(eloScale("lichess")).toEqual({ shown: "lichess", maiaOffset: 0 });
    expect(eloScale("pgn")).toEqual({ shown: "pgn", maiaOffset: 0 });
  });
});
