import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, type AnalyzedGame, type EvalCache } from "../analyze";
import { EnginePool, type UciTransport } from "../engine";
import { parseGameMoves } from "../game";
import { maiaLegalMoves, type MaiaPrediction } from "../maia";
import { evaluatePeers, predictPeers } from "../peer-analysis";
import type { GameRecord, PositionEval } from "../types";

/** Engine that answers every search with +0.20 for the side to move. */
function fakeTransport(log: string[]): UciTransport {
  let cb: (l: string) => void = () => {};
  return {
    send(cmd) {
      log.push(cmd);
      const out = cmd === "uci" ? ["uciok"] : cmd === "isready" ? ["readyok"] : cmd.startsWith("go") ? ["info depth 5 multipv 1 score cp 20 nodes 10 pv e2e4", "bestmove e2e4"] : [];
      queueMicrotask(() => out.forEach((l) => cb(l)));
    },
    onLine(f) {
      cb = f;
    },
    terminate() {},
  };
}

class MemCache implements EvalCache {
  evals = new Map<string, PositionEval>();
  async getEval(k: string) { return this.evals.get(k); }
  async setEval(k: string, v: PositionEval) { this.evals.set(k, v); }
  async getGame() { return undefined; }
  async setGame() {}
}

/** Uniform Maia: every legal move equally likely. */
const uniform = async (qs: { fens: string[] }[]): Promise<MaiaPrediction[]> =>
  qs.map((q) => {
    const legal = maiaLegalMoves(q.fens[q.fens.length - 1]);
    return { policy: Object.fromEntries(legal.map((m) => [m.uci, 1 / legal.length])), wdl: [0.3, 0.1, 0.6] };
  });

function analyzedGame(): AnalyzedGame {
  const game: GameRecord = {
    id: "g001", source: "chesscom", pgn: `[White "a"]\n[Black "b"]\n[Result "1-0"]\n\n1. e4 {[%clk 0:03:00]} e5 {[%clk 0:00:20]} 2. Nf3 {[%clk 0:02:58]} Nc6 {[%clk 0:00:19]} 1-0`,
    white: { name: "a", rating: 1500 }, black: { name: "b", rating: 1500 }, playerColor: "white", result: "win", termination: "resignation",
    timeClass: "blitz", timeControl: { base: 180, increment: 2 },
  };
  const parsed = parseGameMoves(game);
  const ev = (cp: number, best: string): PositionEval => ({ lines: [{ score: { cp }, pv: [best], depth: 10 }], score: { cp }, nodes: 1 });
  const evals = [ev(30, "e2e4"), ev(25, "e7e5"), ev(30, "g1f3"), ev(20, "b8c6"), ev(30, "f1b5")];
  return { game, parsed, evals, deep: {} };
}

describe("peer analysis", () => {
  it("builds decisions for both sides, keeps fast moves out of scope, and reuses cached searches", async () => {
    const games = [analyzedGame()];
    const sk = await predictPeers(games, { predict: uniform });
    expect(sk).toHaveLength(4);
    expect(sk.every((s) => s.preds.length === 5)).toBe(true);
    // Chess.com ratings are moved to Maia's scale.
    expect(sk[0].elo).toBe(1860);

    const log: string[] = [];
    const pool = new EnginePool(() => fakeTransport(log), 1);
    await pool.start();
    const cache = new MemCache();
    const first = await evaluatePeers(sk, games, { pool, cache, settings: DEFAULT_SETTINGS });
    const searches = log.filter((c) => c.startsWith("go")).length;
    expect(first.map((d) => d.mover)).toEqual(["player", "opponent", "player", "opponent"]);
    // Black starts with the base time; after 1...e5 it has 20 s, so 2...Nc6 is out of scope.
    expect(first.map((d) => d.inScope)).toEqual([true, true, true, false]);
    // Engine best takes the position's own eval; the played move takes the next position's eval.
    expect(first[0].win[first[0].moves.indexOf("e2e4")]).toBeCloseTo(first[0].winPosition, 9);
    expect(searches).toBeGreaterThan(0);

    await evaluatePeers(sk, games, { pool, cache, settings: DEFAULT_SETTINGS });
    expect(log.filter((c) => c.startsWith("go")).length).toBe(searches);
    pool.stop();
  });
});
