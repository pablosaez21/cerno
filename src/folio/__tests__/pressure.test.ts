import { describe, expect, it } from "vitest";
import { Brake, DOWN_MS, UP_MS } from "../pressure";

describe("pressure brake", () => {
  it("takes one engine away when the CPU comes under pressure, and one more while it lasts", () => {
    const b = new Brake(3, 0);
    expect(b.observe("fair", 100)).toBeUndefined();
    expect(b.observe("serious", 1_000)).toBe(2);
    expect(b.tick(1_000 + DOWN_MS - 1)).toBeUndefined();
    expect(b.tick(1_000 + DOWN_MS)).toBe(1);
    // Never below one engine.
    expect(b.tick(1_000 + 3 * DOWN_MS)).toBeUndefined();
    expect(b.limit).toBe(1);
  });

  it("halves the engines when the pressure is critical", () => {
    const b = new Brake(6, 0);
    expect(b.observe("critical", 10)).toBe(3);
    const s = new Brake(6, 0);
    s.observe("serious", 10);
    expect(s.observe("critical", 20)).toBe(2);
  });

  it("gives them back one at a time, only after a calm spell (no oscillation)", () => {
    const b = new Brake(3, 0);
    b.observe("serious", 0);
    b.tick(DOWN_MS);
    expect(b.limit).toBe(1);
    const calm = DOWN_MS + 500;
    b.observe("nominal", calm);
    expect(b.tick(calm + UP_MS - 1)).toBeUndefined();
    expect(b.tick(calm + UP_MS)).toBe(2);
    // A short bump resets the calm spell.
    expect(b.observe("serious", calm + UP_MS + 1_000)).toBe(1);
    b.observe("fair", calm + UP_MS + 2_000);
    expect(b.tick(calm + 2 * UP_MS)).toBeUndefined();
    expect(b.tick(calm + 2 * UP_MS + 2_000)).toBe(2);
    expect(b.tick(calm + 3 * UP_MS + 2_000)).toBe(3);
    expect(b.tick(calm + 9 * UP_MS)).toBeUndefined();
  });

  it("does nothing while the CPU stays calm", () => {
    const b = new Brake(4, 0);
    for (let t = 0; t < 60_000; t += 1_000) expect(b.observe(t % 2 ? "fair" : "nominal", t)).toBeUndefined();
    expect(b.limit).toBe(4);
  });
});
