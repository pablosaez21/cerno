// Shared types for the analysis core. Everything here is plain data so it can be
// cached in IndexedDB, sent across workers, and consumed by any interface.

export type Color = "white" | "black";
export type Source = "chesscom" | "lichess" | "pgn";
export type TimeClass =
  | "ultrabullet"
  | "bullet"
  | "blitz"
  | "rapid"
  | "classical"
  | "daily"
  | "unknown";

export type GameResult = "win" | "loss" | "draw";

/** How the game ended, normalised across sources. */
export type Termination =
  | "checkmate"
  | "resignation"
  | "timeout"
  | "draw"
  | "abandoned"
  | "unknown";

export interface PlayerInfo {
  name: string;
  rating?: number;
}

/** One game as fetched from a source, before any engine work. */
export interface GameRecord {
  /** Stable id: `${source}:${sourceId}`. */
  id: string;
  source: Source;
  url?: string;
  pgn: string;
  white: PlayerInfo;
  black: PlayerInfo;
  /** Colour played by the analysed player. */
  playerColor: Color;
  /** Result from the analysed player's point of view. */
  result: GameResult;
  termination: Termination;
  timeClass: TimeClass;
  /** Seconds. Absent for daily or unknown. */
  timeControl?: { base: number; increment: number };
  rated?: boolean;
  /** Milliseconds since epoch. */
  endTime?: number;
  /** Accuracy reported by the source (Chess.com `accuracies`), if any. */
  sourceAccuracy?: { player: number; opponent: number };
}

/** One half-move of a parsed game. */
export interface PlyRecord {
  /** 1-based ply index. Ply 1 is White's first move. */
  ply: number;
  moveNumber: number;
  color: Color;
  san: string;
  /** Standard UCI (castling as e1g1). */
  uci: string;
  fenBefore: string;
  fenAfter: string;
  /** Clock left after the move, seconds. */
  clockAfter?: number;
  /** Seconds spent on the move, including increment correction. */
  timeSpent?: number;
}

/** Engine score from White's point of view. `mate` > 0 means White mates. */
export type Score = { cp: number } | { mate: number };

export interface EngineLine {
  score: Score;
  /** Principal variation in standard UCI, starting from the analysed position. */
  pv: string[];
  depth: number;
}

export interface PositionEval {
  /** Lines ordered best first (MultiPV). Empty for terminal positions. */
  lines: EngineLine[];
  /** Score of the position from White's point of view. */
  score: Score;
  nodes: number;
  /** True when the position is checkmate, stalemate or dead (no engine call). */
  terminal?: boolean;
}
