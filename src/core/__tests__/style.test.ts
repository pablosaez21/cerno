import { describe, expect, it } from "vitest";
import { positionFromFen } from "../chess";
import { finishDecision, type Decision } from "../peers";
import { moveAttributes, STYLE_ATTRIBUTES, styleAttr, styleTraits, type StyleAttribute } from "../style";

const has = (fen: string, uci: string, moveNumber = 20) => {
  const a = moveAttributes(positionFromFen(fen), uci, moveNumber);
  return new Set(STYLE_ATTRIBUTES.filter((_, i) => a[i] === 1));
};

describe("move attributes", () => {
  it("captures, equal trades and queen trades", () => {
    expect(has("4k3/8/8/3n4/8/2N5/8/4K3 w - - 0 1", "c3d5")).toEqual(new Set<StyleAttribute>(["capture", "equal_trade", "knight_move", "advance"]));
    expect(has("4k3/8/8/3q4/8/8/8/3QK3 w - - 0 1", "d1d5")).toEqual(new Set<StyleAttribute>(["capture", "equal_trade", "queen_trade", "queen_move", "advance"]));
  });

  it("checks, castling, king moves", () => {
    expect(has("4k3/8/8/8/8/8/8/R3K3 w Q - 0 1", "a1a8").has("check")).toBe(true);
    expect(has("4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1", "e1g1")).toEqual(new Set<StyleAttribute>(["castling"]));
    expect(has("4k3/8/8/8/8/8/8/4K3 w - - 0 1", "e1d2")).toEqual(new Set<StyleAttribute>(["king_move"]));
  });

  it("retreats, moves to attacked squares and pawn moves near the own king after move 8", () => {
    expect(has("4k3/8/8/4N3/8/8/8/4K3 w - - 0 1", "e5d3").has("retreat")).toBe(true);
    expect(has("4k3/8/8/8/1p6/8/8/2B1K3 w - - 0 1", "c1a3").has("to_attacked_square")).toBe(true);
    expect(has("6k1/8/8/8/8/8/6PP/6K1 w - - 0 1", "g2g4", 12).has("king_side_pawn_move")).toBe(true);
    expect(has("6k1/8/8/8/8/8/6PP/6K1 w - - 0 1", "g2g4", 5).has("king_side_pawn_move")).toBe(false);
  });
});

describe("style traits", () => {
  const fen = "4k3/8/8/8/8/8/P7/4K1N1 w - - 0 1";
  // Maia expects a pawn move half of the time; the player never plays it, the opponents follow Maia.
  const preds = Array.from({ length: 5 }, () => ({ policy: { a2a3: 0.5, g1f3: 0.5 }, wdl: [0.3, 0.1, 0.6] as [number, number, number] }));
  const decisions: Decision[] = [];
  for (let g = 0; g < 40; g++) {
    for (let i = 0; i < 20; i++) {
      const mover = i % 2 ? "opponent" : "player";
      const played = mover === "player" ? "g1f3" : i % 4 === 1 ? "a2a3" : "g1f3";
      const d = finishDecision({
        gameId: `g${g}`, ply: i + 1, mover, color: "white", moveNumber: 20, phase: "middlegame", inScope: true, elo: 1800, eloOpp: 1800, fen, played,
        engineBest: "g1f3", moves: ["g1f3", "a2a3"], inSet: [true, true], p: preds.map(() => [0.5, 0.5]), mass: Array(5).fill(1), win: [50, 50], winPosition: 50,
      });
      d.attr = styleAttr(fen, played, 20, preds);
      decisions.push(d);
    }
  }

  it("flags an attribute the player under-uses while the opponents do not", () => {
    const pawn = styleTraits(decisions).find((t) => t.attribute === "pawn_move")!;
    expect(pawn.observed).toBe(0);
    expect(pawn.expected).toBeCloseTo(0.5, 6);
    expect(pawn.zOpponents).toBeCloseTo(0, 6);
    expect(pawn.zControlled).toBeLessThan(-3);
    expect(pawn.trait).toBe(true);
  });
});
