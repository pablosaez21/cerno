import { describe, expect, it } from "vitest";
import type { AnalyzedGame } from "../analyze";
import { parseGameMoves } from "../game";
import { finishDecision, type Decision } from "../peers";
import { buildReport, REPORT_VERSION } from "../report";
import type { GameRecord, PositionEval } from "../types";

// Synthetic games: White hangs a knight at `blunderPly`.
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

/** A decision for the blunder: good-move probability `good` at level 0, `goodPlus` at +200 and +400. */
function decision(g: AnalyzedGame, good: number, goodPlus: number, inScope = true): Decision {
  const ply = g.parsed.plies[4];
  const row = (q: number) => [q, 1 - q - 0.05];
  return finishDecision({
    gameId: g.game.id, ply: 5, mover: "player", color: "white", moveNumber: 3, phase: "opening", inScope, elo: 1810, eloOpp: 1820,
    fen: ply.fenBefore, played: ply.uci, engineBest: "d2d4", moves: ["d2d4", ply.uci], inSet: [true, true],
    p: [row(good), row(good), row(good), row(goodPlus), row(goodPlus)], mass: Array(5).fill(0.95), win: [50, 28], winPosition: 50,
  });
}
const decisions = [decision(games[0], 0.8, 0.9), decision(games[1], 0.9, 0.95), decision(games[2], 0.2, 0.45), decision(games[3], 0.5, 0.5, false)];

describe("report v3 level fields", () => {
  const r = buildReport(games, "alice", undefined, { decisions, model: "maia3-5m", mode: "reduced" });

  it("is contract version 3", () => {
    expect(r.version).toBe(REPORT_VERSION);
    expect(REPORT_VERSION).toBe(3);
  });

  it("puts normalised peer fields on judged errors, on the judged loss", () => {
    const c = r.errors.find((e) => e.gameId === "C")!;
    expect(c.peer?.pGood).toBeCloseTo(0.8 / 0.95, 3);
    expect(c.peer?.level).toBe("below_level");
    expect(c.peer?.avoidableLoss).toBeCloseTo(c.loss * (0.8 / 0.95), 1);
    const e = r.errors.find((x) => x.gameId === "E")!;
    expect(e.peer?.level).toBe("hard");
    expect(e.peer?.nextLevel).toBe(true);
    expect(e.peer?.learnability).toBeCloseTo((0.45 - 0.2) / 0.95, 3);
    // Moves under 30 s keep their Maia fields (calibrated there too).
    expect(r.errors.find((x) => x.gameId === "F")!.peer?.pGood).toBeCloseTo(0.5 / 0.95, 3);
  });

  it("summarises level per category, including next-level counts", () => {
    // C: (0.9 - 0.8) / 0.95 = 0.105 and E: 0.26 reach the 0.10 learnability tag; D: 0.05 does not.
    expect(r.categories.tactics.level).toMatchObject({ inScope: 4, belowLevel: 2, hard: 1, nextLevel: 2 });
  });

  it("reports the scope and the mode; no profile in reduced mode", () => {
    expect(r.level).toMatchObject({ mode: "reduced", population: "lichess_blitz", eloOffset: 360, scope: { errors: 4, inScope: 4, outOfScope: {} } });
    expect(r.profile).toBeUndefined();
  });

  it("orders exercises by the loss players 200 Elo higher avoid", () => {
    const ids = r.exercises.tactics.map((x) => x.gameId);
    expect(ids.slice(0, 2)).toEqual(["D", "C"]);
  });

  it("has no level fields without Maia", () => {
    const plain = buildReport(games, "alice");
    expect(plain.level).toBeUndefined();
    expect(plain.profile).toBeUndefined();
    expect(plain.errors[0].peer).toBeUndefined();
  });
});
