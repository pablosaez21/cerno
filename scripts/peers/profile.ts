// Prints the peer profile of a decisions file and, with --ref, compares it with
// the planner's reference output (tolerances of step 2).
// Usage: npx tsx scripts/peers/profile.ts <decisions.jsonl> [--ref ref-profile.json]
import fs from "node:fs";
import { profileStats, type ClassStat } from "../../src/core/peer-stats";
import type { Decision } from "../../src/core/peers";

export function readDecisions(file: string): Decision[] {
  return fs.readFileSync(file, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l) as Decision);
}

const args = process.argv.slice(2);
const decisions = readDecisions(args[0]);
const prof = profileStats(decisions);
if (!prof) {
  console.log("not enough games for a profile");
  process.exit(0);
}
const rows = [prof.overall, ...prof.classes];
const fmt = (c: ClassStat) =>
  c.insufficient
    ? `${c.id.padEnd(22)} ${String(c.decisions).padStart(5)} ${String(c.opponentDecisions).padStart(5)} | insufficient`
    : `${c.id.padEnd(22)} ${String(c.decisions).padStart(5)} ${String(c.opponentDecisions).padStart(5)} | ${String(c.player).padStart(5)} ${String(c.opponents).padStart(5)} ${String(c.gap).padStart(5)} ${String(c.sd).padStart(4)} ${c.z!.toFixed(2).padStart(6)} ${c.p!.toFixed(4)} ${c.q?.toFixed(4) ?? "  -   "} ${c.grade ?? "-"} | 80% [${c.ci80}] 95% [${c.ci95}] | MDE ${c.detectableGap} | style ${c.style?.gap} | loss/g ${c.cost.lossPerGame} ${c.cost.opponentsLossPerGame}`;
console.log("class                      nP    nR | player opp  gap   sd      z      p      q   g");
for (const c of [...rows, ...prof.secondary, ...prof.clock]) console.log(fmt(c));
const refIdx = args.indexOf("--ref");
if (refIdx >= 0) {
  const ref = JSON.parse(fs.readFileSync(args[refIdx + 1], "utf8"));
  let ok = true;
  for (const r of ref.classes) {
    const m = rows.find((c) => c.id === r.id)!;
    const fails: string[] = [];
    if (Math.abs(m.player! - r.player) > 15) fails.push(`player ${m.player} vs ${r.player}`);
    if (Math.abs(m.opponents! - r.rivals) > 15) fails.push(`opp ${m.opponents} vs ${r.rivals}`);
    if (Math.abs(m.gap! - r.gap) > 20) fails.push(`gap ${m.gap} vs ${r.gap}`);
    if (Math.abs(m.sd! - r.sd) > 0.15 * r.sd) fails.push(`sd ${m.sd} vs ${r.sd}`);
    if (m.grade !== r.grade) fails.push(`grade ${m.grade} vs ${r.grade}`);
    if (fails.length) ok = false;
    console.log(`${r.id.padEnd(22)} ${fails.length ? "DIFF " + fails.join(", ") : "ok"}`);
  }
  console.log(ok ? "REFERENCE MATCH" : "REFERENCE MISMATCH");
}
