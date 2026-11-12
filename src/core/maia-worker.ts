// Web Worker that downloads Maia-3 (with progress and SHA-256 check) and runs it
// with onnxruntime-web: WebGPU when available, WASM otherwise.
import * as ort from "onnxruntime-web/webgpu";
import { MaiaRunner, type MaiaQuery } from "./maia-ort";

export type MaiaWorkerIn =
  | { type: "init"; modelUrl: string; sha256: string; preferWebGpu: boolean; wasmPaths: string }
  | { type: "predict"; id: number; queries: MaiaQuery[] };

export type MaiaWorkerOut =
  | { type: "progress"; loaded: number; total?: number }
  | { type: "ready"; backend: "webgpu" | "wasm"; bytes: number }
  | { type: "error"; id?: number; message: string }
  | { type: "result"; id: number; predictions: Awaited<ReturnType<MaiaRunner["predict"]>> };

let runner: MaiaRunner | undefined;
const post = (m: MaiaWorkerOut) => (self as unknown as Worker).postMessage(m);

async function download(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`descarga del modelo: HTTP ${res.status}`);
  const total = Number(res.headers.get("content-length")) || undefined;
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    post({ type: "progress", loaded, total });
  }
  const bytes = new Uint8Array(loaded);
  let o = 0;
  for (const c of chunks) {
    bytes.set(c, o);
    o += c.length;
  }
  return bytes;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** A real GPU adapter. Software adapters (SwiftShader) are far slower than WASM. */
async function hardwareGpu(): Promise<boolean> {
  const nav = navigator as unknown as { gpu?: { requestAdapter(): Promise<{ isFallbackAdapter?: boolean; info?: { architecture?: string } } | null> } };
  const adapter = await nav.gpu?.requestAdapter().catch(() => null);
  if (!adapter || adapter.isFallbackAdapter) return false;
  return adapter.info?.architecture !== "swiftshader";
}

self.onmessage = async (e: MessageEvent<MaiaWorkerIn>) => {
  const msg = e.data;
  try {
    if (msg.type === "init") {
      ort.env.wasm.wasmPaths = msg.wasmPaths;
      const bytes = await download(msg.modelUrl);
      const hash = await sha256Hex(bytes);
      if (hash !== msg.sha256) throw new Error(`hash del modelo no coincide: ${hash}`);
      const gpu = msg.preferWebGpu && (await hardwareGpu());
      runner = await MaiaRunner.create(ort as never, bytes, gpu ? ["webgpu", "wasm"] : ["wasm"]);
      post({ type: "ready", backend: gpu ? "webgpu" : "wasm", bytes: bytes.length });
    } else if (msg.type === "predict") {
      if (!runner) throw new Error("Maia no está cargado");
      post({ type: "result", id: msg.id, predictions: await runner.predict(msg.queries) });
    }
  } catch (err) {
    post({ type: "error", id: msg.type === "predict" ? msg.id : undefined, message: err instanceof Error ? err.message : String(err) });
  }
};
