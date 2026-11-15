import { describe, expect, it } from "vitest";
import { Diag } from "../diag";

describe("diagnostic text", () => {
  it("has the device, the run and one line per phase, and nothing else", () => {
    let phase = "pass1+maia";
    const d = new Diag({ userAgent: "UA/1", cores: 10, memoryGb: 16, load: "soft", workers: 3, games: 100, backend: "webgpu", pressureApi: true }, () => phase);
    d.pressureState("fair");
    d.pressureState("serious");
    d.pressureState("serious");
    phase = "pass2";
    d.limit(2);
    d.byPhase["pass2"] = { ms: 1500, frames: 90, stalls: 2, maxMs: 120 };
    d.stop();
    const t = d.text({ status: "done", timings: { totalMs: 1 } });
    expect(t).toContain("navegador: UA/1");
    expect(t).toContain("núcleos (hardwareConcurrency): 10");
    expect(t).toContain("memoria (deviceMemory): 16 GB");
    expect(t).toContain("modo: soft · motores: 3");
    expect(t).toContain("Maia: webgpu");
    expect(t).toContain("partidas: 100");
    expect(t).toContain("pass2: 1.5 s · 90 · 2 · 120 ms · –");
    expect(t).toMatch(/freno \(s: motores\): \d+: 2/);
    expect(t).toContain('tiempos: {"totalMs":1}');
    // Pressure states seen in a phase with no frames are still listed.
    expect(t).toContain("pass1+maia: 0.0 s · 0 · 0 · 0 ms · fair 1, serious 2");
  });
});
