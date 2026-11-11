// Puts the onnxruntime-web runtime in public/ort and the Maia-3 models in
// public/models. Models come from MAIA_MODEL_DIR (local export) or from
// MAIA_MODEL_BASE_URL (default: the GitHub release of this repo); each file is
// checked against its pinned SHA-256. Only the 5M model is published.
// A missing model is not fatal: the report is built without level fields.
import crypto from "node:crypto";
import { build } from "esbuild";
import fs from "node:fs";
import path from "node:path";

const ort = path.resolve("node_modules/onnxruntime-web/dist");
fs.mkdirSync("public/ort", { recursive: true });
for (const f of fs.readdirSync(ort)) if (/^ort-wasm-simd-threaded(\.[a-z]+)?\.(mjs|wasm)$/.test(f)) fs.copyFileSync(path.join(ort, f), path.join("public/ort", f));

// The Maia worker is bundled here, not by Next: Turbopack emits `new URL("x.ts")` as a raw asset.
await build({
  entryPoints: ["src/core/maia-worker.ts"],
  bundle: true,
  format: "esm",
  target: "es2022",
  outfile: "public/maia-worker.js",
  logLevel: "warning",
  minify: true,
});

const MODELS = {
  "maia3-5m.onnx": "26c8e5ac570b008abe91fa5744de533a45658baa2e8ad1cf57f1ed2543b887b6",
  "maia3-23m.onnx": "4e33890fea9f813d44d0d38e9d01f9da725311469152eaa5f80e4d77ffeaf04b",
};
fs.mkdirSync("public/models", { recursive: true });
const sha = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
for (const [name, hash] of Object.entries(MODELS)) {
  const dest = path.join("public/models", name);
  if (fs.existsSync(dest) && sha(fs.readFileSync(dest)) === hash) continue;
  let buf;
  if (process.env.MAIA_MODEL_DIR && fs.existsSync(path.join(process.env.MAIA_MODEL_DIR, name))) buf = fs.readFileSync(path.join(process.env.MAIA_MODEL_DIR, name));
  else {
    const base = process.env.MAIA_MODEL_BASE_URL ?? "https://github.com/pablosaez21/cerno/releases/download/maia3-onnx-v1";
    const res = await fetch(`${base}/${name}`).catch(() => undefined);
    if (res?.ok) buf = Buffer.from(await res.arrayBuffer());
  }
  if (!buf) {
    console.warn(
      name === "maia3-5m.onnx"
        ? `maia: ${name} not available, reports will be built without level metrics`
        : `maia: ${name} not available (optional, only for the /lab benchmark)`,
    );
    continue;
  }
  if (sha(buf) !== hash) throw new Error(`maia: ${name} has the wrong SHA-256`);
  fs.writeFileSync(dest, buf);
  console.log(`maia: ${name} ready`);
}
