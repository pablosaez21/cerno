import { describe, expect, it } from "vitest";
import type { AnalyzedGame } from "../analyze";
import { CARD_AXES, playerCard } from "../card";
import type { Report } from "../report";
import type { StyleTrait } from "../style";

const cls = (id: string, o: Record<string, unknown>) => ({ id, family: id.split(":")[0], decisions: 600, opponentDecisions: 600, games: 90, cost: {}, nextLevel: { gainPerGame: 0, share: 0 }, evidence: [], ...o });
const graded = (id: string, gap: number, grade: "A" | "B" | "C") => cls(id, { gap, grade, ci95: [gap - 150, gap + 150], ci80: [gap - 90, gap + 90], detectableGap: 230 });
const trait = (attribute: StyleTrait["attribute"], controlled: number, zControlled: number, isTrait = true) => ({ attribute, controlled, zControlled, trait: isTrait }) as StyleTrait;
const row = (id: string, timeClass: string, result: "win" | "draw" | "loss") => ({ id, timeClass, result }) as Report["games"][number];
const analysed = (id: string, timeClass: string, endTime: number, rating: number, color: "white" | "black" = "white") =>
  ({ game: { id, source: "chesscom", timeClass, endTime, playerColor: color, white: { name: "a", rating: color === "white" ? rating : 1500 }, black: { name: "b", rating: color === "black" ? rating : 1500 } } }) as unknown as AnalyzedGame;
const cats = (tactics: number) => {
  const rest = (1 - tactics) / 3;
  return { tactics: { winLossShare: tactics }, strategy: { winLossShare: rest }, openings: { winLossShare: rest }, endgames: { winLossShare: rest } };
};

function report(profile: Partial<NonNullable<Report["profile"]>> | undefined, tactics = 0.71): Report {
  return {
    player: { name: "alice", sources: ["chesscom"] },
    categories: cats(tactics),
    games: [row("g1", "blitz", "win"), row("g2", "blitz", "loss"), row("g3", "blitz", "draw"), row("g4", "rapid", "win")],
    profile: profile && { classes: [], combined: [], style: [], clock: { paired: [], classes: [] }, ...profile },
  } as unknown as Report;
}

describe("player card", () => {
  const games = [analysed("g1", "blitz", 100, 1440), analysed("g2", "blitz", 300, 1457, "black"), analysed("g4", "rapid", 900, 1600)];

  it("counts blitz games only and takes the rating of the latest blitz game, on the source's scale", () => {
    const c = playerCard(report(undefined), games);
    expect(c.record).toEqual({ games: 3, win: 1, draw: 1, loss: 1 });
    expect(c.rating).toEqual({ value: 1457, source: "chesscom", endTime: 300 });
    expect(c.profile).toBeUndefined();
    expect(c.mainLoss).toEqual({ area: "tactics", share: 0.71 });
    expect(c.player).toBe("alice");
  });

  it("names where the points go only when one category takes 40 % or more", () => {
    expect(playerCard(report(undefined, 0.35), games).mainLoss).toBeUndefined();
  });

  it("places each axis by grade and direction only, never by the size of the gap", () => {
    const c = playerCard(report({
      classes: [graded("phase:opening", -131, "B"), graded("phase:middlegame", -25, "C"), graded("phase:endgame", 260, "A"), cls("demand:forcing", { insufficient: true, decisions: 90 })] as never,
      combined: [graded("demand:quiet", -300, "A")] as never,
    }), games);
    const axes = c.profile!.axes;
    expect(axes.map((a) => a.id)).toEqual([...CARD_AXES]);
    expect(axes.map((a) => [a.state, a.step, a.direction])).toEqual([
      ["suggestive", -1, "weaker"],
      ["unresolved", 0, undefined],
      ["confirmed", 2, "stronger"],
      ["insufficient", 0, undefined],
      ["confirmed", -2, "weaker"],
    ]);
    // Every graded axis carries its interval, grade and detectable gap.
    expect(axes[0]).toMatchObject({ gap: -131, ci95: [-281, 19], grade: "B", detectableGap: 230 });
    expect(axes[3]).toMatchObject({ decisions: 90, minDecisions: 150 });
  });

  it("marks an axis the report did not compute as missing", () => {
    const c = playerCard(report({ classes: [graded("phase:opening", -10, "C")] as never, combined: undefined as never }), games);
    expect(c.profile!.axes.find((a) => a.id === "demand:quiet")!.state).toBe("missing");
  });

  it("reads the type off the style traits, first rule that matches", () => {
    const style = [trait("pawn_move", -0.05, -4), trait("knight_move", 0.03, 3.5), trait("capture", -0.02, -3.4), trait("equal_trade", -0.02, -3.1), trait("rook_move", 0.01, 1, false)];
    const c = playerCard(report({ style }), games);
    expect(c.profile!.type).toBe("manoeuvrer");
    // "fewer captures" goes when "fewer trades" says it; at most three, strongest first; non-traits never.
    expect(c.profile!.traits.map((t) => `${t.attribute}:${t.more}`)).toEqual(["pawn_move:false", "knight_move:true", "equal_trade:false"]);
    expect(playerCard(report({ style: [trait("check", 0.02, 3.3), trait("equal_trade", 0.02, 3.1)] }), games).profile!.type).toBe("attacker");
  });

  it("calls a measured style with no trait balanced, and leaves the type out without style data", () => {
    expect(playerCard(report({ style: [trait("capture", 0.01, 1.2, false)] }), games).profile!.type).toBe("balanced");
    expect(playerCard(report({ style: [] }), games).profile!.type).toBeUndefined();
    // A trait no rule covers: no type, but the traits still reach the sentence.
    const odd = playerCard(report({ style: [trait("rook_move", 0.02, 3.2)] }), games).profile!;
    expect(odd.type).toBeUndefined();
    expect(odd.traits).toHaveLength(1);
  });

  it("states the pace only from |z| >= 3 on moves under 1.5 s against the opponents", () => {
    const pace = (z: number, mean: number) => playerCard(report({ clock: { paired: [{ id: "share_moves_under_1_5s", games: 90, mean, se: 0.01, z }], classes: [] } }), games).profile!.pace;
    expect(pace(3.09, 0.04)).toBe("faster");
    expect(pace(-3.2, -0.04)).toBe("slower");
    expect(pace(2.5, 0.03)).toBeUndefined();
  });
});
