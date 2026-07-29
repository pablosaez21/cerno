import { describe, expect, it } from "vitest";
import {
  classificationLabel,
  classificationTone,
  formatDate,
  formatEvaluation,
  formatNumber,
  formatPawnValue,
  phaseLabel,
  titleCase,
} from "@/lib/format";

describe("format helpers", () => {
  it("formats known and unknown labels", () => {
    expect(phaseLabel("middlegame")).toBe("Middlegame");
    expect(phaseLabel("late_opening")).toBe("Late Opening");
    expect(classificationLabel("blunder")).toBe("Blunder");
    expect(titleCase("king_safety")).toBe("King Safety");
  });

  it("formats metrics without inventing missing values", () => {
    expect(formatNumber(4)).toBe("4");
    expect(formatNumber(4.25)).toBe("4.3");
    expect(formatNumber(undefined)).toBe("—");
    expect(formatPawnValue(612)).toBe("6.1");
    expect(formatPawnValue(45)).toBe("0.45");
    expect(formatPawnValue(null, "n/a")).toBe("n/a");
  });

  it("formats evaluations including mate values", () => {
    expect(formatEvaluation(0)).toBe("0.00");
    expect(formatEvaluation(1.25)).toBe("+1.25");
    expect(formatEvaluation(-0.5)).toBe("−0.50");
    expect(formatEvaluation(100)).toBe("+M");
    expect(formatEvaluation(-100)).toBe("−M");
  });

  it("formats stable dates and classification tones", () => {
    expect(formatDate("2026-07-29T12:00:00Z")).toContain("Jul 29, 2026");
    expect(classificationTone("blunder")).toBe("tone tone-error");
    expect(classificationTone("mistake")).toBe("tone tone-warning");
    expect(classificationTone("inaccuracy")).toBe("tone tone-info");
    expect(classificationTone("good")).toBe("tone tone-success");
  });
});
