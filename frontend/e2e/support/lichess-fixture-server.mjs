import { createServer } from "node:http";

const HOST = "127.0.0.1";
const PORT = 4300;
const pgn = `[Event "Cerno Lichess E2E"]
[White "FixtureOpponent"]
[Black "CernoE2E"]
[Result "0-1"]

1. e4 e5 2. Qh5 Nc6 3. Qxe5+ Nxe5 0-1`;

const fixture = {
  id: "cerno-e2e-game",
  speed: "rapid",
  rated: false,
  winner: "black",
  status: "resign",
  players: {
    white: { user: { name: "FixtureOpponent" }, rating: 1600 },
    black: { user: { name: "CernoE2E" }, rating: 1610 },
  },
  moves: "e4 e5 Qh5 Nc6 Qxe5+ Nxe5",
  pgn,
};

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://${HOST}:${PORT}`);

  if (url.pathname === "/health") {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end('{"status":"ok"}');
    return;
  }

  const prefix = "/api/games/user/";
  if (!url.pathname.startsWith(prefix)) {
    response.writeHead(404);
    response.end();
    return;
  }

  const username = decodeURIComponent(url.pathname.slice(prefix.length));
  if (username === "MissingE2E") {
    response.writeHead(404);
    response.end();
    return;
  }

  if (
    username !== "CernoE2E" ||
    url.searchParams.get("max") !== "1" ||
    url.searchParams.get("pgnInJson") !== "true"
  ) {
    response.writeHead(400);
    response.end();
    return;
  }

  response.writeHead(200, {
    "Content-Type": "application/x-ndjson",
  });
  response.end(`${JSON.stringify(fixture)}\n`);
});

server.listen(PORT, HOST);

function close() {
  server.close(() => process.exit(0));
}

process.once("SIGINT", close);
process.once("SIGTERM", close);
