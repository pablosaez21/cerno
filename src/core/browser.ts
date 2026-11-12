// Browser adapters: Stockfish in a Web Worker and an IndexedDB cache.
import type { AnalyzedGame, EvalCache } from "./analyze";
import type { UciTransport } from "./engine";
import type { MaiaPrediction } from "./maia";
import type { Decision } from "./peers";
import type { PositionEval } from "./types";

export const ENGINE_URL = "/engine/stockfish-19-lite-single.js";

export function workerTransport(url = ENGINE_URL): UciTransport {
  const worker = new Worker(url);
  return {
    send: (cmd) => worker.postMessage(cmd),
    onLine: (cb) => {
      worker.onmessage = (e: MessageEvent) => cb(String(e.data));
    },
    terminate: () => worker.terminate(),
  };
}

const DB_NAME = "cerno";
const DB_VERSION = 4;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("evals")) db.createObjectStore("evals");
      if (!db.objectStoreNames.contains("games")) db.createObjectStore("games");
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta");
      // Maia-3 predictions, by model, Elo and position history. Separate store:
      // adding it does not touch the Stockfish evaluations already saved.
      if (!db.objectStoreNames.contains("maia")) db.createObjectStore("maia");
      // Peer decision records, one entry per game (new store: other caches stay valid).
      if (!db.objectStoreNames.contains("peers")) db.createObjectStore("peers");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function request<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

/**
 * Evals are written in batches: one transaction per position would dominate
 * the run time. Call `flush()` when the analysis ends.
 */
export class IdbCache implements EvalCache {
  private pending = new Map<string, PositionEval>();
  private flushing: Promise<void> = Promise.resolve();

  private constructor(private readonly db: IDBDatabase) {}

  static async open(): Promise<IdbCache | undefined> {
    try {
      return new IdbCache(await openDb());
    } catch {
      return undefined; // Private mode or blocked storage: run without cache.
    }
  }

  async getEval(key: string): Promise<PositionEval | undefined> {
    const p = this.pending.get(key);
    if (p) return p;
    return request(this.db.transaction("evals").objectStore("evals").get(key));
  }

  async setEval(key: string, ev: PositionEval): Promise<void> {
    this.pending.set(key, ev);
    if (this.pending.size >= 200) await this.flush();
  }

  async getGame(key: string): Promise<AnalyzedGame | undefined> {
    return request(this.db.transaction("games").objectStore("games").get(key));
  }

  async setGame(key: string, game: AnalyzedGame): Promise<void> {
    await this.flush();
    const tx = this.db.transaction("games", "readwrite");
    tx.objectStore("games").put(game, key);
    await done(tx);
  }

  flush(): Promise<void> {
    if (!this.pending.size) return this.flushing;
    const batch = this.pending;
    this.pending = new Map();
    this.flushing = this.flushing.then(async () => {
      const tx = this.db.transaction("evals", "readwrite");
      const store = tx.objectStore("evals");
      for (const [k, v] of batch) store.put(v, k);
      await done(tx);
    });
    return this.flushing;
  }

  async getMaia(key: string): Promise<MaiaPrediction | undefined> {
    return request(this.db.transaction("maia").objectStore("maia").get(key));
  }

  async setMaiaMany(entries: [string, MaiaPrediction][]): Promise<void> {
    if (!entries.length) return;
    const tx = this.db.transaction("maia", "readwrite");
    for (const [k, v] of entries) tx.objectStore("maia").put(v, k);
    await done(tx);
  }

  async getPeers(key: string): Promise<Decision[] | undefined> {
    return request(this.db.transaction("peers").objectStore("peers").get(key));
  }

  async setPeers(key: string, decisions: Decision[]): Promise<void> {
    const tx = this.db.transaction("peers", "readwrite");
    tx.objectStore("peers").put(decisions, key);
    await done(tx);
  }

  /** Small key-value store for the interface (last report, review answers). */
  async getMeta<T>(key: string): Promise<T | undefined> {
    return request(this.db.transaction("meta").objectStore("meta").get(key));
  }

  async setMeta(key: string, value: unknown): Promise<void> {
    const tx = this.db.transaction("meta", "readwrite");
    tx.objectStore("meta").put(value, key);
    await done(tx);
  }

  async clear(): Promise<void> {
    const tx = this.db.transaction(["evals", "games"], "readwrite");
    tx.objectStore("evals").clear();
    tx.objectStore("games").clear();
    await done(tx);
  }
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
