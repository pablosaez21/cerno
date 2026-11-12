// Reads the per-move output of fit.ts and reports, with 95% bootstrap
// intervals over games:
//  - Elo offset (Lichess input = Chess.com rating + offset) that maximises the
//    likelihood of the real moves, for rivals and for the player, 30 s or more.
//  - Per clock bucket (>30 s, 10-30 s, <10 s) for the rivals: moves, top-1
//    accuracy, mean probability of the real move, and the best offset relative
//    to the >30 s bucket.
//  - Share of the player's moves and errors in each bucket (from a report).
// Usage: npx tsx scripts/maia/analyze-fit.ts <fit-history.json> <report.json> [fit-repeat.json]
import fs from "node:fs";

type Fit = { meta: { game: string; mover: "player" | "rival"; clock: number; ply: number; elo: number }[]; perMove: { offset: number; ll: number[]; top1: number[] }[] };
const fit = JSON.parse(fs.readFileSync(process.argv[2], "utf8")) as Fit;
const report = JSON.parse(fs.readFileSync(process.argv[3], "utf8"));
const repeat = process.argv[4] ? (JSON.parse(fs.readFileSync(process.argv[4], "utf8")) as Fit) : undefined;
const B = 1000;
const offsets = fit.perMove.map((p) => p.offset);
const zero = fit.perMove.findIndex((p) => p.offset === 0);
const buckets = { ">=30s": (c: number) => c >= 30, "10-30s": (c: number) => c >= 10 && c < 30, "<10s": (c: number) => c < 10 };
const games = [...new Set(fit.meta.map((m) => m.game))];

let seed = 12345;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const resample = () => {
  const w = new Map<string, number>();
  for (let i = 0; i < games.length; i++) {
    const g = games[Math.floor(rand() * games.length)];
    w.set(g, (w.get(g) ?? 0) + 1);
  }
  return w;
};
const ci = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return [s[Math.floor(0.025 * s.length)], s[Math.floor(0.975 * s.length)]].map((x) => +x.toFixed(3));
};

/** Offset maximising summed log-likelihood, refined by a parabola through the best grid point. */
function bestOffset(idx: number[], weight: (i: number) => number): number {
  const tot = fit.perMove.map((p) => idx.reduce((s, i) => s + weight(i) * p.ll[i], 0));
  const k = tot.indexOf(Math.max(...tot));
  if (k === 0 || k === tot.length - 1) return offsets[k];
  const [x0, x1, x2] = [offsets[k - 1], offsets[k], offsets[k + 1]];
  const [y0, y1, y2] = [tot[k - 1], tot[k], tot[k + 1]];
  const denom = (x0 - x1) * (x0 - x2) * (x1 - x2);
  const a = (x2 * (y1 - y0) + x1 * (y0 - y2) + x0 * (y2 - y1)) / denom;
  const b = (x2 * x2 * (y0 - y1) + x1 * x1 * (y2 - y0) + x0 * x0 * (y1 - y2)) / denom;
  const v = -b / (2 * a);
  return a < 0 && v >= x0 && v <= x2 ? v : x1;
}

function stats(sel: (i: number) => boolean, fitData = fit) {
  const idx = fitData.meta.map((_, i) => i).filter(sel);
  const z = fitData.perMove.findIndex((p) => p.offset === 0);
  const point = {
    moves: idx.length,
    top1: (idx.reduce((s, i) => s + fitData.perMove[z].top1[i], 0) / idx.length) * 100,
    meanP: idx.reduce((s, i) => s + Math.exp(fitData.perMove[z].ll[i]), 0) / idx.length,
  };
  return { idx, point };
}

function boot(idx: number[], f: (w: (i: number) => number) => number) {
  const out: number[] = [];
  for (let b = 0; b < B; b++) {
    const w = resample();
    out.push(f((i) => w.get(fit.meta[i].game) ?? 0));
  }
  return ci(out);
}
const wmean = (idx: number[], w: (i: number) => number, v: (i: number) => number) => {
  let s = 0, n = 0;
  for (const i of idx) { s += w(i) * v(i); n += w(i); }
  return n ? s / n : NaN;
};

const result: Record<string, unknown> = { offsetsGrid: offsets, bootstrap: B, games: games.length };

// Elo offset, 30 s or more, rivals and player.
for (const who of ["rival", "player"] as const) {
  const { idx } = stats((i) => fit.meta[i].mover === who && fit.meta[i].clock >= 30);
  result[`offset_${who}_>=30s`] = { moves: idx.length, offset: +bestOffset(idx, () => 1).toFixed(0), ci95: boot(idx, (w) => bestOffset(idx, w)).map((x) => Math.round(x)), meanElo: Math.round(idx.reduce((s, i) => s + fit.meta[i].elo, 0) / idx.length) };
}

// Clock buckets for rivals.
const ref = stats((i) => fit.meta[i].mover === "rival" && fit.meta[i].clock >= 30).idx;
const bucketOut: Record<string, unknown> = {};
for (const [name, test] of Object.entries(buckets)) {
  const { idx, point } = stats((i) => fit.meta[i].mover === "rival" && test(fit.meta[i].clock));
  const games_ = new Set(idx.map((i) => fit.meta[i].game)).size;
  const off = idx.length ? bestOffset(idx, () => 1) : NaN;
  const rel = boot(idx, (w) => bestOffset(idx, w) - bestOffset(ref, w));
  bucketOut[name] = {
    moves: idx.length,
    games: games_,
    top1: +point.top1.toFixed(2),
    top1_ci95: boot(idx, (w) => wmean(idx, w, (i) => fit.perMove[zero].top1[i]) * 100),
    meanP: +point.meanP.toFixed(4),
    meanP_ci95: boot(idx, (w) => wmean(idx, w, (i) => Math.exp(fit.perMove[zero].ll[i]))),
    bestOffset: Math.round(off),
    offsetMinusAbove30s: Math.round(off - bestOffset(ref, () => 1)),
    offsetMinusAbove30s_ci95: rel.map((x) => Math.round(x)),
    atGridEdge: off <= offsets[0] || off >= offsets[offsets.length - 1],
  };
}
result.rivalClockBuckets = bucketOut;

// Player's moves and errors per bucket (blitz games only).
const blitz = new Set(report.games.filter((g: { timeClass: string }) => g.timeClass === "blitz").map((g: { id: string }) => g.id));
const pm = fit.meta.filter((m) => m.mover === "player");
const errs = report.errors.filter((e: { gameId: string; judgement: string; clockBefore?: number }) => blitz.has(e.gameId) && e.judgement !== "inaccuracy" && e.clockBefore !== undefined);
result.playerShare = Object.fromEntries(
  Object.entries(buckets).map(([name, test]) => [name, {
    moves: pm.filter((m) => test(m.clock)).length,
    movesShare: +(pm.filter((m) => test(m.clock)).length / pm.length).toFixed(3),
    errors: errs.filter((e: { clockBefore: number }) => test(e.clockBefore)).length,
    errorsShare: +(errs.filter((e: { clockBefore: number }) => test(e.clockBefore)).length / errs.length).toFixed(3),
  }]),
);

// History vs repeated board, rivals, 30 s or more, after move 10, header Elo.
if (repeat) {
  const sel = (f: Fit) => (i: number) => f.meta[i].mover === "rival" && f.meta[i].clock >= 30 && f.meta[i].ply > 20;
  const h = stats(sel(fit)), r = stats(sel(repeat), repeat);
  result.historyVsRepeat = { moves: h.idx.length, top1History: +h.point.top1.toFixed(2), top1Repeat: +r.point.top1.toFixed(2), meanPHistory: +h.point.meanP.toFixed(4), meanPRepeat: +r.point.meanP.toFixed(4) };
}
console.log(JSON.stringify(result, null, 1));
