import { describe, expect, it } from "vitest";
import { analyzeGames, DEFAULT_SETTINGS } from "../analyze";
import { EnginePool, type UciTransport } from "../engine";
import type { GameRecord } from "../types";

function fakeTransport(positions: string[]): UciTransport {
  let cb: (l: string) => void = () => {};
  return {
    send(cmd) {
      if (cmd.startsWith("position fen ")) positions.push(cmd.slice(13));
      const out = cmd === "uci" ? ["uciok"] : cmd === "isready" ? ["readyok"] : cmd.startsWith("go") ? ["info depth 5 multipv 1 score cp 10 nodes 10 pv e2e4", "bestmove e2e4"] : [];
      queueMicrotask(() => out.forEach((l) => cb(l)));
    },
    onLine(f) {
      cb = f;
    },
    terminate() {},
  };
}

const game = (id: string, moves: string): GameRecord => ({
  id, source: "pgn", pgn: `[White "a"]\n[Black "b"]\n[Result "1-0"]\n\n${moves} 1-0`, white: { name: "a" }, black: { name: "b" },
  playerColor: "white", result: "win", termination: "resignation", timeClass: "blitz",
});

describe("pass 1", () => {
  it("searches each distinct position once across games and gives it to every game", async () => {
    const searched: string[] = [];
    const pool = new EnginePool(() => fakeTransport(searched), 2);
    await pool.start();
    const out = await analyzeGames([game("g1", "1. e4 e5 2. Nf3"), game("g2", "1. e4 e5 2. Nc3")], { pool, settings: DEFAULT_SETTINGS });
    pool.stop();
    // Start, 1.e4, 1...e5 are shared: 3 shared + 1 + 1 distinct = 5 searches, not 8.
    expect(searched).toHaveLength(5);
    expect(new Set(searched).size).toBe(5);
    expect(out.every((g) => g.evals.length === 4 && g.evals.every(Boolean))).toBe(true);
  });
});
