import { describe, expect, it } from "vitest";
import { EngineRunner, parseInfo, terminalEval, toWhitePov, defaultPoolSize, type UciTransport } from "../engine";

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
