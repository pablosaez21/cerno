import { describe, expect, it } from "vitest";
import { CALIB_EFFICIENCY, calibrated, DEFAULT_LOAD, estimates, estimateSecs, FIXED_S, formatSecs, learn, NODES_PER_GAME, workersFor } from "../pace";

describe("time estimate per load mode", () => {
  it("preselects the soft mode", () => {
    expect(DEFAULT_LOAD).toBe("soft");
  });

  it("reproduces the reference run: 100 games at 9 × 680 k nodes/s take about 264 s", () => {
    expect(estimateSecs(100, 9 * 680_000)).toBeCloseTo(264, -1);
  });

  it("picks the default worker count from the calibration ramp, not from a partial one", () => {
    const ramp = { 1: 1_500_000, 2: 2_950_000, 3: 4_400_000, 4: 5_700_000, 5: 5_900_000 };
    expect(workersFor("soft", undefined, 10)).toBe(3);
    expect(workersFor("soft", calibrated(undefined, 10, ramp, true), 10)).toBe(3);
    expect(workersFor("full", calibrated(undefined, 10, ramp, true), 10)).toBe(9);
    // Six fast workers on a 14-core machine: five.
    const big = { 1: 1e6, 2: 2e6, 3: 3e6, 4: 4e6, 5: 5e6, 6: 6e6, 7: 5e6 };
    expect(workersFor("soft", calibrated(undefined, 14, big, true), 14)).toBe(5);
    // Figures from before the ramp (or another machine) do not pick the count.
    expect(workersFor("soft", calibrated(undefined, 14, big), 14)).toBe(4);
    expect(workersFor("soft", calibrated(undefined, 10, big, true), 14)).toBe(4);
    // A new ramp replaces the old figures.
    const again = calibrated(calibrated(undefined, 10, { 5: 4e6, 9: 6e6 }), 10, ramp, true);
    expect(again.calib).toEqual(ramp);
    expect(again.ramp).toBe(true);
  });

  it("has no figure until the device is measured, then one per worker count", () => {
    expect(estimates(undefined, 10, 100).soft).toEqual({ workers: 3, secs: undefined });
    const pace = calibrated(undefined, 10, { 3: 4_000_000, 9: 6_000_000 });
    const e = estimates(pace, 10, 100);
    // A whole analysis runs slower than the calibration.
    expect(e.soft.secs).toBeCloseTo(FIXED_S + (100 * NODES_PER_GAME) / (4_000_000 * CALIB_EFFICIENCY), 6);
    expect(e.full.secs).toBeLessThan(e.soft.secs!);
    // Measured on another machine (or another core count): not used.
    expect(estimates(pace, 14, 100).soft.secs).toBeUndefined();
  });

  it("prefers a whole analysis to the calibration, and corrects the other mode by the same ratio", () => {
    let pace = calibrated(undefined, 10, { 3: 4_000_000, 9: 6_000_000 });
    pace = learn(pace, 10, { workers: 9, nodes: 900_000_000, stockfishMs: 180_000, freshGames: 60 })!;
    expect(pace.run[9]).toBe(5_000_000);
    expect(pace.nodesPerGame).toBe(15_000_000);
    const e = estimates(pace, 10, 100);
    expect(e.full.secs).toBeCloseTo(FIXED_S + (100 * 15_000_000) / 5_000_000, 6);
    expect(e.soft.secs).toBeCloseTo(FIXED_S + (100 * 15_000_000) / (4_000_000 * (5 / 6)), 6);
  });

  it("learns nothing from a run with few new games", () => {
    const pace = calibrated(undefined, 10, { 5: 4_000_000 });
    expect(learn(pace, 10, { workers: 5, nodes: 50_000_000, stockfishMs: 10_000, freshGames: 3 })).toBe(pace);
  });

  it("adds Maia on the processor when there is no WebGPU", () => {
    expect(estimateSecs(25, 9 * 680_000, NODES_PER_GAME, true, 9) - estimateSecs(25, 9 * 680_000)).toBeCloseTo(25 * 4.2, 6);
  });

  it("rounds like an estimate", () => {
    expect([formatSecs(44), formatSecs(264), formatSecs(380)]).toEqual(["~40 s", "~4 min", "~6 min"]);
  });
});
