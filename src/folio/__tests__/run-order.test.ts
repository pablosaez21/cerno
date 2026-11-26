// On a phone Maia-3 loads only after the Stockfish passes (src/folio/mobile.ts). This runs the real
// pipeline (runAnalysis, real Stockfish WASM in worker_threads, no network) both ways and checks
// that the order changes and the result does not. Only the browser adapters are replaced: the
// engine transport (Node instead of a Web Worker), the IndexedDB cache (none) and the Maia worker
// (a fixed policy, so only the order can differ).
import { describe, expect, it, vi } from "vitest";
import { nodeTransport } from "../../../scripts/node-engine";
import { maiaLegalMoves, type MaiaPrediction } from "@/core/maia";

const events: string[] = [];

vi.mock("@/core/browser", () => ({
  workerTransport: () => nodeTransport(),
  IdbCache: { open: async () => undefined },
}));

vi.mock("@/core/maia-browser", () => {
  class MaiaClient {
    readonly backend = "webgpu";
    static async load() {
      events.push("maia-load");
      return new MaiaClient();
    }
    async predict(qs: { fens: string[] }[]): Promise<MaiaPrediction[]> {
      events.push("maia-predict");
      return qs.map((q) => {
        const legal = maiaLegalMoves(q.fens[q.fens.length - 1]).slice(0, 3);
        return { policy: Object.fromEntries(legal.map((m, i) => [m.uci, [0.6, 0.3, 0.1][i] ?? 0])), wdl: [0.3, 0.1, 0.6] };
      });
    }
    terminate() {
      events.push("maia-end");
    }
  }
  return { MAIA_MODELS: { "maia3-5m": { id: "maia3-5m", url: "", sha256: "", bytes: 1 } }, MaiaClient };
});

const { runAnalysis } = await import("../run");
const { buildReport } = await import("@/core/report");
const { DEFAULT_SETTINGS } = await import("@/core/analyze");

const pgn = (white: string, black: string, result: string, date: string, moves: string) =>
  `[Event "t"]\n[Site "x"]\n[Date "${date}"]\n[White "${white}"]\n[Black "${black}"]\n[Result "${result}"]\n[WhiteElo "1500"]\n[BlackElo "1520"]\n[TimeControl "180"]\n\n${moves} ${result}\n`;
const PGN = [
  pgn("b", "p", "1-0", "2026.01.02", "1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7 8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8"),
  pgn("p", "b", "0-1", "2026.01.01", "1. e4 e5 2. Nf3 Nc6 3. Bc4 Nd4 4. Nxe5 Qg5 5. Nxf7 Qxg2 6. Rf1 Qxe4+ 7. Be2 Nf3#"),
].join("\n");

async function run(maiaAfterStockfish: boolean) {
  events.length = 0;
  const res = await runAnalysis(
    { source: { kind: "pgn", text: PGN, player: "p" }, max: 10, timeClasses: ["blitz"], workers: 2, maiaAfterStockfish },
    (p) => {
      if (p.phase === "pass2" && p.done === p.total) events.push("pass2-done");
    },
  );
  return { res, order: [...events] };
}

describe("Maia after Stockfish (phones)", () => {
  it("loads Maia only once the Stockfish passes are done, and gives the same result", async () => {
    const along = await run(false);
    const after = await run(true);
    // Alongside, the model loads with the engines; after, not before pass 2 has ended.
    expect(along.order.indexOf("maia-load")).toBeLessThan(along.order.lastIndexOf("pass2-done"));
    expect(after.order.indexOf("maia-load")).toBeGreaterThan(after.order.lastIndexOf("pass2-done"));
    expect(after.order).toContain("maia-predict");
    // Meaningful only if Maia and the peer stage had work.
    expect(along.res.peers?.decisions.length).toBeGreaterThan(0);
    expect(after.res.analyzed).toEqual(along.res.analyzed);
    expect(after.res.peers).toEqual(along.res.peers);
    const report = (r: typeof along.res) => buildReport(r.analyzed, "p", DEFAULT_SETTINGS, r.peers);
    expect(report(after.res)).toEqual(report(along.res));
  }, 120_000);

  it("leaves Maia out when asked (a device where it did not fit)", async () => {
    events.length = 0;
    const res = await runAnalysis({ source: { kind: "pgn", text: PGN, player: "p" }, max: 10, timeClasses: ["blitz"], workers: 1, level: false, maiaAfterStockfish: true }, () => {});
    expect(events).not.toContain("maia-load");
    expect(res.peers).toBeUndefined();
    expect(res.analyzed.length).toBe(2);
  }, 120_000);
});
