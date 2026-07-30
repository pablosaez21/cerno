import { Chess } from "chess.js";
import type {
  AnalysisHistory,
  CoachAnalysis,
  CoachGameAnalysis,
  PgnAnalysis,
  PgnMove,
  WeaknessProfile,
} from "@/lib/types";

export const sourcePgn = `[Event "Cerno fixture"]
[White "FixtureWhite"]
[Black "FixtureBlack"]
[Result "*"]

1. e4 e5 2. Qh5 Nc6 3. Qxe5+ Nxe5 *`;

const fixtureGame = new Chess();
fixtureGame.loadPgn(sourcePgn);
const verboseHistory = fixtureGame.history({ verbose: true });
const losses = [12, 18, 45, 22, 612, 109];
const classifications = [
  "good",
  "good",
  "good",
  "good",
  "blunder",
  "mistake",
] as const;

export const pgnMovesFixture: PgnMove[] = verboseHistory.map((move, index) => ({
  move_number: Math.floor(index / 2) + 1,
  move_uci: `${move.from}${move.to}${move.promotion ?? ""}`,
  move_san: move.san,
  mover_color: index % 2 === 0 ? "white" : "black",
  phase: "opening",
  evaluation_before: index === 4 ? 0.2 : 0,
  evaluation_after: index === 4 ? -5.92 : 0,
  cpl: losses[index],
  classification: classifications[index],
  fen_before: move.before,
  fen_after: move.after,
}));

export const pgnAnalysisFixture: PgnAnalysis = {
  total_moves: pgnMovesFixture.length,
  summary: {
    opening: {
      moves: 6,
      avg_cpl: 136.3,
      inaccuracies: 0,
      mistakes: 1,
      blunders: 1,
    },
    middlegame: {
      moves: 0,
      avg_cpl: 0,
      inaccuracies: 0,
      mistakes: 0,
      blunders: 0,
    },
    endgame: {
      moves: 0,
      avg_cpl: 0,
      inaccuracies: 0,
      mistakes: 0,
      blunders: 0,
    },
  },
  critical_moments: [pgnMovesFixture[4], pgnMovesFixture[5]],
  phase_weaknesses: ["opening"],
  moves: pgnMovesFixture,
  coaching: {
    scope: "full_game",
    explanation:
      "Across both sides, the largest evaluation losses in this game cluster in the opening.",
    recommendations: [
      "Replay the critical opening positions from both sides before checking the engine.",
    ],
  },
};

function coachGame(playerColor: "white" | "black"): CoachGameAnalysis {
  return {
    ...pgnAnalysisFixture,
    game_id: `fixture-${playerColor}`,
    player_color: playerColor,
    opponent: playerColor === "white" ? "FixtureBlack" : "FixtureWhite",
    result: playerColor === "white" ? "loss" : "win",
    pgn: sourcePgn,
  };
}

export const coachAnalysisFixture: CoachAnalysis = {
  username: "FixtureWhite",
  games_requested: 1,
  games_analyzed: 1,
  diagnosis: {
    main_weakness: "opening",
    secondary_weakness: null,
    summary: "The largest evaluation loss occurred in the opening.",
    phase_stats: {
      opening: {
        moves: 3,
        avg_cpl: 223,
        inaccuracies: 0,
        mistakes: 0,
        blunders: 1,
      },
      middlegame: { moves: 0, avg_cpl: 0, mistakes: 0, blunders: 0 },
      endgame: { moves: 0, avg_cpl: 0, mistakes: 0, blunders: 0 },
    },
    detected_patterns: ["missed tactics"],
    recommended_focus: ["Check opponent threats before capturing"],
  },
  coach_advice:
    "Pause before forcing captures and verify every opponent reply.",
  critical_moments: [
    {
      game_id: "fixture-white",
      move_number: 3,
      move: "Qxe5+",
      phase: "opening",
      cpl: 612,
      classification: "blunder",
    },
  ],
  theory_recommendations: [],
  grounding_status: "insufficient_evidence",
  strengths: ["The opening development was comparatively stable."],
  weaknesses: ["The critical capture overlooked the opponent's reply."],
  actionable_recommendations: [
    {
      title: "Review forcing replies",
      explanation:
        "The largest evaluation loss followed a forcing capture.",
      actions: ["List every check and capture before choosing the move."],
      evidence_type: "game_analysis",
      engine_evidence_ids: ["E1"],
      source_ids: [],
    },
  ],
  sources: [],
  generation: {
    mode: "fallback",
    reason: "no_api_key",
    prompt_name: "cerno.coach.grounded_training",
    prompt_version: "2.0.0",
    schema_version: "2.0.0",
    model: "gpt-4o-mini",
    retrieval_pipeline_version: "rag-v1",
  },
  training_plan: {
    priority: "opening calculation",
    week_plan: ["Review the critical capture.", "Solve forcing-move puzzles."],
  },
  game_analyses: [coachGame("white")],
  skipped_games: [],
  saved: false,
};

export const coachAnalysisBlackFixture: CoachAnalysis = {
  ...coachAnalysisFixture,
  username: "FixtureBlack",
  critical_moments: [
    {
      game_id: "fixture-black",
      move_number: 3,
      move: "Nxe5",
      phase: "opening",
      cpl: 109,
      classification: "mistake",
    },
  ],
  game_analyses: [coachGame("black")],
};

export const groundedCoachAnalysisFixture: CoachAnalysis = {
  ...coachAnalysisBlackFixture,
  grounding_status: "evidence_found",
  theory_recommendations: [
    {
      citation_id: "S1",
      source_id: "wikibooks-pawn-endings",
      title: "Pawn Endings",
      source: "https://example.test/pawn-endings",
      category: "pawn_endgames",
      phase: "endgame",
      study_id: "wikibooks-pawn-endings",
      chapter: "The Opposition",
      author: "Wikibooks contributors",
      attribution: "https://example.test/pawn-endings-history",
      content_license: "CC BY-SA 4.0",
      license_url: "https://creativecommons.org/licenses/by-sa/4.0/",
      reason: "Relevant for: king opposition in pawn endings.",
      distance: 0.42,
    },
  ],
  actionable_recommendations: [
    ...coachAnalysisBlackFixture.actionable_recommendations,
    {
      title: "Practice opposition",
      explanation:
        "Opposition helps the king control access to key squares.",
      actions: ["Solve five opposition positions from both sides."],
      evidence_type: "theory",
      engine_evidence_ids: ["E1"],
      source_ids: ["S1"],
    },
  ],
  sources: [
    {
      citation_id: "S1",
      source_id: "wikibooks-pawn-endings",
      title: "Pawn Endings",
      chapter: "The Opposition",
      phase: "endgame",
      category: "pawn_endgames",
      author: "Wikibooks contributors",
      attribution: "https://example.test/pawn-endings-history",
      content_license: "CC BY-SA 4.0",
      license_url: "https://creativecommons.org/licenses/by-sa/4.0/",
      canonical_url: "https://example.test/pawn-endings",
    },
  ],
};

export const emptyCoachAnalysisFixture: CoachAnalysis = {
  ...coachAnalysisFixture,
  games_analyzed: 0,
  critical_moments: [],
  theory_recommendations: [],
  game_analyses: [],
  skipped_games: [],
};

export const weaknessProfileFixture: WeaknessProfile = {
  username: "FixtureWhite",
  games_analyzed: 1,
  main_weakness: "opening",
  phase_stats: coachAnalysisFixture.diagnosis.phase_stats,
  detected_patterns: ["missed tactics"],
  recommended_focus: ["Check opponent threats before capturing"],
  recommended_training: [
    { title: "Review forcing moves", priority: "high" },
  ],
};

export const analysisHistoryFixture: AnalysisHistory = {
  username: "FixtureWhite",
  total: 1,
  analyses: [
    {
      id: 1,
      lichess_game_id: "fixture-white",
      opponent: "FixtureBlack",
      color_played: "white",
      result: "loss",
      opening_name: "King's Pawn",
      total_moves: 6,
      analysis_summary: {},
      created_at: "2026-07-29T12:00:00Z",
    },
  ],
};
