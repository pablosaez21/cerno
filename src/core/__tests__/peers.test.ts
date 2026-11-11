import { describe, expect, it } from "vitest";
import type { MaiaPrediction } from "../maia";
import { candidateSet, categoryProbs, demandOf, finishDecision, TAIL, type RawDecision } from "../peers";

const pred = (policy: Record<string, number>): MaiaPrediction => ({ policy, wdl: [0.3, 0.1, 0.6] });
const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function raw(over: Partial<RawDecision> = {}): RawDecision {
  const moves = ["e2e4", "d2d4", "g1f3", "a2a3"];
  return {
    gameId: "g001", ply: 1, mover: "player", color: "white", moveNumber: 1, phase: "opening", inScope: true, elo: 1800, eloOpp: 1800,
    fen: START, played: "e2e4", engineBest: "e2e4", moves, inSet: [true, true, true, false],
    p: Array.from({ length: 5 }, () => [0.5, 0.3, 0.1, 0.02]), mass: Array(5).fill(0.9),
    win: [55, 54, 48, 30], winPosition: 55, ...over,
  };
}

describe("candidate set", () => {
  const levels = [pred({ e2e4: 0.6, d2d4: 0.3, c2c4: 0.1 }), pred({ e2e4: 0.5, g1f3: 0.2, d2d4: 0.2, b2b3: 0.1 })];

  it("takes each level's top moves to 80% or 4 moves, plus the engine best", () => {
    expect(candidateSet(levels, "h2h3")).toEqual(["e2e4", "d2d4", "g1f3", "h2h3"]);
  });

  it("never depends on the move played (it is not an input)", () => {
    expect(candidateSet(levels, "e2e4")).toEqual(["e2e4", "d2d4", "g1f3"]);
  });
});

describe("decision record", () => {
  it("measures losses against the best move of the set and categorises them", () => {
    const d = finishDecision(raw());
    expect(d.winRef).toBe(55);
    expect(d.loss).toEqual([0, 1, 7, 25]);
    expect(d.cat).toEqual([0, 0, 1, 3]);
    expect(d.observed).toBe(0);
    // Quality log-likelihood: mass of good moves in S (e2e4 + d2d4).
    expect(d.lq[0]).toBeCloseTo(Math.log(0.8), 9);
    // Style: log p(played) - log p(its category).
    expect(d.ls[0]).toBeCloseTo(Math.log(0.5) - Math.log(0.8), 9);
  });

  it("puts a played move outside the set in the tail category", () => {
    const d = finishDecision(raw({ played: "a2a3" }));
    expect(d.observed).toBe(TAIL);
    expect(d.lq[0]).toBeCloseTo(Math.log(1 - 0.9), 9);
    expect(d.ls[0]).toBe(0);
    expect(d.playedLoss).toBe(25);
  });

  it("category probabilities sum to 1 at every level", () => {
    const d = finishDecision(raw({ mass: Array(5).fill(0.9), p: Array.from({ length: 5 }, () => [0.5, 0.3, 0.1, 0]) }));
    for (const row of categoryProbs(d)) expect(row.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
  });

  it("flags positions with exactly one good move among three or more", () => {
    expect(finishDecision(raw({ win: [55, 40, 30, 20] })).oneGood).toBe(true);
    expect(finishDecision(raw()).oneGood).toBe(false);
  });
});

describe("demand of a position", () => {
  it("is forcing when the best move captures or checks, then pawn, then piece", () => {
    expect(demandOf("4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1", "e4d5")).toBe("forcing");
    expect(demandOf("4k3/8/8/8/8/8/8/R3K3 w - - 0 1", "a1a8")).toBe("forcing");
    expect(demandOf(START, "e2e4")).toBe("pawn");
    expect(demandOf(START, "g1f3")).toBe("piece");
  });
});
