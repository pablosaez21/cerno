# Cerno

Cerno finds a chess player's weaknesses across their recent games: tactics, openings, endgames and strategy, with the clock as a cross-cutting dimension. Every conclusion links to the positions that support it, and the training recommendations come from fixed rules, not from a language model.

Everything runs in the browser. Games come from the public Chess.com and Lichess APIs or from a PGN file, Stockfish 19 (WASM, lite net) runs in Web Workers, Maia-3 (5M, ONNX) runs in its own worker with onnxruntime-web, and results are cached in IndexedDB. There is no backend.

Cerno compares every move of both players with Maia-3's model of Lichess blitz players at five Elo levels, and Stockfish says how good each candidate move was. The standard is the player's own opponents in the same games: a weakness is a kind of position where the player's moves are worse than his opponents', after adjusting both for how hard their positions were, with an interval and a grade (confirmed, suggestive, within noise). The report adds style traits (move types chosen more or less often than players of that level), recurring opening leaks with what stronger players choose there, and per-error numbers such as how often players 200 Elo higher find a good move. Moves made with less than 30 s on the clock get no per-move Maia numbers.

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
4. Peer analysis (`src/core/peer-analysis.ts`, `peers.ts`, `peer-stats.ts`, `profile.ts`, `style.ts`, `repertoire.ts`): decision records for both sides, the quality-Elo shift against the opponents with a game bootstrap and Benjamini-Hochberg, style and repertoire. With WebGPU Maia runs on the GPU while Stockfish runs on the CPU.
5. Build the report: category stats, findings with evidence, three recommendations, exercises (`src/core/report.ts`). The contract is in [REPORT.md](REPORT.md).

The Maia-3 model is not in git: `npm run build` downloads `maia3-5m.onnx` (21 MB) from this repo's `maia3-onnx-v1` release and checks its SHA-256. `scripts/maia/export.py` rebuilds it from the official weights.

Measured on an Apple M5 (10 cores, 9 Stockfish workers, Maia on WebGPU), Chromium, empty cache: 100 blitz games with the full peer profile in 4 min 44 s; the base report is ready at 2 min 49 s. A second run of the same games is served from the cache.

Validation (measured, see REPORT.md): synthetic players with planted weaknesses (unbiased; 6.7% of null players get any discovery; power 0.87 for a -200 Elo middlegame gap), 16 external Lichess players (the overall gap correlates 0.38 with results beyond rating), and a holdout of the reference player's older games. `scripts/peers/` reproduces each one.

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
