// Node-only helpers for scripts: Stockfish WASM in worker_threads and a JSON file cache.
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { Worker } from "node:worker_threads";
import type { AnalyzedGame, EvalCache } from "../src/core/analyze";
import type { UciTransport } from "../src/core/engine";
import type { PositionEval } from "../src/core/types";

const require = createRequire(import.meta.url);
const stockfishEntry = require.resolve("stockfish");

export function nodeTransport(flavor = "lite-single"): UciTransport {
  const worker = new Worker(
    `const { parentPort, workerData } = require("node:worker_threads");
     const sf = require(workerData.entry)(workerData.flavor, (line) => parentPort.postMessage(line));
     parentPort.on("message", (cmd) => sf.processCommand(cmd));`,
    { eval: true, workerData: { flavor, entry: stockfishEntry } },
  );
  let cb: ((line: string) => void) | undefined;
  worker.on("message", (line: string) => cb?.(line));
  return {
    send: (cmd) => worker.postMessage(cmd),
    onLine: (f) => {
      cb = f;
    },
    terminate: () => void worker.terminate(),
  };
}

/** Whole-file JSON cache. Fine for a few hundred games in scripts. */
export class FileCache implements EvalCache {
  private evals = new Map<string, PositionEval>();
  private games = new Map<string, AnalyzedGame>();
  constructor(private readonly dir: string) {
    fs.mkdirSync(dir, { recursive: true });
    for (const [name, map] of [["evals.json", this.evals], ["games.json", this.games]] as const) {
      const file = path.join(dir, name);
      if (fs.existsSync(file)) for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(file, "utf8")))) (map as Map<string, unknown>).set(k, v);
    }
  }
  async getEval(k: string) { return this.evals.get(k); }
  async setEval(k: string, v: PositionEval) { this.evals.set(k, v); }
  async getGame(k: string) { return this.games.get(k); }
  async setGame(k: string, v: AnalyzedGame) { this.games.set(k, v); }
  flush() {
    fs.writeFileSync(path.join(this.dir, "evals.json"), JSON.stringify(Object.fromEntries(this.evals)));
    fs.writeFileSync(path.join(this.dir, "games.json"), JSON.stringify(Object.fromEntries(this.games)));
  }
}
