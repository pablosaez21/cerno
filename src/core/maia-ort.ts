// Runs Maia-3 with onnxruntime-web. The `ort` module is injected so the same
// code serves the browser worker and Node scripts.
import type * as Ort from "onnxruntime-web";
import { decodePrediction, encodePosition, MAIA_TOKEN_DIM, MAIA_VOCAB, type MaiaPrediction } from "./maia";

export interface MaiaQuery {
  /** History, oldest first, ending with the position to move from (max 8 used). */
  fens: string[];
  eloSelf: number;
  eloOppo: number;
}

export class MaiaRunner {
  private constructor(
    private readonly ort: typeof Ort,
    private readonly session: Ort.InferenceSession,
  ) {}

  static async create(ort: typeof Ort, model: Uint8Array, executionProviders: string[] = ["wasm"]): Promise<MaiaRunner> {
    // 'basic' avoids fusions that some backends get wrong; parity is checked with it.
    const session = await ort.InferenceSession.create(model, { executionProviders, graphOptimizationLevel: "basic" });
    return new MaiaRunner(ort, session);
  }

  async predict(queries: MaiaQuery[]): Promise<MaiaPrediction[]> {
    const B = queries.length;
    if (!B) return [];
    const tokens = new Float32Array(B * 64 * MAIA_TOKEN_DIM);
    queries.forEach((q, i) => encodePosition(q.fens, tokens, i * 64 * MAIA_TOKEN_DIM));
    const { Tensor } = this.ort;
    const out = await this.session.run({
      tokens: new Tensor("float32", tokens, [B, 64, MAIA_TOKEN_DIM]),
      elo_self: new Tensor("float32", Float32Array.from(queries.map((q) => q.eloSelf)), [B]),
      elo_oppo: new Tensor("float32", Float32Array.from(queries.map((q) => q.eloOppo)), [B]),
    });
    const lm = out.logits_move.data as Float32Array;
    const lv = out.logits_value.data as Float32Array;
    return queries.map((q, i) => decodePrediction(q.fens[q.fens.length - 1], lm, lv, i * MAIA_VOCAB, i * 3));
  }

  release(): Promise<void> {
    return this.session.release();
  }
}
