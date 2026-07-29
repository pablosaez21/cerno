import { describe, expect, expectTypeOf, it } from "vitest";
import type {
  CoachAnalysis,
  PhaseStat,
  PgnAnalysis,
  PgnMove,
} from "@/lib/types";
import {
  coachAnalysisBlackFixture,
  coachAnalysisFixture,
  pgnAnalysisFixture,
} from "@/test/fixtures";

describe("frontend response contracts", () => {
  it("preserves explicit mover ownership and phase move evidence", () => {
    const colors = pgnAnalysisFixture.moves.map((move) => move.mover_color);

    expect(colors).toEqual([
      "white",
      "black",
      "white",
      "black",
      "white",
      "black",
    ]);
    expect(coachAnalysisFixture.diagnosis.phase_stats.opening.moves).toBe(3);
    expect(coachAnalysisBlackFixture.game_analyses[0].player_color).toBe(
      "black",
    );
  });

  it("keeps the viewer and profile compile-time contracts narrow", () => {
    expectTypeOf<PgnMove["mover_color"]>().toEqualTypeOf<"white" | "black">();
    expectTypeOf<PhaseStat["moves"]>().toEqualTypeOf<number | undefined>();
    expectTypeOf<PgnAnalysis["moves"]>().toEqualTypeOf<PgnMove[]>();
    expectTypeOf<PgnAnalysis["coaching"]["scope"]>().toEqualTypeOf<"full_game">();
    expectTypeOf<PgnAnalysis["coaching"]["recommendations"]>().toEqualTypeOf<
      string[]
    >();
    expectTypeOf<CoachAnalysis["game_analyses"][number]["player_color"]>()
      .toEqualTypeOf<"white" | "black">();
  });
});
