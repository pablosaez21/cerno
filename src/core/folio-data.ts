// Report + analysed games -> the data the Folio interface reads (public/folio/*.js,
// `window.CERNO_DATA` and `window.CERNO_ELO`). Nothing here computes a new finding:
// it reshapes the report and adds what the viewer needs (moves, clocks, win curves)
// and, for Maia's Elo ladder, Maia-3's move distribution at 17 ratings.
// Elo scales: the analysis and the report work in Maia's Elo (Lichess). Here, and
// only here, every Elo the interface shows is put on the scale of the games' source
// (`shownElo`): fields named `elo` are shown, fields named `maiaElo*` are Maia's.
import type { AnalyzedGame } from "./analyze";
import { eloScale, shownElo, type EloScale, type EloSource } from "./level";
import { sanLine, type ErrorRow, type Report } from "./report";
import type { MaiaPrediction } from "./maia";
import type { MaiaQuery } from "./maia-ort";
import { peerFields } from "./profile";
import type { Decision } from "./peers";
import { judge, winPercentFor, winPercentWhite } from "./winprob";

/** 2: Elo fields on the source's scale (`eloScale`, `peer.elo`, the ladder's `curve[].elo`). */
export const FOLIO_DATA_VERSION = 2;
/** Ratings Maia is asked at for the Elo ladder (Lichess blitz scale). */
export const LADDER_MAIA_ELOS = Array.from({ length: 17 }, (_, i) => 1000 + i * 100);
/** A move is "good" on the ladder when it loses less than this (win %), as in the report's inaccuracy threshold. */
export const LADDER_GOOD_LOSS = 5;

const r1 = (x: number) => Math.round(x * 10) / 10;
const r3 = (x: number) => Math.round(x * 1000) / 1000;
const keyOf = (gameId: string, ply: number) => `${gameId}#${ply}`;

export interface FolioPly {
  san: string;
  uci: string;
  fen: string;
  clk?: number;
  t?: number;
  /** Judgement initial of the player's judged moves. */
  j?: "i" | "m" | "b";
}

export interface FolioGame {
  id: string;
  url?: string;
  white: { name: string; rating?: number };
  black: { name: string; rating?: number };
  color: "white" | "black";
  result: "win" | "loss" | "draw";
  termination: string;
  timeClass: string;
  tc?: { base: number; increment: number };
  endTime?: number;
  opening: Report["games"][number]["opening"];
  openingEnd: number;
  winAfterOpening?: number;
  accuracy?: number;
  patterns: Report["games"][number]["patterns"];
  decisive?: Report["games"][number]["decisive"];
  playerMoves: number;
  errors: Report["games"][number]["errors"];
  startFen: string;
  plies: FolioPly[];
  /** White's win % before each ply (length plies + 1). */
  winCurve: number[];
}

/** One position as the interface draws it (judged error or not). */
export interface FolioPosition {
  gameId: string;
  ply: number;
  moveNumber: number;
  color: "white" | "black";
  fen: string;
  played: { uci: string; san: string };
  best?: { uci: string; san: string };
  bestLine: string[];
  bestLineUci: string[];
  refutation?: string[];
  refutationUci?: string[];
  winBefore: number;
  winAfter: number;
  loss: number;
  judgement?: ErrorRow["judgement"];
  bestGap?: number;
  phase?: string;
  category?: string;
  clockTags?: string[];
  repeated?: boolean;
  clockBefore?: number;
  timeSpent?: number;
  opening?: ErrorRow["opening"];
  timeClass?: string;
  tactic?: ErrorRow["tactic"];
  endgameType?: string;
  outOfScope?: string;
  peer?: FolioPeer;
}

export interface FolioPeer {
  /** The mover's rating on the shown scale (the source's). */
  elo: number;
  /** What Maia was asked with (Lichess scale). */
  maiaEloSelf: number;
  maiaEloOppo: number;
  pPlayed: number;
  pGood: number;
  level?: string;
  avoidableLoss: number;
}

export interface FolioData {
  meta: { source: string; contractVersion: number; folioVersion: number; builtAt: number };
  /** The scale of every Elo the interface shows, and its distance to Maia's. */
  eloScale: EloScale;
  player: Report["player"];
  sample: Report["sample"];
  settings: Report["settings"];
  categories: Report["categories"];
  clock: Report["clock"];
  openings: Report["openings"];
  findings: Report["findings"];
  recommendations: Report["recommendations"];
  exercises: Report["exercises"];
  errors: FolioPosition[];
  /** Positions referenced by findings or recommendations that are not judged errors. */
  positions: Record<string, FolioPosition>;
  level?: Report["level"];
  profile?: Report["profile"];
  repertoireFixes?: Report["repertoireFixes"];
  rankings?: Report["rankings"];
  games: FolioGame[];
}

export interface LadderPoint {
  /** Shown scale (the source's). */
  elo: number;
  /** The rating Maia was asked at (Lichess scale). */
  maiaElo: number;
  pPlayed: number;
  pGood: number;
  top: [string, number][];
}

export interface FolioElo {
  meta: { model: string; population: string; maiaElos: number[]; note: string };
  positions: Record<string, { why: "exercise" | "evidence"; played: string; good: string[]; engine: { uci: string; win: number }[]; curve: LadderPoint[] }>;
}

function folioPeer(p: { eloSelf: number; eloOppo: number; pPlayed: number; pGood: number; level?: string; avoidableLoss: number }, source: EloSource): FolioPeer {
  return { elo: shownElo(p.eloSelf, source), maiaEloSelf: p.eloSelf, maiaEloOppo: p.eloOppo, pPlayed: r3(p.pPlayed), pGood: r3(p.pGood), level: p.level, avoidableLoss: p.avoidableLoss };
}

function slimError(e: ErrorRow, source: EloSource): FolioPosition {
  const out: FolioPosition = {
    gameId: e.gameId,
    ply: e.ply,
    moveNumber: e.moveNumber,
    color: e.color,
    fen: e.fen,
    played: e.played,
    best: e.best,
    bestLine: e.bestLine.san.slice(0, 8),
    bestLineUci: e.bestLine.uci.slice(0, 8),
    winBefore: e.winBefore,
    winAfter: e.winAfter,
    loss: e.loss,
    judgement: e.judgement,
    bestGap: e.bestGap,
    phase: e.phase,
    category: e.category,
    clockTags: e.clockTags,
    repeated: e.repeated,
    clockBefore: e.clockBefore,
    timeSpent: e.timeSpent,
    opening: e.opening,
    timeClass: e.timeClass,
  };
  if (e.refutation.uci.length) {
    out.refutation = e.refutation.san.slice(0, 8);
    out.refutationUci = e.refutation.uci.slice(0, 8);
  }
  if (e.tactic) out.tactic = e.tactic;
  if (e.endgameType) out.endgameType = e.endgameType;
  if (e.outOfScope) out.outOfScope = e.outOfScope;
  if (e.peer) out.peer = folioPeer(e.peer, source);
  return out;
}

/** A referenced position that pass 2 did not judge: built from pass 1 (and the peer record when there is one). */
function positionFromGame(g: AnalyzedGame, ply: number, decision: Decision | undefined, model: string): FolioPosition | undefined {
  const p = g.parsed.plies[ply - 1];
  const before = g.evals[ply - 1];
  const after = g.evals[ply];
  if (!p || !before || !after) return undefined;
  const winBefore = winPercentFor(before.score, p.color);
  const winAfter = winPercentFor(after.score, p.color);
  const loss = Math.max(0, winBefore - winAfter);
  const pv = before.lines[0]?.pv.slice(0, 8) ?? (decision ? [decision.engineBest] : []);
  const bestSan = pv.length ? sanLine(p.fenBefore, pv) : [];
  const out: FolioPosition = {
    gameId: g.game.id,
    ply,
    moveNumber: p.moveNumber,
    color: p.color,
    fen: p.fenBefore,
    played: { uci: p.uci, san: p.san },
    best: pv[0] && bestSan[0] ? { uci: pv[0], san: bestSan[0] } : undefined,
    bestLine: bestSan,
    bestLineUci: pv.slice(0, bestSan.length),
    winBefore: r1(winBefore),
    winAfter: r1(winAfter),
    loss: r1(loss),
    judgement: judge(loss),
    phase: decision?.phase,
    clockBefore: decision?.clockBefore,
    timeSpent: p.timeSpent,
    timeClass: g.game.timeClass,
  };
  if (decision?.inScope) out.peer = folioPeer(peerFields(decision, loss, model), g.game.source);
  return out;
}

function folioGame(row: Report["games"][number], g: AnalyzedGame | undefined, judged: Map<string, ErrorRow>): FolioGame {
  const plies: FolioPly[] = [];
  const winCurve: number[] = [];
  if (g) {
    for (const ev of g.evals) winCurve.push(r1(winPercentWhite(ev.score)));
    for (const p of g.parsed.plies) {
      const e = judged.get(keyOf(row.id, p.ply));
      plies.push({
        san: p.san,
        uci: p.uci,
        fen: p.fenAfter,
        clk: p.clockAfter === undefined ? undefined : r1(p.clockAfter),
        t: p.timeSpent === undefined ? undefined : r1(p.timeSpent),
        ...(e ? { j: e.judgement[0] as "i" | "m" | "b" } : {}),
      });
    }
  }
  return {
    id: row.id,
    url: row.url,
    white: { name: row.white, rating: g?.game.white.rating },
    black: { name: row.black, rating: g?.game.black.rating },
    color: row.playerColor,
    result: row.result,
    termination: row.termination,
    timeClass: row.timeClass,
    tc: g?.game.timeControl,
    endTime: row.endTime,
    opening: row.opening,
    openingEnd: row.openingEnd,
    winAfterOpening: row.winAfterOpening,
    accuracy: row.accuracy,
    patterns: row.patterns,
    decisive: row.decisive,
    playerMoves: row.playerMoves,
    errors: row.errors,
    startFen: g?.parsed.startFen ?? "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    plies,
    winCurve,
  };
}

/** Every {gameId, ply} the interface can show as a diagram. */
export function referencedPositions(report: Report): { gameId: string; ply: number }[] {
  const out: { gameId: string; ply: number }[] = [];
  for (const f of report.findings) out.push(...f.evidence);
  for (const r of report.recommendations) out.push(...r.prescription.positions);
  for (const x of report.repertoireFixes ?? []) out.push(...x.evidence);
  return out;
}

export function buildFolioData(report: Report, analyzed: AnalyzedGame[], decisions: Decision[] = [], builtAt = Date.now()): FolioData {
  const byId = new Map(analyzed.map((g) => [g.game.id, g]));
  const judged = new Map(report.errors.map((e) => [keyOf(e.gameId, e.ply), e]));
  const decisionAt = new Map(decisions.filter((d) => d.mover === "player").map((d) => [keyOf(d.gameId, d.ply), d]));
  const model = report.level?.model ?? "maia3-5m";
  // One source per study; `level.eloOffset` uses the same rule.
  const studySource: EloSource = analyzed.some((g) => g.game.source === "chesscom") ? "chesscom" : (analyzed[0]?.game.source ?? "pgn");
  const positions: Record<string, FolioPosition> = {};
  for (const { gameId, ply } of referencedPositions(report)) {
    const k = keyOf(gameId, ply);
    if (judged.has(k) || positions[k]) continue;
    const g = byId.get(gameId);
    const pos = g && positionFromGame(g, ply, decisionAt.get(k), model);
    if (pos) positions[k] = pos;
  }
  return {
    meta: { source: `Cerno report v${report.version}`, contractVersion: report.version, folioVersion: FOLIO_DATA_VERSION, builtAt },
    eloScale: eloScale(studySource),
    player: report.player,
    sample: report.sample,
    settings: report.settings,
    categories: report.categories,
    clock: report.clock,
    openings: report.openings,
    findings: report.findings,
    recommendations: report.recommendations,
    exercises: report.exercises,
    errors: report.errors.map((e) => slimError(e, byId.get(e.gameId)?.game.source ?? studySource)),
    positions,
    level: report.level,
    profile: report.profile,
    repertoireFixes: report.repertoireFixes,
    rankings: report.rankings,
    games: report.games.map((row) => folioGame(row, byId.get(row.id), judged)),
  };
}

/** Positions that get an Elo ladder: every exercise, the recommendations, and the first evidence of each finding. */
export function ladderTargets(data: FolioData, perFinding = 12, maxFindings = 12): { gameId: string; ply: number; why: "exercise" | "evidence" }[] {
  const out = new Map<string, { gameId: string; ply: number; why: "exercise" | "evidence" }>();
  for (const list of Object.values(data.exercises)) for (const x of list) out.set(keyOf(x.gameId, x.ply), { gameId: x.gameId, ply: x.ply, why: "exercise" });
  const add = (gameId: string, ply: number) => {
    const k = keyOf(gameId, ply);
    if (!out.has(k)) out.set(k, { gameId, ply, why: "evidence" });
  };
  for (const r of data.recommendations) r.prescription.positions.slice(0, perFinding).forEach((p) => add(p.gameId, p.ply));
  for (const f of data.findings.slice(0, maxFindings)) f.evidence.slice(0, perFinding).forEach((p) => add(p.gameId, p.ply));
  return [...out.values()];
}

/** Good moves of a position: from the peer record's evaluated set, else from pass 2's lines, else pass 1's best move. */
function goodMoves(g: AnalyzedGame, ply: number, decision: Decision | undefined): { good: string[]; engine: { uci: string; win: number }[] } {
  if (decision) {
    const engine = decision.moves
      .map((uci, i) => ({ uci, win: r1(decision.win[i]), inSet: decision.inSet[i], loss: decision.loss[i] }))
      .filter((m) => m.inSet)
      .sort((a, b) => b.win - a.win);
    return { good: engine.filter((m) => m.loss < LADDER_GOOD_LOSS).map((m) => m.uci), engine: engine.map(({ uci, win }) => ({ uci, win })) };
  }
  const color = g.parsed.plies[ply - 1].color;
  const lines = g.deep[ply]?.before.lines ?? g.evals[ply - 1]?.lines ?? [];
  const engine = lines.filter((l) => l.pv[0]).map((l) => ({ uci: l.pv[0], win: r1(winPercentFor(l.score, color)) }));
  const best = engine[0]?.win ?? 0;
  return { good: engine.filter((m) => best - m.win < LADDER_GOOD_LOSS).map((m) => m.uci), engine };
}

/** Maia-3's distribution at each ladder rating (both sides at that rating) for the target positions. */
export async function eloLadder(
  targets: { gameId: string; ply: number; why: "exercise" | "evidence" }[],
  analyzed: AnalyzedGame[],
  decisions: Decision[],
  deps: { predict: (q: MaiaQuery[]) => Promise<MaiaPrediction[]>; model: string; batchSize?: number; signal?: AbortSignal; onProgress?: (done: number, total: number) => void },
): Promise<FolioElo> {
  const byId = new Map(analyzed.map((g) => [g.game.id, g]));
  const decisionAt = new Map(decisions.filter((d) => d.mover === "player").map((d) => [keyOf(d.gameId, d.ply), d]));
  const items: { key: string; source: EloSource; why: "exercise" | "evidence"; played: string; fens: string[]; good: string[]; engine: { uci: string; win: number }[] }[] = [];
  for (const t of targets) {
    const g = byId.get(t.gameId);
    const p = g?.parsed.plies[t.ply - 1];
    if (!g || !p) continue;
    const fens = [g.parsed.startFen, ...g.parsed.plies.map((x) => x.fenAfter)].slice(Math.max(0, t.ply - 8), t.ply);
    const key = keyOf(t.gameId, t.ply);
    items.push({ key, source: g.game.source, why: t.why, played: p.uci, fens, ...goodMoves(g, t.ply, decisionAt.get(key)) });
  }
  const queries: MaiaQuery[] = items.flatMap((it) => LADDER_MAIA_ELOS.map((elo) => ({ fens: it.fens, eloSelf: elo, eloOppo: elo })));
  const batch = deps.batchSize ?? 256;
  const preds: MaiaPrediction[] = [];
  for (let i = 0; i < queries.length; i += batch) {
    if (deps.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    preds.push(...(await deps.predict(queries.slice(i, i + batch))));
    deps.onProgress?.(Math.min(i + batch, queries.length), queries.length);
  }
  const positions: FolioElo["positions"] = {};
  items.forEach((it, k) => {
    const curve = LADDER_MAIA_ELOS.map((elo, j) => {
      const policy = preds[k * LADDER_MAIA_ELOS.length + j].policy;
      const top = Object.entries(policy)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([u, p]) => [u, r3(p)] as [string, number]);
      return { elo: shownElo(elo, it.source), maiaElo: elo, pPlayed: r3(policy[it.played] ?? 0), pGood: r3(it.good.reduce((s, u) => s + (policy[u] ?? 0), 0)), top };
    });
    positions[it.key] = { why: it.why, played: it.played, good: it.good, engine: it.engine, curve };
  });
  return {
    meta: {
      model: deps.model,
      population: "Lichess blitz, both players at the same Elo",
      maiaElos: LADDER_MAIA_ELOS,
      note: `Good moves lose under ${LADDER_GOOD_LOSS} win % among the evaluated moves; moves not evaluated count as not good, so pGood is a lower bound.`,
    },
    positions,
  };
}
