export type PhaseName = "opening" | "middlegame" | "endgame";

export type PhaseStat = {
  moves?: number;
  avg_cpl?: number;
  inaccuracies?: number;
  mistakes?: number;
  blunders?: number;
  [key: string]: unknown;
};

export type CoachAnalysis = {
  username: string;
  games_requested: number;
  games_analyzed: number;
  diagnosis: {
    main_weakness: string;
    secondary_weakness?: string | null;
    summary: string;
    phase_stats: Record<string, PhaseStat>;
    detected_patterns: string[];
    recommended_focus: string[];
  };
  coach_advice: string;
  critical_moments: {
    game_id: string;
    move_number: number;
    move: string;
    phase: string;
    cpl: number;
    classification: string;
  }[];
  theory_recommendations: {
    citation_id?: string | null;
    source_id?: string | null;
    title?: string | null;
    source?: string | null;
    category?: string | null;
    phase?: string | null;
    study_id?: string | null;
    chapter?: string | null;
    author?: string | null;
    attribution?: string | null;
    content_license?: string | null;
    license_url?: string | null;
    reason: string;
    distance?: number | null;
  }[];
  grounding_status: "evidence_found" | "insufficient_evidence";
  strengths: string[];
  weaknesses: string[];
  actionable_recommendations: {
    title: string;
    explanation: string;
    actions: string[];
    evidence_type: "game_analysis" | "theory";
    engine_evidence_ids: string[];
    source_ids: string[];
  }[];
  sources: {
    citation_id: string;
    source_id: string;
    title: string;
    chapter?: string | null;
    phase?: string | null;
    category?: string | null;
    author?: string | null;
    attribution?: string | null;
    content_license?: string | null;
    license_url?: string | null;
    canonical_url?: string | null;
  }[];
  generation: {
    mode: "llm" | "fallback";
    reason:
      | "none"
      | "no_api_key"
      | "provider_error"
      | "validation_error";
    prompt_name: string;
    prompt_version: string;
    schema_version: string;
    model: string;
    retrieval_pipeline_version: string;
    input_tokens?: number | null;
    output_tokens?: number | null;
    latency_ms?: number | null;
  };
  training_plan: {
    priority: string;
    week_plan: string[];
  };
  game_analyses: CoachGameAnalysis[];
  skipped_games: Record<string, unknown>[];
  saved: boolean;
};

export type PgnMove = {
  move_number: number;
  move_uci: string;
  move_san: string;
  mover_color: "white" | "black";
  phase: string;
  evaluation_before: number;
  evaluation_after: number;
  cpl: number;
  classification: string;
  fen_before: string;
  fen_after: string;
};

export type PgnEngineAnalysis = {
  total_moves: number;
  summary: Record<string, PhaseStat>;
  critical_moments: PgnMove[];
  phase_weaknesses: string[];
  moves: PgnMove[];
};

export type PgnAnalysis = PgnEngineAnalysis & {
  coaching: {
    scope: "full_game";
    explanation: string;
    recommendations: string[];
  };
};

export type CoachGameAnalysis = PgnEngineAnalysis & {
  game_id: string;
  player_color: "white" | "black";
  opponent: string;
  result: "win" | "loss" | "draw";
  pgn: string;
};

export type WeaknessProfile = {
  username: string;
  games_analyzed: number;
  main_weakness: string;
  phase_stats: Record<string, PhaseStat>;
  detected_patterns: string[];
  recommended_focus: string[];
  recommended_training: {
    title: string;
    priority: string;
  }[];
};

export type AnalysisHistory = {
  username: string;
  total: number;
  analyses: {
    id: number;
    lichess_game_id?: string | null;
    opponent?: string | null;
    color_played?: string | null;
    result?: string | null;
    opening_name?: string | null;
    total_moves?: number | null;
    analysis_summary?: Record<string, unknown> | null;
    created_at: string;
  }[];
};
