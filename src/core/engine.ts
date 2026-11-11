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
 */
export class EnginePool {
  private runners: EngineRunner[] = [];

  constructor(
    private readonly createTransport: () => UciTransport,
    readonly size: number,
    private readonly hashMb = 16,
  ) {}

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
          const ev = await runner.analyse(req);
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
