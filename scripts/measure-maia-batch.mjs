// Whether Maia's batch size is part of the result: the same 3,000 queries (random legal games,
// 8-position histories, several Elos) in batches of 256, 64 and 32 on the real GPU, compared with
// a second run at 256. Prints, per batch size, how many predictions differ, the largest difference
// and the time per call. Usage: node scripts/measure-maia-batch.mjs [baseUrl] [webgpu|wasm]
import { chromium } from "@playwright/test";
import { Chess } from "chessops/chess";
import { makeFen } from "chessops/fen";

const [base = "http://localhost:4173", backend = "webgpu"] = process.argv.slice(2);
let seed = 7;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
const queries = [];
for (let g = 0; queries.length < 3000; g++) {
  const pos = Chess.default();
  const fens = [makeFen(pos.toSetup())];
  for (let ply = 0; ply < 80 && !pos.isEnd() && queries.length < 3000; ply++) {
    const moves = [];
    for (const [from, dests] of pos.allDests()) for (const to of dests) moves.push({ from, to, ...(pos.board.pawn.has(from) && (to >> 3 === 7 || to >> 3 === 0) ? { promotion: "queen" } : {}) });
    pos.play(moves[Math.floor(rnd() * moves.length)]);
    fens.push(makeFen(pos.toSetup()));
    for (const d of [-200, -100, 0, 100, 200]) queries.push({ fens: fens.slice(-8), eloSelf: 1500 + d + (g % 7) * 50, eloOppo: 1550 });
  }
}
const browser = await chromium.launch({ headless: true, channel: "chromium" });
const page = await browser.newPage();
await page.goto(base + "/");
const res = await page.evaluate(async ({ queries, backend }) => {
  const w = new Worker("/maia-worker.js", { type: "module" });
  const msg = (m) => new Promise((res, rej) => { w.onmessage = (e) => { if (e.data.type === "progress") return; if (e.data.type === "error") rej(new Error(e.data.message)); else res(e.data); }; w.postMessage(m); });
  const ready = await msg({ type: "init", modelUrl: "/models/maia3-5m.onnx", sha256: "26c8e5ac570b008abe91fa5744de533a45658baa2e8ad1cf57f1ed2543b887b6", preferWebGpu: backend === "webgpu", wasmPaths: "/ort/" });
  let id = 0;
  const run = async (bs) => {
    const out = [], times = [];
    for (let i = 0; i < queries.length; i += bs) { const t0 = performance.now(); out.push(...(await msg({ type: "predict", id: id++, queries: queries.slice(i, i + bs) })).predictions); times.push(performance.now() - t0); }
    times.sort((a, b) => a - b);
    return { out, p50: Math.round(times[times.length >> 1]), max: Math.round(times[times.length - 1]) };
  };
  await run(256); // warm-up: shader compilation
  const ref = (await run(256)).out;
  const stats = {};
  for (const bs of [256, 64, 32]) {
    const r = await run(bs);
    let differ = 0, maxAbs = 0;
    r.out.forEach((p, i) => {
      const q = ref[i];
      let d = false;
      for (const k of new Set([...Object.keys(p.policy), ...Object.keys(q.policy)])) if ((p.policy[k] ?? -1) !== (q.policy[k] ?? -1)) { d = true; maxAbs = Math.max(maxAbs, Math.abs((p.policy[k] ?? 0) - (q.policy[k] ?? 0))); }
      p.wdl.forEach((v, j) => { if (v !== q.wdl[j]) { d = true; maxAbs = Math.max(maxAbs, Math.abs(v - q.wdl[j])); } });
      if (d) differ++;
    });
    stats[bs] = { differ, maxAbs, msPerCallP50: r.p50, msPerCallMax: r.max };
  }
  return { backend: ready.backend, stats };
}, { queries, backend });
console.log(JSON.stringify(res, null, 1));
await browser.close();
