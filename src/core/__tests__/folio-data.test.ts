import { describe, expect, it } from "vitest";
import type { AnalyzedGame } from "../analyze";
import { buildFolioData, eloLadder, LADDER_MAIA_ELOS, ladderTargets } from "../folio-data";
import { parseGameMoves } from "../game";
import type { MaiaPrediction } from "../maia";
import type { MaiaQuery } from "../maia-ort";
import { finishDecision, type Decision } from "../peers";
import { buildReport } from "../report";
import type { GameRecord, PositionEval } from "../types";

// Synthetic games: White hangs a knight on ply 5 (same shape as report-level.test.ts).
function game(id: string, moves: string, source: GameRecord["source"] = "chesscom"): AnalyzedGame {
  const record: GameRecord = {
    id, source, url: `https://example.test/${id}`, pgn: `[White "alice"]\n[Black "bob"]\n[Result "0-1"]\n\n${moves} 0-1`,
    white: { name: "alice", rating: 1450 }, black: { name: "bob", rating: 1460 }, playerColor: "white", result: "loss", termination: "resignation", timeClass: "blitz",
    timeControl: { base: 180, increment: 2 }, endTime: 1_700_000_000_000,
  };
  const parsed = parseGameMoves(record);
  const ev = (cp: number, pv: string[] = []): PositionEval => ({ lines: [{ score: { cp }, pv, depth: 10 }], score: { cp }, nodes: 1 });
  const evals = [parsed.startFen, ...parsed.plies.map((p) => p.fenAfter)].map((_, i) => (i < 5 ? ev(0, ["a2a3"]) : ev(-250)));
  return {
    game: record, parsed, evals,
    deep: { 5: { before: { lines: [{ score: { cp: 0 }, pv: ["d2d4"], depth: 18 }, { score: { cp: -20 }, pv: ["a2a3"], depth: 18 }], score: { cp: 0 }, nodes: 1 }, after: ev(-250, ["d8d5", "e2e4"]) } },
  };
}
const games = [
  game("C", "1. h3 d5 2. Nc3 Nf6 3. Nxd5 Qxd5 4. e4 Qd8"),
  game("D", "1. a3 d5 2. Nc3 c6 3. Nxd5 cxd5 4. e4 dxe4"),
  game("E", "1. b3 d5 2. Nc3 e6 3. Nxd5 exd5 4. e4 dxe4"),
  game("F", "1. g3 d5 2. Nc3 Nc6 3. Nxd5 Qxd5 4. e4 Qd8"),
];

function decision(g: AnalyzedGame, ply: number, good: number): Decision {
  const p = g.parsed.plies[ply - 1];
  const row = [good, 1 - good - 0.05];
  return finishDecision({
    gameId: g.game.id, ply, mover: "player", color: p.color, moveNumber: p.moveNumber, phase: "opening", inScope: true, elo: 1810, eloOpp: 1820,
    fen: p.fenBefore, played: p.uci, engineBest: "d2d4", moves: ["d2d4", p.uci], inSet: [true, true],
    p: Array(5).fill(row), mass: Array(5).fill(0.95), win: [50, 28], winPosition: 50,
  });
}
const decisions = games.map((g) => decision(g, 5, 0.6));

describe("buildFolioData", () => {
  const report = buildReport(games, "alice", undefined, { decisions, model: "maia3-5m", mode: "reduced" });
  const data = buildFolioData(report, games, decisions, 123);

  it("keeps the report sections and adds the viewer fields of each game", () => {
    expect(data.findings).toBe(report.findings);
    expect(data.meta).toMatchObject({ contractVersion: 3, folioVersion: 2, builtAt: 123 });
    const c = data.games.find((g) => g.id === "C")!;
    expect(c.plies).toHaveLength(8);
    expect(c.winCurve).toHaveLength(9);
    expect(c.winCurve[0]).toBe(50);
    expect(c.white).toEqual({ name: "alice", rating: 1450 });
    expect(c.tc).toEqual({ base: 180, increment: 2 });
    // Ply 5 is the player's judged blunder; the opponent's plies carry no mark.
    expect(c.plies[4]).toMatchObject({ san: "Nxd5", uci: "c3d5", j: "b" });
    expect(c.plies[5].j).toBeUndefined();
  });

  it("slims error rows to the lines the diagrams play", () => {
    const e = data.errors.find((x) => x.gameId === "C")!;
    expect(e.bestLineUci).toEqual(["d2d4"]);
    expect(e.refutationUci?.[0]).toBe("d8d5");
    // Maia was asked at 1810 (Lichess); the interface shows the Chess.com rating, 360 lower.
    expect(e.peer).toMatchObject({ elo: 1450, maiaEloSelf: 1810, maiaEloOppo: 1820, level: undefined });
    expect(e.peer).not.toHaveProperty("eloSelf");
    expect(e.peer?.pGood).toBeCloseTo(0.6 / 0.95, 3);
    expect(data.eloScale).toEqual({ shown: "chesscom", maiaOffset: 360, maiaOffsetCi95: [313, 399], measuredAt: 1453 });
  });

  it("leaves Lichess and PGN ratings as they are", () => {
    for (const source of ["lichess", "pgn"] as const) {
      const own = games.map((g) => ({ ...g, game: { ...g.game, source } }));
      const d = buildFolioData(buildReport(own, "alice", undefined, { decisions, model: "maia3-5m", mode: "reduced" }), own, decisions);
      expect(d.eloScale).toEqual({ shown: source, maiaOffset: 0 });
      expect(d.errors.find((x) => x.gameId === "C")!.peer).toMatchObject({ elo: 1810, maiaEloSelf: 1810 });
    }
  });

  it("puts the peer Elo of positions that are not judged errors on the shown scale too", () => {
    const withRef = { ...report, findings: [...report.findings, { ...report.findings[0], id: "x", evidence: [{ gameId: "C", ply: 3 }] }] };
    const d = buildFolioData(withRef, games, [...decisions, decision(games[0], 3, 0.6)]);
    expect(d.positions["C#3"].peer).toMatchObject({ elo: 1450, maiaEloSelf: 1810 });
  });

  it("builds positions referenced by findings that are not judged errors from pass 1", () => {
    const withRef = { ...report, findings: [...report.findings, { ...report.findings[0], id: "x", evidence: [{ gameId: "C", ply: 3 }] }] };
    const d = buildFolioData(withRef, games, decisions);
    const p = d.positions["C#3"];
    expect(p).toMatchObject({ gameId: "C", ply: 3, color: "white", played: { uci: "b1c3", san: "Nc3" }, best: { uci: "a2a3", san: "a3" }, loss: 0, judgement: undefined });
    // Judged errors are not duplicated.
    expect(d.positions["C#5"]).toBeUndefined();
  });
});

describe("eloLadder", () => {
  const report = buildReport(games, "alice", undefined, { decisions, model: "maia3-5m", mode: "reduced" });
  const data = buildFolioData(report, games, decisions);

  it("targets every exercise once", () => {
    const targets = ladderTargets(data);
    const keys = targets.map((t) => `${t.gameId}#${t.ply}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const list of Object.values(data.exercises)) for (const x of list) expect(keys).toContain(`${x.gameId}#${x.ply}`);
  });

  it("queries Maia at each rating with the real history and sums the good moves", async () => {
    const seen: MaiaQuery[] = [];
    const predict = async (qs: MaiaQuery[]): Promise<MaiaPrediction[]> => {
      seen.push(...qs);
      // Stronger ratings play the engine move more often.
      return qs.map((q) => {
        const good = (q.eloSelf - 1000) / 2000;
        return { policy: { d2d4: good, c3d5: 1 - good }, wdl: [0.3, 0.4, 0.3] };
      });
    };
    const ladder = await eloLadder([{ gameId: "C", ply: 5, why: "exercise" }], games, decisions, { predict, model: "maia3-5m", batchSize: 5 });
    expect(seen).toHaveLength(LADDER_MAIA_ELOS.length);
    // Maia is still asked on the Lichess scale, whatever the source.
    expect(seen.map((q) => q.eloSelf)).toEqual(LADDER_MAIA_ELOS);
    expect(LADDER_MAIA_ELOS[0]).toBe(1000);
    expect(LADDER_MAIA_ELOS[16]).toBe(2600);
    expect(seen[0].fens).toHaveLength(5);
    expect(seen.every((q) => q.eloSelf === q.eloOppo)).toBe(true);
    const pos = ladder.positions["C#5"];
    // d2d4 loses 0 (good), c3d5 loses 22 (not good).
    expect(pos.good).toEqual(["d2d4"]);
    expect(pos.engine.map((m) => m.uci)).toEqual(["d2d4", "c3d5"]);
    // Chess.com games: the curve is shown 360 lower than Maia was asked.
    expect(pos.curve[0]).toMatchObject({ elo: 640, maiaElo: 1000, pGood: 0, pPlayed: 1 });
    expect(pos.curve[16]).toMatchObject({ elo: 2240, maiaElo: 2600, pGood: 0.8, pPlayed: 0.2 });
    expect(ladder.meta.maiaElos).toEqual(LADDER_MAIA_ELOS);
    expect(pos.curve[16].top[0]).toEqual(["d2d4", 0.8]);
  });

  it("falls back to pass 2's lines when there is no peer record", async () => {
    const predict = async (qs: MaiaQuery[]) => qs.map(() => ({ policy: { d2d4: 0.5, a2a3: 0.5 }, wdl: [0.3, 0.4, 0.3] as [number, number, number] }));
    const ladder = await eloLadder([{ gameId: "C", ply: 5, why: "evidence" }], games, [], { predict, model: "m" });
    // Pass 2: d2d4 at 0 cp and a2a3 at -20 cp (1.8 win % worse): both good.
    expect(ladder.positions["C#5"].good).toEqual(["d2d4", "a2a3"]);
    expect(ladder.positions["C#5"].curve[0].pGood).toBe(1);
  });

  it("shows the ladder of Lichess games on Maia's own scale", async () => {
    const predict = async (qs: MaiaQuery[]) => qs.map(() => ({ policy: { d2d4: 0.5, a2a3: 0.5 }, wdl: [0.3, 0.4, 0.3] as [number, number, number] }));
    const own = [game("L", "1. h3 d5 2. Nc3 Nf6 3. Nxd5 Qxd5 4. e4 Qd8", "lichess")];
    const ladder = await eloLadder([{ gameId: "L", ply: 5, why: "evidence" }], own, [], { predict, model: "m" });
    expect(ladder.positions["L#5"].curve.map((c) => c.elo)).toEqual(LADDER_MAIA_ELOS);
  });
});
