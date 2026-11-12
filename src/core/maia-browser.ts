// Browser adapter for Maia-3: one dedicated worker, batched queries.
import type { MaiaPrediction } from "./maia";
import type { MaiaQuery } from "./maia-ort";
import type { MaiaWorkerIn, MaiaWorkerOut } from "./maia-worker";

export interface MaiaModelInfo {
  id: string;
  url: string;
  sha256: string;
  bytes: number;
}

/** Models exported from the official weights by scripts/maia/export.py. */
export const MAIA_MODELS: Record<"maia3-5m" | "maia3-23m", MaiaModelInfo> = {
  "maia3-5m": { id: "maia3-5m", url: "/models/maia3-5m.onnx", sha256: "26c8e5ac570b008abe91fa5744de533a45658baa2e8ad1cf57f1ed2543b887b6", bytes: 21_099_666 },
  "maia3-23m": { id: "maia3-23m", url: "/models/maia3-23m.onnx", sha256: "4e33890fea9f813d44d0d38e9d01f9da725311469152eaa5f80e4d77ffeaf04b", bytes: 91_146_431 },
};

export class MaiaClient {
  private nextId = 0;
  private pending = new Map<number, { resolve: (p: MaiaPrediction[]) => void; reject: (e: Error) => void }>();

  private constructor(
    private readonly worker: Worker,
    readonly backend: "webgpu" | "wasm",
    readonly model: MaiaModelInfo,
  ) {
    worker.onmessage = (e: MessageEvent<MaiaWorkerOut>) => {
      const m = e.data;
      if (m.type === "result") this.settle(m.id)?.resolve(m.predictions);
      else if (m.type === "error" && m.id !== undefined) this.settle(m.id)?.reject(new Error(m.message));
    };
  }

  private settle(id: number) {
    const p = this.pending.get(id);
    this.pending.delete(id);
    return p;
  }

  static load(model: MaiaModelInfo, opts: { preferWebGpu?: boolean; onProgress?: (loaded: number, total?: number) => void } = {}): Promise<MaiaClient> {
    // Built by scripts/copy-maia.mjs from src/core/maia-worker.ts.
    const worker = new Worker("/maia-worker.js", { type: "module" });
    return new Promise((resolve, reject) => {
      worker.onmessage = (e: MessageEvent<MaiaWorkerOut>) => {
        const m = e.data;
        if (m.type === "progress") opts.onProgress?.(m.loaded, m.total ?? model.bytes);
        else if (m.type === "ready") resolve(new MaiaClient(worker, m.backend, model));
        else if (m.type === "error") {
          worker.terminate();
          reject(new Error(m.message));
        }
      };
      worker.onerror = (e) => reject(new Error(e.message || "no se pudo arrancar el worker de Maia"));
      const init: MaiaWorkerIn = { type: "init", modelUrl: model.url, sha256: model.sha256, preferWebGpu: opts.preferWebGpu ?? true, wasmPaths: "/ort/" };
      worker.postMessage(init);
    });
  }

  predict(queries: MaiaQuery[]): Promise<MaiaPrediction[]> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      const msg: MaiaWorkerIn = { type: "predict", id, queries };
      this.worker.postMessage(msg);
    });
  }

  terminate(): void {
    this.worker.terminate();
  }
}
