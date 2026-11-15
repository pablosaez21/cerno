// The load modes and the pressure brake change only how many Stockfish workers run. This checks,
// with the real engine (Stockfish WASM in worker_threads, no network), that the analysis and the
// report are the same with 1 worker, with several, and with several whose limit changes mid-run:
// nodes are fixed, each engine is single-threaded, and every task starts with `ucinewgame`, so no
// result depends on which worker ran it or when.
import { describe, expect, it } from "vitest";
import { nodeTransport } from "../../../scripts/node-engine";
import { analyzeGames, DEFAULT_SETTINGS, type AnalyzedGame } from "../analyze";
import { EnginePool } from "../engine";
import { maiaLegalMoves, type MaiaPrediction } from "../maia";
import { evaluatePeers, predictPeers } from "../peer-analysis";
import { buildReport } from "../report";
import type { GameRecord } from "../types";

const game = (id: string, playerColor: "white" | "black", result: GameRecord["result"], moves: string): GameRecord => ({
  id, source: "pgn", pgn: `[White "w"]\n[Black "b"]\n[Result "*"]\n\n${moves} *`,
  white: { name: "w", rating: 1500 }, black: { name: "b", rating: 1500 }, playerColor, result, termination: "resignation",
  timeClass: "blitz", timeControl: { base: 180, increment: 0 },
});

// Two games that share an opening (pass 1 searches shared positions once) and have
// player moves that lose win % (pass 2 and the peer candidates have work).
const GAMES = [
  game("opera", "black", "loss", "1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7 8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8"),
  game("short", "white", "loss", "1. e4 e5 2. Nf3 Nc6 3. Bc4 Nd4 4. Nxe5 Qg5 5. Nxf7 Qxg2 6. Rf1 Qxe4+ 7. Be2 Nf3#"),
];

/** A fixed stand-in for Maia: the same policy every time, so only the engine can differ. */
const firstMoves = async (qs: { fens: string[] }[]): Promise<MaiaPrediction[]> =>
  qs.map((q) => {
    const legal = maiaLegalMoves(q.fens[q.fens.length - 1]).slice(0, 3);
    return { policy: Object.fromEntries(legal.map((m, i) => [m.uci, [0.6, 0.3, 0.1][i] ?? 0])), wdl: [0.3, 0.1, 0.6] };
  });

async function run(workers: number, opts: { flip?: boolean } = {}) {
  const pool = new EnginePool(() => nodeTransport(), workers);
  await pool.start();
  // The brake: the limit goes 1, 2, …, workers and back every few milliseconds, mid-search.
  let k = 0;
  const flip = opts.flip ? setInterval(() => pool.setLimit((k++ % workers) + 1), 15) : undefined;
  try {
    const analyzed: AnalyzedGame[] = await analyzeGames(GAMES, { pool, settings: DEFAULT_SETTINGS });
    const skeletons = await predictPeers(analyzed, { predict: firstMoves });
    const decisions = await evaluatePeers(skeletons, analyzed, { pool, settings: DEFAULT_SETTINGS });
    const report = buildReport(analyzed, "p", DEFAULT_SETTINGS, { decisions, model: "fixed", mode: "full" });
    return { analyzed, decisions, report, flips: k };
  } finally {
    if (flip) clearInterval(flip);
    pool.stop();
  }
}

describe("worker count", () => {
  it("gives the same analysis, peer decisions and report with 1 worker and with 3", async () => {
    const one = await run(1);
    const three = await run(3);
    // The test is only meaningful if every stage had engine work.
    expect(Object.keys(one.analyzed[0].deep).length).toBeGreaterThan(0);
    expect(one.decisions.length).toBeGreaterThan(0);
    expect(three.analyzed).toEqual(one.analyzed);
    expect(three.decisions).toEqual(one.decisions);
    expect(three.report).toEqual(one.report);
  }, 180_000);

  it("gives the same with 3 workers whose limit changes mid-run", async () => {
    const one = await run(1);
    const braked = await run(3, { flip: true });
    expect(braked.flips).toBeGreaterThan(20);
    expect(braked.analyzed).toEqual(one.analyzed);
    expect(braked.decisions).toEqual(one.decisions);
    expect(braked.report).toEqual(one.report);
  }, 180_000);
});
