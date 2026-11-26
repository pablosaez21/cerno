// Player card: the page before the preface. Who the player is in five axes against the
// opponents of the same games, a player type read off the style traits, and the numbers
// a sentence needs. No new statistic: every value comes from the report's profile.
// The interface writes the words (public/folio/card.js); here are only data and rules.
import type { AnalyzedGame } from "./analyze";
import type { Category } from "./classify";
import { MIN_CLASS_DECISIONS } from "./peer-stats";
import type { ProfileClass } from "./profile";
import type { Report } from "./report";
import type { StyleAttribute } from "./style";
import type { Source } from "./types";

/** The five axes, in drawing order (clockwise from the top). Táctica = forcing demand; Estrategia = quiet demand. */
export const CARD_AXES = ["phase:opening", "phase:middlegame", "phase:endgame", "demand:forcing", "demand:quiet"] as const;
export type CardAxisId = (typeof CARD_AXES)[number];
/** A clock statement needs |z| >= 3 (REPORT.md, clock). */
export const CARD_PACE_Z = 3;
/** The sentence names where the points go only when one category takes this share or more. */
export const CARD_MAIN_LOSS = 0.4;
/** At most this many style traits in the sentence. */
export const CARD_MAX_TRAITS = 3;

export type CardAxisState = "confirmed" | "suggestive" | "unresolved" | "insufficient" | "missing";

export interface CardAxis {
  id: CardAxisId;
  /** confirmed = grade A, suggestive = B, unresolved = C (within noise, never "equal"), insufficient = under the minimum sample, missing = not computed. */
  state: CardAxisState;
  direction?: "weaker" | "stronger";
  /** Where the vertex sits: 0 on the opponents' line, ±1 for B, ±2 for A. Never the size of the gap. */
  step: -2 | -1 | 0 | 1 | 2;
  gap?: number;
  ci95?: [number, number];
  grade?: "A" | "B" | "C";
  detectableGap?: number;
  decisions: number;
  minDecisions: number;
}

export interface CardTrait {
  attribute: StyleAttribute;
  more: boolean;
  zControlled: number;
}

export type PlayerTypeId = "attacker" | "simplifier" | "manoeuvrer" | "pawn_stormer" | "structural" | "cautious" | "active_king" | "balanced";

/**
 * Player types, first match wins. Each rule reads only style traits (|zControlled| >= 3,
 * opponents' own |z| < 3); "balanced" = style measured and no trait. The list is ours:
 * the interface shows only the player's own type.
 */
export const PLAYER_TYPES: { id: PlayerTypeId; rule: (has: (a: StyleAttribute, more: boolean) => boolean, traits: number) => boolean }[] = [
  { id: "attacker", rule: (h) => h("check", true) || h("to_attacked_square", true) || (h("capture", true) && h("advance", true)) },
  { id: "simplifier", rule: (h) => h("equal_trade", true) || h("queen_trade", true) },
  { id: "manoeuvrer", rule: (h) => (h("capture", false) || h("equal_trade", false)) && (h("pawn_move", false) || h("knight_move", true) || h("bishop_move", true) || h("retreat", true)) },
  { id: "pawn_stormer", rule: (h) => h("king_side_pawn_move", true) },
  { id: "structural", rule: (h) => h("pawn_move", true) },
  { id: "cautious", rule: (h) => h("retreat", true) || h("castling", true) || h("to_attacked_square", false) },
  { id: "active_king", rule: (h) => h("king_move", true) },
  { id: "balanced", rule: (_, n) => n === 0 },
];

export interface PlayerCard {
  player: string;
  /** The player's rating in the latest blitz game, as the source gives it (Chess.com or Lichess; PGN as given). Not Maia's scale. */
  rating?: { value: number; source: Source; endTime?: number };
  /** Blitz games only: the sample the axes are computed on. */
  record: { games: number; win: number; draw: number; loss: number };
  /** Absent without a profile (no WebGPU, or under 30 blitz games). */
  profile?: {
    axes: CardAxis[];
    /** Absent when the style traits were not computed. */
    type?: PlayerTypeId;
    traits: CardTrait[];
    /** More (faster) or fewer (slower) moves under 1.5 s than the opponents, when |z| >= 3. */
    pace?: "faster" | "slower";
  };
  /** The category that takes CARD_MAIN_LOSS or more of the win % lost, if any. */
  mainLoss?: { area: Category; share: number };
}

function axis(id: CardAxisId, c: ProfileClass | undefined): CardAxis {
  if (!c) return { id, state: "missing", step: 0, decisions: 0, minDecisions: MIN_CLASS_DECISIONS };
  const base = { id, decisions: c.decisions, minDecisions: MIN_CLASS_DECISIONS };
  if (c.insufficient || !c.grade || c.gap === undefined) return { ...base, state: "insufficient", step: 0 };
  const dir = c.gap < 0 ? -1 : 1;
  const nums = { gap: c.gap, ci95: c.ci95, grade: c.grade, detectableGap: c.detectableGap };
  if (c.grade === "C") return { ...base, ...nums, state: "unresolved", step: 0 };
  return { ...base, ...nums, state: c.grade === "A" ? "confirmed" : "suggestive", direction: dir < 0 ? "weaker" : "stronger", step: ((c.grade === "A" ? 2 : 1) * dir) as CardAxis["step"] };
}

/** Traits for the sentence: strongest first; "fewer captures" is dropped when "fewer equal trades" says it. */
function sentenceTraits(traits: CardTrait[]): CardTrait[] {
  let out = [...traits].sort((a, b) => Math.abs(b.zControlled) - Math.abs(a.zControlled));
  if (out.some((t) => t.attribute === "equal_trade" && !t.more)) out = out.filter((t) => !(t.attribute === "capture" && !t.more));
  return out.slice(0, CARD_MAX_TRAITS);
}

export function playerCard(report: Report, analyzed: AnalyzedGame[]): PlayerCard {
  const blitz = report.games.filter((g) => g.timeClass === "blitz");
  const record = { games: blitz.length, win: 0, draw: 0, loss: 0 };
  for (const g of blitz) record[g.result]++;
  let rating: PlayerCard["rating"];
  for (const a of analyzed) {
    const g = a.game;
    const r = (g.playerColor === "white" ? g.white : g.black).rating;
    if (g.timeClass !== "blitz" || r === undefined) continue;
    if (!rating || (g.endTime ?? 0) > (rating.endTime ?? 0)) rating = { value: r, source: g.source, endTime: g.endTime };
  }
  const shares = (Object.entries(report.categories) as [Category, { winLossShare: number }][]).sort((a, b) => b[1].winLossShare - a[1].winLossShare);
  const top = shares[0];
  const card: PlayerCard = { player: report.player.name, rating, record };
  if (top && top[1].winLossShare >= CARD_MAIN_LOSS) card.mainLoss = { area: top[0], share: top[1].winLossShare };
  const P = report.profile;
  if (!P) return card;
  const byId = new Map([...P.classes, ...(P.combined ?? [])].map((c) => [c.id, c]));
  const traits: CardTrait[] = P.style.filter((t) => t.trait).map((t) => ({ attribute: t.attribute, more: t.controlled > 0, zControlled: t.zControlled }));
  const has = (a: StyleAttribute, more: boolean) => traits.some((t) => t.attribute === a && t.more === more);
  const type = P.style.length ? PLAYER_TYPES.find((x) => x.rule(has, traits.length))?.id : undefined;
  const fast = P.clock.paired.find((x) => x.id === "share_moves_under_1_5s");
  card.profile = {
    axes: CARD_AXES.map((id) => axis(id, byId.get(id))),
    type,
    traits: sentenceTraits(traits),
    pace: fast && Math.abs(fast.z) >= CARD_PACE_Z ? (fast.mean > 0 ? "faster" : "slower") : undefined,
  };
  return card;
}
