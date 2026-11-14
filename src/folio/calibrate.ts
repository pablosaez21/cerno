// A short Stockfish measurement for the cover's time estimate: the nodes per second this
// device reaches with each worker count. Same engine, node budget and one-thread-per-worker
// setup as pass 1, about a second per count. Nothing from it reaches the analysis.
import { workerTransport } from "@/core/browser";
import { EnginePool } from "@/core/engine";

const FENS = [
  "r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4",
  "r2q1rk1/pp2bppp/2n1pn2/2pp4/3P4/2PBPN2/PP1N1PPP/R2QK2R w KQ - 0 9",
  "r1b2rk1/1pq1bppp/p1nppn2/8/3NP3/2N1B3/PPPQBPPP/R4RK1 w - - 0 11",
  "2r3k1/5ppp/p3p3/1p1n4/3P4/P4N2/1P3PPP/2R3K1 b - - 1 25",
  "r4rk1/1b2qppp/p2p1n2/1pn1p3/4P3/1BN2N1P/PPP2PP1/R2QR1K1 w - - 2 14",
  "8/5pk1/6p1/3P4/2P5/6P1/5PK1/8 w - - 0 40",
  "3r2k1/pp3pp1/2p1b2p/4P3/2P5/1P3N1P/P4PP1/3R2K1 w - - 0 24",
  "r3k2r/pp1n1ppp/2p1pn2/q7/1bPP4/2N1PN2/PPQ2PPP/R3KB1R w KQkq - 0 10",
];
const NODES = 60_000;
const range = (n: number) => Array.from({ length: n }, (_, i) => i);

/** Nodes per second with each worker count, or undefined if aborted. */
export async function calibrate(counts: number[], signal?: AbortSignal): Promise<Record<number, number> | undefined> {
  const sizes = [...new Set(counts)].sort((a, b) => a - b);
  const pool = new EnginePool(() => workerTransport(), sizes[sizes.length - 1]);
  try {
    await pool.start();
    // Warm-up, not measured: compile and touch memory in every worker.
    await pool.run(range(pool.size), (i) => [{ fen: FENS[i % FENS.length], nodes: NODES, multiPv: 1 }], () => {}, signal);
    const out: Record<number, number> = {};
    for (const n of sizes) {
      // n tasks: only n workers get one, the rest stay idle.
      let nodes = 0;
      const t0 = performance.now();
      await pool.run(range(n), (i) => FENS.map((_, j) => ({ fen: FENS[(i + j) % FENS.length], nodes: NODES, multiPv: 1 })), (_t, _r, ev) => void (nodes += ev.nodes), signal);
      if (signal?.aborted) return undefined;
      out[n] = Math.round(nodes / ((performance.now() - t0) / 1000));
    }
    return signal?.aborted ? undefined : out;
  } finally {
    pool.stop();
  }
}
