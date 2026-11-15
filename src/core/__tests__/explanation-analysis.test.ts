import { describe, expect, it } from "vitest";
import { analyzeGames, DEFAULT_SETTINGS, evalKey, gameKey, type AnalyzedGame, type EvalCache, type GameDone } from "../analyze";
import { fenOf, playLine, sanOf } from "../chess";
import { EnginePool, type UciTransport } from "../engine";
import { EXPLANATION_VERSION, explanationProbeFens, type ExplanationInput } from "../explain";
import { enrichExplanations } from "../explanation-analysis";
import type { GameRecord, PositionEval } from "../types";
import cases from "./fixtures/explanations.json";

const c = cases.find((c) => c.name === "1.10")! as ExplanationInput;
const ev = (cp: number, pv: string[]): PositionEval => ({ score: { cp }, nodes: 500_000, lines: [{ score: { cp }, depth: 10, pv }] });
function game(): AnalyzedGame {
  const after = fenOf(playLine(c.fen, [c.played]).positions[1]);
  const record: GameRecord = { id: "cached", source: "pgn", pgn: "", white: { name: "a" }, black: { name: "b" }, playerColor: "white", result: "loss", termination: "resignation", timeClass: "blitz" };
  return { game: record, parsed: { startFen: c.fen, plies: [{ ply: 1, moveNumber: 5, color: "white", san: sanOf(c.fen, c.played)!, uci: c.played, fenBefore: c.fen, fenAfter: after }] }, evals: [ev(0, c.bestLine), ev(-500, c.refutation)], deep: { 1: { before: ev(0, c.bestLine), after: ev(-500, c.refutation) } } };
}
function transport(searched: string[]): UciTransport {
  let cb: (line: string) => void = () => {}, fen = "";
  const fens = explanationProbeFens(c.fen, c.bestLine[0]);
  return {
    send(cmd) {
      if (cmd.startsWith("position fen ")) fen = cmd.slice(13);
      let lines: string[] = [];
      if (cmd === "uci") lines = ["uciok"];
      if (cmd === "isready") lines = ["readyok"];
      if (cmd.startsWith("go")) {
        searched.push(fen);
        const probe = fen === fens.before ? c.probes!.before! : c.probes!.best!;
        const score = "cp" in probe.score ? probe.score.cp : 0;
        const pv = probe.lines[0].pv;
        lines = [`info depth ${probe.lines[0].depth} score cp ${fen.split(" ")[1] === "w" ? score : -score} nodes 500000 pv ${pv.join(" ")}`, `bestmove ${pv[0]}`];
      }
      queueMicrotask(() => lines.forEach(cb));
    }, onLine(f) { cb = f; }, terminate() {},
  };
}
function cacheFor(g: AnalyzedGame) {
  const evals = new Map<string, PositionEval>(), games = new Map([[gameKey(DEFAULT_SETTINGS, g.game.id), g]]);
  const cache: EvalCache = {
    getEval: async (k) => evals.get(k), setEval: async (k, v) => { evals.set(k, v); },
    getGame: async (k) => games.get(k), setGame: async (k, v) => { games.set(k, v); },
  };
  return { cache, evals, games };
}

describe("additional explanation searches", () => {
  it("upgrades an old game cache with only two searches and then reuses everything", async () => {
    const g = game(), { cache } = cacheFor(g), searched: string[] = [], seen: GameDone[] = [];
    const pool = new EnginePool(() => transport(searched), 1);
    await pool.start();
    try {
      const out = await analyzeGames([g.game], { pool, cache, onGame: (x) => seen.push(x) });
      expect(searched).toEqual(Object.values(explanationProbeFens(c.fen, c.bestLine[0])));
      expect(out[0].evals).toBe(g.evals);
      expect(out[0].deep[1].before).toBe(g.deep[1].before);
      expect(out[0].deep[1].after).toBe(g.deep[1].after);
      expect(out[0].deep[1].explanation).toEqual(c.probes);
      expect(out[0].explanationVersion).toBe(EXPLANATION_VERSION);
      expect(seen).toHaveLength(1);
      expect(seen[0].game).toBe(out[0]);
      searched.length = 0;
      const again = await analyzeGames([g.game], { pool, cache });
      expect(searched).toEqual([]);
      expect(again[0].deep).toEqual(out[0].deep);
    } finally { pool.stop(); }
  });

  it("reuses separately cached probe evaluations without any search", async () => {
    const g = game(), { cache, evals } = cacheFor(g), searched: string[] = [];
    const fens = explanationProbeFens(c.fen, c.bestLine[0]);
    for (const kind of ["before", "best"] as const) evals.set(evalKey(DEFAULT_SETTINGS, DEFAULT_SETTINGS.pass2Nodes, 1, fens[kind]!), c.probes![kind]!);
    const pool = new EnginePool(() => transport(searched), 1);
    await pool.start();
    try {
      const [out] = await analyzeGames([g.game], { pool, cache });
      expect(searched).toEqual([]);
      expect(out.deep[1].explanation).toEqual(c.probes);
    } finally { pool.stop(); }
  });

  it("does not probe inaccuracies or moves already equal to the engine's best", async () => {
    const g = game(), searched: string[] = [];
    g.deep[1].after = ev(-50, c.refutation);
    const pool = new EnginePool(() => transport(searched), 1);
    await pool.start();
    const finished: AnalyzedGame[] = [];
    try {
      await enrichExplanations([g], { pool, settings: DEFAULT_SETTINGS, onGame: (x) => finished.push(x), onProgress() {} });
      expect(searched).toEqual([]);
      expect(finished).toEqual([g]);
    } finally { pool.stop(); }
  });

  it("honours cancellation before upgrading or telling an unfinished game", async () => {
    const g = game(), controller = new AbortController(), finished: AnalyzedGame[] = [];
    controller.abort();
    const pool = new EnginePool(() => transport([]), 1);
    await expect(enrichExplanations([g], { pool, settings: DEFAULT_SETTINGS, signal: controller.signal, onGame: (x) => finished.push(x), onProgress() {} })).rejects.toMatchObject({ name: "AbortError" });
    expect(g.explanationVersion).toBeUndefined();
    expect(finished).toEqual([]);
  });
});
