import { describe, expect, it } from "vitest";
import type { AnalyzedGame } from "../analyze";
import { parseGameMoves } from "../game";
import { buildReport } from "../report";
import type { GameRecord, PositionEval } from "../types";

/**
 * Builds an analysed game where the player (White) hangs a knight at `blunderPly`.
 * Evals are 0 before the blunder and -250 after it.
 */
function game(id: string, moves: string, blunderPly: number, best: string[], refutation: string[]): AnalyzedGame {
  const record: GameRecord = {
    id,
    source: "pgn",
    pgn: `[White "alice"]\n[Black "bob"]\n[Result "0-1"]\n\n${moves} 0-1`,
    white: { name: "alice" },
    black: { name: "bob" },
    playerColor: "white",
    result: "loss",
    termination: "resignation",
    timeClass: "blitz",
  };
  const parsed = parseGameMoves(record);
  const ev = (cp: number, pv: string[] = []): PositionEval => ({ lines: [{ score: { cp }, pv, depth: 10 }], score: { cp }, nodes: 1 });
  const evals = [parsed.startFen, ...parsed.plies.map((p) => p.fenAfter)].map((_, i) => (i < blunderPly ? ev(0, ["a2a3"]) : ev(-250)));
  return {
    game: record,
    parsed,
    evals,
    deep: {
      [blunderPly]: {
        before: { lines: [{ score: { cp: 0 }, pv: best, depth: 18 }, { score: { cp: -20 }, pv: ["a2a3"], depth: 18 }], score: { cp: 0 }, nodes: 1 },
        after: ev(-250, refutation),
      },
    },
  };
}

const games = [
  game("A", "1. Nc3 d5 2. Nxd5 Qxd5 3. e4 Qd8", 3, ["e2e4", "d5e4", "c3e4"], ["d8d5", "e2e4", "d5e4"]),
  game("B", "1. Nc3 d5 2. Nxd5 Qxd5 3. e4 Qd8", 3, ["e2e4", "d5e4", "c3e4"], ["d8d5", "e2e4", "d5e4"]),
  game("C", "1. h3 d5 2. Nc3 Nf6 3. Nxd5 Qxd5 4. e4 Qd8", 5, ["d2d4"], ["d8d5", "e2e4"]),
  game("D", "1. a3 d5 2. Nc3 c6 3. Nxd5 cxd5 4. e4 dxe4", 5, ["d2d4"], ["c6d5", "e2e4"]),
  game("E", "1. b3 d5 2. Nc3 e6 3. Nxd5 exd5 4. e4 dxe4", 5, ["d2d4"], ["e6d5", "e2e4"]),
];

describe("report", () => {
  const report = buildReport(games, "alice");

  it("judges and labels each error with its evidence", () => {
    const c = report.errors.find((e) => e.gameId === "C")!;
    expect(c).toMatchObject({ ply: 5, judgement: "blunder", category: "tactics", tactic: { tag: "hanging_piece" } });
    expect(c.played.san).toBe("Nxd5");
    expect(c.best?.san).toBe("d4");
    expect(c.refutation.san[0]).toBe("Qxd5");
  });

  it("moves the same opening mistake repeated in two games to openings, keeping the tactic tag", () => {
    const a = report.errors.find((e) => e.gameId === "A")!;
    expect(a).toMatchObject({ category: "openings", repeated: true, tactic: { tag: "hanging_piece" } });
    const f = report.findings.find((x) => x.kind === "repeated_mistake")!;
    expect(f.area).toBe("openings");
    expect(f.evidence).toEqual([{ gameId: "A", ply: 3 }, { gameId: "B", ply: 3 }]);
  });

  it("emits a tactic finding only with three occurrences in three games", () => {
    const f = report.findings.find((x) => x.id === "tactics:hanging_piece")!;
    expect(f.occurrences).toBe(3);
    expect(f.evidence.map((e) => e.gameId).sort()).toEqual(["C", "D", "E"]);
    expect(f.impact).toBeCloseTo(f.winLoss / 5, 1);
  });

  it("counts categories, decided games and errors per 100 moves", () => {
    expect(report.categories.tactics.counts.blunder).toBe(3);
    expect(report.categories.openings.counts.blunder).toBe(2);
    expect(report.categories.tactics.decidedGames).toBe(3);
    expect(report.categories.openings.decidedGames).toBe(2);
    expect(report.categories.tactics.winLossShare).toBeCloseTo(0.6, 2);
    expect(report.categories.tactics.errorsPer100).toBeCloseTo((3 / report.sample.playerMoves) * 100, 1);
  });

  it("recommends from the highest-impact findings with a rule-based prescription", () => {
    expect(report.recommendations.length).toBeGreaterThan(0);
    const top = report.recommendations[0];
    expect(top.findingId).toBe("tactics:hanging_piece");
    expect(top.prescription.themes).toContain("hangingPiece");
    expect(top.prescription.methods).toContain("blunder_check");
    expect(top.reason).toMatchObject({ occurrences: 3, games: 3, gamesAnalysed: 5 });
  });

  it("turns errors into exercises with the engine solution", () => {
    expect(report.exercises.tactics).toHaveLength(3);
    const ex = report.exercises.tactics.find((e) => e.gameId === "C")!;
    expect(ex.solution.uci[0]).toBe("d2d4");
    expect(ex.played.uci).toBe("c3d5");
    expect(ex.orientation).toBe("white");
  });

  it("never emits a finding without evidence", () => {
    for (const f of report.findings) expect(f.evidence.length).toBeGreaterThan(0);
  });
});
