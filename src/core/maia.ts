// Maia-3 input encoding and output decoding, ported from the official code
// (CSSLab/maia3, AGPL-3.0: maia3/dataset.py, maia3/utils.py, maia3/models.py).
// Pure TypeScript: the model itself runs in an adapter (src/core/maia-browser.ts).
import { positionFromFen, parseStdUci, toStdUci } from "./chess";

export const MAIA_HISTORY = 8;
export const MAIA_CHANNELS = 12;
export const MAIA_TOKEN_DIM = MAIA_CHANNELS * MAIA_HISTORY; // 96 floats per square
export const MAIA_VOCAB = 4096 + 256;
/** The model clamps Elo to [0, 5000] and interpolates linearly; training covers ~600-2600. */
export const MAIA_ELO_RANGE: [number, number] = [0, 5000];

const PIECE_CHANNEL: Record<string, number> = { P: 0, N: 1, B: 2, R: 3, Q: 4, K: 5, p: 6, n: 7, b: 8, r: 9, q: 10, k: 11 };
const PROMO = ["q", "r", "b", "n"];

/**
 * The board as the official tokenizer sees it: 64 chars, a1..h8, mirrored
 * (ranks flipped and colours swapped) when Black is to move.
 */
export function maiaBoardString(fen: string): string {
  const [placement, turn] = fen.split(" ");
  const squares: string[] = Array(64).fill(".");
  placement.split("/").forEach((row, i) => {
    let file = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) file += Number(ch);
      else {
        squares[(7 - i) * 8 + file] = ch;
        file++;
      }
    }
  });
  if (turn !== "b") return squares.join("");
  const mirrored: string[] = Array(64).fill(".");
  for (let sq = 0; sq < 64; sq++) {
    const p = squares[sq];
    mirrored[sq ^ 56] = p === "." ? "." : p === p.toUpperCase() ? p.toLowerCase() : p.toUpperCase();
  }
  return mirrored.join("");
}

/**
 * Tokens for one position with its history: Float32Array of 64 x 96, square-major,
 * channel = 12 * historySlot + piece. `fens` is oldest first and ends with the
 * position to move from; short histories are padded with the earliest position.
 */
export function encodePosition(fens: string[], out = new Float32Array(64 * MAIA_TOKEN_DIM), offset = 0): Float32Array {
  const hist = fens.slice(-MAIA_HISTORY);
  const padded = [...Array(MAIA_HISTORY - hist.length).fill(hist[0]), ...hist];
  out.fill(0, offset, offset + 64 * MAIA_TOKEN_DIM);
  padded.forEach((fen, slot) => {
    const board = maiaBoardString(fen);
    for (let sq = 0; sq < 64; sq++) {
      const ch = board[sq];
      if (ch !== ".") out[offset + sq * MAIA_TOKEN_DIM + slot * MAIA_CHANNELS + PIECE_CHANNEL[ch]] = 1;
    }
  });
  return out;
}

const sqIndex = (s: string) => (Number(s[1]) - 1) * 8 + (s.charCodeAt(0) - 97);
const mirrorUci = (u: string) => `${u[0]}${9 - Number(u[1])}${u[2]}${9 - Number(u[3])}${u.slice(4)}`;

/** Vocabulary index of a standard UCI move played in `fen` (side to move). */
export function maiaMoveIndex(uci: string, blackToMove: boolean): number {
  const u = blackToMove ? mirrorUci(uci) : uci;
  const from = sqIndex(u.slice(0, 2));
  const to = sqIndex(u.slice(2, 4));
  if (u.length === 5) {
    const fromFile = from % 8;
    const toFile = to % 8;
    return 4096 + (fromFile * 8 + toFile) * 4 + PROMO.indexOf(u[4]);
  }
  return from * 64 + to;
}

/** Legal moves of `fen` with their vocabulary index. */
export function maiaLegalMoves(fen: string): { uci: string; index: number }[] {
  const pos = positionFromFen(fen);
  const black = pos.turn === "black";
  const out: { uci: string; index: number }[] = [];
  for (const [from, dests] of pos.allDests()) {
    for (const to of dests) {
      const piece = pos.board.get(from)!;
      const toRank = Math.floor(to / 8);
      const promos = piece.role === "pawn" && (toRank === 7 || toRank === 0) ? PROMO : [undefined];
      for (const p of promos) {
        const move = { from, to, promotion: p ? ({ q: "queen", r: "rook", b: "bishop", n: "knight" } as const)[p as "q"] : undefined };
        const uci = toStdUci(pos, move);
        // chessops lists castling twice (king to rook and king two squares); keep one.
        if (out.some((m) => m.uci === uci)) continue;
        if (!parseStdUci(pos, uci)) continue;
        out.push({ uci, index: maiaMoveIndex(uci, black) });
      }
    }
  }
  return out;
}

export interface MaiaPrediction {
  /** Probability per legal move (standard UCI), sums to 1. */
  policy: Record<string, number>;
  /** [loss, draw, win] for the side to move. */
  wdl: [number, number, number];
}

/** Masked softmax over legal moves, and WDL from the value head. */
/** Legal moves of the last positions decoded: a position is queried at several Elo levels in a row. */
const legalCache = new Map<string, { uci: string; index: number }[]>();
function cachedLegalMoves(fen: string): { uci: string; index: number }[] {
  let legal = legalCache.get(fen);
  if (!legal) {
    legal = maiaLegalMoves(fen);
    if (legalCache.size >= 512) legalCache.clear();
    legalCache.set(fen, legal);
  }
  return legal;
}

export function decodePrediction(fen: string, logitsMove: ArrayLike<number>, logitsValue: ArrayLike<number>, moveOffset = 0, valueOffset = 0): MaiaPrediction {
  const legal = cachedLegalMoves(fen);
  let max = -Infinity;
  for (const m of legal) max = Math.max(max, logitsMove[moveOffset + m.index]);
  let total = 0;
  const exps = legal.map((m) => {
    const e = Math.exp(logitsMove[moveOffset + m.index] - max);
    total += e;
    return e;
  });
  const policy: Record<string, number> = {};
  legal.forEach((m, i) => (policy[m.uci] = exps[i] / total));
  const v = [0, 1, 2].map((i) => logitsValue[valueOffset + i]);
  const vm = Math.max(...v);
  const ve = v.map((x) => Math.exp(x - vm));
  const vs = ve[0] + ve[1] + ve[2];
  return { policy, wdl: [ve[0] / vs, ve[1] / vs, ve[2] / vs] };
}

/** Moves sorted by probability, most likely first. */
export function rankedMoves(p: MaiaPrediction): { uci: string; p: number }[] {
  return Object.entries(p.policy)
    .map(([uci, prob]) => ({ uci, p: prob }))
    .sort((a, b) => b.p - a.p);
}
