# Cerno

Cerno finds a chess player's weaknesses across their recent games: tactics, openings, endgames and strategy, with the clock as a cross-cutting dimension. Every conclusion links to the positions that support it, and the training recommendations come from fixed rules, not from a language model.

Everything runs in the browser. Games come from the public Chess.com and Lichess APIs or from a PGN file, Stockfish 19 (WASM, lite net) runs in Web Workers, Maia-3 (5M, ONNX) runs in its own worker with onnxruntime-web, and results are cached in IndexedDB. There is no backend.

Maia-3 compares each error with what Lichess blitz players of the same Elo do in that position: errors most of them avoid are below the player's level; errors most of them also make are hard at that level. It says nothing about moves made with less than 30 s on the clock, which it was not trained on.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000/lab
```

`/lab` is a throwaway test page: source, username, number of games, time classes, progress and the full report. `/review` shows 30 random errors from the last report so a player can mark whether each label is right.

Static build: `npm run build` writes `out/`; `node scripts/serve-out.mjs` serves it.

## How it works

1. Fetch the last N games (`src/core/sources.ts`).
2. Pass 1: every position once at 60k nodes. Pass 2: the player's moves that lose win probability, at 500k nodes with MultiPV 3, before and after the move (`src/core/analyze.ts`).
3. Judge each move by the win probability it loses, with the Lichess formula and thresholds (`src/core/winprob.ts`), find its phase (`src/core/phase.ts`) and tactical evidence (`src/core/tactics.ts`), and assign one category (`src/core/classify.ts`).
4. Level analysis with Maia-3 (`src/core/level-analysis.ts`): probability of the move played and of a good move for players of the same Elo, and a per-phase comparison on a sample of positions.
5. Build the report: category stats, findings with evidence, three recommendations, exercises (`src/core/report.ts`). The contract is in [REPORT.md](REPORT.md).

The Maia-3 model is not in git: `npm run build` downloads `maia3-5m.onnx` (21 MB) from this repo's `maia3-onnx-v1` release and checks its SHA-256. `scripts/maia/export.py` rebuilds it from the official weights.

Measured on an Apple M5 (10 cores, 9 workers), Chromium, empty cache: 100 blitz games in 3 min 50 s. A second run of the same games is served from the cache.

## Checks

```bash
npm test           # unit tests, no network
npm run typecheck
npm run lint
npx tsx scripts/bench.ts <chesscom-games.json> <user> [workers] [pass1Nodes] [pass2Nodes]
node scripts/measure-browser.mjs <chesscom-user> [games]   # needs the static server running
```

## License

AGPL-3.0-or-later. It ships Stockfish (GPLv3) and the Maia-3 model (AGPLv3). Opening names: [lichess-org/chess-openings](https://github.com/lichess-org/chess-openings) (CC0).
