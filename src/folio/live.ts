// What the wait screen shows of each game while the analysis runs: its win % curve once
// pass 1 has every position, then its judged moves once pass 2 is done. Same rules as the
// report (a judged move has a judgement and a category), so the counters end where the
// finished study starts.
import type { AnalyzedGame } from "@/core/analyze";
import { classifyGame, type MoveAnalysis } from "@/core/classify";
import type { GameResult } from "@/core/types";
import { winPercentFor } from "@/core/winprob";

export interface LiveMove {
  ply: number;
  color: "white" | "black";
  /** Position before the move. */
  fen: string;
  played: { uci: string; san: string };
  best?: { uci: string; san: string };
  /** Opponent's best reply line after the played move (UCI). */
  refutation: string[];
  loss: number;
  judgement?: "inaccuracy" | "mistake" | "blunder";
}

/** The one line the wait's feed prints for a game, in the demo's order of interest. */
export type LiveNote =
  | { kind: "fork" | "hang" | "mate" | "worst"; move: LiveMove }
  | { kind: "lwtl"; clock: number }
  | { kind: "clean" };

export interface LiveGame {
  id: string;
  /** Numbered in the order played: 1 is the oldest. */
  no: number;
  result: GameResult;
  /** q: waiting · c: pass 1 done, curve known · d: complete. */
  state: "q" | "c" | "d";
  /** Player's win % after each position (index 0 = start). */
  curve?: number[];
  playerMoves?: number;
  /** Judged moves, inaccuracies included. */
  judged?: number;
  /** Judged moves without inaccuracies. */
  mistakes?: number;
  /** Costliest mistake (not inaccuracy), for the galley board. */
  worst?: LiveMove;
  note?: LiveNote;
}

const r1 = (x: number) => Math.round(x * 10) / 10;

export function liveCurve(a: AnalyzedGame): number[] {
  return a.evals.map((ev) => r1(winPercentFor(ev.score, a.game.playerColor)));
}

function liveMove(m: MoveAnalysis): LiveMove {
  return { ply: m.ply, color: m.color, fen: m.fenBefore, played: m.played, best: m.best, refutation: m.refutation, loss: r1(m.loss), judgement: m.judgement };
}

/** The pass-2 summary of a complete game. */
export function liveDone(a: AnalyzedGame): Pick<LiveGame, "curve" | "playerMoves" | "judged" | "mistakes" | "worst" | "note"> {
  const ga = classifyGame(a);
  const judged = ga.moves.filter((m) => m.judgement && m.category);
  const mistakes = judged.filter((m) => m.judgement !== "inaccuracy");
  const worstMistake = [...mistakes].sort((x, y) => y.loss - x.loss)[0];
  const tag = (t: string, motif?: string) => judged.find((m) => m.tactic?.tag === t && (!motif || m.tactic.motifs.includes(motif as never)));
  const fork = tag("allowed_tactic", "fork");
  const hang = tag("hanging_piece");
  const mate = tag("allowed_mate");
  const lwtl = ga.patterns.find((p) => p.pattern === "lost_with_time_left");
  const worst = [...judged].sort((x, y) => y.loss - x.loss)[0];
  const note: LiveNote = fork
    ? { kind: "fork", move: liveMove(fork) }
    : hang
      ? { kind: "hang", move: liveMove(hang) }
      : mate
        ? { kind: "mate", move: liveMove(mate) }
        : lwtl && lwtl.value !== undefined
          ? { kind: "lwtl", clock: lwtl.value }
          : worst && worst.loss >= 15
            ? { kind: "worst", move: liveMove(worst) }
            : { kind: "clean" };
  return {
    curve: liveCurve(a),
    playerMoves: ga.playerMoves,
    judged: judged.length,
    mistakes: mistakes.length,
    worst: worstMistake && liveMove(worstMistake),
    // "clean" only when nothing at all was judged, as in the demo
    note: note.kind === "clean" && judged.length ? undefined : note,
  };
}
