import { describe, expect, it } from "vitest";
import { candidatesToEvaluate, CHESSCOM_TO_LICHESS_OFFSET, eloForMaia, expectedLoss, goodMass, levelTag, LEVEL_THRESHOLDS, outOfScope, peerMetrics } from "../level";
import type { MaiaPrediction } from "../maia";

const pred = (policy: Record<string, number>): MaiaPrediction => ({ policy, wdl: [0.3, 0.1, 0.6] });

describe("level metrics", () => {
  const p = pred({ e2e4: 0.5, d2d4: 0.3, g1f3: 0.1, b1c3: 0.06, a2a3: 0.04 });

  it("evaluates the most likely moves until 90% or 6 moves, skipping known ones", () => {
    expect(candidatesToEvaluate(p, new Set(["d2d4"]))).toEqual(["e2e4", "g1f3"]);
    const flat = pred(Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`m${i}`, 0.1])));
    expect(candidatesToEvaluate(flat, new Set())).toHaveLength(6);
  });

  it("sums the probability of good moves and keeps the unevaluated mass apart", () => {
    const losses = new Map([["e2e4", 0], ["d2d4", 12], ["g1f3", 4.9]]);
    const g = goodMass(p, losses);
    expect(g.pGood).toBeCloseTo(0.6, 9);
    expect(g.pUnevaluated).toBeCloseTo(0.1, 9);
  });

  it("tags below level and hard at the thresholds, nothing in between", () => {
    expect(levelTag(LEVEL_THRESHOLDS.belowLevel)).toBe("below_level");
    expect(levelTag(LEVEL_THRESHOLDS.hard)).toBe("hard");
    expect(levelTag((LEVEL_THRESHOLDS.belowLevel + LEVEL_THRESHOLDS.hard) / 2)).toBeUndefined();
  });

  it("computes pPlayed and the avoidable loss", () => {
    const m = peerMetrics({ model: "maia3-5m", pred: p, losses: new Map([["e2e4", 0], ["d2d4", 0], ["a2a3", 20]]), played: "a2a3", loss: 20, eloSelf: 1800, eloOppo: 1850 });
    expect(m.pPlayed).toBeCloseTo(0.04, 9);
    expect(m.pGood).toBeCloseTo(0.8, 9);
    expect(m.avoidableLoss).toBeCloseTo(16, 9);
    expect(m.level).toBe("below_level");
  });

  it("puts fast moves, other time classes and unknown ratings out of scope", () => {
    expect(outOfScope({ clockBefore: 29.9, timeClass: "blitz", ratingKnown: true })).toBe("clock");
    expect(outOfScope({ clockBefore: 30, timeClass: "blitz", ratingKnown: true })).toBeUndefined();
    expect(outOfScope({ clockBefore: 300, timeClass: "rapid", ratingKnown: true })).toBe("time_class");
    expect(outOfScope({ clockBefore: 300, timeClass: "blitz", ratingKnown: false })).toBe("no_rating");
  });

  it("converts Chess.com ratings with the measured offset", () => {
    expect(eloForMaia(1450, "chesscom")).toBe(1450 + CHESSCOM_TO_LICHESS_OFFSET);
    expect(eloForMaia(1450, "lichess")).toBe(1450);
  });

  it("expected loss is the probability-weighted loss over evaluated moves", () => {
    const e = expectedLoss(pred({ a: 0.5, b: 0.25, c: 0.25 }), new Map([["a", 0], ["b", 20]]));
    expect(e.coverage).toBeCloseTo(0.75, 9);
    expect(e.expected).toBeCloseTo((0.25 * 20) / 0.75, 9);
  });
});
