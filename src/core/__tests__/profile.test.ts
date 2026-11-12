import { describe, expect, it } from "vitest";
import { finishDecision, PEER_ELO_DELTAS, type Decision } from "../peers";
import { buildProfile, expectedLossAt, goodShare, opponentsTotalShift, pairedClock } from "../profile";
import { rng } from "../review";

function decisions(): Decision[] {
  const rand = rng(3);
  const out: Decision[] = [];
  for (let g = 0; g < 40; g++) {
    for (let i = 0; i < 20; i++) {
      const base = 0.5 + 0.3 * rand();
      const p = PEER_ELO_DELTAS.map((d) => {
        const good = Math.min(0.95, base + d / 4000);
        return [good, (1 - good) * 0.6, (1 - good) * 0.4];
      });
      const pick = rand();
      out.push(
        finishDecision({
          gameId: `g${String(g).padStart(3, "0")}`, ply: i + 1, mover: i % 2 ? "opponent" : "player", color: i % 2 ? "black" : "white",
          moveNumber: 10 + Math.floor(i / 2), phase: "middlegame", inScope: true, clockBefore: 100 - i, timeSpent: 2 + (i % 3), elo: 1800, eloOpp: 1800,
          fen: "4k3/8/8/8/8/8/8/4K2R w - - 0 1", played: pick < 0.7 ? "h1h8" : pick < 0.9 ? "h1h2" : "e1d1", engineBest: "h1h8", moves: ["h1h8", "h1h2", "e1d1"],
          inSet: [true, true, true], p, mass: p.map((r) => r[0] + r[1] + r[2]), win: [60, 50, 40], winPosition: 60,
        }),
      );
    }
  }
  return out;
}

describe("peer profile", () => {
  const ds = decisions();

  it("normalises the good-move share and the expected loss over the evaluated set", () => {
    const d = ds[0];
    expect(goodShare(d, 2)).toBeCloseTo(d.p[2][0] / d.mass[2], 9);
    expect(expectedLossAt(d, 2)).toBeCloseTo((d.p[2][1] * 10 + d.p[2][2] * 20) / d.mass[2], 9);
  });

  it("builds the profile with the opponents as control, costs and evidence", () => {
    const p = buildProfile(ds)!;
    expect(p.control).toBe("opponents_same_games");
    expect(p.games).toBe(40);
    expect(p.overall.decisions).toBe(400);
    expect(p.overall.nextLevel.gainPerGame).toBeGreaterThan(0);
    expect(p.overall.evidence.length).toBeLessThanOrEqual(50);
    expect(p.overall.evidence.every((e) => ds.find((d) => d.gameId === e.gameId && d.ply === e.ply)!.playedLoss >= 10)).toBe(true);
    // Too few decisions per class for the 150 minimum.
    expect(p.classes.find((c) => c.id === "phase:endgame")!.insufficient).toBe(true);
  });

  it("pairs the clock with the opponent of the same game", () => {
    const at10 = pairedClock(ds).find((c) => c.id === "clock_at_move_10")!;
    expect(at10.games).toBe(40);
    expect(at10.mean).toBeCloseTo(1, 6);
  });

  it("checks the Elo scale with the opponents' full move likelihood", () => {
    expect(Number.isFinite(opponentsTotalShift(ds))).toBe(true);
  });
});
