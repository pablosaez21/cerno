import { describe, expect, it } from "vitest";
import ref from "./fixtures/maia-reference.json";
import { decodePrediction, encodePosition, maiaBoardString, maiaLegalMoves, MAIA_HISTORY, MAIA_TOKEN_DIM, MAIA_VOCAB } from "../maia";

// Reference produced by scripts/maia/make_reference.py with the official Maia-3 code.
type Case = { label: string; fens: string[]; boards: string[]; legal: Record<string, number>; top: [string, number][]; wdlSideToMove: number[] };
const cases = (ref as unknown as { cases: Case[] }).cases;

function boardsFromTokens(t: Float32Array): string[] {
  const chars = "PNBRQKpnbrqk";
  return Array.from({ length: MAIA_HISTORY }, (_, slot) => {
    let s = "";
    for (let sq = 0; sq < 64; sq++) {
      let c = ".";
      for (let ch = 0; ch < 12; ch++) if (t[sq * MAIA_TOKEN_DIM + slot * 12 + ch] === 1) c = chars[ch];
      s += c;
    }
    return s;
  });
}

describe("Maia-3 encoding parity with the official code", () => {
  it("has the reference cases, including the special ones", () => {
    expect(cases.length).toBeGreaterThanOrEqual(200);
    for (const l of ["white promotion", "black promotion", "white en passant", "black en passant", "black can castle both sides", "full 8-position history"]) {
      expect(cases.some((c) => c.label === l)).toBe(true);
    }
  });

  it("produces the same tokens for every history slot", () => {
    for (const c of cases) {
      expect(boardsFromTokens(encodePosition(c.fens)), c.label).toEqual(c.boards);
    }
  });

  it("maps every legal move to the same vocabulary index", () => {
    for (const c of cases) {
      const fen = c.fens[c.fens.length - 1];
      const mine = Object.fromEntries(maiaLegalMoves(fen).map((m) => [m.uci, m.index]));
      expect(mine, c.label).toEqual(c.legal);
    }
  });

  it("mirrors the board when Black is to move", () => {
    const b = maiaBoardString("8/8/8/8/8/8/1p4k1/6K1 b - - 0 1");
    expect(b[6 * 8 + 1]).toBe("P"); // b2 black pawn -> b7 white pawn
    expect(b[7 * 8 + 6]).toBe("k"); // g1 white king -> g8 black king
  });

  it("decodes a masked softmax over legal moves only", () => {
    const fen = "8/1P4k1/8/8/8/8/6K1/8 w - - 0 1";
    const logits = new Float32Array(MAIA_VOCAB).fill(50); // illegal moves must not count
    const legal = maiaLegalMoves(fen);
    legal.forEach((m) => (logits[m.index] = 0));
    logits[legal.find((m) => m.uci === "b7b8q")!.index] = Math.log(3);
    const p = decodePrediction(fen, logits, [0, 0, Math.log(2)]);
    expect(Object.keys(p.policy)).toHaveLength(legal.length);
    expect(p.policy.b7b8q).toBeCloseTo(3 / (legal.length + 2), 6);
    expect(p.wdl[2]).toBeCloseTo(0.5, 6);
  });
});
