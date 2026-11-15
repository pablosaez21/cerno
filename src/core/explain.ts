// Facts, never prose, behind the two exercise lines. Every mark names a position
// in the accompanying legal line (0 = before the move).
import { attacks } from "chessops/attacks";
import type { Chess } from "chessops/chess";
import type { NormalMove, Role, Square } from "chessops/types";
import { makeSquare } from "chessops/util";
import { fenOf, materialBalance, opposite, parseStdUci, PIECE_VALUE, playLine, positionFromFen, sanOf } from "./chess";
import { attackersOf, isBackRankMate, isDefended, MATERIAL_SWING, settledBalance, SHORT_MATE, TACTIC_HORIZON, type TacticTag } from "./tactics";
import type { Color, PositionEval } from "./types";

export const EXPLANATION_VERSION = 1;

export interface ExplanationProbes {
  /** Opponent to move before the player's move, with en passant cleared. */
  before?: PositionEval;
  /** Player to move again after the best move, with en passant cleared. */
  best?: PositionEval;
}
export interface Proof { fen: string; uci: string[] }
export interface MaterialOutcome {
  /** Change from the initial balance, in pawns, from the player's side. */
  net: number;
  lost: Role[];
  won: Role[];
  promotions: { color: Color; role: Role }[];
}
export type ExplanationFact =
  | { kind: "material"; outcome: MaterialOutcome }
  | { kind: "mate"; winner: Color; moves: number; backRank: boolean }
  | { kind: "hanging"; role: Role; square: string; moved: boolean; reply: string }
  | { kind: "removed_defender"; role: Role; from: string; victim: Role; square: string; reply: string }
  | { kind: "fork"; move: string; targets: { role: Role; square: string }[] }
  | { kind: "free_capture"; role: Role; square: string; undefended: boolean; capturer: Role }
  | { kind: "castling_lost" }
  | { kind: "new_attack"; role: Role; square: string; proof: Proof };
export interface ExplanationMark {
  /** Number of moves already played in this line, not a game ply. */
  ply: number;
  arrows: { from: string; to: string }[];
}
export interface ExplainedLine {
  uci: string[];
  san: string[];
  facts: ExplanationFact[];
  marks: ExplanationMark[];
}
export interface MoveExplanation {
  played: ExplainedLine;
  best: ExplainedLine;
  /** A probe is conditional on passing the turn, not an evaluation of a legal move. */
  threatBefore?: { kind: "already_present"; move: string; proof: Proof } | { kind: "not_found" };
}
export interface ExplanationInput {
  fen: string;
  color: Color;
  played: string;
  bestLine: string[];
  refutation: string[];
  tactic?: { tag: TacticTag };
  probes?: ExplanationProbes;
}

/** A hypothetical pass. Never pass while in check, in an ended game, or retain en passant. */
export function passTurn(fen: string): string | undefined {
  const pos = positionFromFen(fen);
  if (pos.isCheck() || pos.isEnd()) return undefined;
  const fields = fen.split(" ");
  fields[1] = fields[1] === "w" ? "b" : "w";
  fields[3] = "-";
  try {
    const out = fields.join(" ");
    positionFromFen(out);
    return out;
  } catch {
    return undefined;
  }
}

export function explanationProbeFens(fen: string, best: string | undefined): Partial<Record<keyof ExplanationProbes, string>> {
  const before = passTurn(fen);
  const pos = positionFromFen(fen);
  const move = best && parseStdUci(pos, best);
  if (!move) return { before };
  pos.play(move);
  return { before, best: passTurn(fenOf(pos)) };
}

function capturedRole(pos: Chess, move: NormalMove): Role | undefined {
  const victim = pos.board.get(move.to);
  if (victim && victim.color !== pos.turn) return victim.role;
  if (pos.board.get(move.from)?.role === "pawn" && move.to === pos.epSquare) return "pawn";
}

function lineFacts(fen: string, line: string[], color: Color, horizon: number) {
  const limit = line.slice(0, horizon + 4);
  const played = playLine(fen, limit);
  const valid = played.moves.length === limit.length && limit.length > 0;
  const mateAt = valid ? played.positions.findIndex((p) => p.isCheckmate()) : -1;
  const settled = settledBalance(fen, limit, color, horizon);
  const n = mateAt > 0 ? mateAt : settled.plies;
  const positions = played.positions.slice(0, n + 1);
  const moves = played.moves.slice(0, n) as NormalMove[];
  const end = positions.at(-1)!;
  const outcome: MaterialOutcome = { net: materialBalance(end, color) - materialBalance(positions[0], color), lost: [], won: [], promotions: [] };
  moves.forEach((m, i) => {
    const role = capturedRole(positions[i], m);
    if (role) (positions[i].turn === color ? outcome.won : outcome.lost).push(role);
    if (m.promotion) outcome.promotions.push({ color: positions[i].turn, role: m.promotion });
  });
  // A PV ending at a capture may be cut before a recapture. Do not sell that
  // temporary balance as material won. Promotions get the same protection.
  const last = moves.at(-1);
  const pendingRecapture = last && !end.isEnd() && [...end.allDests()].some(([from, dests]) =>
    dests.has(last.to) && parseStdUci(end, makeSquare(from) + makeSquare(last.to) + (end.board.get(from)?.role === "pawn" && (last.to < 8 || last.to >= 56) ? "q" : "")));
  const materialKnown = valid && !(n === limit.length && last && (capturedRole(positions[n - 1], last) || last.promotion) && pendingRecapture);
  const uci = limit.slice(0, n);
  const result: ExplainedLine = {
    uci, san: uci.map((u, i) => sanOf(fenOf(positions[i]), u)!), facts: [],
    marks: uci.length ? [{ ply: 0, arrows: [{ from: uci[0].slice(0, 2), to: uci[0].slice(2, 4) }] }] : [],
  };
  if (mateAt > 0) {
    const winner = opposite(end.turn);
    const movesToMate = moves.filter((_, i) => positions[i].turn === winner).length;
    if (movesToMate <= SHORT_MATE) result.facts.push({ kind: "mate", winner, moves: movesToMate, backRank: isBackRankMate(fen, uci) });
  }
  return { result, positions, moves, outcome, materialKnown, valid };
}

function fork(line: ReturnType<typeof lineFacts>, side: Color) {
  let seen = 0;
  for (let i = 0; i < line.moves.length && seen < 3; i++) {
    if (line.positions[i].turn !== side) continue;
    seen++;
    const after = line.positions[i + 1], sq = line.moves[i].to, piece = after.board.get(sq);
    if (!piece || !unpinned(after, sq, side)) continue;
    const attackers = attackersOf(after, sq, opposite(side));
    if (attackers.length && (!isDefended(after, sq, piece) || attackers.some((a) => {
      const r = after.board.get(a)!.role;
      return r !== "king" && PIECE_VALUE[r] < PIECE_VALUE[piece.role];
    }))) continue;
    const value = (r: Role) => r === "king" ? 99 : PIECE_VALUE[r];
    const targets = [...attacks(piece, sq, after.board.occupied)].flatMap((t) => {
      const p = after.board.get(t);
      return p && p.color !== side && p.role !== "pawn" && (value(p.role) > value(piece.role) || !isDefended(after, t, p)) ? [{ role: p.role, square: makeSquare(t) }] : [];
    });
    if (targets.length < 2) continue;
    line.result.facts.push({ kind: "fork", move: line.result.san[i], targets });
    line.result.marks.push({ ply: i + 1, arrows: targets.map((t) => ({ from: makeSquare(sq), to: t.square })) });
    return;
  }
}

function unpinned(pos: Chess, from: Square, color: Color): boolean {
  const king = pos.board.kingOf(color);
  return king !== undefined && pos.kingAttackers(king, opposite(color), pos.board.occupied.without(from)).isEmpty();
}

/** Extracts the two real lines and only the facts their positions can support. */
export function explainMove(input: ExplanationInput): MoveExplanation {
  const { fen, color, played, bestLine, refutation, tactic, probes } = input;
  const bad = lineFacts(fen, [played, ...refutation], color, TACTIC_HORIZON + 1);
  const good = lineFacts(fen, bestLine, color, TACTIC_HORIZON);
  const out: MoveExplanation = { played: bad.result, best: good.result };
  if (!bad.valid || !good.valid) return out;
  const pos = bad.positions[0], after = bad.positions[1];
  const pm = bad.moves[0], bm = good.moves[0], reply = bad.moves[1];
  if (!after || !pm || !bm) return out;
  const allowed = tactic?.tag.startsWith("allowed") || tactic?.tag === "hanging_piece";
  if (tactic) {
    for (const line of [bad, good]) {
      if (line.materialKnown && !line.result.facts.some((f) => f.kind === "mate")) line.result.facts.push({ kind: "material", outcome: line.outcome });
    }
  }
  if (reply && allowed && bad.materialKnown && bad.outcome.net <= -MATERIAL_SWING) {
    const victim = after.board.get(reply.to), mover = pos.board.get(pm.from)!;
    if (victim?.color === color) {
      if (tactic?.tag === "hanging_piece" && !isDefended(after, reply.to, victim)) {
        out.played.facts.unshift({ kind: "hanging", role: victim.role, square: makeSquare(reply.to), moved: pm.to === reply.to, reply: out.played.san[1] });
        out.played.marks.push({ ply: 1, arrows: [{ from: makeSquare(reply.from), to: makeSquare(reply.to) }] });
      } else if (pm.to !== reply.to && attacks(mover, pm.from, pos.board.occupied).has(reply.to) &&
        unpinned(pos, pm.from, color) && !isDefended(after, reply.to, victim)) {
        out.played.facts.unshift({ kind: "removed_defender", role: mover.role, from: makeSquare(pm.from), victim: victim.role, square: makeSquare(reply.to), reply: out.played.san[1] });
        out.played.marks[0].arrows.push({ from: makeSquare(pm.from), to: makeSquare(reply.to) });
      }
    }
    fork(bad, opposite(color));
  }
  if (tactic?.tag === "missed_capture" && good.materialKnown && good.outcome.net >= MATERIAL_SWING) {
    const victim = pos.board.get(bm.to), capturer = pos.board.get(bm.from)!;
    if (victim && victim.color !== color) out.best.facts.unshift({ kind: "free_capture", role: victim.role, square: makeSquare(bm.to), undefended: !isDefended(pos, bm.to, victim), capturer: capturer.role });
  }
  if (tactic?.tag === "missed_tactic" && good.materialKnown && good.outcome.net >= MATERIAL_SWING) fork(good, color);

  // A king move in this line loses existing castling rights; no claim that
  // every legal defence requires it, or that this explains the whole eval.
  if (!tactic && pos.castles.castlingRights.intersect(pos.board[color]).nonEmpty() &&
    bad.moves.slice(0, 3).some((m, i) => bad.positions[i].turn === color && bad.positions[i].board.get(m.from)?.role === "king" && Math.max(Math.abs(m.to % 8 - m.from % 8), Math.abs(Math.floor(m.to / 8) - Math.floor(m.from / 8))) === 1) &&
    good.positions.at(-1)!.castles.castlingRights.intersect(pos.board[color]).nonEmpty()) {
    out.played.facts.push({ kind: "castling_lost" });
  }

  const fens = explanationProbeFens(fen, bestLine[0]);
  const probe = (kind: keyof ExplanationProbes, side: Color) => {
    const ev = probes?.[kind], start = fens[kind];
    const pv = ev?.lines[0]?.pv;
    if (!ev || !start || !pv?.length) return;
    const line = lineFacts(start, pv, side, TACTIC_HORIZON);
    if (!line.valid) return;
    const mate = line.result.facts.find((f) => f.kind === "mate");
    // A short mate score with a cut-off PV cannot prove either the mate or
    // its absence. In particular it must never become a negative probe.
    if ("mate" in ev.score && Math.abs(ev.score.mate) <= SHORT_MATE && !mate) return;
    const threat = mate?.kind === "mate" ? mate.winner === side : line.materialKnown && line.outcome.net >= MATERIAL_SWING;
    return { line, threat, proof: { fen: start, uci: line.result.uci } };
  };
  const before = probe("before", opposite(color));
  if (before?.threat && before.proof.uci[0] === refutation[0]) {
    out.threatBefore = { kind: "already_present", move: before.line.result.san[0], proof: before.proof };
    out.played.marks[0].arrows.push({ from: refutation[0].slice(0, 2), to: refutation[0].slice(2, 4) });
  } else if (before && !before.threat && before.line.materialKnown && allowed) {
    out.threatBefore = { kind: "not_found" };
  }
  const next = probe("best", color);
  const follow = next?.line.moves[0], landed = good.positions[1]?.board.get(bm.to);
  if (next?.threat && follow && landed && !pos.board.get(bm.to) && follow.from === bm.to) {
    const victim = good.positions[1].board.get(follow.to), mover = pos.board.get(bm.from)!;
    if (victim && victim.color !== color && !attacks(mover, bm.from, pos.board.occupied).has(follow.to)) {
      out.best.facts.push({ kind: "new_attack", role: victim.role, square: makeSquare(follow.to), proof: next.proof });
      out.best.marks.push({ ply: 1, arrows: [{ from: makeSquare(bm.to), to: makeSquare(follow.to) }] });
    }
  }
  return out;
}
