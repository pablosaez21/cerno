// Style profile: which kinds of moves the player chooses more or less often than
// Lichess blitz players of the same Elo (Maia-3) in the same positions, with the
// opponents of the same games as control. Needs Maia only (no Stockfish).
import type { Chess } from "chessops/chess";
import { attacks } from "chessops/attacks";
import type { NormalMove } from "chessops/types";
import { parseStdUci, PIECE_VALUE, positionFromFen } from "./chess";
import type { MaiaPrediction } from "./maia";
import type { Decision } from "./peers";
import { bootstrapIndices } from "./peer-stats";

export const STYLE_ATTRIBUTES = [
  "capture",
  "check",
  "pawn_move",
  "equal_trade",
  "queen_trade",
  "castling",
  "king_move",
  "knight_move",
  "bishop_move",
  "rook_move",
  "queen_move",
  "retreat",
  "advance",
  "to_attacked_square",
  "king_side_pawn_move",
] as const;
export type StyleAttribute = (typeof STYLE_ATTRIBUTES)[number];

/** Levels whose full policy is kept for style: -400, 0, +400. */
export const STYLE_LEVELS = [0, 2, 4] as const;
/** |z| for a trait; with 15 attributes keeps the chance of any false trait under 5%. */
export const STYLE_TRAIT_Z = 3;

function squareAttackedBy(pos: Chess, sq: number, color: "white" | "black", occupied = pos.board.occupied): boolean {
  for (const s of pos.board[color]) {
    const piece = pos.board.get(s)!;
    if (attacks(piece, s, occupied).has(sq)) return true;
  }
  return false;
}

/** The 15 attributes of one move, as 0/1. */
export function moveAttributes(pos: Chess, uci: string, moveNumber: number): number[] {
  const mv = parseStdUci(pos, uci) as NormalMove | undefined;
  if (!mv) return STYLE_ATTRIBUTES.map(() => 0);
  const me = pos.turn;
  const opp = me === "white" ? "black" : "white";
  const piece = pos.board.get(mv.from)!;
  const target = pos.board.get(mv.to);
  const castling = piece.role === "king" && (target?.role === "rook" && target.color === me || Math.abs((mv.to % 8) - (mv.from % 8)) === 2);
  const ep = piece.role === "pawn" && pos.epSquare === mv.to;
  const captured = target && target.color !== me ? target : ep ? { role: "pawn" as const } : undefined;
  const after = pos.clone();
  after.play(mv);
  const rank = (sq: number) => Math.floor(sq / 8);
  const forward = me === "white" ? rank(mv.to) - rank(mv.from) : rank(mv.from) - rank(mv.to);
  const minorOrMajor = piece.role !== "king" && piece.role !== "pawn";
  const landing = castling ? undefined : mv.to;
  const king = pos.board.kingOf(me);
  const v = PIECE_VALUE;
  const a: Record<StyleAttribute, boolean> = {
    capture: !!captured,
    check: after.isCheck(),
    pawn_move: piece.role === "pawn",
    equal_trade: !!captured && v[piece.role] === v[captured.role] && v[piece.role] >= 3,
    queen_trade: piece.role === "queen" && captured?.role === "queen",
    castling: !!castling,
    king_move: piece.role === "king" && !castling,
    knight_move: piece.role === "knight",
    bishop_move: piece.role === "bishop",
    rook_move: piece.role === "rook" && !castling,
    queen_move: piece.role === "queen",
    retreat: minorOrMajor && forward < 0,
    advance: minorOrMajor && forward > 0,
    to_attacked_square: landing !== undefined && squareAttackedBy(after, landing, opp),
    king_side_pawn_move: piece.role === "pawn" && moveNumber > 8 && king !== undefined && Math.abs((mv.from % 8) - (king % 8)) <= 1,
  };
  return STYLE_ATTRIBUTES.map((k) => (a[k] ? 1 : 0));
}

export interface StyleAttr {
  /** Attributes of the move played. */
  observed: number[];
  /** Expected share of each attribute under the full Maia policy at -400, 0, +400. */
  expected: number[][];
}

export function styleAttr(fen: string, played: string, moveNumber: number, preds: MaiaPrediction[]): StyleAttr {
  const pos = positionFromFen(fen);
  const cache = new Map<string, number[]>();
  const attrOf = (u: string) => {
    let x = cache.get(u);
    if (!x) {
      x = moveAttributes(pos, u, moveNumber);
      cache.set(u, x);
    }
    return x;
  };
  const expected = STYLE_LEVELS.map((level) => {
    const e = STYLE_ATTRIBUTES.map(() => 0);
    for (const [u, p] of Object.entries(preds[level].policy)) {
      const x = attrOf(u);
      for (let k = 0; k < e.length; k++) e[k] += p * x[k];
    }
    return e.map((y) => Math.round(y * 1e5) / 1e5);
  });
  return { observed: attrOf(played), expected };
}

export interface StyleTrait {
  attribute: StyleAttribute;
  decisions: number;
  /** Share of the player's moves with the attribute, and Maia's expectation at his Elo, -400 and +400. */
  observed: number;
  expected: number;
  expectedMinus400: number;
  expectedPlus400: number;
  z: number;
  zOpponents: number;
  /** (player's observed minus expected) minus (opponents' observed minus expected), over its bootstrap SD. */
  zControlled: number;
  controlled: number;
  trait: boolean;
}

/** Style traits over in-scope decisions with style attributes. */
export function styleTraits(decisions: (Decision & { attr?: StyleAttr })[]): StyleTrait[] {
  const ds = decisions.filter((d) => d.inScope && d.attr);
  const gameIds = [...new Set(ds.map((d) => d.gameId))].sort();
  if (!gameIds.length) return [];
  const gi = new Map(gameIds.map((g, i) => [g, i]));
  const boot = bootstrapIndices(gameIds.length);
  return STYLE_ATTRIBUTES.map((attribute, k) => {
    const side = (mover: "player" | "opponent") => {
      const rows = ds.filter((d) => d.mover === mover);
      const perGame = gameIds.map(() => ({ diff: 0, n: 0 }));
      let o = 0, e = 0, v = 0, eMinus = 0, ePlus = 0;
      for (const d of rows) {
        const oi = d.attr!.observed[k];
        const ei = d.attr!.expected[1][k];
        o += oi;
        e += ei;
        v += ei * (1 - ei);
        eMinus += d.attr!.expected[0][k];
        ePlus += d.attr!.expected[2][k];
        const pg = perGame[gi.get(d.gameId)!];
        pg.diff += oi - ei;
        pg.n++;
      }
      return { n: rows.length, o, e, v, eMinus, ePlus, perGame };
    };
    const P = side("player");
    const R = side("opponent");
    const z = (s: typeof P) => (s.v > 0 ? (s.o - s.e) / Math.sqrt(s.v) : 0);
    const rate = (s: typeof P, idx?: Int32Array) => {
      let diff = 0, n = 0;
      for (const g of idx ?? gameIds.map((_, i) => i)) {
        diff += s.perGame[g].diff;
        n += s.perGame[g].n;
      }
      return n ? diff / n : 0;
    };
    const controlled = rate(P) - rate(R);
    const bs = boot.map((idx) => rate(P, idx) - rate(R, idx));
    const m = bs.reduce((a, b) => a + b, 0) / bs.length;
    const sd = Math.sqrt(bs.reduce((a, x) => a + (x - m) ** 2, 0) / bs.length);
    // Without variation between games the bootstrap has no spread: fall back to the binomial SE.
    const se = sd > 0 ? sd : Math.sqrt(P.v / Math.max(1, P.n) ** 2 + R.v / Math.max(1, R.n) ** 2);
    const zc = se > 0 ? controlled / se : 0;
    const r = (x: number, d = 4) => Math.round(x * 10 ** d) / 10 ** d;
    return {
      attribute,
      decisions: P.n,
      observed: r(P.o / Math.max(1, P.n)),
      expected: r(P.e / Math.max(1, P.n)),
      expectedMinus400: r(P.eMinus / Math.max(1, P.n)),
      expectedPlus400: r(P.ePlus / Math.max(1, P.n)),
      z: r(z(P), 2),
      zOpponents: r(z(R), 2),
      zControlled: r(zc, 2),
      controlled: r(controlled),
      trait: Math.abs(zc) >= STYLE_TRAIT_Z && Math.abs(z(R)) < STYLE_TRAIT_Z,
    };
  });
}
