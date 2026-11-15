// Run the shipped browser script against a small DOM/board adapter. The move
// application, explanation extractor, templates and trainer handlers are real.
import fs from "node:fs";
import vm from "node:vm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fenOf, playLine, positionFromFen, sanOf } from "../../core/chess";
import { explainMove, type ExplanationInput } from "../../core/explain";
import cases from "../../core/__tests__/fixtures/explanations.json";

type Listener = (e: { key?: string; preventDefault(): void; target: NodeStub }) => unknown;
class NodeStub {
  hidden = false;
  disabled = false;
  textContent = "";
  innerHTML = "";
  className = "";
  dataset: Record<string, string> = {};
  attrs: Record<string, string> = {};
  events: Record<string, Listener> = {};
  nodes: Record<string, NodeStub> = {};
  groups: Record<string, NodeStub[]> = {};
  classList = { add() {}, remove() {}, replace() {} };
  addEventListener(name: string, listener: Listener) { this.events[name] = listener; }
  removeEventListener() {}
  remove() {}
  setAttribute(name: string, value: string) { this.attrs[name] = value; }
  removeAttribute(name: string) { delete this.attrs[name]; }
  querySelector(selector: string): NodeStub { return this.nodes[selector] ??= new NodeStub(); }
  querySelectorAll(selector: string): NodeStub[] { return this.groups[selector] ?? []; }
  closest() { return null; }
  getBoundingClientRect() { return { top: 100, bottom: 200 }; }
  fire(event: string, key?: string) { return this.events[event]?.({ key, preventDefault() {}, target: this }); }
}

function setup(name = "1.10", { reduced = false, saved = null as string | null, lang = "es" } = {}) {
  const c = cases.find((x) => x.name === name)! as ExplanationInput;
  const explanation = explainMove(c);
  const p = { key: "real", id: "real", gameId: "game", ply: 1, no: "1.1", turn: c.color[0], orientation: c.color, fen: c.fen,
    played: { uci: c.played, san: sanOf(c.fen, c.played)! }, solution: { uci: c.bestLine, san: explanation.best.san },
    refutation: { uci: c.refutation, san: explanation.played.san.slice(1) }, explanation, loss: 30, winBefore: 60, winAfter: 30,
  };
  const root = new NodeStub(), doc = new NodeStub(), why = root.querySelector("[data-explanation]");
  why.hidden = !saved;
  const played = new NodeStub(), best = new NodeStub(), prev = new NodeStub(), next = new NodeStub();
  played.dataset.whyLine = "played"; best.dataset.whyLine = "best";
  prev.dataset.whyStep = "prev"; next.dataset.whyStep = "next";
  why.groups["[data-why-line]"] = [played, best]; root.groups["[data-why-step]"] = [prev, next];
  const controls = root.querySelector("[data-why-controls]");
  root.nodes["[data-why-toggle]"] = controls.querySelector("[data-why-toggle]");
  controls.nodes['[data-why-step="prev"]'] = prev; controls.nodes['[data-why-step="next"]'] = next;
  const routes: { re: RegExp; fn: (...args: string[]) => { html: string; after(root: NodeStub): void } }[] = [];
  const leave: (() => void)[] = [], statuses = new Map<string, unknown>(saved ? [["ex.real", saved]] : []);
  let input: { onMove(from: string, to: string): Promise<void> } | null = null;
  const board = {
    fen: c.fen, map: {} as Record<string, string>, _input: { disabled: false }, arrows: {},
    input(value: typeof input) { input = value; },
    setFen(fen: string) { this.fen = fen; }, setBaseHighlight() {}, highlight() {}, stopLine() {},
    pencil(spec: unknown) { this.arrows = spec as object; },
  };
  for (const [sq, piece] of positionFromFen(c.fen).board) {
    const square = String.fromCharCode(97 + sq % 8) + (Math.floor(sq / 8) + 1);
    board.map[square] = piece.color[0] + ({ pawn: "P", knight: "N", bishop: "B", rook: "R", queen: "Q", king: "K" }[piece.role]);
  }
  const M = { D: { recommendations: [] }, chapters: [{ area: "tactics", no: 1 }], exSets: { tactics: [p] }, playerElo: () => null, glyph: () => "?" };
  const context = vm.createContext({ window: {}, console, setTimeout, clearTimeout, document: Object.assign(doc, { body: { contains: () => true } }), location: { hash: "" },
    CernoBoard: { applyUci: (fen: string, uci: string) => {
      const result = playLine(fen, [uci]);
      if (!result.moves.length) throw new Error("illegal playback: " + uci);
      return fenOf(result.positions[1]);
    } },
  });
  vm.runInContext(fs.readFileSync("public/folio/i18n.js", "utf8"), context);
  const I = context.window.FOLIO_I18N;
  const F = { M, state: { lang },
    t: (key: string, params?: object) => I.fill(I[lang][key] ?? I.en[key] ?? key, params), n: (v: number) => String(v),
    esc: (s: string) => String(s).replaceAll("<", "&lt;"), san: (s: string) => s, mvn: (_: number, s: string) => s,
    route: (re: RegExp, fn: typeof routes[number]["fn"]) => routes.push({ re, fn }),
    store: { get: (k: string, d: unknown) => statuses.get(k) ?? d, set: (k: string, v: unknown) => statuses.set(k, v) },
    line: (_: number, s: string[]) => s.join(" "), pctv: (n: number) => `${n}%`,
    diagram: () => '<figure id="fig-d1"></figure>', boards: [board], chess: () => ({}),
    reduced: () => reduced, motionOK: () => false, swapIn() {}, levelNote: () => "", lbl: (s: string) => s,
    onLeave: (fn: () => void) => leave.push(fn), uciSan: sanOf,
  };
  context.window.F = F;
  vm.runInContext(fs.readFileSync("public/folio/train.js", "utf8"), context);
  const page = routes.find((r) => r.re.test("/exercises/tactics/1"))!.fn("tactics", "1");
  page.after(root);
  return { F: context.window.F, I, root, why, page, p, board, played, best, prev, next, controls, statuses, leave, doc,
    solve: () => input!.onMove(c.bestLine[0].slice(0, 2), c.bestLine[0].slice(2, 4)),
    reveal: () => root.querySelector("[data-reveal]").fire("keydown", "Enter"),
  };
}

afterEach(() => vi.useRealTimers());

describe("exercise explanation UI", () => {
  it("keeps explanation controls hidden until solving, then exposes both replay lines", async () => {
    vi.useFakeTimers();
    const x = setup();
    expect(x.page.html).toContain('data-explanation hidden');
    expect(x.why.hidden).toBe(true);
    await x.solve();
    expect(x.why.hidden).toBe(false);
    expect(x.root.querySelector("[data-original-solution]").hidden).toBe(true);
    expect(x.statuses.get("ex.real")).toBe("solved");
    expect(x.best.attrs["aria-pressed"]).toBe("true");
    await vi.advanceTimersByTimeAsync(1000);
    expect(x.board.fen).toBe(fenOf(playLine(x.p.fen, [x.p.solution.uci[0]]).positions[1]));
  });

  it("switches to the played move, cancels the previous line and marks the hanging piece", async () => {
    vi.useFakeTimers();
    const x = setup();
    x.reveal();
    expect(x.statuses.get("ex.real")).toBe("revealed");
    await vi.advanceTimersByTimeAsync(1000);
    x.played.fire("click");
    expect(x.board.fen).toBe(x.p.fen);
    await vi.advanceTimersByTimeAsync(1000);
    expect(x.board.fen).toBe(fenOf(playLine(x.p.fen, [x.p.played.uci]).positions[1]));
    expect(x.board.arrows).toMatchObject({ pencil: [{ from: "d8", to: "h4" }] });
    x.played.fire("click");
    const paused = x.board.fen;
    await vi.advanceTimersByTimeAsync(5000);
    expect(x.board.fen).toBe(paused);
    expect(x.played.textContent).toBe("Verlo");
    x.played.fire("click");
    x.leave.forEach((f) => f());
    await vi.runAllTimersAsync();
    expect(x.board.fen).toBe(paused);
  });

  it("offers manual steps with reduced motion and keeps saved completion", () => {
    vi.useFakeTimers();
    const x = setup("1.10", { reduced: true, saved: "solved" });
    expect(x.why.hidden).toBe(false);
    x.played.fire("click");
    expect(vi.getTimerCount()).toBe(0);
    expect(x.prev.disabled).toBe(true);
    x.next.fire("click");
    expect(x.board.fen).toBe(fenOf(playLine(x.p.fen, [x.p.played.uci]).positions[1]));
    x.prev.fire("click");
    expect(x.board.fen).toBe(x.p.fen);
    x.reveal();
    expect(x.statuses.get("ex.real")).toBe("solved");
  });

  it("explains exchanges in plain Spanish, keeps promotion values and states the honest fallback", () => {
    const x = setup("1.2");
    expect(x.page.html).toContain("Pierdes una torre y un peón por un caballo.");
    expect(x.page.html).toContain("La amenaza de Nxe4 ya estaba si pasabas el turno.");
    const quiet = setup("3.10");
    expect(quiet.page.html).toContain("El motor prefiere esta línea, pero no dice por qué.");
    expect(quiet.page.html).not.toContain("Ganas");
    const promo = x.F.exerciseExplanation({ ...x.p, explanation: { ...x.p.explanation, best: { ...x.p.explanation.best, facts: [{ kind: "material", outcome: { net: 8, lost: [], won: [], promotions: [{ color: "white", role: "queen" }] } }] } } });
    expect(promo.html).toContain("+8 peones, contando las coronaciones");
    const en = setup("1.2", { lang: "en" });
    expect(en.page.html).toContain("You lose a rook and a pawn for a knight.");
    expect(en.page.html).not.toContain("why.");
  });

  it("uses the approved Spanish recommendation and solution labels", () => {
    const x = setup();
    expect(x.I.recTitle.es.missed_tactic).toBe("Atento a tus tácticas");
    expect(x.page.html).toContain("Solución (mantén pulsado)");
    const labels = fs.readFileSync("public/folio/labels.js", "utf8");
    expect(labels).toContain("Repasa tus propios errores");
    expect(labels).not.toContain("Repite tus propios errores");
  });
});
