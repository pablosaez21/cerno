import { describe, expect, it } from "vitest";
import { EnginePool, EngineRunner, parseInfo, terminalEval, toWhitePov, defaultPoolSize, fastWorkers, poolSizeFor, softPoolSize, type UciTransport } from "../engine";

describe("UCI parsing", () => {
  it("reads score, multipv and pv", () => {
    const i = parseInfo("info depth 14 seldepth 20 multipv 2 score cp -35 nodes 60000 nps 900000 pv e7e5 g1f3 b8c6");
    expect(i).toEqual({ depth: 14, multipv: 2, score: { cp: -35 }, nodes: 60000, pv: ["e7e5", "g1f3", "b8c6"] });
    expect(parseInfo("info depth 3 score mate -2 pv a1a8")?.score).toEqual({ mate: -2 });
  });

  it("ignores bound and pv-less lines", () => {
    expect(parseInfo("info depth 10 score cp 20 lowerbound nodes 5 pv e2e4")).toBeUndefined();
    expect(parseInfo("info string NNUE enabled")).toBeUndefined();
  });

  it("converts side-to-move scores to White's view", () => {
    expect(toWhitePov({ cp: 50 }, false)).toEqual({ cp: -50 });
    expect(toWhitePov({ mate: 3 }, false)).toEqual({ mate: -3 });
    expect(toWhitePov({ cp: 50 }, true)).toEqual({ cp: 50 });
  });

  it("evaluates checkmate and stalemate without the engine", () => {
    expect(terminalEval("rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3")?.score).toEqual({ mate: -1 });
    expect(terminalEval("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1")?.score).toEqual({ cp: 0 });
    expect(terminalEval("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1")).toBeUndefined();
  });

  it("sizes the pool to cores minus one, capped", () => {
    expect(defaultPoolSize(10)).toBe(9);
    expect(defaultPoolSize(1)).toBe(1);
    expect(defaultPoolSize(32)).toBe(12);
    expect(defaultPoolSize(undefined)).toBe(3);
  });

  it("without a calibration, the default load uses a third of the cores, never more than full load", () => {
    // Apple M5 (10 cores), M4 Pro (14), a 4-core laptop, a 2-core phone, unknown.
    expect([10, 14, 4, 2, undefined].map((c) => [poolSizeFor("soft", c), poolSizeFor("full", c)])).toEqual([[3, 9], [4, 12], [1, 3], [1, 1], [1, 3]]);
    expect(poolSizeFor("soft", 64)).toBe(12);
  });

  it("finds the fast workers: each one added adds half of one worker's speed", () => {
    // Apple M5 in Chromium (a real calibration): the fifth worker adds 0.42 of one.
    const m5 = { 1: 1_213_785, 2: 2_462_976, 3: 3_478_112, 4: 4_384_968, 5: 4_894_901 };
    expect(fastWorkers(m5)).toBe(4);
    // Stops at the first worker that adds too little, even if a later one looks better (noise).
    expect(fastWorkers({ 1: 1_000_000, 2: 1_400_000, 3: 2_700_000 })).toBe(1);
    // One worker is at least half of two (a lone measurement slowed by another program).
    expect(fastWorkers({ 1: 870_000, 2: 2_150_000, 3: 2_360_000 })).toBe(2);
    expect(fastWorkers({ 2: 2_000_000 })).toBeUndefined();
  });

  it("with a calibration, the default load is one less than the fast workers, between a third and half the cores", () => {
    // Calibrations of an Apple M5 in Chromium (the second and third with the fourth worker adding
    // only 0.53 of one): 3 each time.
    const m5 = { 1: 1_213_785, 2: 2_462_976, 3: 3_478_112, 4: 4_384_968, 5: 4_894_901, 6: 5_545_881 };
    expect(softPoolSize(10, m5)).toBe(3);
    expect(softPoolSize(10, { 1: 1_219_655, 2: 2_346_702, 3: 3_304_784, 4: 3_946_949, 5: 4_400_000 })).toBe(3);
    expect(softPoolSize(10, { 1: 1_109_997, 2: 2_360_253, 3: 3_346_220, 4: 3_975_079, 5: 4_310_000 })).toBe(3);
    expect(poolSizeFor("soft", 10, m5)).toBe(3);
    expect(poolSizeFor("full", 10, m5)).toBe(9);
    // 4 cores with two threads each: the fifth thread shares a core.
    expect(softPoolSize(8, { 1: 1e6, 2: 2e6, 3: 2.9e6, 4: 3.8e6, 5: 3.9e6 })).toBe(3);
    // Eight fast workers on 10 cores: half the cores.
    expect(softPoolSize(10, { 1: 1e6, 2: 2e6, 3: 3e6, 4: 4e6, 5: 5e6, 6: 6e6, 7: 7e6, 8: 8e6, 9: 8.5e6 })).toBe(5);
    // The same M5 calibrated hot (the 4th worker adds 0.3 of one): still a third of the cores.
    expect(fastWorkers({ 1: 1_223_882, 2: 2_453_121, 3: 3_495_891, 4: 3_815_072 })).toBe(3);
    expect(softPoolSize(10, { 1: 1_223_882, 2: 2_453_121, 3: 3_495_891, 4: 3_815_072 })).toBe(3);
    // Or calibrated right after a long analysis, one worker looking fast: still 3.
    expect(softPoolSize(10, { 1: 1_200_000, 2: 1_500_000 })).toBe(3);
    // One fast worker: still one.
    expect(softPoolSize(4, { 1: 1e6, 2: 1.2e6 })).toBe(1);
  });
});

describe("EnginePool limit", () => {
  // Engines that answer "go" after a tick, so several searches overlap.
  const slow = (): UciTransport => {
    let cb: (l: string) => void = () => {};
    return {
      send(cmd) {
        const out = cmd === "uci" ? ["uciok"] : cmd === "isready" ? ["readyok"] : cmd.startsWith("go") ? ["info depth 1 score cp 0 nodes 1 pv e2e4", "bestmove e2e4"] : [];
        if (out.length) setTimeout(() => out.forEach((l) => cb(l)), 2);
      },
      onLine(f) {
        cb = f;
      },
      terminate() {},
    };
  };

  it("never starts a search past the limit, also when it changes mid-run", async () => {
    const pool = new EnginePool(slow, 4);
    await pool.start();
    const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    let inFlight = 0;
    let peak = 0;
    const over: number[] = [];
    const orig = EngineRunner.prototype.analyse;
    // A search may start only while fewer than `limit` are running (those already running when
    // the limit drops finish first).
    EngineRunner.prototype.analyse = async function (req) {
      inFlight++;
      peak = Math.max(peak, inFlight);
      if (inFlight > pool.limit) over.push(inFlight);
      try {
        return await orig.call(this, req);
      } finally {
        inFlight--;
      }
    };
    let done = 0;
    try {
      await pool.run(Array.from({ length: 8 }, (_, i) => i), () => Array.from({ length: 5 }, () => ({ fen, nodes: 1, multiPv: 1 })), () => {
        done++;
        if (done === 10) pool.setLimit(1);
        if (done === 25) pool.setLimit(3);
      });
    } finally {
      EngineRunner.prototype.analyse = orig;
    }
    expect(done).toBe(40);
    expect(peak).toBe(4);
    expect(over).toEqual([]);
    expect(pool.limit).toBe(3);
  });

  it("keeps the limit between 1 and the pool size", () => {
    const pool = new EnginePool(slow, 3);
    pool.setLimit(0);
    expect(pool.limit).toBe(1);
    pool.setLimit(9);
    expect(pool.limit).toBe(3);
  });
});

/** A scripted engine that answers like Stockfish. */
function fakeTransport(script: (cmd: string) => string[]): UciTransport & { sent: string[] } {
  let cb: (l: string) => void = () => {};
  const sent: string[] = [];
  return {
    sent,
    send(cmd) {
      sent.push(cmd);
      queueMicrotask(() => script(cmd).forEach((l) => cb(l)));
    },
    onLine(f) {
      cb = f;
    },
    terminate() {},
  };
}

describe("EngineRunner", () => {
  it("runs MultiPV with a node budget and orders lines", async () => {
    const t = fakeTransport((cmd) => {
      if (cmd === "uci") return ["id name Stockfish", "uciok"];
      if (cmd === "isready") return ["readyok"];
      if (cmd.startsWith("go")) {
        return [
          "info depth 5 multipv 1 score cp 10 nodes 100 pv e7e5",
          "info depth 6 multipv 1 score cp 30 nodes 200 pv c7c5 g1f3",
          "info depth 6 multipv 2 score cp 20 nodes 200 pv e7e5 g1f3",
          "bestmove c7c5",
        ];
      }
      return [];
    });
    const r = new EngineRunner(t);
    await r.init(16);
    const ev = await r.analyse({ fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1", nodes: 200, multiPv: 2 });
    expect(t.sent).toContain("setoption name MultiPV value 2");
    expect(t.sent).toContain("go nodes 200");
    expect(ev.lines.map((l) => l.pv[0])).toEqual(["c7c5", "e7e5"]);
    // Black to move: +30 for Black is -30 for White.
    expect(ev.score).toEqual({ cp: -30 });
  });
});
