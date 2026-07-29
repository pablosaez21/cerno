import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";
import {
  buildPositions,
  findCriticalPly,
  getPlayedSquares,
  groupMoves,
  readPgnMetadata,
  reconstructPositions,
  validFen,
} from "@/lib/game-viewer";
import type { PgnMove } from "@/lib/types";
import {
  pgnAnalysisFixture,
  pgnMovesFixture,
  sourcePgn,
} from "@/test/fixtures";

describe("GameViewer position reconstruction", () => {
  it("prefers valid engine FEN values", () => {
    const engineInitial = "8/8/8/8/8/8/4K3/6k1 w - - 0 1";
    const engineAfter = "8/8/8/8/8/5K2/8/6k1 b - - 1 1";
    const move = {
      ...pgnMovesFixture[0],
      fen_before: engineInitial,
      fen_after: engineAfter,
    };

    expect(buildPositions([move], sourcePgn)).toEqual([
      engineInitial,
      engineAfter,
    ]);
  });

  it("replays the PGN when engine FEN is missing or invalid", () => {
    const moves = pgnMovesFixture.map((move) => ({
      ...move,
      fen_before: "",
      fen_after: "invalid",
    }));
    const reconstructed = reconstructPositions(sourcePgn);

    expect(buildPositions(moves, sourcePgn)).toEqual(reconstructed);
    expect(reconstructed).toHaveLength(moves.length + 1);
    expect(validFen(reconstructed.at(-1))).toBe(true);
  });

  it("respects a non-standard initial FEN", () => {
    const customPgn = `[Event "Custom"]
[SetUp "1"]
[FEN "8/8/8/8/8/8/4K3/6k1 w - - 0 1"]

1. Kf3 *`;
    const move = {
      ...pgnMovesFixture[0],
      move_uci: "e2f3",
      move_san: "Kf3",
      fen_before: "",
      fen_after: "",
    };
    const positions = buildPositions([move], customPgn);

    expect(positions[0]).toBe("8/8/8/8/8/8/4K3/6k1 w - - 0 1");
    expect(new Chess(positions[1]).get("f3")?.type).toBe("k");
  });

  it("falls back safely when both PGN and FEN are invalid", () => {
    const moves = [
      { ...pgnMovesFixture[0], fen_before: "bad", fen_after: "also bad" },
      { ...pgnMovesFixture[1], fen_before: "bad", fen_after: "" },
    ];

    expect(buildPositions(moves, "not a PGN")).toEqual([
      "start",
      "start",
      "start",
    ]);
    expect(reconstructPositions("not a PGN")).toEqual([]);
  });

  it("keeps the last valid position when later data is incomplete", () => {
    const moves = [
      pgnMovesFixture[0],
      {
        ...pgnMovesFixture[1],
        fen_after: "invalid",
      },
    ];

    expect(buildPositions(moves, "")).toEqual([
      pgnMovesFixture[0].fen_before,
      pgnMovesFixture[0].fen_after,
      pgnMovesFixture[0].fen_after,
    ]);
  });
});

describe("GameViewer deterministic helpers", () => {
  it("groups every ply by explicit mover color", () => {
    const rows = groupMoves(pgnMovesFixture);

    expect(rows).toHaveLength(3);
    expect(rows[0].white?.move.move_san).toBe("e4");
    expect(rows[0].black?.move.move_san).toBe("e5");
    expect(rows[2].white?.ply).toBe(5);
    expect(rows[2].black?.ply).toBe(6);
  });

  it("finds critical moments without an off-by-one error", () => {
    expect(
      findCriticalPly(
        pgnMovesFixture,
        pgnAnalysisFixture.critical_moments[0],
      ),
    ).toBe(5);
    expect(
      findCriticalPly(pgnMovesFixture, {
        ...pgnMovesFixture[0],
        move_number: 99,
      }),
    ).toBeNull();
    expect(findCriticalPly(pgnMovesFixture, undefined)).toBeNull();
  });

  it("validates FEN and extracts only valid UCI squares", () => {
    expect(validFen(pgnMovesFixture[0].fen_before)).toBe(true);
    expect(validFen("invalid")).toBe(false);
    expect(getPlayedSquares(pgnMovesFixture[0])).toEqual({
      from: "e2",
      to: "e4",
    });
    expect(
      getPlayedSquares({
        ...pgnMovesFixture[0],
        move_uci: "not-a-move",
      }),
    ).toBeNull();
  });

  it("reads metadata and defaults safely for malformed PGN", () => {
    expect(readPgnMetadata(sourcePgn)).toMatchObject({
      event: "Cerno fixture",
      white: "FixtureWhite",
      black: "FixtureBlack",
      orientation: "white",
    });
    expect(
      readPgnMetadata('[Orientation "Black"]\n\n1. e4 *').orientation,
    ).toBe("black");
    expect(readPgnMetadata("invalid")).toEqual({ orientation: "white" });
  });

  it("supports an empty move list", () => {
    expect(groupMoves([])).toEqual([]);
    expect(buildPositions([], "")).toEqual(["start"]);
    expect(getPlayedSquares(undefined)).toBeNull();
  });

  it("retains the PgnMove contract in defensive copies", () => {
    const partial: PgnMove = { ...pgnMovesFixture[0], fen_after: "" };
    expect(buildPositions([partial], sourcePgn)).toHaveLength(2);
  });
});
