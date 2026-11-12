// Builds the typed report consumed by the interface. No final texts: every
// field is data, and every finding points to the positions that support it.
// Contract: REPORT.md at the repository root.
import { DEFAULT_SETTINGS, type AnalysisSettings, type AnalyzedGame } from "./analyze";
import { fenOf, playLine, sanOf } from "./chess";
import {
  CATEGORIES,
  classifyGame,
  markRepeated,
  timeTroubleLimit,
  type Category,
  type ClockTag,
  type GameAnalysis,
  type GamePattern,
  type MoveAnalysis,
} from "./classify";
import type { EndgameType, Phase } from "./phase";
import { settledBalance, type Motif, type TacticTag } from "./tactics";
import { CHESSCOM_TO_LICHESS_OFFSET, type OutOfScope } from "./level";
import type { Decision } from "./peers";
import { STYLE_ATTRIBUTES } from "./style";
import { buildProfile, OFFSET_WARNING, opponentsTotalShift, peerFields, type LevelTag, type PeerFields, type Profile } from "./profile";
import type { Color, GameResult, Source, Termination, TimeClass } from "./types";
import { THRESHOLDS, type Judgement } from "./winprob";

export const REPORT_VERSION = 3;

/** Minimum sample for a finding. */
export const MIN_SAMPLE = {
  /** Occurrences of a pattern (moves or games). */
  occurrences: 3,
  /** Distinct games those occurrences come from. */
  games: 3,
  /** Games with the same opening family and colour. */
  openingGames: 5,
  /** A repeated mistake needs the same position and move in this many games. */
  repeatedGames: 2,
} as const;

/** An opening line is weak when, on average per game, the player loses this much in the opening... */
export const OPENING_WEAK_LOSS_PER_GAME = 8;
/** ...or leaves the opening at or below this win %. Results alone never make a line weak. */
export const OPENING_WEAK_EXIT = 42;
/** Time trouble is a finding only if the error rate in trouble is this many times the normal rate. */
export const TIME_TROUBLE_RATE_RATIO = 1.5;
/** Max share of shared evidence between two recommendations. */
export const RECOMMENDATION_MAX_OVERLAP = 0.5;
export const EXERCISES_PER_CATEGORY = 25;

/** "profile": a gap against the opponents of the same games (version 3). */
export type Area = Category | "clock" | "profile" | "style";

export interface EvidenceRef {
  gameId: string;
  /** Ply of the player's move (or of the position) that supports the finding. */
  ply: number;
}

/** Level numbers (Maia-3) for a set of judged moves. Absent when Maia did not run. */
export interface LevelSummary {
  /** Judged moves inside Maia's scope (blitz, 30 s or more, ratings known). */
  inScope: number;
  /** Of those, how many most Lichess players of the same Elo would have avoided. */
  belowLevel: number;
  /** Of those, how many most players of that Elo would also have got wrong. */
  hard: number;
  /** Sum over in-scope moves of loss x pGood. */
  avoidableLoss: number;
  /** Of those, how many players 400 Elo higher find a good move clearly more often (learnability >= 0.10). */
  nextLevel: number;
  /** Sum over in-scope moves of loss x pGood at +200 Elo. */
  nextLevelLoss: number;
}

/** Peer data computed in the run: decision records of both sides. */
export interface PeerInput {
  decisions: Decision[];
  model: string;
  /** "full": every move of both sides (profile). "reduced": the player's judged moves only (no WebGPU). */
  mode: "full" | "reduced";
}

export interface LevelReport {
  model: string;
  /** The comparison population, always a population, never the player. */
  population: "lichess_blitz";
  /** Lichess Elo fed to Maia = source rating + this. */
  eloOffset: number;
  mode: "full" | "reduced";
  /** Mistakes and blunders in and out of Maia's scope. */
  scope: { errors: number; inScope: number; outOfScope: Partial<Record<OutOfScope, number>>; outOfScopeShare: number };
  /** Opponents' full-likelihood shift (about 0 when the Elo conversion fits these games). Full mode only. */
  opponentsTotalShift?: number;
  offsetWarning?: boolean;
}

export interface CategoryStats {
  /** Share of all win % lost in judged moves that falls in this category, 0..1. */
  winLossShare: number;
  /** Sum of win % lost in judged moves of this category. */
  winLoss: number;
  /** Mistakes + blunders per 100 player moves. */
  errorsPer100: number;
  counts: Record<Judgement, number>;
  /** Lost games (and draws from a winning position) whose decisive move is in this category. */
  decidedGames: number;
  level?: LevelSummary;
}

export interface ClockStats {
  /** Player moves made with the clock at or below the time-trouble limit. */
  movesInTimeTrouble: number;
  /** Mistakes + blunders per 100 moves, in and out of time trouble. */
  errorsPer100InTrouble?: number;
  errorsPer100Normal?: number;
  fastCriticalErrors: number;
  lostOnTime: number;
  lostWithTimeLeft: number;
  /** Games with clock data. */
  gamesWithClock: number;
}

export interface OpeningRow {
  family: string;
  color: Color;
  games: number;
  /** Points per game, 0..1. */
  score: number;
  /** Mean player win % when the opening phase ends. */
  avgWinAfterOpening?: number;
  /** Mean full move at which the game left the opening dataset. */
  avgBookExitMove?: number;
  /** Judged moves in the opening phase, and the win % they lost. */
  openingErrors: number;
  openingWinLoss: number;
  /** Same, only for moves whose category is "openings" (tactics excluded). */
  openingCategoryWinLoss: number;
  /** Most frequent full names within the family. */
  names: { eco?: string; name: string; games: number }[];
  gameIds: string[];
}

export type FindingKind =
  | "tactic_tag"
  | "repeated_mistake"
  | "opening_line"
  | "endgame_type"
  | "game_pattern"
  | "strategy_errors"
  | "clock"
  | "profile_gap"
  | "style_trait"
  | "repertoire_leak";

export interface Finding {
  /** Stable id, e.g. "tactics:hanging_piece", "openings:line:Sicilian Defense:black". */
  id: string;
  area: Area;
  kind: FindingKind;
  /** Kind-specific key: tactic tag, endgame type, pattern, clock tag, opening family. */
  key: string;
  params: Record<string, string | number | boolean | undefined>;
  /** Moves or games behind the finding. */
  occurrences: number;
  games: number;
  /** Win % lost behind the finding (sum). */
  winLoss: number;
  /** winLoss divided by games analysed: win % per game. Used for ranking. */
  impact: number;
  evidence: EvidenceRef[];
  level?: LevelSummary;
}

export type TrainingMethod =
  | "blunder_check" // habit: before moving, check what is left undefended and the opponent's checks and captures
  | "puzzles" // themed puzzles (Lichess themes in `themes`)
  | "own_positions" // solve the player's own error positions (report.exercises)
  | "repertoire_fix" // fix one concrete position of the repertoire
  | "repertoire_study" // study an opening line with one colour
  | "endgame_theory" // study and practise an endgame type
  | "convert_advantage" // play out winning positions from own games
  | "defend_endgames" // play out level endgames from own games
  | "review_games" // review own games with an engine, focused on the listed positions
  | "time_management" // keep time for the end: budget per move, no long thinks early
  | "slow_down_critical" // spend time in critical positions
  | "play_vs_maia"; // play out positions from own games against Maia-3 at the opponents' Elo

export interface Prescription {
  area: Area;
  methods: TrainingMethod[];
  /** Lichess puzzle themes, see https://lichess.org/training/themes */
  themes: string[];
  /** Positions to work on: the evidence ordered by loss. */
  positions: EvidenceRef[];
  params: Record<string, string | number | undefined>;
  /** Positions to play out against Maia-3 at the opponents' Elo (method play_vs_maia). */
  drills?: DrillSpec[];
}

export interface DrillSpec {
  fen: string;
  side: Color;
  goal: "win" | "draw";
  /** Lichess Elo for Maia-3: median of the opponents' Elo in these games. */
  maiaElo: number;
  sourceGameId: string;
  ply: number;
}

/** What a recommendation rests on. */
export type RecommendationBasis = "confirmed_vs_opponents" | "suggestive_vs_opponents" | "level_typical";

export interface Recommendation {
  rank: number;
  findingId: string;
  prescription: Prescription;
  /** "Because of this": the numbers behind the recommendation. */
  reason: { occurrences: number; games: number; winLoss: number; impact: number; gamesAnalysed: number; level?: LevelSummary };
  basis?: RecommendationBasis;
}

export interface Exercise {
  id: string;
  gameId: string;
  ply: number;
  category: Category;
  fen: string;
  /** Side to move = the player. */
  orientation: Color;
  /** Move played in the game (the one to avoid). */
  played: { uci: string; san: string };
  /** Solution line from the engine; the first move is the answer. */
  solution: { uci: string[]; san: string[] };
  loss: number;
  tags: string[];
  level?: LevelTag;
}

export interface ErrorRow {
  gameId: string;
  ply: number;
  moveNumber: number;
  color: Color;
  fen: string;
  played: { uci: string; san: string };
  best?: { uci: string; san: string };
  bestLine: { uci: string[]; san: string[] };
  refutation: { uci: string[]; san: string[] };
  winBefore: number;
  winAfter: number;
  loss: number;
  judgement: Judgement;
  bestGap?: number;
  phase: Phase;
  endgameType?: EndgameType;
  category: Category;
  tactic?: { tag: TacticTag; motifs: Motif[]; material?: number; mateIn?: number };
  clockTags: ClockTag[];
  repeated: boolean;
  clockBefore?: number;
  timeSpent?: number;
  opening?: { eco?: string; name?: string; family?: string };
  timeClass: TimeClass;
  /** Maia-3 comparison with Lichess blitz players of the same Elo. */
  peer?: PeerFields;
  /** Why Maia-3 says nothing about this move. */
  outOfScope?: OutOfScope;
}

export interface GameRow {
  id: string;
  source: Source;
  url?: string;
  /** Full game, for the viewer only. */
  pgn: string;
  white: string;
  black: string;
  playerColor: Color;
  result: GameResult;
  termination: Termination;
  timeClass: TimeClass;
  endTime?: number;
  opening: { eco?: string; name?: string; family?: string; bookPlies: number };
  openingEnd: number;
  winAfterOpening?: number;
  accuracy?: number;
  sourceAccuracy?: number;
  patterns: { pattern: GamePattern; ply?: number; value?: number }[];
  decisive?: { ply: number; category?: Category };
  playerMoves: number;
  errors: Record<Judgement, number>;
}

export interface Report {
  version: typeof REPORT_VERSION;
  player: { name: string; sources: Source[] };
  sample: {
    games: number;
    playerMoves: number;
    byTimeClass: Partial<Record<TimeClass, number>>;
    results: Record<GameResult, number>;
    from?: number;
    to?: number;
  };
  settings: {
    thresholds: typeof THRESHOLDS;
    engine: string;
    pass1Nodes: number;
    pass2Nodes: number;
    minSample: typeof MIN_SAMPLE;
  };
  categories: Record<Category, CategoryStats>;
  clock: ClockStats;
  openings: OpeningRow[];
  findings: Finding[];
  recommendations: Recommendation[];
  exercises: Record<Category, Exercise[]>;
  errors: ErrorRow[];
  games: GameRow[];
  /** Present when Maia-3 ran. */
  level?: LevelReport;
  /** Peer profile against the opponents of the same games (Maia-3 + Stockfish). Present in full mode with enough games. */
  profile?: Profile;
  /** Recurring opening moves that cost points, with what stronger players choose there. */
  repertoireFixes?: { fen: string; ply: number; played: string; count: number; meanLoss: number; favouritePlus400: string; engineBest: string; habitBelowLevel: boolean; evidence: EvidenceRef[] }[];
  /**
   * Alternative ordering by avoidable loss, shown next to the default one
   * until the player approves switching. Present when Maia-3 ran.
   */
  rankings?: { byAvoidableLoss: string[]; recommendationsByAvoidableLoss: Recommendation[]; legacyRecommendations: Recommendation[] };
}

const emptyCounts = (): Record<Judgement, number> => ({ inaccuracy: 0, mistake: 0, blunder: 0 });
const isError = (m: MoveAnalysis) => m.judgement === "mistake" || m.judgement === "blunder";
const sum = <T>(xs: T[], f: (x: T) => number) => xs.reduce((s, x) => s + f(x), 0);
const ref = (m: { gameId: string; ply: number }): EvidenceRef => ({ gameId: m.gameId, ply: m.ply });
const round = (x: number, d = 2) => Math.round(x * 10 ** d) / 10 ** d;

export function sanLine(fen: string, ucis: string[]): string[] {
  const out: string[] = [];
  const { positions, moves } = playLine(fen, ucis);
  for (let i = 0; i < moves.length; i++) {
    const s = sanOf(fenOf(positions[i]), ucis[i]);
    if (!s) break;
    out.push(s);
  }
  return out;
}


export function buildReport(
  analyzed: AnalyzedGame[],
  playerName: string,
  settings: AnalysisSettings = DEFAULT_SETTINGS,
  peers?: PeerInput,
): Report {
  const games = analyzed.map(classifyGame);
  markRepeated(games);
  const N = games.length;
  const allMoves = games.flatMap((g) => g.moves);
  const judged = allMoves.filter((m) => m.judgement && m.category);
  const totalJudgedLoss = sum(judged, (m) => m.loss) || 1;
  const byId = new Map(games.map((g) => [g.game.id, g]));
  const decisionByKey = new Map((peers?.decisions ?? []).map((d) => [`${d.gameId}#${d.ply}`, d]));
  const outOfScopeOf = (m: MoveAnalysis): OutOfScope | undefined => {
    if (!peers) return undefined;
    const g = byId.get(m.gameId)!.game;
    if (g.timeClass !== "blitz") return "time_class";
    if (g.white.rating === undefined || g.black.rating === undefined) return "no_rating";
    return undefined;
  };
  const judgedByKey = new Map(judged.map((m) => [`${m.gameId}#${m.ply}`, m]));
  /** Peer metrics with avoidableLoss on the judged (pass-2) loss. */
  /** Maia fields of a judged move, on its judged (pass-2) loss. */
  const peerOf = (m: MoveAnalysis): PeerFields | undefined => {
    const d = decisionByKey.get(`${m.gameId}#${m.ply}`);
    // Moves under 30 s included: on 1,654 opponent moves under 30 s normalised pGood
    // predicts 0.836 against 0.810 observed, as well calibrated as with more time.
    return d && peers ? peerFields(d, m.loss, peers.model) : undefined;
  };
  const levelSummary = (ms: MoveAnalysis[]): LevelSummary | undefined => {
    if (!peers) return undefined;
    const ps = ms.map(peerOf).filter((p): p is PeerFields => !!p);
    return {
      inScope: ps.length,
      belowLevel: ps.filter((p) => p.level === "below_level").length,
      hard: ps.filter((p) => p.level === "hard").length,
      avoidableLoss: round(sum(ps, (p) => p.avoidableLoss), 1),
      nextLevel: ps.filter((p) => p.nextLevel).length,
      nextLevelLoss: round(sum(ps, (p) => p.nextLevelLoss), 1),
    };
  };

  // ---- Categories
  const decisiveCategory = new Map<string, Category | undefined>();
  for (const g of games) {
    if (g.decisivePly === undefined) continue;
    decisiveCategory.set(g.game.id, g.moves.find((m) => m.ply === g.decisivePly)?.category);
  }
  const categories = Object.fromEntries(
    CATEGORIES.map((c) => {
      const ms = judged.filter((m) => m.category === c);
      const counts = emptyCounts();
      ms.forEach((m) => counts[m.judgement!]++);
      const stats: CategoryStats = {
        winLossShare: round(sum(ms, (m) => m.loss) / totalJudgedLoss, 3),
        winLoss: round(sum(ms, (m) => m.loss), 1),
        errorsPer100: round(((counts.mistake + counts.blunder) / Math.max(1, allMoves.length)) * 100),
        counts,
        decidedGames: [...decisiveCategory.values()].filter((x) => x === c).length,
        level: levelSummary(ms),
      };
      return [c, stats];
    }),
  ) as Record<Category, CategoryStats>;

  // ---- Clock
  const withClock = allMoves.filter((m) => m.clockBefore !== undefined);
  const inTrouble = withClock.filter((m) => m.clockBefore! <= timeTroubleLimit(byId.get(m.gameId)!.game.timeControl?.base));
  const normal = withClock.filter((m) => !inTrouble.includes(m));
  const per100 = (ms: MoveAnalysis[]) => (ms.length ? round((ms.filter(isError).length / ms.length) * 100) : undefined);
  const gamesWith = (p: GamePattern) => games.filter((g) => g.patterns.some((x) => x.pattern === p));
  const clock: ClockStats = {
    movesInTimeTrouble: inTrouble.length,
    errorsPer100InTrouble: per100(inTrouble),
    errorsPer100Normal: per100(normal),
    fastCriticalErrors: judged.filter((m) => m.clockTags.includes("fast_critical")).length,
    lostOnTime: gamesWith("lost_on_time").length,
    lostWithTimeLeft: gamesWith("lost_with_time_left").length,
    gamesWithClock: new Set(withClock.map((m) => m.gameId)).size,
  };

  // ---- Openings
  const openingGroups = new Map<string, GameAnalysis[]>();
  for (const g of games) {
    const k = `${g.opening.family ?? "?"}|${g.game.playerColor}`;
    openingGroups.set(k, [...(openingGroups.get(k) ?? []), g]);
  }
  const openings: OpeningRow[] = [...openingGroups.entries()]
    .map(([k, gs]) => {
      const [family, color] = k.split("|") as [string, Color];
      const oms = gs.flatMap((g) => g.moves.filter((m) => m.judgement && m.phase === "opening"));
      const names = new Map<string, { eco?: string; name: string; games: number }>();
      for (const g of gs) {
        const n = g.opening.name ?? "?";
        names.set(n, { eco: g.opening.eco, name: n, games: (names.get(n)?.games ?? 0) + 1 });
      }
      const exits = gs.map((g) => g.winAfterOpening).filter((x): x is number => x !== undefined);
      return {
        family,
        color,
        games: gs.length,
        score: round(sum(gs, (g) => (g.game.result === "win" ? 1 : g.game.result === "draw" ? 0.5 : 0)) / gs.length),
        avgWinAfterOpening: exits.length ? round(sum(exits, (x) => x) / exits.length, 1) : undefined,
        avgBookExitMove: round(sum(gs, (g) => Math.ceil(g.opening.bookPlies / 2)) / gs.length, 1),
        openingErrors: oms.length,
        openingWinLoss: round(sum(oms, (m) => m.loss), 1),
        openingCategoryWinLoss: round(sum(oms.filter((m) => m.category === "openings"), (m) => m.loss), 1),
        names: [...names.values()].sort((a, b) => b.games - a.games).slice(0, 5),
        gameIds: gs.map((g) => g.game.id),
      };
    })
    .sort((a, b) => b.games - a.games);

  // ---- Findings
  const findings: Finding[] = [];
  const impactOf = (winLoss: number) => round(winLoss / Math.max(1, N));
  const fromMoves = (
    base: Omit<Finding, "occurrences" | "games" | "winLoss" | "impact" | "evidence">,
    ms: MoveAnalysis[],
    minGames: number = MIN_SAMPLE.games,
    minOcc: number = MIN_SAMPLE.occurrences,
  ) => {
    const gameCount = new Set(ms.map((m) => m.gameId)).size;
    if (ms.length < minOcc || gameCount < minGames) return;
    const winLoss = sum(ms, (m) => m.loss);
    findings.push({
      ...base,
      occurrences: ms.length,
      games: gameCount,
      winLoss: round(winLoss, 1),
      impact: impactOf(winLoss),
      evidence: [...ms].sort((a, b) => b.loss - a.loss).map(ref),
    });
  };

  // Tactics, by tag.
  const tacticMoves = judged.filter((m) => m.category === "tactics" && m.tactic);
  const tags = [...new Set(tacticMoves.map((m) => m.tactic!.tag))];
  for (const tag of tags) {
    const ms = tacticMoves.filter((m) => m.tactic!.tag === tag);
    const motifCount = (mo: Motif) => ms.filter((m) => m.tactic!.motifs.includes(mo)).length;
    fromMoves({ id: `tactics:${tag}`, area: "tactics", kind: "tactic_tag", key: tag, params: { fork: motifCount("fork"), back_rank_mate: motifCount("back_rank_mate") } }, ms);
  }

  // Repeated mistakes: same position, same move, several games.
  const repeatGroups = new Map<string, MoveAnalysis[]>();
  for (const m of judged.filter((x) => x.repeated)) {
    const k = `${m.fenBefore.split(" ").slice(0, 4).join(" ")}|${m.played.uci}`;
    repeatGroups.set(k, [...(repeatGroups.get(k) ?? []), m]);
  }
  for (const [k, ms] of repeatGroups) {
    const first = ms[0];
    fromMoves(
      {
        id: `repeated:${k}`,
        area: first.category!,
        kind: "repeated_mistake",
        key: first.played.uci,
        params: { fen: first.fenBefore, played: first.played.san, best: first.best?.san, phase: first.phase },
      },
      ms,
      MIN_SAMPLE.repeatedGames,
      MIN_SAMPLE.repeatedGames,
    );
  }

  // Opening lines that go badly.
  for (const row of openings) {
    if (row.family === "?" || row.games < MIN_SAMPLE.openingGames) continue;
    const weakLoss = row.openingCategoryWinLoss / row.games >= OPENING_WEAK_LOSS_PER_GAME;
    const weakExit = row.avgWinAfterOpening !== undefined && row.avgWinAfterOpening <= OPENING_WEAK_EXIT;
    if (!weakLoss && !weakExit) continue;
    const gs = row.gameIds.map((id) => byId.get(id)!);
    const oms = gs.flatMap((g) => g.moves.filter((m) => m.judgement && m.category === "openings"));
    const exitDeficit = sum(gs, (g) => Math.max(0, 50 - (g.winAfterOpening ?? 50)));
    const winLoss = Math.max(row.openingCategoryWinLoss, exitDeficit);
    const evidence = oms.length
      ? [...oms].sort((a, b) => b.loss - a.loss).map(ref)
      : gs.map((g) => ({ gameId: g.game.id, ply: g.openingEnd }));
    findings.push({
      id: `openings:line:${row.family}:${row.color}`,
      area: "openings",
      kind: "opening_line",
      key: row.family,
      params: { family: row.family, color: row.color, score: row.score, avgWinAfterOpening: row.avgWinAfterOpening, weakLoss, weakExit },
      occurrences: row.games,
      games: row.games,
      winLoss: round(winLoss, 1),
      impact: impactOf(winLoss),
      evidence,
    });
  }

  // Endgames, by type.
  const endMoves = judged.filter((m) => m.category === "endgames");
  for (const t of new Set(endMoves.map((m) => m.endgameType!))) {
    fromMoves({ id: `endgames:type:${t}`, area: "endgames", kind: "endgame_type", key: t, params: { endgameType: t } }, endMoves.filter((m) => m.endgameType === t));
  }

  // Strategy: middlegame errors with no short-term tactical refutation. The
  // engine does not say why; only the state of the position is reported.
  const strategyErrors = judged.filter((m) => m.category === "strategy" && isError(m));
  fromMoves(
    {
      id: "strategy:errors",
      area: "strategy",
      kind: "strategy_errors",
      key: "middlegame_no_tactic",
      params: {
        whenAhead: strategyErrors.filter((m) => m.winBefore >= 70).length,
        whenLevel: strategyErrors.filter((m) => m.winBefore > 30 && m.winBefore < 70).length,
        whenBehind: strategyErrors.filter((m) => m.winBefore <= 30).length,
      },
    },
    strategyErrors,
  );

  // Game patterns.
  const patternArea: Partial<Record<GamePattern, Area>> = {
    drift: "strategy",
    advantage_not_converted: "strategy",
    winning_endgame_not_converted: "endgames",
    equal_endgame_lost: "endgames",
    lost_on_time: "clock",
    lost_with_time_left: "clock",
  };
  for (const [pattern, area] of Object.entries(patternArea) as [GamePattern, Area][]) {
    const gs = gamesWith(pattern);
    if (gs.length < MIN_SAMPLE.games) continue;
    let winLoss = 0;
    const evidence: EvidenceRef[] = [];
    for (const g of gs) {
      const p = g.patterns.find((x) => x.pattern === pattern)!;
      const gameLoss = sum(g.moves, (m) => m.loss);
      if (pattern === "drift") winLoss += gameLoss;
      else if (pattern === "advantage_not_converted" || pattern === "winning_endgame_not_converted") winLoss += p.value ?? 0;
      else if (pattern === "equal_endgame_lost") winLoss += sum(g.moves.filter((m) => m.phase === "endgame"), (m) => m.loss);
      else if (pattern === "lost_on_time") winLoss += g.moves.at(-1)?.winAfter ?? 0;
      else winLoss += g.moves.find((m) => m.ply === g.decisivePly)?.loss ?? 0;
      const evPly = p.ply ?? g.decisivePly ?? g.moves.at(-1)?.ply;
      if (evPly !== undefined) evidence.push({ gameId: g.game.id, ply: evPly });
    }
    findings.push({
      id: `${area}:pattern:${pattern}`,
      area,
      kind: "game_pattern",
      key: pattern,
      params: {},
      occurrences: gs.length,
      games: gs.length,
      winLoss: round(winLoss, 1),
      impact: impactOf(winLoss),
      evidence,
    });
  }

  // Clock, per move. Time trouble only counts when it really raises the error rate.
  const troubleRatio =
    clock.errorsPer100InTrouble !== undefined && clock.errorsPer100Normal ? clock.errorsPer100InTrouble / clock.errorsPer100Normal : undefined;
  if (troubleRatio !== undefined && troubleRatio >= TIME_TROUBLE_RATE_RATIO) {
    fromMoves(
      { id: "clock:time_trouble", area: "clock", kind: "clock", key: "time_trouble", params: { errorsPer100InTrouble: clock.errorsPer100InTrouble, errorsPer100Normal: clock.errorsPer100Normal } },
      judged.filter((m) => isError(m) && m.clockTags.includes("time_trouble")),
    );
  }
  fromMoves({ id: "clock:fast_critical", area: "clock", kind: "clock", key: "fast_critical", params: {} }, judged.filter((m) => isError(m) && m.clockTags.includes("fast_critical")));

  // Peer profile (version 3): graded gaps against the opponents become findings.
  const points = new Map(games.map((g) => [g.game.id, g.game.result === "win" ? 1 : g.game.result === "draw" ? 0.5 : 0]));
  const judgedLoss = new Map(judged.map((m) => [`${m.gameId}#${m.ply}`, m.loss]));
  const profile = peers?.mode === "full" ? buildProfile(peers.decisions, new Set(judgedLoss.keys()), { points, judgedLoss }) : undefined;
  if (profile) {
    for (const c of [...profile.classes, ...profile.clock.classes]) {
      if (c.insufficient || (c.grade !== "A" && c.grade !== "B")) continue;
      const ev = c.evidence;
      const losses = ev.map((e) => decisionByKey.get(`${e.gameId}#${e.ply}`)?.playedLoss ?? 0);
      const winLoss = sum(losses, (x) => x);
      findings.push({
        id: `profile:${c.id}`,
        area: "profile",
        kind: "profile_gap",
        key: c.id,
        params: { gap: c.gap, sd: c.sd, ciLow: c.ci95![0], ciHigh: c.ci95![1], z: c.z, grade: c.grade, direction: c.direction, detectableGap: c.detectableGap },
        occurrences: ev.length,
        games: new Set(ev.map((e) => e.gameId)).size,
        winLoss: round(winLoss, 1),
        impact: round(winLoss / Math.max(1, N)),
        evidence: ev,
      });
    }
  }
  if (profile) {
    for (const t of profile.style) {
      if (!t.trait) continue;
      const ev = peers!.decisions
        .filter((d) => d.mover === "player" && d.inScope && d.attr?.observed[STYLE_ATTRIBUTES.indexOf(t.attribute)] === (t.controlled < 0 ? 0 : 1) && d.playedLoss >= 5)
        .sort((a, b) => b.playedLoss - a.playedLoss)
        .slice(0, 20)
        .map((d) => ({ gameId: d.gameId, ply: d.ply }));
      findings.push({
        id: `style:${t.attribute}`,
        area: "style",
        kind: "style_trait",
        key: t.attribute,
        params: { observed: t.observed, expected: t.expected, z: t.z, zOpponents: t.zOpponents, zControlled: t.zControlled, trend: round(t.expectedPlus400 - t.expectedMinus400, 4) },
        occurrences: t.decisions,
        games: profile.games,
        winLoss: 0,
        impact: 0,
        evidence: ev.length ? ev : [{ gameId: peers!.decisions[0].gameId, ply: peers!.decisions[0].ply }],
      });
    }
    // Repertoire leaks replace the repeated-mistake findings.
    for (let i = findings.length - 1; i >= 0; i--) if (findings[i].kind === "repeated_mistake") findings.splice(i, 1);
    for (const node of profile.repertoire) {
      for (const mv of node.moves) {
        if (!mv.leak) continue;
        const winLoss = round(mv.meanLoss * mv.count, 1);
        findings.push({
          id: `repertoire:${node.fen.split(" ").slice(0, 4).join(" ")}|${mv.uci}`,
          area: "openings",
          kind: "repertoire_leak",
          key: mv.uci,
          params: { fen: node.fen, played: mv.san, best: node.engineBest.san, favouritePlus400: node.favouritePlus400.san, pMinus400: mv.pMinus400, p0: mv.p0, pPlus400: mv.pPlus400, habitBelowLevel: mv.habitBelowLevel },
          occurrences: mv.count,
          games: mv.count,
          winLoss,
          impact: round(winLoss / Math.max(1, N)),
          evidence: mv.evidence,
        });
      }
    }
  }
  findings.sort((a, b) => b.impact - a.impact);
  for (const f of findings) {
    f.level = levelSummary(f.evidence.map((e) => judgedByKey.get(`${e.gameId}#${e.ply}`)).filter((m): m is MoveAnalysis => !!m));
  }

  const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;
  const oppElo = median((peers?.decisions ?? []).filter((d) => d.mover === "opponent").map((d) => d.elo));
  const attachProfileExtras = (rec: Recommendation, f: Finding) => {
    const cls = f.key;
    if (cls === "phase:opening" && profile) {
      const fixes = profile.repertoire.flatMap((n) => n.moves.filter((m) => m.leak).flatMap((m) => m.evidence.slice(0, 1)));
      rec.prescription.positions = [...fixes, ...rec.prescription.positions].slice(0, 10);
      rec.prescription.params.repertoireFixes = fixes.length;
    }
    if (rec.prescription.methods.includes("play_vs_maia") && peers) {
      const goal: "win" | "draw" = cls === "standing:behind" ? "draw" : "win";
      rec.prescription.drills = f.evidence.slice(0, 10).map((e) => {
        const d = decisionByKey.get(`${e.gameId}#${e.ply}`)!;
        return { fen: d.fen, side: d.color, goal, maiaElo: oppElo, sourceGameId: e.gameId, ply: e.ply };
      });
    }
  };
  // ---- Recommendations: top three, skipping heavy overlaps.
  const basisOf = (f: Finding): RecommendationBasis | undefined =>
    !profile ? undefined : f.kind === "profile_gap" ? (f.params.grade === "A" ? "confirmed_vs_opponents" : "suggestive_vs_opponents") : "level_typical";
  const recommend = (ordered: Finding[], start: Recommendation[] = []): Recommendation[] => {
    const out: Recommendation[] = [...start];
    const used: Set<string>[] = start.map((r) => new Set(findings.find((f) => f.id === r.findingId)!.evidence.map((e) => `${e.gameId}#${e.ply}`)));
    for (const f of ordered) {
      if (out.length >= 3) break;
      const keys = new Set(f.evidence.map((e) => `${e.gameId}#${e.ply}`));
      const overlaps = used.some((u) => [...keys].filter((k) => u.has(k)).length / keys.size > RECOMMENDATION_MAX_OVERLAP);
      if (overlaps) continue;
      used.push(keys);
      out.push({
        rank: out.length + 1,
        findingId: f.id,
        prescription: prescribe(f),
        reason: { occurrences: f.occurrences, games: f.games, winLoss: f.winLoss, impact: f.impact, gamesAnalysed: N, level: f.level },
        basis: basisOf(f),
      });
      if (f.kind === "profile_gap") attachProfileExtras(out[out.length - 1], f);
    }
    return out;
  };
  const NEW_KINDS: FindingKind[] = ["profile_gap", "style_trait", "repertoire_leak"];
  const legacy = recommend(findings.filter((f) => !NEW_KINDS.includes(f.kind)));
  // Version 3 (plan 3.12): per family, the weakest graded class (A or B); A before B, then z.
  // choice:several_good is never a target (everything but critical positions: too broad to train).
  // Then fill with level-typical findings by the loss players 200 Elo higher avoid.
  let recommendations: Recommendation[];
  if (profile) {
    const targets = profileTargets([...profile.classes, ...profile.clock.classes])
      .map((id) => findings.find((x) => x.id === `profile:${id}`))
      .filter((f): f is Finding => !!f);
    const fromProfile = recommend(targets);
    const perGameNext = (f: Finding) => (f.level?.nextLevelLoss ?? 0) / Math.max(1, N);
    const fill = findings.filter((f) => !NEW_KINDS.includes(f.kind)).sort((a, b) => perGameNext(b) - perGameNext(a));
    recommendations = recommend(fill, fromProfile);
  } else {
    recommendations = legacy;
  }
  const byAvoidable = peers ? [...findings].filter((f) => f.level).sort((a, b) => b.level!.avoidableLoss - a.level!.avoidableLoss) : undefined;

  // ---- Exercises
  const exercises = Object.fromEntries(CATEGORIES.map((c) => [c, [] as Exercise[]])) as Record<Category, Exercise[]>;
  // With Maia: ordered by the loss players 200 Elo higher avoid (loss x pGood at +200);
  // without it, by loss.
  const order = (m: MoveAnalysis) => peerOf(m)?.nextLevelLoss ?? (peers ? -1 : m.loss);
  for (const m of [...judged].sort((a, b) => order(b) - order(a) || b.loss - a.loss)) {
    if (!isError(m) || !m.best || !m.bestLine.length) continue;
    const list = exercises[m.category!];
    if (list.length >= EXERCISES_PER_CATEGORY) continue;
    const plies = m.tactic ? Math.max(1, settledBalance(m.fenBefore, m.bestLine, m.color).plies) : 3;
    const uci = m.bestLine.slice(0, Math.min(plies, 9));
    list.push({
      id: `${m.gameId}#${m.ply}`,
      gameId: m.gameId,
      ply: m.ply,
      category: m.category!,
      fen: m.fenBefore,
      orientation: m.color,
      played: m.played,
      solution: { uci, san: sanLine(m.fenBefore, uci) },
      loss: round(m.loss, 1),
      tags: [...(m.tactic ? [m.tactic.tag, ...m.tactic.motifs] : []), ...(m.endgameType ? [`endgame_${m.endgameType}`] : []), ...m.clockTags],
      level: peerOf(m)?.level,
    });
  }

  // ---- Errors and games
  const errors: ErrorRow[] = judged.map((m) => {
    const g = byId.get(m.gameId)!;
    return {
      gameId: m.gameId,
      ply: m.ply,
      moveNumber: m.moveNumber,
      color: m.color,
      fen: m.fenBefore,
      played: m.played,
      best: m.best,
      bestLine: { uci: m.bestLine, san: sanLine(m.fenBefore, m.bestLine) },
      refutation: { uci: m.refutation, san: sanLine(afterFen(m), m.refutation) },
      winBefore: round(m.winBefore, 1),
      winAfter: round(m.winAfter, 1),
      loss: round(m.loss, 1),
      judgement: m.judgement!,
      bestGap: m.bestGap === undefined ? undefined : round(m.bestGap, 1),
      phase: m.phase,
      endgameType: m.endgameType,
      category: m.category!,
      tactic: m.tactic ? { tag: m.tactic.tag, motifs: m.tactic.motifs, material: m.tactic.material, mateIn: m.tactic.mateIn } : undefined,
      clockTags: m.clockTags,
      repeated: !!m.repeated,
      clockBefore: m.clockBefore,
      timeSpent: m.timeSpent,
      opening: { eco: g.opening.eco, name: g.opening.name, family: g.opening.family },
      timeClass: g.game.timeClass,
      peer: peerOf(m),
      outOfScope: outOfScopeOf(m),
    };
  });

  const gameRows: GameRow[] = games.map((g) => {
    const errs = emptyCounts();
    g.moves.forEach((m) => m.judgement && errs[m.judgement]++);
    return {
      id: g.game.id,
      source: g.game.source,
      url: g.game.url,
      pgn: g.game.pgn,
      white: g.game.white.name,
      black: g.game.black.name,
      playerColor: g.game.playerColor,
      result: g.game.result,
      termination: g.game.termination,
      timeClass: g.game.timeClass,
      endTime: g.game.endTime,
      opening: g.opening,
      openingEnd: g.openingEnd,
      winAfterOpening: g.winAfterOpening === undefined ? undefined : round(g.winAfterOpening, 1),
      accuracy: g.accuracy === undefined ? undefined : round(g.accuracy, 1),
      sourceAccuracy: g.game.sourceAccuracy?.player,
      patterns: g.patterns,
      decisive: g.decisivePly === undefined ? undefined : { ply: g.decisivePly, category: decisiveCategory.get(g.game.id) },
      playerMoves: g.playerMoves,
      errors: errs,
    };
  });

  const byTimeClass: Partial<Record<TimeClass, number>> = {};
  games.forEach((g) => (byTimeClass[g.game.timeClass] = (byTimeClass[g.game.timeClass] ?? 0) + 1));
  const ends = games.map((g) => g.game.endTime).filter((x): x is number => x !== undefined);

  return {
    version: REPORT_VERSION,
    player: { name: playerName, sources: [...new Set(games.map((g) => g.game.source))] },
    sample: {
      games: N,
      playerMoves: allMoves.length,
      byTimeClass,
      results: {
        win: games.filter((g) => g.game.result === "win").length,
        draw: games.filter((g) => g.game.result === "draw").length,
        loss: games.filter((g) => g.game.result === "loss").length,
      },
      from: ends.length ? Math.min(...ends) : undefined,
      to: ends.length ? Math.max(...ends) : undefined,
    },
    settings: {
      thresholds: THRESHOLDS,
      engine: settings.engineId,
      pass1Nodes: settings.pass1Nodes,
      pass2Nodes: settings.pass2Nodes,
      minSample: MIN_SAMPLE,
    },
    categories,
    clock,
    openings,
    findings,
    recommendations,
    exercises,
    errors,
    games: gameRows,
    level: peers && levelReport(peers, judged.filter(isError), peerOf, outOfScopeOf, games.some((g) => g.game.source === "chesscom")),
    profile,
    repertoireFixes: profile?.repertoire.flatMap((n) => n.moves.filter((m) => m.leak).map((m) => ({ fen: n.fen, ply: n.ply, played: m.san, count: m.count, meanLoss: m.meanLoss, favouritePlus400: n.favouritePlus400.san, engineBest: n.engineBest.san, habitBelowLevel: m.habitBelowLevel, evidence: m.evidence }))),
    rankings: byAvoidable && { byAvoidableLoss: byAvoidable.map((f) => f.id), recommendationsByAvoidableLoss: recommend(byAvoidable), legacyRecommendations: legacy },
  };
}

function afterFen(m: MoveAnalysis): string {
  const { positions } = playLine(m.fenBefore, [m.played.uci]);
  return fenOf(positions[positions.length - 1]);
}

const ENDGAME_THEMES: Record<EndgameType, string[]> = {
  pawn: ["pawnEndgame"],
  rook: ["rookEndgame"],
  minor: ["bishopEndgame", "knightEndgame"],
  queen: ["queenEndgame"],
  rook_minor: ["rookEndgame", "endgame"],
  mixed: ["endgame"],
};

/** Rule table: finding -> training. */
export function prescribe(f: Finding): Prescription {
  const base = { area: f.area, positions: f.evidence.slice(0, 10), params: {} as Prescription["params"] };
  const motif = (m: Motif) => Number(f.params[m] ?? 0) * 2 >= f.occurrences;
  switch (f.kind) {
    case "tactic_tag": {
      const tag = f.key as TacticTag;
      const backRank = motif("back_rank_mate") ? ["backRankMate"] : [];
      const fork = motif("fork") ? ["fork"] : [];
      const table: Record<TacticTag, Pick<Prescription, "methods" | "themes">> = {
        hanging_piece: { methods: ["blunder_check", "puzzles", "own_positions"], themes: ["hangingPiece"] },
        missed_capture: { methods: ["puzzles", "own_positions"], themes: ["hangingPiece"] },
        allowed_mate: { methods: ["blunder_check", "puzzles"], themes: ["mateIn2", ...backRank] },
        missed_mate: { methods: ["puzzles", "own_positions"], themes: ["mateIn1", "mateIn2", ...backRank] },
        allowed_tactic: { methods: ["blunder_check", "puzzles", "own_positions"], themes: fork.length ? fork : ["mix"] },
        missed_tactic: { methods: ["puzzles", "own_positions"], themes: fork.length ? fork : ["mix"] },
      };
      return { ...base, ...table[tag] };
    }
    case "repeated_mistake":
      return { ...base, methods: ["repertoire_fix"], themes: [], params: { fen: String(f.params.fen), played: String(f.params.played), best: f.params.best as string | undefined } };
    case "opening_line":
      return { ...base, methods: ["repertoire_study", "review_games"], themes: [], params: { family: String(f.params.family), color: String(f.params.color) } };
    case "endgame_type":
      return { ...base, methods: ["endgame_theory", "own_positions"], themes: ENDGAME_THEMES[f.key as EndgameType] };
    case "strategy_errors":
      return { ...base, methods: ["review_games", "own_positions"], themes: [] };
    case "game_pattern": {
      const p = f.key as GamePattern;
      if (p === "winning_endgame_not_converted" || p === "advantage_not_converted") return { ...base, methods: ["convert_advantage", "review_games"], themes: p === "winning_endgame_not_converted" ? ["endgame"] : [] };
      if (p === "equal_endgame_lost") return { ...base, methods: ["defend_endgames", "endgame_theory"], themes: ["endgame"] };
      if (p === "lost_on_time") return { ...base, methods: ["time_management"], themes: [] };
      if (p === "lost_with_time_left") return { ...base, methods: ["slow_down_critical"], themes: [] };
      return { ...base, methods: ["review_games"], themes: [] };
    }
    case "clock":
      return { ...base, methods: f.key === "fast_critical" ? ["slow_down_critical"] : ["time_management"], themes: [] };
    case "style_trait":
      return { ...base, methods: ["own_positions", "review_games"], themes: [], params: { attribute: f.key } };
    case "repertoire_leak":
      return { ...base, methods: ["repertoire_fix"], themes: [], params: { fen: String(f.params.fen), played: String(f.params.played), best: f.params.best as string | undefined, favouritePlus400: f.params.favouritePlus400 as string | undefined } };
    case "profile_gap": {
      // Section 6 of the plan: one entry per profile class.
      const table: Record<string, Pick<Prescription, "methods" | "themes">> = {
        "phase:opening": { methods: ["repertoire_fix", "repertoire_study"], themes: [] },
        "phase:middlegame": { methods: ["own_positions", "review_games"], themes: [] },
        "phase:endgame": { methods: ["endgame_theory", "play_vs_maia"], themes: ["endgame"] },
        "standing:ahead": { methods: ["convert_advantage", "play_vs_maia"], themes: [] },
        "standing:behind": { methods: ["defend_endgames", "play_vs_maia"], themes: [] },
        "standing:level": { methods: ["blunder_check", "own_positions"], themes: [] },
        "demand:forcing": { methods: ["puzzles", "own_positions"], themes: ["mix"] },
        "demand:pawn": { methods: ["own_positions", "review_games"], themes: [] },
        "demand:piece": { methods: ["own_positions", "review_games"], themes: [] },
        "choice:one_good": { methods: ["puzzles"], themes: ["mix"] },
        "choice:several_good": { methods: ["own_positions"], themes: [] },
        "clock:>=60": { methods: ["own_positions"], themes: [] },
        "clock:30-60": { methods: ["time_management", "own_positions"], themes: [] },
        "clock:<30": { methods: ["time_management", "puzzles"], themes: ["short"] },
      };
      return { ...base, ...(table[f.key] ?? { methods: ["own_positions"], themes: [] }), params: { class: f.key, gap: f.params.gap as number, grade: f.params.grade as string } };
    }
  }
}

export type { Category } from "./classify";

function levelReport(
  peers: PeerInput,
  errors: MoveAnalysis[],
  peerOf: (m: MoveAnalysis) => PeerFields | undefined,
  outOfScopeOf: (m: MoveAnalysis) => OutOfScope | undefined,
  chesscom: boolean,
): LevelReport {
  const outOfScope: Partial<Record<OutOfScope, number>> = {};
  let inScope = 0;
  for (const m of errors) {
    const o = outOfScopeOf(m);
    if (o) outOfScope[o] = (outOfScope[o] ?? 0) + 1;
    else if (peerOf(m)) inScope++;
  }
  const shift = peers.mode === "full" ? opponentsTotalShift(peers.decisions) : undefined;
  return {
    model: peers.model,
    population: "lichess_blitz",
    eloOffset: chesscom ? CHESSCOM_TO_LICHESS_OFFSET : 0,
    mode: peers.mode,
    scope: { errors: errors.length, inScope, outOfScope, outOfScopeShare: round((errors.length - inScope) / Math.max(1, errors.length), 3) },
    opponentsTotalShift: shift,
    offsetWarning: shift === undefined ? undefined : Math.abs(shift) > OFFSET_WARNING,
  };
}

/**
 * Plan 3.12: per family, the weakest class graded A or B (choice:several_good
 * excluded: too broad to train; classes without real between-player spread in
 * V4 excluded); grade A before B, then by z ascending.
 */
/** Classes too broad to train (about 90% of all decisions): never recommendation targets. */
const TOO_BROAD = new Set(["choice:several_good", "clock:>=60"]);

export function profileTargets(classes: { id: string; family: string; insufficient?: boolean; direction?: string; grade?: string; z?: number; tau?: number | null }[]): string[] {
  const out: { id: string; grade: string; z: number }[] = [];
  for (const family of ["phase", "standing", "demand", "choice", "clock"]) {
    const c = classes
      // tau === null: external players show no real between-player spread in this class (V4).
      .filter((x) => x.family === family && !TOO_BROAD.has(x.id) && !x.insufficient && x.tau !== null && x.direction === "weaker" && (x.grade === "A" || x.grade === "B"))
      .sort((a, b) => a.z! - b.z!)[0];
    if (c) out.push({ id: c.id, grade: c.grade!, z: c.z! });
  }
  return out.sort((a, b) => (a.grade === b.grade ? a.z - b.z : a.grade === "A" ? -1 : 1)).map((x) => x.id);
}
