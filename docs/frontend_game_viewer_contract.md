# Game viewer data contract

## Implemented data flow

All analysis endpoints provide enough position-level data for the same board
viewer.

`POST /games/analyze` returns the complete ordered ply list. Each move contains:

- `move_number`, `move_uci`, and `move_san`;
- `mover_color`, explicitly `white` or `black`;
- `fen_before` and `fen_after`;
- `evaluation_before`, `evaluation_after`, and `cpl`;
- `phase` and `classification`.

The same response now includes additive full-game coaching:

```json
{
  "coaching": {
    "scope": "full_game",
    "explanation": "Engine-grounded explanation of the game",
    "recommendations": ["At least one concrete review action"]
  }
}
```

The low-level `full_game` scope remains deliberate: callers of
`/games/analyze` have not supplied player ownership. The product PGN form now
requires a White/Black selection and calls `POST /coach/analyze-pgn` instead.
That endpoint returns the same structured contract as `/coach/analyze-user`.
It uses the selected side for player-only diagnosis while retaining both sides
in the nested game analysis used by the viewer.

`POST /coach/analyze-user` and `POST /coach/analyze-pgn` include
`game_analyses`. These are derived from the Stockfish results that the shared
coach service already computes, so they do not trigger additional engine work.
Every entry includes the original PGN, player color, opponent, result, complete
move sequence, phase summary, and critical moments.

The nested `game_analyses` entries remain full-game reports: all plies and all
engine critical moments are available to the viewer. Top-level coach diagnosis and
critical moments are a separate player-only projection.

The frontend uses backend FEN values first. If a FEN is missing or invalid,
`chess.js` replays the original PGN and reconstructs that position. Lichess games
open from the analyzed player's side. Move-list color placement uses `mover_color`
directly rather than inferring ownership from list position or FEN.

Normalized `diagnosis.phase_stats` also includes `moves`, the number of analyzed
player plies contributing to each phase. Existing phase metrics remain unchanged.

## Fields still unavailable

The current Stockfish service evaluates the played position before and after each
move, but does not return a best move or principal variation. To compare the played
move against a recommendation, each move would need fields such as:

```json
{
  "recommended_move_uci": "e2e4",
  "recommended_move_san": "e4",
  "evaluation_best": 0.35,
  "principal_variation_san": ["e4", "e5", "Nf3"],
  "explanation": "optional backend-generated or curated text"
}
```

Until that contract exists, the viewer only draws the played move and reports the
real evaluation loss. It does not infer a recommendation or fabricate an explanation.

## Automated contract evidence

Phase 2C protects the implemented viewer behavior at two layers:

- Vitest exercises backend-FEN preference, PGN replay, custom initial FEN,
  malformed FEN/PGN, initial and final positions, all plies, explicit
  `mover_color`, move grouping, critical-ply bounds, and off-by-one behavior.
- React Testing Library exercises start/previous/next/end, direct move
  selection, ArrowLeft/ArrowRight/Home/End, critical jumps, White and Black
  orientation, manual flip, empty data, and inaccessible critical indices.
- Coaching-result and endpoint tests prove that the game viewer keeps global
  moments while the separate coaching section contains only personal moments,
  including for uploaded PGN.
- Playwright proves that the production frontend can navigate a six-ply report
  returned by the real FastAPI/Stockfish path. The PGN case requires the same
  diagnosis, training-plan, phase, critical-moment, and viewer structure as the
  Lichess report, preventing an engine-only alternative report from passing. It
  checks the board at 1280x720 and 390x844 so the complete square remains
  bounded by the viewport.

The unit test replaces only `react-chessboard` rendering with a small semantic
element; `chess.js` position reconstruction and all Cerno viewer logic remain
real. Browser tests use the real `react-chessboard`.
