import { describe, expect, it } from "vitest";
import type { ErrorRow } from "../report";
import { sampleForReview, scoreReview } from "../review";

const err = (i: number, judgement: ErrorRow["judgement"], category: ErrorRow["category"] = "tactics") =>
  ({ gameId: `g${i}`, ply: i, judgement, category, clockTags: [] }) as unknown as ErrorRow;

describe("review", () => {
  const errors = [...Array.from({ length: 50 }, (_, i) => err(i, i % 2 ? "mistake" : "blunder")), ...Array.from({ length: 20 }, (_, i) => err(100 + i, "inaccuracy"))];

  it("samples 30 mistakes or blunders, stable for a seed", () => {
    const a = sampleForReview(errors, 42);
    expect(a).toHaveLength(30);
    expect(a.every((e) => e.judgement !== "inaccuracy")).toBe(true);
    expect(sampleForReview(errors, 42)).toEqual(a);
    expect(sampleForReview(errors, 43)).not.toEqual(a);
    expect(new Set(a.map((e) => e.gameId)).size).toBe(30);
  });

  it("scores category accuracy over answered items", () => {
    const sample = [err(1, "blunder"), err(2, "blunder", "strategy"), err(3, "mistake")];
    const s = scoreReview(sample, {
      "g1#1": { categoryOk: true, tagsOk: true },
      "g2#2": { categoryOk: false, categoryShouldBe: "tactics", realError: false },
    });
    expect(s).toMatchObject({ answered: 2, categoryCorrect: 1, categoryAccuracy: 0.5, tagsAnswered: 1, tagsCorrect: 1, notErrors: 1 });
    expect(s.byCategory.strategy).toEqual({ answered: 1, correct: 0 });
  });
});
