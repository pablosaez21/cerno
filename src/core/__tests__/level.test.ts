import { describe, expect, it } from "vitest";
import { CHESSCOM_TO_LICHESS_OFFSET, eloForMaia, outOfScope } from "../level";

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
    expect(eloForMaia(undefined, "lichess")).toBeUndefined();
  });
});
