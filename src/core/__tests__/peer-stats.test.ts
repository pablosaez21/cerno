import { describe, expect, it } from "vitest";
import { benjaminiHochberg, bootstrapIndices, classStat, eloShift, gamesToConfirm, gradeClasses, gradeFamily, percentile, profileStats, ALL_CLASS, type ClassStat } from "../peer-stats";
import { simulate } from "../peer-sim";
import { finishDecision, PEER_ELO_DELTAS, type Decision } from "../peers";
import { rng } from "../review";

describe("Elo shift", () => {
  it("returns the vertex of the local parabola", () => {
    const f = (x: number) => -((x - 50) ** 2) / 1000;
    expect(eloShift(PEER_ELO_DELTAS.map(f)).shift).toBeCloseTo(50, 6);
    expect(eloShift(PEER_ELO_DELTAS.map(f)).atEdge).toBe(false);
  });

  it("returns the edge point, flagged, when the maximum is at the edge", () => {
    expect(eloShift([5, 4, 3, 2, 1])).toEqual({ shift: -400, atEdge: true });
    expect(eloShift([1, 2, 3, 4, 5])).toEqual({ shift: 400, atEdge: true });
  });
});

describe("family grades", () => {
  it("grades a separate family with its own Benjamini-Hochberg", () => {
    const c = (id: string, p: number, ci80: [number, number]) => ({ id, family: "clock", decisions: 200, opponentDecisions: 200, games: 30, p, ci80, atEdge: false, cost: {} }) as unknown as ClassStat;
    const fam = [c("a", 0.001, [-200, -100]), c("b", 0.2, [-80, -5]), c("c", 0.8, [-40, 60])];
    gradeFamily(fam);
    expect(fam.map((x) => x.grade)).toEqual(["A", "B", "C"]);
  });
});

describe("helpers", () => {
  it("Benjamini-Hochberg matches the textbook example", () => {
    const q = benjaminiHochberg([0.01, 0.04, 0.03, 0.2]);
    expect(q.map((x) => +x.toFixed(4))).toEqual([0.04, 0.0533, 0.0533, 0.2]);
  });

  it("percentile interpolates like numpy", () => {
    expect(percentile([1, 2, 3, 4], 50)).toBe(2.5);
    expect(percentile([1, 2, 3, 4], 10)).toBeCloseTo(1.3, 9);
  });

  it("bootstrap indices are deterministic for a seed", () => {
    expect(bootstrapIndices(10, 3, 5)).toEqual(bootstrapIndices(10, 3, 5));
    expect(bootstrapIndices(10, 3, 5)).not.toEqual(bootstrapIndices(10, 3, 6));
  });

  it("games to confirm scales with (2.8 / z)^2 and is capped", () => {
    expect(gamesToConfirm(100, -1.4)).toBe(400);
    expect(gamesToConfirm(100, 0.1)).toBeUndefined();
    expect(gamesToConfirm(100, 0.6)).toBe(2000);
  });
});

/** 400 synthetic decisions per side over 40 games from a seeded policy model. */
function fixture(): Decision[] {
  const rand = rng(42);
  const out: Decision[] = [];
  for (let g = 0; g < 40; g++) {
    for (let i = 0; i < 20; i++) {
      // Good-move probability rises with Elo; the rest is split between a mistake and a blunder.
      const base = 0.5 + 0.3 * rand();
      const p = PEER_ELO_DELTAS.map((delta) => {
        const good = Math.min(0.95, base + delta / 4000);
        return [good, (1 - good) * 0.6, (1 - good) * 0.4];
      });
      out.push(
        finishDecision({
          gameId: `g${String(g).padStart(3, "0")}`, ply: i + 1, mover: i % 2 ? "opponent" : "player", color: i % 2 ? "black" : "white",
          moveNumber: 15, phase: i < 6 ? "opening" : "middlegame", inScope: true, elo: 1800, eloOpp: 1800,
          fen: "4k3/8/8/8/8/8/8/4K2R w - - 0 1", played: "h1h8", engineBest: "h1h8", moves: ["h1h8", "h1h2", "e1d1"], inSet: [true, true, true],
          p, mass: p.map((r) => r[0] + r[1] + r[2]), win: [60, 50, 40], winPosition: 60,
        }),
      );
    }
  }
  return out;
}

describe("profile statistics on synthetic players", () => {
  const base = fixture();
  const gameIds = [...new Set(base.map((d) => d.gameId))].sort();

  it("recovers a planted shift on the player", () => {
    const rand = rng(7);
    const gaps: number[] = [];
    for (let k = 0; k < 30; k++) {
      const sim = simulate(base, () => -200, rand);
      gaps.push(classStat(ALL_CLASS, sim, gameIds, bootstrapIndices(gameIds.length, 50, k), { minDecisions: 100, minGames: 10 }).gap!);
    }
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    expect(mean).toBeGreaterThan(-300);
    expect(mean).toBeLessThan(-100);
  });

  it("finds no gap on average when nothing is planted", () => {
    const rand = rng(8);
    const gaps: number[] = [];
    for (let k = 0; k < 30; k++) {
      const sim = simulate(base, () => 0, rand);
      gaps.push(classStat(ALL_CLASS, sim, gameIds, bootstrapIndices(gameIds.length, 50, k), { minDecisions: 100, minGames: 10 }).gap!);
    }
    expect(Math.abs(gaps.reduce((a, b) => a + b, 0) / gaps.length)).toBeLessThan(60);
  });

  it("marks small classes as insufficient and grades the rest", () => {
    const stat = classStat({ id: "phase:endgame", family: "phase", test: (d) => d.phase === "endgame" }, base, gameIds, bootstrapIndices(gameIds.length, 20));
    expect(stat.insufficient).toBe(true);
    const overall = classStat(ALL_CLASS, base, gameIds, bootstrapIndices(gameIds.length, 50), { minDecisions: 100, minGames: 10 });
    gradeClasses(overall, []);
    expect(["A", "B", "C"]).toContain(overall.grade);
  });

  it("needs at least 30 games for a profile", () => {
    expect(profileStats(base.filter((d) => d.gameId < "g020"))).toBeUndefined();
  });
});
