// Step 3 (V1): synthetic players on the real positions. For each setting, draw
// `players` synthetic players (categories redrawn from Maia at a planted shift,
// opponents at 0) and report, per class, the mean estimate, its SD across
// players, the share with p < 0.05 and the share discovered by BH (q <= 0.10).
// Usage: npx tsx scripts/peers/simulate.ts <decisions.jsonl> [players=300] [resamples=200]
import fs from "node:fs";
import { profileStats } from "../../src/core/peer-stats";
import { simulate } from "../../src/core/peer-sim";
import type { Decision } from "../../src/core/peers";
import { rng } from "../../src/core/review";

const [file, playersArg = "300", resArg = "200"] = process.argv.slice(2);
const players = Number(playersArg);
const resamples = Number(resArg);
const decisions = fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as Decision);
const real = profileStats(decisions)!;
const realSd = new Map([real.overall, ...real.classes].map((c) => [c.id, c.sd!]));

const settings: { name: string; target?: string; planted: (d: Decision) => number }[] = [
  { name: "null", planted: () => 0 },
  { name: "-200 opening", target: "phase:opening", planted: (d) => (d.phase === "opening" ? -200 : 0) },
  { name: "-200 middlegame", target: "phase:middlegame", planted: (d) => (d.phase === "middlegame" ? -200 : 0) },
  { name: "-200 endgame", target: "phase:endgame", planted: (d) => (d.phase === "endgame" ? -200 : 0) },
  { name: "-300 endgame", target: "phase:endgame", planted: (d) => (d.phase === "endgame" ? -300 : 0) },
  { name: "-250 forcing", target: "demand:forcing", planted: (d) => (d.demand === "forcing" ? -250 : 0) },
  { name: "-100 everywhere", target: "all", planted: () => -100 },
  { name: "-150 everywhere", target: "all", planted: () => -150 },
];
const only = process.env.ONLY;
const out: Record<string, unknown>[] = [];
for (const s of settings) {
  if (only && !s.name.includes(only)) continue;
  const rand = rng(1000 + out.length);
  const per = new Map<string, { gaps: number[]; sig: number; disc: number }>();
  let anyDiscovery = 0;
  const t0 = performance.now();
  for (let i = 0; i < players; i++) {
    const sim = simulate(decisions, s.planted, rand);
    const prof = profileStats(sim, { resamples, seed: 7 + i })!;
    let any = false;
    for (const c of [prof.overall, ...prof.classes]) {
      if (c.insufficient) continue;
      const e = per.get(c.id) ?? { gaps: [], sig: 0, disc: 0 };
      e.gaps.push(c.gap!);
      if (c.p! < 0.05) e.sig++;
      if (c.id !== "all" && c.q! <= 0.1) { e.disc++; any = true; }
      per.set(c.id, e);
    }
    if (any) anyDiscovery++;
  }
  const rows = [...per.entries()].map(([id, e]) => {
    const m = e.gaps.reduce((a, b) => a + b, 0) / e.gaps.length;
    const sd = Math.sqrt(e.gaps.reduce((a, x) => a + (x - m) ** 2, 0) / e.gaps.length);
    return { id, mean: Math.round(m), sdAcrossPlayers: Math.round(sd), realBootstrapSd: realSd.get(id), sdRatio: +(sd / realSd.get(id)!).toFixed(2), pLt05: +(e.sig / players).toFixed(3), bhDiscovered: +(e.disc / players).toFixed(3) };
  });
  console.log(`\n== ${s.name} (${players} players, ${Math.round((performance.now() - t0) / 1000)} s) any BH discovery: ${(anyDiscovery / players).toFixed(3)}`);
  console.table(rows);
  out.push({ setting: s.name, target: s.target, anyDiscovery: anyDiscovery / players, rows });
}
if (process.env.OUT) fs.writeFileSync(process.env.OUT, JSON.stringify(out, null, 1));
