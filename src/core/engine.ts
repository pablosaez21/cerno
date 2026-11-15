// UCI engine driver and worker pool. The transport (Web Worker in the browser,
// worker_threads in Node scripts) is injected through `UciTransport`.
import { positionFromFen } from "./chess";
import type { EngineLine, PositionEval, Score } from "./types";

export interface UciTransport {
  send(cmd: string): void;
  onLine(cb: (line: string) => void): void;
  terminate(): void;
}

export interface AnalyseRequest {
  fen: string;
  nodes: number;
  multiPv: number;
}

/** Parses one `info` line. Returns undefined for lines without a usable score. */
export function parseInfo(line: string): { multipv: number; depth: number; score: Score; pv: string[]; nodes?: number } | undefined {
  if (!line.startsWith("info ") || !line.includes(" score ") || !line.includes(" pv ")) return undefined;
  if (line.includes(" lowerbound") || line.includes(" upperbound")) return undefined;
  const t = line.split(" ");
  let depth = 0;
  let multipv = 1;
  let score: Score | undefined;
  let nodes: number | undefined;
  let pv: string[] = [];
  for (let i = 1; i < t.length; i++) {
    switch (t[i]) {
      case "depth":
        depth = Number(t[++i]);
        break;
      case "multipv":
        multipv = Number(t[++i]);
        break;
      case "nodes":
        nodes = Number(t[++i]);
        break;
      case "score": {
        const kind = t[++i];
        const value = Number(t[++i]);
        score = kind === "mate" ? { mate: value } : { cp: value };
        break;
      }
      case "pv":
        pv = t.slice(i + 1);
        i = t.length;
        break;
    }
  }
  if (!score) return undefined;
  return { multipv, depth, score, pv, nodes };
}

/** Engine scores are from the side to move; convert to White's point of view. */
export function toWhitePov(score: Score, whiteToMove: boolean): Score {
  if (whiteToMove) return score;
  return "mate" in score ? { mate: -score.mate } : { cp: -score.cp };
}

/** Checkmate, stalemate and dead positions need no engine. */
export function terminalEval(fen: string): PositionEval | undefined {
  const pos = positionFromFen(fen);
  if (pos.isCheckmate()) {
    // Side to move is mated. Encode as mate in 0 with the winner's sign (±0 is not usable).
    const score: Score = { mate: pos.turn === "white" ? -1 : 1 };
    return { lines: [], score, nodes: 0, terminal: true };
  }
  if (pos.isStalemate() || pos.isInsufficientMaterial()) {
    return { lines: [], score: { cp: 0 }, nodes: 0, terminal: true };
  }
  return undefined;
}

export class EngineRunner {
  private listener: ((line: string) => void) | undefined;
  private currentMultiPv = 1;

  constructor(private readonly transport: UciTransport) {
    transport.onLine((line) => this.listener?.(line));
  }

  private waitFor(prefix: string): Promise<string[]> {
    return new Promise((resolve) => {
      const lines: string[] = [];
      this.listener = (line) => {
        lines.push(line);
        if (line.startsWith(prefix)) {
          this.listener = undefined;
          resolve(lines);
        }
      };
    });
  }

  async init(hashMb = 32): Promise<void> {
    const ok = this.waitFor("uciok");
    this.transport.send("uci");
    await ok;
    this.transport.send(`setoption name Hash value ${hashMb}`);
    this.transport.send("setoption name UCI_AnalyseMode value true");
    const ready = this.waitFor("readyok");
    this.transport.send("isready");
    await ready;
  }

  async newGame(): Promise<void> {
    this.transport.send("ucinewgame");
    const ready = this.waitFor("readyok");
    this.transport.send("isready");
    await ready;
  }

  async analyse(req: AnalyseRequest): Promise<PositionEval> {
    const terminal = terminalEval(req.fen);
    if (terminal) return terminal;
    if (req.multiPv !== this.currentMultiPv) {
      this.transport.send(`setoption name MultiPV value ${req.multiPv}`);
      this.currentMultiPv = req.multiPv;
    }
    const whiteToMove = req.fen.split(" ")[1] === "w";
    const done = this.waitFor("bestmove");
    this.transport.send(`position fen ${req.fen}`);
    this.transport.send(`go nodes ${req.nodes}`);
    const lines = await done;
    const byPv = new Map<number, EngineLine>();
    let nodes = 0;
    for (const line of lines) {
      const info = parseInfo(line);
      if (!info) continue;
      if (info.nodes) nodes = info.nodes;
      const prev = byPv.get(info.multipv);
      if (!prev || info.depth >= prev.depth) {
        byPv.set(info.multipv, { score: toWhitePov(info.score, whiteToMove), pv: info.pv, depth: info.depth });
      }
    }
    const ordered = [...byPv.entries()].sort((a, b) => a[0] - b[0]).map(([, l]) => l);
    if (!ordered.length) {
      // Engine returned no info (should not happen for legal, non-terminal positions).
      const best = lines.find((l) => l.startsWith("bestmove"))?.split(" ")[1];
      return { lines: best ? [{ score: { cp: 0 }, pv: [best], depth: 0 }] : [], score: { cp: 0 }, nodes };
    }
    return { lines: ordered, score: ordered[0].score, nodes };
  }

  terminate(): void {
    this.transport.terminate();
  }
}

/**
 * A fixed set of single-threaded engines. Tasks are sequences of requests run
 * on one engine in order, so consecutive positions of one game share the hash.
 *
 * `setLimit(n)` caps how many engines search at once, between two searches: an engine over the
 * cap keeps its task and waits for a turn. The order of requests on each engine does not change,
 * so the results are the same with any limit, also when it changes mid-run (pool-size.test.ts).
 */
export class EnginePool {
  private runners: EngineRunner[] = [];
  /** Nodes searched by every run so far (for the time estimate; never read by the analysis). */
  nodes = 0;
  private cap: number;
  private searching = 0;
  private waiting: (() => void)[] = [];

  constructor(
    private readonly createTransport: () => UciTransport,
    readonly size: number,
    private readonly hashMb = 16,
  ) {
    this.cap = size;
  }

  /** Engines that may search at once (1..size). */
  get limit(): number {
    return this.cap;
  }

  setLimit(n: number): void {
    this.cap = Math.max(1, Math.min(this.size, Math.round(n)));
    this.wake();
  }

  private wake(): void {
    while (this.searching < this.cap && this.waiting.length) {
      this.searching++;
      this.waiting.shift()!();
    }
  }

  private acquire(): Promise<void> {
    if (this.searching < this.cap) {
      this.searching++;
      return Promise.resolve();
    }
    return new Promise((resolve) => this.waiting.push(resolve));
  }

  private release(): void {
    this.searching--;
    this.wake();
  }

  async start(): Promise<void> {
    this.runners = await Promise.all(
      Array.from({ length: this.size }, async () => {
        const r = new EngineRunner(this.createTransport());
        await r.init(this.hashMb);
        return r;
      }),
    );
  }

  /** Runs every task; `onResult` fires per position as soon as it is ready. */
  async run<T>(
    tasks: T[],
    requestsOf: (task: T) => AnalyseRequest[],
    onResult: (task: T, req: AnalyseRequest, ev: PositionEval) => void | Promise<void>,
    signal?: AbortSignal,
  ): Promise<void> {
    let next = 0;
    const worker = async (runner: EngineRunner) => {
      while (next < tasks.length) {
        if (signal?.aborted) return;
        const task = tasks[next++];
        await runner.newGame();
        for (const req of requestsOf(task)) {
          if (signal?.aborted) return;
          await this.acquire();
          let ev: PositionEval;
          try {
            ev = await runner.analyse(req);
          } finally {
            this.release();
          }
          this.nodes += ev.nodes;
          await onResult(task, req, ev);
        }
      }
    };
    await Promise.all(this.runners.map(worker));
  }

  stop(): void {
    this.runners.forEach((r) => r.terminate());
    this.runners = [];
  }
}

/** Workers to use: all cores but one, capped. */
export function defaultPoolSize(cores: number | undefined, cap = 12): number {
  const c = cores && cores > 0 ? cores : 4;
  return Math.max(1, Math.min(cap, c - 1));
}

/**
 * How hard the analysis loads the computer. "soft", the default, is the count measured on this
 * device by `softPoolSize`; "full" is all cores but one, for a computer left alone. The report is
 * the same in both (fixed nodes, one thread per engine, `ucinewgame` per task: see pool-size.test.ts).
 */
export type LoadMode = "soft" | "full";

/**
 * A worker is "fast" while adding it adds at least this share of what one worker alone reaches.
 * Past that point the extra workers land on slower cores (efficiency cores, the second thread of a
 * core), which a page cannot see any other way. Measured on an Apple M5 (4 fast + 6 efficiency
 * cores), Chromium, ten calibrations: the 2nd, 3rd and 4th workers added 0.89–1.01, 0.79–0.90 and
 * 0.53–0.75 of one worker; the 5th 0.19–0.49 (and the 6th to 9th 0.02–0.49 in four full curves).
 * A share of each worker's own speed (0.76–0.81 with 5) did not separate them.
 */
export const FAST_SHARE = 0.5;

/** Fast workers in a calibration (nodes per second keyed by worker count): from 1 up, while each
 *  added worker adds FAST_SHARE of one worker's speed. One worker's speed is at least half of two's
 *  (a lone measurement slowed by another program would make every later worker look fast).
 *  Undefined without the one-worker figure. */
export function fastWorkers(calib: Record<number, number>): number | undefined {
  if (!calib[1]) return undefined;
  const one = Math.max(calib[1], (calib[2] ?? 0) / 2);
  let fast = 1;
  for (let n = 2; calib[n]; n++) {
    if (calib[n] - calib[n - 1] < FAST_SHARE * one) break;
    fast = n;
  }
  return fast;
}

/**
 * The default ("soft") worker count: one less than the fast workers, so a fast core stays free for
 * the rest of the computer, but never less than a third of the cores nor more than half. The floor
 * is there because the calibration also measures heat: on an Apple M5 it found 4 fast workers cold
 * and 3 after 20 minutes of analysis (the 4th then added 0.3–0.5 of one), and a figure measured hot
 * would be kept. A third of the cores is 3 on the M5, the count measured without stalls or CPU
 * pressure over 100 games; the calibration only raises it, on machines with more fast cores.
 */
export function softPoolSize(cores: number | undefined, calib?: Record<number, number>, cap = 12): number {
  const c = cores && cores > 0 ? cores : 4;
  const full = defaultPoolSize(c, cap);
  const fast = calib ? fastWorkers(calib) : undefined;
  const third = Math.floor(c / 3);
  const n = fast !== undefined ? Math.max(fast - 1, third) : third;
  return Math.max(1, Math.min(full, Math.floor(c / 2), n));
}

export function poolSizeFor(mode: LoadMode, cores: number | undefined, calib?: Record<number, number>, cap = 12): number {
  return mode === "full" ? defaultPoolSize(cores, cap) : softPoolSize(cores, calib, cap);
}
