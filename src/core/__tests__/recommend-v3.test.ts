import { describe, expect, it } from "vitest";
import { finishDecision, type Decision } from "../peers";
import { repertoire } from "../repertoire";
import { profileTargets } from "../report";

describe("version-3 recommendation targets", () => {
  const c = (id: string, family: string, grade: string, z: number, direction = "weaker") => ({ id, family, grade, z, direction });

  it("takes the weakest graded class per family, A before B, then by z", () => {
    const ids = profileTargets([
      c("phase:opening", "phase", "B", -1.7),
      c("phase:endgame", "phase", "B", -1.9),
      c("standing:level", "standing", "A", -3.2),
      c("demand:pawn", "demand", "C", -1.0),
      c("choice:one_good", "choice", "B", -1.6),
      c("choice:several_good", "choice", "A", -4),
      c("clock:>=60", "clock", "A", -5),
    ]);
    expect(ids).toEqual(["standing:level", "phase:endgame", "choice:one_good"]);
  });

  it("skips classes without real between-player spread (V4)", () => {
    expect(profileTargets([{ ...c("phase:endgame", "phase", "B", -2), tau: null }, { ...c("phase:opening", "phase", "B", -1.5), tau: 131 }])).toEqual(["phase:opening"]);
  });

  it("ignores stronger classes, grade C and insufficient samples", () => {
    expect(profileTargets([c("phase:opening", "phase", "A", 3, "stronger"), c("demand:pawn", "demand", "C", -1), { id: "phase:endgame", family: "phase", insufficient: true }])).toEqual([]);
  });
});

describe("repertoire", () => {
  const fen = "rnbqkbnr/pppp1ppp/8/4p3/3P4/8/PPP1PPPP/RNBQKBNR w KQkq - 0 2";
  const node = (game: string, played: string, lossPlayed: number): Decision =>
    finishDecision({
      gameId: game, ply: 3, mover: "player", color: "white", moveNumber: 2, phase: "opening", inScope: true, elo: 1800, eloOpp: 1800, fen, played,
      engineBest: "d4e5", moves: ["d4e5", "b1c3"], inSet: [true, true],
      p: [[0.4, 0.5], [0.5, 0.4], [0.6, 0.3], [0.7, 0.2], [0.74, 0.1]], mass: [0.9, 0.9, 0.9, 0.9, 0.84], win: [55, 55 - lossPlayed], winPosition: 55,
    });

  it("finds a recurring leak and a habit stronger players abandon", () => {
    const ds = [node("g1", "b1c3", 9), node("g2", "b1c3", 9), node("g3", "b1c3", 9)];
    const nodes = repertoire(ds, new Map([["g1", 1], ["g2", 0], ["g3", 0.5]]));
    expect(nodes).toHaveLength(1);
    const n = nodes[0];
    expect(n.games).toBe(3);
    expect(n.score).toBe(0.5);
    expect(n.favouritePlus400.uci).toBe("d4e5");
    expect(n.moves[0]).toMatchObject({ uci: "b1c3", san: "Nc3", count: 3, meanLoss: 9, leak: true, habitBelowLevel: true });
  });

  it("needs three games at the node", () => {
    expect(repertoire([node("g1", "b1c3", 9), node("g2", "b1c3", 9)], new Map())).toHaveLength(0);
  });
});
