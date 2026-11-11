// Label review: a fixed random sample of errors that the player marks as
// right or wrong. Pure helpers so the sample and the score are testable.
import type { Category } from "./classify";
import type { ErrorRow } from "./report";

export const REVIEW_SIZE = 30;

export interface ReviewAnswer {
  /** Is the main category right? */
  categoryOk?: boolean;
  /** The category the player would give, when categoryOk is false. */
  categoryShouldBe?: Category;
  /** Are the tactic/clock tags right? undefined when there are none. */
  tagsOk?: boolean;
  /** Was it really a mistake? */
  realError?: boolean;
  note?: string;
}

/** mulberry32: small deterministic PRNG. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Uniform sample of mistakes and blunders, stable for a given seed. */
export function sampleForReview(errors: ErrorRow[], seed: number, size = REVIEW_SIZE): ErrorRow[] {
  const pool = errors.filter((e) => e.judgement === "mistake" || e.judgement === "blunder");
  const rand = rng(seed);
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, size);
}

export interface ReviewScore {
  answered: number;
  categoryCorrect: number;
  categoryAccuracy?: number;
  tagsAnswered: number;
  tagsCorrect: number;
  notErrors: number;
  /** Per category given by Cerno: answered and correct. */
  byCategory: Partial<Record<Category, { answered: number; correct: number }>>;
}

export function scoreReview(sample: ErrorRow[], answers: Record<string, ReviewAnswer>): ReviewScore {
  const s: ReviewScore = { answered: 0, categoryCorrect: 0, tagsAnswered: 0, tagsCorrect: 0, notErrors: 0, byCategory: {} };
  for (const e of sample) {
    const a = answers[`${e.gameId}#${e.ply}`];
    if (!a || a.categoryOk === undefined) continue;
    s.answered++;
    const c = (s.byCategory[e.category] ??= { answered: 0, correct: 0 });
    c.answered++;
    if (a.categoryOk) {
      s.categoryCorrect++;
      c.correct++;
    }
    if (a.tagsOk !== undefined) {
      s.tagsAnswered++;
      if (a.tagsOk) s.tagsCorrect++;
    }
    if (a.realError === false) s.notErrors++;
  }
  s.categoryAccuracy = s.answered ? s.categoryCorrect / s.answered : undefined;
  return s;
}
