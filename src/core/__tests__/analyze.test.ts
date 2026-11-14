import { describe, expect, it } from "vitest";
import { analyzeGames, DEFAULT_SETTINGS, type GameDone } from "../analyze";
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

describe("onGame", () => {
  it("tells each game after pass 1 with every eval, then once complete, as returned", async () => {
    const pool = new EnginePool(() => fakeTransport([]), 2);
    await pool.start();
    const seen: GameDone[] = [];
    const out = await analyzeGames([game("g1", "1. e4 e5 2. Nf3"), game("g2", "1. e4 e5 2. Nc3")], { pool, settings: DEFAULT_SETTINGS, onGame: (e) => seen.push(e) });
    pool.stop();
    for (const g of out) {
      const mine = seen.filter((e) => e.game.game.id === g.game.id);
      expect(mine.map((e) => e.pass)).toEqual([1, 2]);
      expect(mine[0].game.evals).toHaveLength(4);
      expect(mine[0].game.evals.every(Boolean)).toBe(true);
      expect(mine[1].game).toBe(g);
    }
  });

  it("tells a game with pass-2 work once its deep evals are in", async () => {
    // Every position after 2.Nc3 looks lost for White, so that move goes to pass 2.
    const lossy = (): UciTransport => {
      let cb: (l: string) => void = () => {};
      let fen = "";
      return {
        send(cmd) {
          if (cmd.startsWith("position fen ")) fen = cmd.slice(13);
          const cp = fen.includes("2N5") ? 900 : 10;
          const out = cmd === "uci" ? ["uciok"] : cmd === "isready" ? ["readyok"] : cmd.startsWith("go") ? [`info depth 5 multipv 1 score cp ${cp} nodes 10 pv e7e5`, "bestmove e7e5"] : [];
          queueMicrotask(() => out.forEach((l) => cb(l)));
        },
        onLine(f) {
          cb = f;
        },
        terminate() {},
      };
    };
    const pool = new EnginePool(lossy, 2);
    await pool.start();
    const seen: GameDone[] = [];
    const out = await analyzeGames([game("g2", "1. e4 e5 2. Nc3")], { pool, settings: DEFAULT_SETTINGS, onGame: (e) => seen.push(e) });
    pool.stop();
    expect(Object.keys(out[0].deep)).toEqual(["3"]);
    expect(seen.map((e) => e.pass)).toEqual([1, 2]);
    expect(seen[1].game).toBe(out[0]);
    expect(seen[1].game.deep[3].before && seen[1].game.deep[3].after).toBeTruthy();
  });

  it("does not change the analysis: same result with or without a listener", async () => {
    const games = () => [game("g1", "1. e4 e5 2. Nf3"), game("g2", "1. e4 e5 2. Nc3")];
    const run = async (onGame?: (e: GameDone) => void) => {
      const pool = new EnginePool(() => fakeTransport([]), 2);
      await pool.start();
      const out = await analyzeGames(games(), { pool, settings: DEFAULT_SETTINGS, onGame });
      pool.stop();
      return out;
    };
    const plain = await run();
    const told = await run(() => {});
    expect(told).toEqual(plain);
  });

  it("ignores a listener that throws", async () => {
    const pool = new EnginePool(() => fakeTransport([]), 1);
    await pool.start();
    const out = await analyzeGames([game("g1", "1. e4 e5")], { pool, settings: DEFAULT_SETTINGS, onGame: () => { throw new Error("view broke"); } });
    pool.stop();
    expect(out).toHaveLength(1);
  });
});
