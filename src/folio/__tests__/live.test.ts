import { describe, expect, it } from "vitest";
import type { AnalyzedGame } from "@/core/analyze";
import { classifyGame } from "@/core/classify";
import { parseGameMoves } from "@/core/game";
import type { GameRecord, PositionEval, Score } from "@/core/types";
import { liveCurve, liveDone } from "../live";

// 1.e4 e5 2.Qh5 Nc6 3.Bc4 Nf6?? 4.Qxf7#: Black's third move throws the game away.
const rec: GameRecord = {
  id: "t:1", source: "pgn", pgn: `[White "w"]\n[Black "me"]\n[Result "1-0"]\n\n1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0`,
  white: { name: "w" }, black: { name: "me" }, playerColor: "black", result: "loss", termination: "checkmate", timeClass: "blitz",
};

const ev = (score: Score, pv: string[] = []): PositionEval => ({ score, nodes: 1, lines: pv.length ? [{ score, pv, depth: 10 } as never] : [] });

function analyzed(): AnalyzedGame {
  const parsed = parseGameMoves(rec);
  // White's view after each ply; 3...Nf6 (ply 6) walks into mate.
  const evals = [ev({ cp: 20 }, ["e2e4"]), ev({ cp: 30 }, ["e7e5"]), ev({ cp: 25 }, ["d1h5"]), ev({ cp: 40 }, ["b8c6"]), ev({ cp: 30 }, ["f1c4"]), ev({ cp: 60 }, ["d8e7"]), ev({ mate: 1 }, ["h5f7"]), { ...ev({ mate: 0 }), terminal: true }];
  // pass 2 judged only the costly move, as analyzeGames does
  const deep = { 6: { before: ev({ cp: 40 }, ["d8e7", "h5f7"]), after: ev({ mate: 1 }, ["h5f7"]) } } as AnalyzedGame["deep"];
  return { game: rec, parsed, evals, deep };
}

describe("live view of a game", () => {
  it("draws the curve from the player's side", () => {
    const c = liveCurve(analyzed());
    expect(c).toHaveLength(8);
    expect(c[0]).toBeLessThan(50); // +0.20 for White is under 50 % for Black
    expect(c[6]).toBeLessThan(5); // mate in 1 against the player
  });

  it("counts judged moves and mistakes as the report does", () => {
    const a = analyzed();
    const ga = classifyGame(a);
    const judged = ga.moves.filter((m) => m.judgement && m.category);
    const s = liveDone(a);
    expect(s.judged).toBe(judged.length);
    expect(s.mistakes).toBe(judged.filter((m) => m.judgement !== "inaccuracy").length);
    expect(s.playerMoves).toBe(ga.playerMoves);
    expect(s.mistakes).toBeGreaterThan(0);
    expect(s.worst?.played.san).toBe("Nf6");
  });
});
