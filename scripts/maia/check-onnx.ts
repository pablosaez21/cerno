// End-to-end parity: TypeScript encoder + ONNX (onnxruntime-web, WASM) vs the
// official PyTorch outputs stored in the reference file.
// Usage: npx tsx scripts/maia/check-onnx.ts <model.onnx> [reference.json]
import fs from "node:fs";
import * as ort from "onnxruntime-web";
import { decodePrediction, encodePosition, MAIA_TOKEN_DIM, MAIA_VOCAB } from "../../src/core/maia";

const [model, refPath = "src/core/__tests__/fixtures/maia-reference.json"] = process.argv.slice(2);
const ref = JSON.parse(fs.readFileSync(refPath, "utf8")) as { cases: { label: string; fens: string[]; eloSelf: number; eloOppo: number; top: [string, number][]; wdlSideToMove: number[] }[] };
const session = await ort.InferenceSession.create(fs.readFileSync(model), { executionProviders: ["wasm"], graphOptimizationLevel: "all" });
const B = ref.cases.length;
const tokens = new Float32Array(B * 64 * MAIA_TOKEN_DIM);
ref.cases.forEach((c, i) => encodePosition(c.fens, tokens, i * 64 * MAIA_TOKEN_DIM));
const t0 = performance.now();
const out = await session.run({
  tokens: new ort.Tensor("float32", tokens, [B, 64, MAIA_TOKEN_DIM]),
  elo_self: new ort.Tensor("float32", Float32Array.from(ref.cases.map((c) => c.eloSelf)), [B]),
  elo_oppo: new ort.Tensor("float32", Float32Array.from(ref.cases.map((c) => c.eloOppo)), [B]),
});
const ms = performance.now() - t0;
const lm = out.logits_move.data as Float32Array;
const lv = out.logits_value.data as Float32Array;
let maxP = 0, maxW = 0, topSame = 0;
ref.cases.forEach((c, i) => {
  const p = decodePrediction(c.fens[c.fens.length - 1], lm, lv, i * MAIA_VOCAB, i * 3);
  // Reference moves are in the model's (mirrored) vocabulary; compare probabilities by rank.
  const mine = Object.values(p.policy).sort((a, b) => b - a);
  c.top.forEach(([, prob], k) => (maxP = Math.max(maxP, Math.abs((mine[k] ?? 0) - prob))));
  c.wdlSideToMove.forEach((w, k) => (maxW = Math.max(maxW, Math.abs(p.wdl[k] - w))));
  const best = Object.entries(p.policy).sort((a, b) => b[1] - a[1])[0][0];
  const black = c.fens[c.fens.length - 1].split(" ")[1] === "b";
  const refBest = black ? `${c.top[0][0][0]}${9 - +c.top[0][0][1]}${c.top[0][0][2]}${9 - +c.top[0][0][3]}${c.top[0][0].slice(4)}` : c.top[0][0];
  if (best === refBest) topSame++;
});
console.log(JSON.stringify({ cases: B, maxProbDiff: maxP, maxWdlDiff: maxW, sameTopMove: topSame, batchMs: Math.round(ms) }));
