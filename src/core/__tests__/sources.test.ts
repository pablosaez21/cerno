import { describe, expect, it } from "vitest";
import { parseGameMoves } from "../game";
import {
  fetchChesscomGames,
  fetchLichessGames,
  guessPgnPlayer,
  lichessUrl,
  normalizeChesscomGame,
  readPgnFile,
  SourceError,
  splitPgn,
  timeClassFromControl,
  type FetchFn,
} from "../sources";

const PGN_CLOCKS = `[Event "Live Chess"]
[White "alice"]
[Black "bob"]
[Result "0-1"]
[TimeControl "180+2"]
[Termination "bob won by resignation"]

1. e4 {[%clk 0:03:01]} 1... e5 {[%clk 0:02:59.5]} 2. Nf3 {[%clk 0:02:58]} 2... Nc6 {[%clk 0:03:00]} 3. Bc4 {[%clk 0:02:50]} 3... Nf6 {[%clk 0:02:55]} 4. O-O {[%clk 0:02:45]} 0-1`;

function chesscomGame(overrides: Record<string, unknown> = {}) {
  return {
    url: "https://www.chess.com/game/live/1",
    uuid: "u1",
    pgn: PGN_CLOCKS,
    time_control: "180+2",
    time_class: "blitz",
    rated: true,
    rules: "chess",
    end_time: 1_700_000_000,
    white: { username: "Alice", rating: 1500, result: "resigned" },
    black: { username: "bob", rating: 1510, result: "win" },
    accuracies: { white: 70.5, black: 80.1 },
    ...overrides,
  };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("Chess.com", () => {
  it("normalises a game from the player's side", () => {
    const g = normalizeChesscomGame(chesscomGame(), "alice")!;
    expect(g.playerColor).toBe("white");
    expect(g.result).toBe("loss");
    expect(g.termination).toBe("resignation");
    expect(g.timeControl).toEqual({ base: 180, increment: 2 });
    expect(g.timeClass).toBe("blitz");
    expect(g.sourceAccuracy).toEqual({ player: 70.5, opponent: 80.1 });
    expect(g.endTime).toBe(1_700_000_000_000);
  });

  it("drops variants and games of other players", () => {
    expect(normalizeChesscomGame(chesscomGame({ rules: "chess960" }), "alice")).toBeUndefined();
    expect(normalizeChesscomGame(chesscomGame(), "carol")).toBeUndefined();
  });

  it("maps draw codes", () => {
    const g = normalizeChesscomGame(chesscomGame({ white: { username: "alice", result: "repetition" }, black: { username: "bob", result: "repetition" } }), "alice")!;
    expect(g.result).toBe("draw");
    expect(g.termination).toBe("draw");
  });

  it("walks archives backwards, serially, until N games", async () => {
    const calls: string[] = [];
    const fetchFn: FetchFn = async (url) => {
      calls.push(url);
      if (url.endsWith("/archives")) return json({ archives: ["https://a/2026/09", "https://a/2026/10", "https://a/2026/11"] });
      const month = url.slice(-2);
      return json({ games: [1, 2].map((i) => chesscomGame({ uuid: `${month}-${i}`, end_time: Number(month) * 100 + i })) });
    };
    const games = await fetchChesscomGames("Alice", { max: 3, fetchFn });
    expect(calls).toEqual(["https://api.chess.com/pub/player/alice/games/archives", "https://a/2026/11", "https://a/2026/10"]);
    expect(games.map((g) => g.id)).toEqual(["chesscom:11-2", "chesscom:11-1", "chesscom:10-2"]);
  });

  it("filters by time class and reports missing users", async () => {
    const fetchFn: FetchFn = async (url) =>
      url.endsWith("/archives") ? json({ archives: ["m"] }) : json({ games: [chesscomGame(), chesscomGame({ uuid: "r", time_class: "rapid", time_control: "600" })] });
    expect((await fetchChesscomGames("alice", { max: 10, fetchFn, timeClasses: ["rapid"] })).map((g) => g.id)).toEqual(["chesscom:r"]);
    await expect(fetchChesscomGames("nobody", { max: 1, fetchFn: async () => json({}, 404) })).rejects.toBeInstanceOf(SourceError);
  });
});

describe("Lichess", () => {
  const line = (o: Record<string, unknown>) =>
    JSON.stringify({
      id: "abc",
      rated: true,
      variant: "standard",
      speed: "blitz",
      status: "outoftime",
      winner: "black",
      lastMoveAt: 1,
      clock: { initial: 300, increment: 3 },
      players: { white: { user: { name: "Alice" }, rating: 1600 }, black: { user: { name: "Bob" }, rating: 1650 } },
      pgn: PGN_CLOCKS,
      ...o,
    });

  it("builds the export URL with clocks, openings and perf filter", () => {
    const u = new URL(lichessUrl("Alice", 100, ["blitz", "rapid"]));
    expect(u.pathname).toBe("/api/games/user/Alice");
    expect(u.searchParams.get("clocks")).toBe("true");
    expect(u.searchParams.get("pgnInJson")).toBe("true");
    expect(u.searchParams.get("perfType")).toBe("blitz,rapid");
  });

  it("reads NDJSON, skips variants and keeps N", async () => {
    const body = [line({}), line({ id: "v", variant: "chess960" }), line({ id: "c" })].join("\n") + "\n";
    let accept = "";
    const fetchFn: FetchFn = async (_u, init) => {
      accept = new Headers(init?.headers).get("Accept") ?? "";
      return new Response(body);
    };
    const games = await fetchLichessGames("alice", { max: 5, fetchFn });
    expect(accept).toBe("application/x-ndjson");
    expect(games.map((g) => g.id)).toEqual(["lichess:abc", "lichess:c"]);
    expect(games[0]).toMatchObject({ playerColor: "white", result: "loss", termination: "timeout", timeClass: "blitz" });
  });
});

describe("PGN files", () => {
  const other = PGN_CLOCKS.replace('[White "alice"]', '[White "carol"]');
  const third = PGN_CLOCKS.replace('[White "alice"]', '[White "dave"]');
  // bob plays all three games.
  const file = [PGN_CLOCKS, other, third].join("\n\n");

  it("splits games and guesses the most frequent name", () => {
    expect(splitPgn(file)).toHaveLength(3);
    const guess = guessPgnPlayer(file);
    expect(guess.player).toBe("bob");
    expect(guess.candidates[0]).toEqual({ name: "bob", games: 3 });
  });

  it("asks when two names tie", () => {
    expect(guessPgnPlayer(PGN_CLOCKS).player).toBeUndefined();
  });

  it("keeps the chosen player's games with colour and result", () => {
    const games = readPgnFile(file, "bob");
    expect(games).toHaveLength(3);
    expect(readPgnFile(file, "alice")).toHaveLength(1);
    expect(games[0]).toMatchObject({ playerColor: "black", result: "win", timeClass: "blitz", termination: "resignation" });
  });
});

describe("moves and clocks", () => {
  it("parses SAN to standard UCI, FENs and time spent with increment", () => {
    const { plies } = parseGameMoves({ pgn: PGN_CLOCKS, timeControl: { base: 180, increment: 2 } });
    expect(plies).toHaveLength(7);
    expect(plies[6]).toMatchObject({ san: "O-O", uci: "e1g1", color: "white", moveNumber: 4, clockAfter: 165 });
    // White: 180 -> 181 (first move +2): spent 1 s. Then 181 -> 178: 3 + 2 = 5 s.
    expect(plies[0].timeSpent).toBe(1);
    expect(plies[2].timeSpent).toBe(5);
    expect(plies[1].timeSpent).toBeCloseTo(2.5);
    expect(plies[0].fenBefore).toBe("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
  });

  it("classifies speed like Lichess", () => {
    expect(timeClassFromControl({ base: 60, increment: 0 })).toBe("bullet");
    expect(timeClassFromControl({ base: 180, increment: 2 })).toBe("blitz");
    expect(timeClassFromControl({ base: 600, increment: 0 })).toBe("rapid");
    expect(timeClassFromControl({ base: 1800, increment: 0 })).toBe("classical");
  });
});
