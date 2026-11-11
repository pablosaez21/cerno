import { describe, expect, it } from "vitest";
import { judge, moveAccuracy, winPercentFor, winPercentWhite, winningChances } from "../winprob";

describe("win probability (Lichess formula)", () => {
  it("is 50% at equality and symmetric", () => {
    expect(winPercentWhite({ cp: 0 })).toBe(50);
    expect(winPercentWhite({ cp: 150 }) + winPercentWhite({ cp: -150 })).toBeCloseTo(100, 10);
  });

  it("matches 2 / (1 + exp(-0.00368208 cp)) - 1", () => {
    expect(winningChances(100)).toBeCloseTo(2 / (1 + Math.exp(-0.368208)) - 1, 12);
    expect(winPercentWhite({ cp: 100 })).toBeCloseTo(59.1, 1);
    expect(winPercentWhite({ cp: 300 })).toBeCloseTo(75.1, 1);
  });

  it("caps centipawns at ±1000", () => {
    expect(winPercentWhite({ cp: 5000 })).toBe(winPercentWhite({ cp: 1000 }));
    expect(winPercentWhite({ cp: -5000 })).toBe(winPercentWhite({ cp: -1000 }));
  });

  it("treats mate as 100% or 0%", () => {
    expect(winPercentWhite({ mate: 3 })).toBe(100);
    expect(winPercentWhite({ mate: -1 })).toBe(0);
    expect(winPercentFor({ mate: -2 }, "black")).toBe(100);
  });

  it("shrinks swings in decided positions: +8 to +5 is at most an inaccuracy, +3 to 0 is a blunder", () => {
    expect(judge(winPercentWhite({ cp: 800 }) - winPercentWhite({ cp: 500 }))).toBe("inaccuracy");
    expect(judge(winPercentWhite({ cp: 1500 }) - winPercentWhite({ cp: 1000 }))).toBeUndefined();
    expect(judge(winPercentWhite({ cp: 300 }) - winPercentWhite({ cp: 0 }))).toBe("blunder");
  });

  it("uses Lichess thresholds of 5, 10 and 15 points", () => {
    expect(judge(4.9)).toBeUndefined();
    expect(judge(5)).toBe("inaccuracy");
    expect(judge(10)).toBe("mistake");
    expect(judge(15)).toBe("blunder");
  });

  it("move accuracy is 100 without loss and decreases with it", () => {
    expect(moveAccuracy(60, 60)).toBe(100);
    expect(moveAccuracy(60, 50)).toBeLessThan(moveAccuracy(60, 55));
  });
});
