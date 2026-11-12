// Step 7 (V5): out-of-sample check. Signals pre-registered on sample A (the
// latest 96 blitz games) are tested on sample B (older games never used to
// choose anything). A signal replicates when B has the same sign and B's 80%
// interval excludes 0. Then the pooled profile (A + B).
// Usage: npx tsx scripts/peers/holdout.ts <decisions A.jsonl> <decisions B.jsonl> [out.json]
import fs from "node:fs";
import { profileStats, type ClassStat } from "../../src/core/peer-stats";
import type { Decision } from "../../src/core/peers";

const read = (f: string) => fs.readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as Decision);
const [fa, fb, out] = process.argv.slice(2);
const A = read(fa);
const B = read(fb);
const pa = profileStats(A)!;
const pb = profileStats(B)!;
const pooled = profileStats([...A, ...B])!;
const find = (p: typeof pa, id: string) => [p.overall, ...p.classes].find((c) => c.id === id)!;

// Pre-registered in the plan (section 4, step 7), before sample B was fetched.
const expectedNegative = ["all", "phase:opening", "phase:endgame", "standing:level", "demand:forcing", "demand:pawn", "choice:several_good"];
const expectedNull = ["phase:middlegame", "demand:piece", "choice:one_good"];
const fmt = (c: ClassStat) => (c.insufficient ? "insufficient" : `${c.gap} [80%: ${c.ci80![0]}, ${c.ci80![1]}] ${c.grade}`);
const rows = [
  ...expectedNegative.map((id) => {
    const a = find(pa, id), b = find(pb, id);
    const rep = !b.insufficient && b.gap! < 0 && b.ci80![1] < 0;
    return { signal: `${id} < 0`, A: fmt(a), B: fmt(b), replicates: rep, sameSign: !b.insufficient && b.gap! < 0 };
  }),
  ...expectedNull.map((id) => {
    const a = find(pa, id), b = find(pb, id);
    return { signal: `${id} not weaker`, A: fmt(a), B: fmt(b), replicates: !b.insufficient && !(b.ci80![1] < 0), sameSign: !b.insufficient && b.gap! >= 0 };
  }),
  {
    signal: "opening style gap < 0",
    A: `${find(pa, "phase:opening").style?.gap} [95%: ${find(pa, "phase:opening").style?.ci95}]`,
    B: `${find(pb, "phase:opening").style?.gap} [95%: ${find(pb, "phase:opening").style?.ci95}]`,
    replicates: (find(pb, "phase:opening").style?.ci95[1] ?? 0) < 0,
    sameSign: (find(pb, "phase:opening").style?.gap ?? 0) < 0,
  },
];
console.log(`A: ${pa.games} games, B: ${pb.games} games, pooled: ${pooled.games}`);
console.table(rows);
console.log("Pooled profile:");
console.table([pooled.overall, ...pooled.classes].map((c) => ({ id: c.id, nP: c.decisions, gap: c.gap, sd: c.sd, ci95: c.ci95?.join(" "), q: c.q, grade: c.grade, mde: c.detectableGap })));
if (out) fs.writeFileSync(out, JSON.stringify({ rows, A: pa, B: pb, pooled }, null, 1));
