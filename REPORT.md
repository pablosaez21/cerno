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
| `version` | Contract version (3). Version 3 adds `profile`, `repertoireFixes` and new per-error Maia fields, and removes `level.phases`. |
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
| `level` | Maia-3 summary: model, Elo conversion, mode, scope and the Elo-scale check. Absent when the model could not run. |
| `profile` | The peer profile: the player against the opponents of the same games, by class, with intervals and grades; style traits; repertoire. Full mode only (WebGPU), 30 or more blitz games. |
| `repertoireFixes` | Recurring opening moves that cost points, with what players 400 Elo higher choose there. |
| `rankings` | `byAvoidableLoss`, `recommendationsByAvoidableLoss`, and `legacyRecommendations` (what version 2 would recommend). Absent without Maia. |

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

`exercises[].explanation` and `errors[].explanation` add two replayable lines, `played` (the game move followed by the engine's reply) and `best`. Each carries legal `uci` and `san`, computed `facts`, and arrows in `marks` (`ply` counts moves already played within that line, with 0 the initial position). The Folio data keeps these proof lines in full, even when its older diagram fields are shortened. The interface reveals the facts and replay controls only after solving or requesting the solution.

**Facts, not generated reasons** (`src/core/explain.ts`). No language model is used. Material describes the net change along that engine line, with the pieces taken by each side and promotions; identical captures on both sides cancel in the displayed summary. It uses the existing tactical horizon (10 plies, plus the exchange tail; 11 for the line including the played move). A line cut before an available recapture does not support a material claim. Mates must actually reach checkmate in the legal proof line, within the existing five-move limit. Other facts name a captured undefended piece, its removed defender (excluding pinned defenders and remaining direct/x-ray defences), a safe double attack with its targets, an available free capture, or a king move that loses existing castling rights in the played line. No fact claims to explain every aspect of the engine's evaluation. Without a supported fact, both lines remain replayable and the interface says the engine does not explain its preference.

**Conditional threat probes.** For verified mistakes and blunders only, at most two additional searches use the pass-2 node budget and one PV: the opponent moving first before the error, and the player moving again after the best move. These hypothetical passes clear en passant and are omitted in check or in ended games. They never change move judgements, categories, findings or prescriptions. A prior threat is recorded only when a probe wins material or reaches short mate and its first move is also the actual refutation's first move; this proves that reply already worked in the hypothetical position, not that every continuation is identical. A negative result says only that the engine did not find a short threat in that search. A new attack after a quiet best move requires the moved piece to attack a previously unattacked target, capture that target on the probe's first move, and finish the probe line with a net material gain or short mate. Each positive probe keeps its hypothetical FEN and legal proof line.

Probe evaluations share the position cache. Cached analysed games receive an additive `explanationVersion` upgrade, preserving their original pass-1 and pass-2 evaluations. Previously saved Folio studies get facts from their stored lines when opened, without engine work; shorter stored lines may support fewer facts. A new analysis adds the probes. Missing probes never count as a negative result.

**Verification sample.** The eleven positions from the proposal are stored as offline fixtures (Pablo's games, engine lines and probe results). They include mate, a hanging knight, a fork, an ignored threat, a removed pawn defender, exchanges, a missed capture, a missed tactic, a strategic error, lost castling rights and an unexplained ending. The restricted new-attack rule follows the review of 12 candidate explanations in which 4 naive threat descriptions were false. On the same cached 100-game report, 44 of the 93 selected exercises have a supported fact; the remaining 49 keep the honest fallback. No tactical classification threshold changed. A five-game Node run on 2026-11-15 (`scripts/bench.ts`, two workers, 60k/500k nodes, including the probes) took 31.9 s: 7.5 s in pass 1 and 24.4 s in pass 2 plus probes. This is not a browser timing or an estimate for 100 games.

## Level (Maia-3)

Maia-3 (CSSLab, AGPL-3.0) predicts the move a **Lichess blitz player of a given Elo** would play. It describes that population, never the player: every field and text says so. Model: Maia-3 5M, exported to ONNX from the official weights (`scripts/maia/export.py`), run in the browser with onnxruntime-web.

**Modes.** `full` (WebGPU): Maia at five Elo levels (the mover's Elo -400, -200, 0, +200, +400) for every move of both sides, in parallel with Stockfish. `reduced` (WASM, about 15 times slower): the player's judged moves only; no `profile`.

**Scope.** Per-move Maia fields need a blitz game and both ratings (`errors[].outOfScope`: `time_class`, `no_rating`). Moves under 30 s are included: Maia-3 was trained without them, but on 1,654 opponent moves under 30 s normalised `pGood` predicts 0.836 against 0.810 observed, with every bin within its standard error, as well calibrated as with more time. The graded primary classes and the style traits keep the 30 s minimum, because that is the scope they were validated on (V1, V4, holdout).

**Elo.** Lichess Elo = Chess.com rating + `level.eloOffset` (+360: the offset that makes the reference player's opponents' moves most likely, 95% interval [+313, +399], mean Chess.com rating 1453). Lichess games use their own rating. `level.opponentsTotalShift` re-checks it per user with the opponents' full move likelihood; `offsetWarning` when it exceeds 150. Because the profile compares with the opponents, an offset error moves both sides alike.

**Elo scales.** Every Elo inside the report is Maia's (Lichess): `errors[].peer.eloSelf`, `eloOppo`, `drills[].maiaElo`. The interface never shows those: it shows Elo on the scale of the games' source, Lichess Elo - offset (`shownElo()` in `src/core/level.ts`, the only conversion back). `buildFolioData()` and `eloLadder()` (`src/core/folio-data.ts`) apply it once: `eloScale` (source, offset, its interval and the rating it was measured at), `peer.elo` and the ladder's `curve[].elo` are shown values; Maia's own stay beside them as `maiaEloSelf`, `maiaEloOppo` and `curve[].maiaElo`. The ladder still asks Maia at Lichess 1000 to 2600 every 100, so with Chess.com games its points are shown at 640 to 2240; axis marks are round numbers. Differences in Elo (gaps, -400 / +200 / +400) are the same on both scales. PGN ratings are taken as given, with no offset, as in the analysis. The method chapter states the offset, its interval and that it was measured on one player; elsewhere texts say "at your level", not "at your rating", because the Lichess population sits at the equivalent rating, not at the same number.

**Candidate set.** For each move, the union over the five levels of Maia's moves until 80% of the probability or 4 moves, plus the engine's best. It never depends on the move played. Every candidate is evaluated at the pass-1 budget (60k nodes): the best move takes the position's own eval, the played move the next position's eval. Losses are against the best move of the set; categories good (< 5), inaccuracy (< 10), mistake (< 15), blunder; a played move outside the set is the category `tail`.

**Per error** (`errors[].peer`, judged moves in scope):

| Field | Meaning |
| --- | --- |
| `pPlayed` | Probability that players of `eloSelf` play the move played. |
| `pGood` | Probability of a good move for those players, over the evaluated moves (normalised by `pEvaluated`). |
| `pGoodNext`, `pGoodPlus400` | Same for players 200 and 400 Elo higher. |
| `learnability` | `pGoodPlus400 - pGood`. `nextLevel` is true from 0.10 (the top 30% of the reference player's errors). |
| `eloTrend` | log p(+400) - log p(-400) of the move played: negative when stronger players abandon it. |
| `level` | `below_level` if `pGood` >= 0.7, `hard` if <= 0.3. |
| `avoidableLoss`, `nextLevelLoss` | Judged loss x `pGood`, x `pGoodNext`. Exercises are ordered by `nextLevelLoss`. |

Calibration (V6, 1,200 random opponent moves with 30 s or more): normalised `pGood` predicts 0.787 against 0.766 observed. By bin: 0-0.3 → 0.197 observed (n 117), 0.3-0.5 → 0.378 (90), 0.5-0.7 → 0.635 (137), 0.7-0.85 → 0.726 (146), 0.85-1 → 0.942 (710). Moves tagged `below_level` are good 91% of the time for real players, `hard` ones 20%.

`LevelSummary` (in `categories[].level`, `findings[].level`, `recommendations[].reason.level`): judged moves in scope, `belowLevel`, `hard`, `nextLevel`, `avoidableLoss`, `nextLevelLoss`.

## Peer profile (`profile`)

A **weakness** is a class of decisions, defined before looking at the move played, where the player's moves are worse than his opponents' moves in the same games, after adjusting both for the difficulty of their own positions, by a margin the sample can tell from zero.

**Statistic.** For each decision and each of the five levels, the log-probability under Maia of the quality category actually observed (good, inaccuracy, mistake, blunder, tail). Summed over a class, the Elo shift that maximises it (local 3-point parabola; `atEdge` when the maximum is at -400 or +400) is the class's **quality-Elo shift**: the Elo, relative to the mover's own rating, at which the Maia population best explains how good the moves were. Its absolute value depends on platform, time control and position type and is never interpreted alone.

**Control.** `gap` = player's shift minus opponents' shift in the same class. Interval: 1,000 bootstrap resamples over games (seed 20261111), same resample for both sides and all classes. Bootstrap deviations are widened per class by the ratio measured on synthetic players (V1: 1.0 to 1.29, median 1.16), so that `sd`, `ci80` and `ci95` match the real spread. `detectableGap` = 2.8 x `sd` (80% power at 0.05). `gamesToConfirm` = games x (2.8 / |z|)^2.

**Grades.** A, confirmed: Benjamini-Hochberg q <= 0.10 over the 11 primary classes (the overall class: p <= 0.05), not `atEdge`. B, suggestive: the 80% interval excludes 0. C, within noise: reported with `detectableGap`, never as "no weakness". Classes need 150 decisions per side in 20 games (`insufficient` otherwise); the profile needs 30 blitz games.

**Classes.** Primary (graded): `phase:opening|middlegame|endgame`; `standing:ahead|level|behind` (best move's win % >= 65, between, <= 35); `demand:forcing|pawn|piece` (the engine's best move captures or checks; else is a pawn move; else a piece move); `choice:one_good|several_good` (exactly one good move in a set of 3 or more). Secondary (no grade): move-number bands. Clock family (all decisions, including under 30 s; graded with its own Benjamini-Hochberg over its three classes): `clock:>=60|30-60|<30`. `clock:>=60` (about 90% of decisions) and `choice:several_good` are too broad to be recommendation targets. Classes defined by Maia's own prediction are not allowed: selecting on the predictor biases the comparison.

Each class also has `cost` (win % lost per game in moves losing 5 or more, mistakes+blunders per 100 decisions, both sides) and `nextLevel.gainPerGame` (expected loss at the player's Elo minus at +200, Maia's model on his positions, losses capped at 30). `evidence`: the player's decisions of the class losing 10 or more, pass-2 verified first.

**Validation (V1).** 300 synthetic players per setting, drawn from Maia on the reference player's real positions: null estimates unbiased (means -7 to +11); any discovery for 6.7% of null players; overall p < 0.05 for 4.0%. Power: planted -200 middlegame gap 0.87, -300 endgame 0.81, -250 forcing 0.62, -150 everywhere 0.84.

**Validation on real players.** 16 Lichess players rated 1000-2400, ~48 blitz games each (V2-V4): the overall gap correlates 0.38 with score minus the Elo-expected score; real between-player spread of the overall gap tau = 178 Elo. Class gaps beyond the overall gap show real spread for opening (131), pawn demand (116), one good move (109), behind (176) and middlegame (36), and none beyond noise for endgame, ahead, level, forcing, piece and several good moves: those classes keep their grade but are not personal recommendation targets (`ProfileClass.tau = null`). Lichess movers sit +66 Elo (se 9) above Maia at their own rating (3+0 +32, 3+2 +161, 5+0 +185): Maia alone is not the standard. Games with a rating difference above 300 show no different baseline (+22 vs +33).

**Holdout (V5).** Signals registered on the reference player's latest 96 games, tested on his 300 previous blitz games: overall (-69, grade A on its own), opening (-170, A), level positions (-115, A), pawn demand (-204, A), several good moves (-80, A) and the opening style gap replicate; endgame (-32) and forcing (-60), the two classes without real spread in V4, do not; middlegame, piece and one-good stay near 0 as registered. All five style traits replicate.

**Clock (`profile.clock.paired`).** Player minus opponent in the same game: clock at moves 10/20/30/40, mean time per move by phase, share of moves under 1.5 s. A clock statement needs |z| >= 3.

**Style (`profile.style`).** For 15 move attributes (capture, check, pawn move, equal trade, queen trade, castling, king move, knight/bishop/rook/queen move, retreat, advance, move to an attacked square, pawn move near the own king after move 8): share observed against Maia's full-policy expectation at the player's Elo (also at -400 and +400), z for player and opponents, and `zControlled` = player's excess minus opponents' excess over its game-bootstrap SD. A `trait` needs |zControlled| >= 3 and the opponents' own |z| < 3. Texts say "your choices resemble", never "you play at".

**Repertoire (`profile.repertoire`).** Positions with the player to move reached in 3 or more games by ply 24: per move played, count, mean loss, Maia probability at -400 / 0 / +400, `leak` (twice with mean loss >= 5, or three times with >= 3), `habitBelowLevel` (p(+400) <= 0.6 x p(-400)); the favourite of players 400 Elo higher and the engine's best.

**Findings and recommendations.** Graded gaps (A or B) become findings `profile_gap` (area `profile`); traits `style_trait` (area `style`); leaks `repertoire_leak` (replacing `repeated_mistake`). Recommendations: per family (phase, standing, demand, choice) the weakest class graded A or B, A before B then by z (never `choice:several_good`), up to three, skipping evidence overlaps above 50%; then level-typical findings by `nextLevelLoss` per game. `basis`: `confirmed_vs_opponents`, `suggestive_vs_opponents`, `level_typical`. Prescriptions may carry `drills` for `play_vs_maia`: a position, the side, the goal and Maia's Elo (the opponents' median).

**Known limits.** The control assumes Maia+Stockfish is off by the same amount for the player's positions and the opponents' (other side of the same openings); this cannot be tested with one player. Statistics use 60k-node evaluations (8.5% of good/not-good calls differ from 500k): same noise for both sides, it costs power, not validity. The tail category is part quality, part unusualness. A gap is an average over the sample. What the sample cannot resolve is stated as `detectableGap`.
