// Game sources: Chess.com public API, Lichess export API and PGN files.
// All three normalise to GameRecord. Network calls take an injectable fetch.
import { parsePgn } from "chessops/pgn";
import type { Color, GameRecord, GameResult, Termination, TimeClass } from "./types";

export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

export interface FetchOptions {
  max: number;
  /** Keep only these time classes. Empty or undefined keeps all. */
  timeClasses?: TimeClass[];
  fetchFn?: FetchFn;
  signal?: AbortSignal;
  onProgress?: (found: number) => void;
}

const sameName = (a: string | undefined, b: string) => a?.toLowerCase() === b.toLowerCase();

// ---------------------------------------------------------------- Chess.com

const CHESSCOM_DRAW = new Set([
  "agreed",
  "repetition",
  "stalemate",
  "insufficient",
  "50move",
  "timevsinsufficient",
]);

function chesscomTermination(code: string): Termination {
  if (code === "checkmated") return "checkmate";
  if (code === "resigned") return "resignation";
  if (code === "timeout") return "timeout";
  if (code === "abandoned") return "abandoned";
  if (CHESSCOM_DRAW.has(code)) return "draw";
  return "unknown";
}

interface ChesscomSide {
  username: string;
  rating?: number;
  result: string;
}
interface ChesscomGame {
  url: string;
  pgn?: string;
  uuid?: string;
  time_control?: string;
  time_class?: string;
  rated?: boolean;
  rules?: string;
  end_time?: number;
  initial_setup?: string;
  white: ChesscomSide;
  black: ChesscomSide;
  accuracies?: { white: number; black: number };
}

export function parseTimeControl(tc: string | undefined): GameRecord["timeControl"] {
  if (!tc || tc === "-" || tc.includes("/")) return undefined; // daily: "1/86400"
  const [base, inc] = tc.split("+").map(Number);
  if (!Number.isFinite(base)) return undefined;
  return { base, increment: Number.isFinite(inc) ? inc : 0 };
}

/** Lichess speed estimate: base + 40 * increment. */
export function timeClassFromControl(tc: GameRecord["timeControl"]): TimeClass {
  if (!tc) return "unknown";
  const total = tc.base + 40 * tc.increment;
  if (total < 30) return "ultrabullet";
  if (total < 180) return "bullet";
  if (total < 480) return "blitz";
  if (total < 1500) return "rapid";
  return "classical";
}

const STANDARD_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export function normalizeChesscomGame(g: ChesscomGame, username: string): GameRecord | undefined {
  if (g.rules !== "chess" || !g.pgn) return undefined;
  if (g.initial_setup && g.initial_setup !== STANDARD_FEN) return undefined;
  const playerColor: Color | undefined = sameName(g.white.username, username)
    ? "white"
    : sameName(g.black.username, username)
      ? "black"
      : undefined;
  if (!playerColor) return undefined;
  const me = g[playerColor];
  const them = g[playerColor === "white" ? "black" : "white"];
  const result: GameResult =
    me.result === "win" ? "win" : CHESSCOM_DRAW.has(me.result) ? "draw" : "loss";
  const termination = chesscomTermination(result === "win" ? them.result : me.result);
  const timeControl = parseTimeControl(g.time_control);
  const timeClass = (["bullet", "blitz", "rapid", "daily"] as const).find((t) => t === g.time_class) ?? timeClassFromControl(timeControl);
  return {
    id: `chesscom:${g.uuid ?? g.url}`,
    source: "chesscom",
    url: g.url,
    pgn: g.pgn,
    white: { name: g.white.username, rating: g.white.rating },
    black: { name: g.black.username, rating: g.black.rating },
    playerColor,
    result,
    termination,
    timeClass,
    timeControl,
    rated: g.rated,
    endTime: g.end_time ? g.end_time * 1000 : undefined,
    sourceAccuracy: g.accuracies
      ? {
          player: g.accuracies[playerColor],
          opponent: g.accuracies[playerColor === "white" ? "black" : "white"],
        }
      : undefined,
  };
}

/**
 * Walks the monthly archives backwards, one request at a time (Chess.com asks
 * clients to avoid parallel requests), until `max` games are collected.
 */
export async function fetchChesscomGames(username: string, opts: FetchOptions): Promise<GameRecord[]> {
  const f = opts.fetchFn ?? fetch;
  const user = encodeURIComponent(username.trim().toLowerCase());
  const res = await f(`https://api.chess.com/pub/player/${user}/games/archives`, { signal: opts.signal });
  if (res.status === 404) throw new SourceError("not_found", `Chess.com: no existe el usuario ${username}`);
  if (!res.ok) throw new SourceError("http", `Chess.com respondió ${res.status}`);
  const { archives } = (await res.json()) as { archives: string[] };
  const out: GameRecord[] = [];
  for (const url of [...archives].reverse()) {
    const r = await f(url, { signal: opts.signal });
    if (r.status === 429) throw new SourceError("rate_limited", "Chess.com limita las peticiones; espera un minuto");
    if (!r.ok) throw new SourceError("http", `Chess.com respondió ${r.status}`);
    const { games } = (await r.json()) as { games: ChesscomGame[] };
    const month = games
      .map((g) => normalizeChesscomGame(g, username))
      .filter((g): g is GameRecord => !!g && keepClass(g, opts.timeClasses))
      .sort((a, b) => (b.endTime ?? 0) - (a.endTime ?? 0));
    out.push(...month);
    opts.onProgress?.(Math.min(out.length, opts.max));
    if (out.length >= opts.max) break;
  }
  return out.slice(0, opts.max);
}

function keepClass(g: GameRecord, classes: TimeClass[] | undefined): boolean {
  return !classes?.length || classes.includes(g.timeClass);
}

// ---------------------------------------------------------------- Lichess

interface LichessGame {
  id: string;
  rated?: boolean;
  variant: string;
  speed?: string;
  status: string;
  lastMoveAt?: number;
  createdAt?: number;
  winner?: Color;
  pgn?: string;
  clock?: { initial: number; increment: number };
  initialFen?: string;
  players: Record<Color, { user?: { name: string }; rating?: number; aiLevel?: number }>;
}

function lichessTermination(status: string): Termination {
  if (status === "mate") return "checkmate";
  if (status === "resign") return "resignation";
  if (status === "outoftime") return "timeout";
  if (status === "timeout") return "abandoned";
  if (status === "draw" || status === "stalemate") return "draw";
  return "unknown";
}

export function normalizeLichessGame(g: LichessGame, username: string): GameRecord | undefined {
  if (g.variant !== "standard" || !g.pgn || g.initialFen) return undefined;
  const nameOf = (c: Color) => g.players[c].user?.name ?? (g.players[c].aiLevel ? `Stockfish ${g.players[c].aiLevel}` : "?");
  const playerColor: Color | undefined = sameName(nameOf("white"), username)
    ? "white"
    : sameName(nameOf("black"), username)
      ? "black"
      : undefined;
  if (!playerColor) return undefined;
  if (["created", "started", "aborted", "noStart", "unknownFinish"].includes(g.status)) return undefined;
  const result: GameResult = !g.winner ? "draw" : g.winner === playerColor ? "win" : "loss";
  const timeControl = g.clock ? { base: g.clock.initial, increment: g.clock.increment } : undefined;
  const speed = (["ultraBullet", "bullet", "blitz", "rapid", "classical", "correspondence"] as const).find((s) => s === g.speed);
  const timeClass: TimeClass =
    speed === "ultraBullet" ? "ultrabullet" : speed === "correspondence" ? "daily" : (speed ?? timeClassFromControl(timeControl));
  return {
    id: `lichess:${g.id}`,
    source: "lichess",
    url: `https://lichess.org/${g.id}${playerColor === "black" ? "/black" : ""}`,
    pgn: g.pgn,
    white: { name: nameOf("white"), rating: g.players.white.rating },
    black: { name: nameOf("black"), rating: g.players.black.rating },
    playerColor,
    result,
    termination: lichessTermination(g.status),
    timeClass,
    timeControl,
    rated: g.rated,
    endTime: g.lastMoveAt ?? g.createdAt,
  };
}

const LICHESS_PERF: Partial<Record<TimeClass, string>> = {
  ultrabullet: "ultraBullet",
  bullet: "bullet",
  blitz: "blitz",
  rapid: "rapid",
  classical: "classical",
  daily: "correspondence",
};

export function lichessUrl(username: string, max: number, timeClasses?: TimeClass[]): string {
  const params = new URLSearchParams({
    max: String(max),
    clocks: "true",
    opening: "true",
    pgnInJson: "true",
  });
  const perfs = (timeClasses ?? []).map((t) => LICHESS_PERF[t]).filter(Boolean);
  if (perfs.length) params.set("perfType", perfs.join(","));
  return `https://lichess.org/api/games/user/${encodeURIComponent(username.trim())}?${params}`;
}

export async function fetchLichessGames(username: string, opts: FetchOptions): Promise<GameRecord[]> {
  const f = opts.fetchFn ?? fetch;
  // Ask for a margin: variants and unfinished games are filtered out client-side.
  const res = await f(lichessUrl(username, Math.ceil(opts.max * 1.2) + 5, opts.timeClasses), {
    headers: { Accept: "application/x-ndjson" },
    signal: opts.signal,
  });
  if (res.status === 404) throw new SourceError("not_found", `Lichess: no existe el usuario ${username}`);
  if (res.status === 429) throw new SourceError("rate_limited", "Lichess limita las peticiones; espera un minuto");
  if (!res.ok) throw new SourceError("http", `Lichess respondió ${res.status}`);
  const text = await res.text();
  const out: GameRecord[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const g = normalizeLichessGame(JSON.parse(line) as LichessGame, username);
    if (g && keepClass(g, opts.timeClasses)) out.push(g);
    if (out.length >= opts.max) break;
  }
  opts.onProgress?.(out.length);
  return out;
}

// ---------------------------------------------------------------- PGN file

export interface PgnPlayerGuess {
  /** Names ordered by number of games, most frequent first. */
  candidates: { name: string; games: number }[];
  /** Set when one name clearly dominates; otherwise the UI must ask. */
  player?: string;
}

export function guessPgnPlayer(text: string): PgnPlayerGuess {
  const counts = new Map<string, number>();
  for (const game of parsePgn(text)) {
    for (const key of ["White", "Black"]) {
      const name = game.headers.get(key)?.trim();
      if (name && name !== "?") counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  const candidates = [...counts.entries()]
    .map(([name, games]) => ({ name, games }))
    .sort((a, b) => b.games - a.games || a.name.localeCompare(b.name));
  const [first, second] = candidates;
  const player = first && (!second || first.games > second.games) ? first.name : undefined;
  return { candidates, player };
}

function pgnTermination(headers: Map<string, string>, result: string): Termination {
  const t = (headers.get("Termination") ?? "").toLowerCase();
  if (t.includes("time")) return "timeout";
  if (t.includes("checkmate")) return "checkmate";
  if (t.includes("resign")) return "resignation";
  if (t.includes("abandon")) return "abandoned";
  if (result === "1/2-1/2") return "draw";
  return "unknown";
}

/** Splits a multi-game PGN file and keeps the games played by `player`. */
export function readPgnFile(text: string, player: string, opts: Pick<FetchOptions, "max" | "timeClasses"> = { max: Infinity }): GameRecord[] {
  const out: GameRecord[] = [];
  const chunks = splitPgn(text);
  chunks.forEach((chunk, index) => {
    const [game] = parsePgn(chunk);
    if (!game) return;
    const h = game.headers;
    const variant = (h.get("Variant") ?? "standard").toLowerCase();
    if (variant !== "standard" || h.has("FEN") || h.get("SetUp") === "1") return;
    const white = h.get("White") ?? "?";
    const black = h.get("Black") ?? "?";
    const playerColor: Color | undefined = sameName(white, player) ? "white" : sameName(black, player) ? "black" : undefined;
    if (!playerColor) return;
    const res = h.get("Result") ?? "*";
    if (res === "*") return;
    const result: GameResult =
      res === "1/2-1/2" ? "draw" : (res === "1-0") === (playerColor === "white") ? "win" : "loss";
    const timeControl = parseTimeControl(h.get("TimeControl"));
    const g: GameRecord = {
      id: `pgn:${h.get("Link") ?? h.get("Site") ?? ""}:${h.get("Date") ?? ""}:${h.get("UTCTime") ?? h.get("EndTime") ?? ""}:${white}:${black}:${index}`,
      source: "pgn",
      url: urlOf(h.get("Link") ?? h.get("Site")),
      pgn: chunk,
      white: { name: white, rating: num(h.get("WhiteElo")) },
      black: { name: black, rating: num(h.get("BlackElo")) },
      playerColor,
      result,
      termination: pgnTermination(h, res),
      timeClass: timeClassFromControl(timeControl),
      timeControl,
      endTime: dateOf(h.get("UTCDate") ?? h.get("Date"), h.get("UTCTime") ?? h.get("EndTime")),
    };
    if (keepClass(g, opts.timeClasses)) out.push(g);
  });
  // Most recent first when dates are known, keeping file order otherwise.
  return out
    .map((g, i) => ({ g, i }))
    .sort((a, b) => (b.g.endTime ?? -b.i) - (a.g.endTime ?? -a.i))
    .map(({ g }) => g)
    .slice(0, opts.max);
}

/** Splits a PGN file into one string per game (header block + movetext). */
export function splitPgn(text: string): string[] {
  const games: string[] = [];
  let current: string[] = [];
  let inMoves = false;
  for (const line of text.replace(/\r\n?/g, "\n").split("\n")) {
    const isHeader = line.startsWith("[");
    if (isHeader && inMoves) {
      games.push(current.join("\n").trim());
      current = [];
      inMoves = false;
    }
    if (!isHeader && line.trim()) inMoves = true;
    current.push(line);
  }
  if (current.join("").trim()) games.push(current.join("\n").trim());
  return games;
}

function num(s: string | undefined): number | undefined {
  const n = Number(s);
  return s && Number.isFinite(n) ? n : undefined;
}

function urlOf(s: string | undefined): string | undefined {
  return s && /^https?:\/\//.test(s) ? s : undefined;
}

function dateOf(date: string | undefined, time: string | undefined): number | undefined {
  if (!date || date.includes("?")) return undefined;
  const t = Date.parse(`${date.replace(/\./g, "-")}T${time && /^\d\d:\d\d/.test(time) ? time : "00:00:00"}Z`);
  return Number.isFinite(t) ? t : undefined;
}

export class SourceError extends Error {
  constructor(
    public readonly code: "not_found" | "rate_limited" | "http",
    message: string,
  ) {
    super(message);
  }
}
