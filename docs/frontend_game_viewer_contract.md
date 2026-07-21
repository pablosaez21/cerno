# Game viewer data contract

## Implemented data flow

Both analysis endpoints now provide enough position-level data for the same board viewer.

`POST /games/analyze` returns the complete ordered ply list. Each move contains:

- `move_number`, `move_uci`, and `move_san`;
- `fen_before` and `fen_after`;
- `evaluation_before`, `evaluation_after`, and `cpl`;
- `phase` and `classification`.

`POST /coach/analyze-user` now includes `game_analyses`. This is derived from the
Stockfish results that the coach service already computes, so it does not trigger
any additional engine work. Every entry includes the original PGN, player color,
opponent, result, complete move sequence, phase summary, and critical moments.

The frontend uses backend FEN values first. If a FEN is missing or invalid,
`chess.js` replays the original PGN and reconstructs that position. Lichess games
open from the analyzed player's side.

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
