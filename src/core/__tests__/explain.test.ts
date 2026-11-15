import { describe, expect, it } from "vitest";
import { fenOf, materialBalance, playLine, positionFromFen } from "../chess";
import { explainMove, explanationProbeFens, passTurn, type ExplanationInput } from "../explain";
import realCases from "./fixtures/explanations.json";

const real = (name: string) => realCases.find((c) => c.name === name)! as ExplanationInput;
const facts = (name: string) => explainMove(real(name));

describe("exercise explanations, the eleven positions shown in the proposal", () => {
  it("shows the actual back-rank mate, with distance from the mating side", () => {
    const e = facts("1.1");
    expect(e.played.facts).toContainEqual({ kind: "mate", winner: "white", moves: 2, backRank: true });
    expect(playLine(real("1.1").fen, e.played.uci).positions.at(-1)!.isCheckmate()).toBe(true);
    expect(e.best.facts.some((f) => f.kind === "mate")).toBe(false);
  });

  it("names the undefended knight, its square and the reply that takes it", () => {
    const e = facts("1.10");
    expect(e.played.facts).toContainEqual({ kind: "hanging", role: "knight", square: "h4", moved: true, reply: "Qxh4" });
    expect(e.played.marks).toContainEqual({ ply: 1, arrows: [{ from: "d8", to: "h4" }] });
    expect(e.threatBefore).toEqual({ kind: "not_found" });
  });

  it("shows the bishop's fork on the position where both targets are attacked", () => {
    const e = facts("1.4");
    expect(e.played.facts).toContainEqual({ kind: "fork", move: "Bc7", targets: [{ role: "queen", square: "b6" }, { role: "rook", square: "d8" }] });
    expect(e.played.marks).toContainEqual({ ply: 2, arrows: [{ from: "c7", to: "b6" }, { from: "c7", to: "d8" }] });
    expect(e.threatBefore?.kind).toBe("already_present");
  });

  it("records the pawn that stopped defending d5, rather than just a material number", () => {
    expect(facts("P2.9").played.facts).toContainEqual({ kind: "removed_defender", role: "pawn", from: "c6", victim: "pawn", square: "d5", reply: "Nxd5" });
  });

  it("counts both sides of an exchange and does not call a rook-for-knight loss a whole rook", () => {
    expect(facts("1.2").played.facts).toContainEqual({ kind: "material", outcome: { net: -3, lost: ["rook", "pawn"], won: ["knight"], promotions: [] } });
    expect(facts("1.16").played.facts).toContainEqual({ kind: "material", outcome: { net: -2, lost: ["bishop", "bishop"], won: ["bishop", "pawn"], promotions: [] } });
  });

  it("identifies the missed queen capture and the positive balance on the full best line", () => {
    const e = facts("1.18");
    expect(e.best.facts).toContainEqual({ kind: "free_capture", role: "queen", square: "h6", undefended: true, capturer: "queen" });
    expect(e.best.facts).toContainEqual(expect.objectContaining({ kind: "material", outcome: expect.objectContaining({ net: 10 }) }));
    expect(facts("1.5").best.facts).toContainEqual(expect.objectContaining({ kind: "material", outcome: expect.objectContaining({ net: 6 }) }));
  });

  it("keeps a prior threat in a strategic error as a conditional proof, without inventing a plan", () => {
    const e = facts("2.4");
    expect(e.played.facts).toEqual([]);
    expect(e.best.facts).toEqual([]);
    expect(e.threatBefore).toMatchObject({ kind: "already_present", move: "Qxh7+" });
  });

  it("states the loss of castling rights on the actual king-move line", () => {
    const e = facts("4.1");
    expect(e.played.facts).toEqual([{ kind: "castling_lost" }]);
    expect(e.best.facts).toEqual([]);
  });

  it("leaves a quiet ending unexplained", () => {
    const e = facts("3.10");
    expect(e.played.facts).toEqual([]);
    expect(e.best.facts).toEqual([]);
    expect(e.threatBefore).toBeUndefined();
  });

  it("keeps complete legal proof lines, matching SAN, marks and material numbers", () => {
    for (const c of realCases) {
      const e = explainMove(c as ExplanationInput);
      for (const line of [e.played, e.best]) {
        const played = playLine(c.fen, line.uci);
        expect(played.moves).toHaveLength(line.uci.length);
        expect(line.san).toHaveLength(line.uci.length);
        for (const m of line.marks) expect(m.ply).toBeLessThanOrEqual(line.uci.length);
        for (const fact of line.facts) if (fact.kind === "material") {
          expect(fact.outcome.net).toBe(materialBalance(played.positions.at(-1)!, c.color as "white" | "black") - materialBalance(played.positions[0], c.color as "white" | "black"));
        }
      }
    }
  });
});

describe("boundaries and conservative explanations", () => {
  it("cannot pass in check or in a terminal position, and clears en passant", () => {
    expect(passTurn("4k3/8/8/8/8/8/8/4R1K1 b - - 0 1")).toBeUndefined();
    expect(passTurn("7k/6Q1/5K2/8/8/8/8/8 b - - 0 1")).toBeUndefined();
    const fen = "4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1";
    expect(passTurn(fen)).toBe(fen.replace(" w - d6 ", " b - - "));
    const mate = "6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1";
    expect(explanationProbeFens(mate, "d1d8").best).toBeUndefined();
  });

  it("accounts for en passant and promotion material", () => {
    const ep = explainMove({ fen: "4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1", color: "white", played: "e1f1", bestLine: ["e5d6", "e8f7"], refutation: ["d5d4"], tactic: { tag: "missed_tactic" } });
    expect(ep.best.facts).toContainEqual({ kind: "material", outcome: { net: 1, lost: [], won: ["pawn"], promotions: [] } });
    const promo = explainMove({ fen: "k7/4P3/8/8/8/8/8/4K3 w - - 0 1", color: "white", played: "e1d1", bestLine: ["e7e8q", "a8b7"], refutation: ["a8b7"], tactic: { tag: "missed_tactic" } });
    expect(promo.best.facts).toContainEqual({ kind: "material", outcome: { net: 8, lost: [], won: [], promotions: [{ color: "white", role: "queen" }] } });
  });

  it("does not count a queen trade halfway through or explain an illegal PV", () => {
    const input: ExplanationInput = { fen: "3qk3/8/8/8/8/3Q4/8/3RK3 b - - 0 1", color: "black", played: "e8f7", bestLine: ["d8d3"], refutation: ["e1f2"], tactic: { tag: "missed_capture" } };
    expect(explainMove(input).best.facts).toEqual([]);
    expect(explainMove({ ...input, bestLine: ["d8d3", "a1a2"] }).best.facts).toEqual([]);
  });

  it("does not explain a fork with a pinned rook that cannot take either target", () => {
    const e = explainMove({ fen: "2k5/2r5/8/8/8/3p4/Q1N1B3/2R4K b - - 0 1", color: "black", played: "c7c6", bestLine: ["c7c2", "a2a1"], refutation: ["a2a1"], tactic: { tag: "missed_tactic" } });
    expect(e.best.facts).toContainEqual(expect.objectContaining({ kind: "material", outcome: expect.objectContaining({ net: 3 }) }));
    expect(e.best.facts.some((f) => f.kind === "fork")).toBe(false);
  });

  it("never claims a new attack when the piece already attacked that target", () => {
    // The queen already attacks a7 from a2; Qa3 does not create that threat.
    const input: ExplanationInput = { fen: "7k/r7/8/8/8/8/Q7/6K1 w - - 0 1", color: "white", played: "g1h1", bestLine: ["a2a3", "h8g8"], refutation: ["h8g8"], probes: { best: { score: { cp: 500 }, nodes: 500000, lines: [{ score: { cp: 500 }, depth: 10, pv: ["a3a7", "h8g8"] }] } } };
    expect(explainMove(input).best.facts.some((f) => f.kind === "new_attack")).toBe(false);
    // The h6 queen capture is a capture, not a newly created threat by a quiet move.
    const e = facts("1.18");
    expect(e.best.facts.some((f) => f.kind === "free_capture")).toBe(true);
    expect(e.best.facts.some((f) => f.kind === "new_attack")).toBe(false);
  });

  it("does not turn a missing probe or a different reply into a prior threat", () => {
    const c = real("1.10");
    expect(explainMove({ ...c, probes: undefined }).threatBefore).toBeUndefined();
    const incompleteMate = { before: { ...c.probes!.before!, score: { mate: -2 } } };
    expect(explainMove({ ...c, probes: incompleteMate }).threatBefore).toBeUndefined();
    const other = real("1.4");
    const probes = { before: { ...other.probes!.before!, lines: [{ score: { cp: 0 }, depth: 1, pv: ["c4e4", "g8f8"] }] } };
    expect(explainMove({ ...other, probes }).threatBefore).toBeUndefined();
  });

  it("a new-attack proof captures the named piece and starts from the hypothetical position", () => {
    const c = real("1.2"), e = facts("1.2");
    const fact = e.best.facts.find((f) => f.kind === "new_attack")!;
    expect(fact.kind).toBe("new_attack");
    if (fact.kind !== "new_attack") return;
    expect(fact).toMatchObject({ role: "knight", square: "g5" });
    expect(fact.proof.fen).toBe(explanationProbeFens(c.fen, c.bestLine[0]).best);
    expect(playLine(fact.proof.fen, fact.proof.uci).moves).toHaveLength(fact.proof.uci.length);
    expect(fenOf(positionFromFen(c.fen))).toBe(c.fen);
  });
});
