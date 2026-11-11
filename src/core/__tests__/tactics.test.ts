import { describe, expect, it } from "vitest";
import { findFork, isBackRankMate, settledBalance, tacticEvidence } from "../tactics";

// Each case gives the engine lines by hand: the labels must follow from them.
describe("tactic evidence", () => {
  it("hanging piece: the knight goes to an undefended square and the queen takes it", () => {
    const ev = tacticEvidence({
      fenBefore: "3q2k1/ppp2ppp/8/8/8/2N5/PPP2PPP/6K1 w - - 0 1",
      played: "c3d5",
      color: "white",
      bestLine: ["a2a3", "a7a6"],
      bestScore: { cp: 0 },
      refutation: ["d8d5", "a2a3", "a7a6"],
      afterScore: { cp: -300 },
    });
    expect(ev?.tag).toBe("hanging_piece");
    expect(ev?.material).toBe(3);
  });

  it("allowed tactic with a fork: Nc2+ hits king and rook", () => {
    const ev = tacticEvidence({
      fenBefore: "4k3/pp3ppp/8/8/1n6/8/PP3PPP/R3K3 w - - 0 1",
      played: "h2h3",
      color: "white",
      bestLine: ["e1d2", "e8e7"],
      bestScore: { cp: 0 },
      refutation: ["b4c2", "e1d2", "c2a1"],
      afterScore: { cp: -500 },
    });
    expect(ev?.tag).toBe("allowed_tactic");
    expect(ev?.motifs).toContain("fork");
  });

  it("missed capture: an undefended queen could be taken", () => {
    const ev = tacticEvidence({
      fenBefore: "6k1/ppp2ppp/8/3q4/8/2N5/PPP2PPP/6K1 w - - 0 1",
      played: "a2a3",
      color: "white",
      bestLine: ["c3d5", "a7a6"],
      bestScore: { cp: 900 },
      refutation: ["d5d8", "b2b3"],
      afterScore: { cp: 0 },
    });
    expect(ev?.tag).toBe("missed_capture");
  });

  it("missed back-rank mate", () => {
    const ev = tacticEvidence({
      fenBefore: "6k1/5ppp/1n6/8/8/8/5PPP/3R2K1 w - - 0 1",
      played: "h2h3",
      color: "white",
      bestLine: ["d1d8"],
      bestScore: { mate: 1 },
      refutation: ["b6d5"],
      afterScore: { cp: 200 },
    });
    expect(ev?.tag).toBe("missed_mate");
    expect(ev?.mateIn).toBe(1);
    expect(ev?.motifs).toContain("back_rank_mate");
  });

  it("allowed back-rank mate (player is Black)", () => {
    const ev = tacticEvidence({
      // The knight on c6 guards d8; moving it away allows Rd8#.
      fenBefore: "6k1/5ppp/2n5/8/8/8/5PPP/3R2K1 b - - 0 1",
      played: "c6a5",
      color: "black",
      bestLine: ["h7h6", "h2h3"],
      bestScore: { cp: 0 },
      refutation: ["d1d8"],
      afterScore: { mate: 1 },
    });
    expect(ev?.tag).toBe("allowed_mate");
    expect(ev?.motifs).toContain("back_rank_mate");
  });

  it("no label when no line wins material or mates", () => {
    const ev = tacticEvidence({
      fenBefore: "4k3/pp3ppp/8/8/8/8/PP3PPP/4K3 w - - 0 1",
      played: "e1d1",
      color: "white",
      bestLine: ["e1e2", "e8e7"],
      bestScore: { cp: 60 },
      refutation: ["e8d7", "d1e2"],
      afterScore: { cp: -60 },
    });
    expect(ev).toBeUndefined();
  });

  it("does not call a fair trade a hanging piece", () => {
    // White takes a defended knight with the bishop; Black recaptures: material is level.
    const ev = tacticEvidence({
      fenBefore: "4k3/ppp2ppp/2n5/8/8/5B2/PPP2PPP/4K3 w - - 0 1",
      played: "f3c6",
      color: "white",
      bestLine: ["a2a3", "a7a6"],
      bestScore: { cp: 0 },
      refutation: ["b7c6", "a2a3"],
      afterScore: { cp: -100 },
    });
    expect(ev).toBeUndefined();
  });
});

describe("helpers", () => {
  it("settled balance waits for the exchange to end", () => {
    // 1.Nxd5 Qxd5: balance after the sequence, not in the middle.
    const r = settledBalance("3q2k1/ppp2ppp/8/3p4/8/2N5/PPP2PPP/6K1 w - - 0 1", ["c3d5", "d8d5", "a2a3"], "white");
    // Start: White N + 6 pawns (9) vs Black Q + 7 pawns (16) = -7. After Nxd5 Qxd5: -9.
    expect(r.balance).toBe(-9);
    expect(r.plies).toBe(3);
  });

  it("finds a knight fork and rejects a fork on a square where the knight is lost", () => {
    expect(findFork("4k3/pp3ppp/8/8/1n6/7P/PP3PP1/R3K3 b - - 0 1", ["b4c2"], "black")).toBe(true);
    // Same fork, but the queen on d1 guards c2: the knight is lost there.
    expect(findFork("4k3/pp3ppp/8/8/1n6/7P/PP3PP1/R2QK3 b - - 0 1", ["b4c2"], "black")).toBe(false);
  });

  it("back-rank mate requires the king boxed by its own pieces", () => {
    expect(isBackRankMate("6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1", ["d1d8"])).toBe(true);
    expect(isBackRankMate("6k1/5p1p/6p1/8/8/8/5PPP/3R2K1 w - - 0 1", ["d1d8"])).toBe(false);
  });
});
