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
  critical_moments: {
    game_id: string;
    move_number: number;
    move: string;
    phase: string;
    cpl: number;
    classification: string;
  }[];
  theory_recommendations: {
    source?: string | null;
    category?: string | null;
    study_id?: string | null;
    chapter?: string | null;
    reason: string;
    distance?: number | null;
  }[];
  training_plan: {
    priority: string;
    week_plan: string[];
  };
  skipped_games: Record<string, unknown>[];
  saved: boolean;
};

export type PgnMove = {
  move_number: number;
  move_uci: string;
  move_san: string;
  phase: string;
  evaluation_before: number;
  evaluation_after: number;
  cpl: number;
  classification: string;
  fen_before: string;
  fen_after: string;
};

export type PgnAnalysis = {
  total_moves: number;
  summary: Record<string, PhaseStat>;
  critical_moments: PgnMove[];
  phase_weaknesses: string[];
  moves: PgnMove[];
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
