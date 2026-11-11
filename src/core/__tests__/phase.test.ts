import { describe, expect, it } from "vitest";
import { parseGameMoves } from "../game";
import { endgameStart, endgameType, openingEndPly, openingOf, phasesOf, OPENING_CAP_PLIES } from "../phase";

const pgn = (moves: string) => `[Event "t"]\n[Result "*"]\n\n${moves} *`;

describe("opening detection", () => {
  it("names the deepest known position and counts book plies", () => {
    const { plies } = parseGameMoves({ pgn: pgn("1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. h4") });
    const o = openingOf(plies);
    expect(o.name).toMatch(/^Ruy Lopez/);
    expect(o.family).toBe("Ruy Lopez");
    expect(o.eco).toMatch(/^C/);
    expect(o.bookPlies).toBe(6);
  });

  it("caps the opening phase", () => {
    expect(openingEndPly(4)).toBe(10);
    expect(openingEndPly(40)).toBe(OPENING_CAP_PLIES);
  });

  it("returns no name when the first move is unknown", () => {
    const { plies } = parseGameMoves({ pgn: pgn("1. e4 e5") });
    expect(openingOf(plies).bookPlies).toBe(2);
  });
});

describe("endgame detection (Lichess Divider)", () => {
  it("does not mark the start position as endgame", () => {
    expect(endgameStart(["rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"])).toBeUndefined();
  });

  it("starts the endgame at 6 or fewer major and minor pieces", () => {
    const fens = [
      "r3k2r/ppp2ppp/2n1bn2/8/8/2N1BN2/PPP2PPP/R3K2R w KQkq - 0 12", // 10 pieces -> middlegame
      "r3k2r/ppp2ppp/4b3/8/8/4B3/PPP2PPP/R3K2R w KQkq - 0 13", // 6 pieces -> endgame
    ];
    expect(endgameStart(fens)).toBe(1);
  });

  it("classifies endgame types by material", () => {
    expect(endgameType("8/5k2/8/3p4/3P4/8/5K2/8 w - - 0 1")).toBe("pawn");
    expect(endgameType("8/5k2/8/3p4/3P4/8/r4K2/R7 w - - 0 1")).toBe("rook");
    expect(endgameType("8/5k2/2n5/3p4/3P4/2B5/5K2/8 w - - 0 1")).toBe("minor");
    expect(endgameType("8/5k2/2n5/3p4/3P4/8/r4K2/R7 w - - 0 1")).toBe("rook_minor");
    expect(endgameType("8/5k2/8/3p4/3P4/8/q4K2/Q7 w - - 0 1")).toBe("queen");
  });

  it("assigns opening, middlegame and endgame per ply", () => {
    const { startFen, plies } = parseGameMoves({ pgn: pgn("1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. h4 h5 5. a4 a5 6. b3 b6 7. c3 c6") });
    const phases = phasesOf(startFen, plies, openingOf(plies).bookPlies);
    expect(phases.slice(0, 12).every((p) => p === "opening")).toBe(true);
    expect(phases[12]).toBe("middlegame");
  });
});
