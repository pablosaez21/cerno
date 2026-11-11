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
import type { Color, GameResult, Source, Termination, TimeClass } from "./types";
import { THRESHOLDS, type Judgement } from "./winprob";

export const REPORT_VERSION = 1;

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

export type Area = Category | "clock";

export interface EvidenceRef {
  gameId: string;
  /** Ply of the player's move (or of the position) that supports the finding. */
  ply: number;
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
  | "clock";

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
  | "slow_down_critical"; // spend time in critical positions

export interface Prescription {
  area: Area;
  methods: TrainingMethod[];
  /** Lichess puzzle themes, see https://lichess.org/training/themes */
  themes: string[];
  /** Positions to work on: the evidence ordered by loss. */
  positions: EvidenceRef[];
  params: Record<string, string | number | undefined>;
}

export interface Recommendation {
  rank: number;
  findingId: string;
  prescription: Prescription;
  /** "Because of this": the numbers behind the recommendation. */
  reason: { occurrences: number; games: number; winLoss: number; impact: number; gamesAnalysed: number };
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
): Report {
  const games = analyzed.map(classifyGame);
  markRepeated(games);
  const N = games.length;
  const allMoves = games.flatMap((g) => g.moves);
  const judged = allMoves.filter((m) => m.judgement && m.category);
  const totalJudgedLoss = sum(judged, (m) => m.loss) || 1;
  const byId = new Map(games.map((g) => [g.game.id, g]));

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
    const weakLoss = row.openingWinLoss / row.games >= OPENING_WEAK_LOSS_PER_GAME;
    const weakExit = row.avgWinAfterOpening !== undefined && row.avgWinAfterOpening <= OPENING_WEAK_EXIT;
    if (!weakLoss && !weakExit) continue;
    const gs = row.gameIds.map((id) => byId.get(id)!);
    const oms = gs.flatMap((g) => g.moves.filter((m) => m.judgement && m.phase === "opening"));
    const exitDeficit = sum(gs, (g) => Math.max(0, 50 - (g.winAfterOpening ?? 50)));
    const winLoss = Math.max(row.openingWinLoss, exitDeficit);
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

  findings.sort((a, b) => b.impact - a.impact);

  // ---- Recommendations: top three by impact, skipping heavy overlaps.
  const recommendations: Recommendation[] = [];
  const used: Set<string>[] = [];
  for (const f of findings) {
    if (recommendations.length >= 3) break;
    const keys = new Set(f.evidence.map((e) => `${e.gameId}#${e.ply}`));
    const overlaps = used.some((u) => [...keys].filter((k) => u.has(k)).length / keys.size > RECOMMENDATION_MAX_OVERLAP);
    if (overlaps) continue;
    used.push(keys);
    recommendations.push({
      rank: recommendations.length + 1,
      findingId: f.id,
      prescription: prescribe(f),
      reason: { occurrences: f.occurrences, games: f.games, winLoss: f.winLoss, impact: f.impact, gamesAnalysed: N },
    });
  }

  // ---- Exercises
  const exercises = Object.fromEntries(CATEGORIES.map((c) => [c, [] as Exercise[]])) as Record<Category, Exercise[]>;
  for (const m of [...judged].sort((a, b) => b.loss - a.loss)) {
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
  }
}

export type { Category } from "./classify";
