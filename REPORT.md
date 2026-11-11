# Report contract

`buildReport()` in `src/core/report.ts` returns a `Report`. It is the only thing the interface needs. All fields are data: no final texts, no language. The TypeScript types in that file are the source of truth; this page explains what the numbers mean.

## Units

- **Win %**: the player's win probability, 0 to 100, from the Lichess formula (`src/core/winprob.ts`). Mate is 0 or 100.
- **Loss** of a move: win % before the move minus win % after it, for the player who moved. Never negative.
- **Judgement**: inaccuracy ≥ 5, mistake ≥ 10, blunder ≥ 15 points (Lichess thresholds). Only moves re-analysed in pass 2 are judged.
- **Error** in counts such as `errorsPer100` means mistake or blunder. Inaccuracies are counted apart.
- `ply`: 1 is White's first move. `EvidenceRef = { gameId, ply }` points to the player's move at that ply; look it up in `errors` (same `gameId` and `ply`). If it is not there, it points to a position of the game (for example, the end of the opening).

## Top-level fields

| Field | Meaning |
| --- | --- |
| `version` | Contract version (1). |
| `player`, `sample` | Who and what was analysed: games, player moves, time classes, results, date range. |
| `settings` | Thresholds, engine, node budgets and minimum samples used. |
| `categories` | One entry per category: `tactics`, `openings`, `endgames`, `strategy`. |
| `clock` | Clock stats. The clock is a cross-cutting dimension, not a category. |
| `openings` | One row per opening family and colour. |
| `findings` | Concrete patterns with their evidence, sorted by `impact`. |
| `recommendations` | The three findings with most impact, with a rule-based training prescription. |
| `exercises` | The player's own errors as positions to solve, per category. |
| `errors` | Every judged move of the player, with all its detail. |
| `games` | One row per game, including the PGN for the viewer. |

## Categories

Each judged move gets one main category, decided in this order:

1. **tactics**: the engine lines show, within 10 plies (followed to the end of any exchange in progress), a forced mate in 5 or fewer, or a net material swing of 1 pawn or more that the player allowed or missed, or the opponent's first reply takes a piece the move left undefended.
2. **openings**: the move is in the opening phase. A move played in the same position in two or more games and judged bad each time is also "openings" when it is in the opening, even if it is tactical: it is a repertoire problem. It keeps its tactic tag.
3. **endgames**: endgame phase, without tactical evidence.
4. **strategy**: everything else: middlegame errors with no short-term tactical refutation. The engine does not say why; Cerno does not invent it.

`CategoryStats`: `winLossShare` (share of all win % lost in judged moves), `winLoss`, `errorsPer100` (mistakes + blunders per 100 player moves), `counts` per judgement, `decidedGames` (lost games, and draws after reaching 85%, whose decisive move is in this category).

Phases: endgame starts as Lichess `Divider` says (6 or fewer queens, rooks, bishops and knights in total). The opening lasts while the game stays in the Lichess chess-openings dataset plus 6 plies, at least until ply 20 (move 10) and never past ply 30.

## Tags

`errors[].tactic.tag`, only when computed from the engine lines:

| Tag | Rule |
| --- | --- |
| `hanging_piece` | The opponent's first reply captures a non-pawn piece that the move left undefended, and the opponent ends up 2+ pawns ahead. |
| `allowed_tactic` | The opponent wins 1+ pawn of material by force, not by a simple capture of an undefended piece. |
| `missed_capture` | The best move captures an undefended piece (or one worth more than the capturer) and wins material; the move played does not. |
| `missed_tactic` | The best line wins 1+ pawn by force, not by a simple capture; the move played does not. |
| `allowed_mate` | After the move, the opponent mates in 5 or fewer. |
| `missed_mate` | A mate in 5 or fewer was available and the move played loses it. |

Motifs (`tactic.motifs`): `fork` (a piece, safe on its square, attacks two non-pawn pieces worth more than it or undefended) and `back_rank_mate` (the mate ends on the back rank with the king boxed in by its own pieces). No other motif is reported: pins, discovered attacks and others are not detected reliably yet.

`errors[].clockTags`: `time_trouble` (clock at or below max(10 s, 10% of base) before the move); `fast_critical` (mistake or blunder, best move 10+ points better than the second, played in at most half the player's median time and at most 10 s, not in time trouble).

Game patterns (`games[].patterns`): `drift` (lost with no blunder from ≥ 40% after the opening), `advantage_not_converted` and `winning_endgame_not_converted` (reached 85% after the opening and did not win; the second when the worst later move is in the endgame), `equal_endgame_lost` (entered the endgame between 35% and 65% and lost), `lost_on_time`, `lost_with_time_left` (lost, not on time, with half the base time or more).

## Findings

`Finding = { id, area, kind, key, params, occurrences, games, winLoss, impact, evidence }`.

- `area`: a category or `clock`.
- `kind`: `tactic_tag`, `repeated_mistake`, `opening_line`, `endgame_type`, `strategy_errors`, `game_pattern`, `clock`.
- `impact` = `winLoss` / games analysed: win % lost per game. Findings are sorted by it.
- `evidence`: every supporting position, worst first. Never empty.

Minimum sample: 3 occurrences in 3 different games. Exceptions: a repeated mistake needs the same position and move in 2 games; an opening line needs 5 games with that family and colour and either 8+ points lost per game in errors of the openings category or an average of 42% or less when leaving it. Time trouble is a finding only when the error rate in time trouble is 1.5 times the normal rate.

## Recommendations

`Recommendation = { rank, findingId, prescription, reason }`. The top three findings by impact, skipping a finding when more than half of its evidence is already used by a better one. `reason` carries the numbers ("because of this"). `prescription.methods` comes from a fixed table in `prescribe()`:

`blunder_check`, `puzzles` (with Lichess puzzle `themes`), `own_positions` (the `exercises`), `repertoire_fix`, `repertoire_study`, `endgame_theory`, `convert_advantage`, `defend_endgames`, `review_games`, `time_management`, `slow_down_critical`. `prescription.positions` lists up to 10 evidence positions.

## Exercises

Per category, up to 25 of the player's mistakes and blunders, worst first. `fen` is the position before the move, `orientation` the player's colour, `played` the move to avoid and `solution` the engine line (first move is the answer; tactical lines are cut when the material settles).
