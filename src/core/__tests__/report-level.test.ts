import { describe, expect, it } from "vitest";
import type { AnalyzedGame } from "../analyze";
import { parseGameMoves } from "../game";
import type { LevelData, PhaseLevelSample } from "../level-analysis";
import { buildReport, phaseComparison, REPORT_VERSION } from "../report";
import type { GameRecord, PositionEval } from "../types";

// Same synthetic games as report.test.ts: White hangs a knight at `blunderPly`.
function game(id: string, moves: string, blunderPly: number, best: string[], refutation: string[]): AnalyzedGame {
  const record: GameRecord = {
    id, source: "chesscom", pgn: `[White "alice"]\n[Black "bob"]\n[Result "0-1"]\n\n${moves} 0-1`,
    white: { name: "alice", rating: 1450 }, black: { name: "bob", rating: 1460 }, playerColor: "white", result: "loss", termination: "resignation", timeClass: "blitz",
  };
  const parsed = parseGameMoves(record);
  const ev = (cp: number, pv: string[] = []): PositionEval => ({ lines: [{ score: { cp }, pv, depth: 10 }], score: { cp }, nodes: 1 });
  const evals = [parsed.startFen, ...parsed.plies.map((p) => p.fenAfter)].map((_, i) => (i < blunderPly ? ev(0, ["a2a3"]) : ev(-250)));
  return {
    game: record, parsed, evals,
    deep: { [blunderPly]: { before: { lines: [{ score: { cp: 0 }, pv: best, depth: 18 }, { score: { cp: -20 }, pv: ["a2a3"], depth: 18 }], score: { cp: 0 }, nodes: 1 }, after: ev(-250, refutation) } },
  };
}
const games = [
  game("C", "1. h3 d5 2. Nc3 Nf6 3. Nxd5 Qxd5 4. e4 Qd8", 5, ["d2d4"], ["d8d5", "e2e4"]),
  game("D", "1. a3 d5 2. Nc3 c6 3. Nxd5 cxd5 4. e4 dxe4", 5, ["d2d4"], ["c6d5", "e2e4"]),
  game("E", "1. b3 d5 2. Nc3 e6 3. Nxd5 exd5 4. e4 dxe4", 5, ["d2d4"], ["e6d5", "e2e4"]),
  game("F", "1. g3 d5 2. Nc3 Nc6 3. Nxd5 Qxd5 4. e4 Qd8", 5, ["d2d4"], ["d8d5", "e2e4"]),
];
const peer = (pGood: number) => ({ model: "maia3-5m", eloSelf: 1810, eloOppo: 1820, pPlayed: 0.05, pGood, pUnevaluated: 0.05, level: pGood >= 0.7 ? ("below_level" as const) : pGood <= 0.3 ? ("hard" as const) : undefined, avoidableLoss: 0 });
const level: LevelData = {
  model: "maia3-5m",
  eloOffset: 360,
  moves: {
    C: [{ ply: 5, peer: peer(0.8) }],
    D: [{ ply: 5, peer: peer(0.9) }],
    E: [{ ply: 5, peer: peer(0.2) }],
    F: [{ ply: 5, outOfScope: "clock" }],
  },
  phaseSamples: [],
};

describe("report v2 level fields", () => {
  const r = buildReport(games, "alice", undefined, level);

  it("is contract version 2", () => {
    expect(r.version).toBe(REPORT_VERSION);
    expect(REPORT_VERSION).toBe(2);
  });

  it("puts peer metrics on errors with avoidable loss on the judged loss", () => {
    const c = r.errors.find((e) => e.gameId === "C")!;
    expect(c.peer?.level).toBe("below_level");
    expect(c.peer?.avoidableLoss).toBeCloseTo(c.loss * 0.8, 1);
    expect(r.errors.find((e) => e.gameId === "F")!.outOfScope).toBe("clock");
  });

  it("summarises level per category and finding", () => {
    expect(r.categories.tactics.level).toMatchObject({ inScope: 3, belowLevel: 2, hard: 1 });
    const f = r.findings.find((x) => x.id === "tactics:hanging_piece")!;
    expect(f.level).toMatchObject({ inScope: 3, belowLevel: 2, hard: 1 });
    expect(r.recommendations[0].reason.level).toEqual(f.level);
  });

  it("reports the share of errors outside Maia's scope", () => {
    expect(r.level?.scope).toEqual({ errors: 4, inScope: 3, outOfScope: { clock: 1 }, outOfScopeShare: 0.25 });
    expect(r.level?.population).toBe("lichess_blitz");
  });

  it("keeps the default ranking and offers the avoidable-loss ranking next to it", () => {
    expect(r.rankings?.byAvoidableLoss[0]).toBe("tactics:hanging_piece");
    expect(r.rankings?.recommendationsByAvoidableLoss.length).toBeGreaterThan(0);
  });

  it("lists exercises below the player's level first", () => {
    const levels = r.exercises.tactics.map((x) => x.level);
    expect(levels.slice(0, 2)).toEqual(["below_level", "below_level"]);
  });

  it("has no level fields without Maia", () => {
    const plain = buildReport(games, "alice");
    expect(plain.level).toBeUndefined();
    expect(plain.categories.tactics.level).toBeUndefined();
    expect(plain.errors[0].peer).toBeUndefined();
  });
});

describe("phase comparison (M3)", () => {
  const sample = (gameId: string, realLoss: number, expectedLoss: number): PhaseLevelSample => ({ gameId, ply: 1, phase: "endgame", realLoss, expectedLoss, coverage: 0.9 });

  it("finds nothing when the interval crosses 1", () => {
    const xs = Array.from({ length: 40 }, (_, i) => sample(`g${i}`, i % 2 ? 3 : 1, 2));
    const c = phaseComparison(xs).endgame!;
    expect(c.ratio).toBeCloseTo(1, 6);
    expect(c.finding).toBeUndefined();
    expect(c.ratioCi95[0]).toBeLessThan(1);
    expect(c.ratioCi95[1]).toBeGreaterThan(1);
  });

  it("flags a phase only when the whole interval is above 1", () => {
    const xs = Array.from({ length: 40 }, (_, i) => sample(`g${i}`, 4 + (i % 3), 2));
    const c = phaseComparison(xs).endgame!;
    expect(c.finding).toBe("worse_than_level");
    expect(c.realLossPer100).toBeCloseTo(((4 + 5 + 6) / 3) * 100, -1);
  });
});
