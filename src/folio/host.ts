// Hosts the Folio interface (plain scripts in public/folio/) inside the Next page.
// It loads the saved study, injects the scripts in order, and exposes
// `window.CernoApp`: start an analysis, follow its progress, open the result.
import { DEFAULT_SETTINGS } from "@/core/analyze";
import { IdbCache } from "@/core/browser";
import { buildFolioData, FOLIO_DATA_VERSION, ladderTargets, type FolioData, type FolioElo } from "@/core/folio-data";
import { buildReport, type Report } from "@/core/report";
import type { TimeClass } from "@/core/types";
import { runAnalysis, type RunProgress, type SourceInput } from "./run";

export const FOLIO_KEY = "folio";
/** Load order matters: each script reads the globals the previous ones set. */
export const FOLIO_SCRIPTS = ["vendor/chess.min.js", "labels.js", "board-folio.js", "i18n.js", "model.js", "core.js", "views.js", "train.js", "sieve.js", "cerno.js", "ascii.js"];

export interface SavedStudy {
  version: number;
  data: FolioData;
  elo: FolioElo;
}

type StageState = "wait" | "run" | "done" | "skip";
export interface LiveState {
  status: "idle" | "running" | "done" | "error";
  user?: string;
  max?: number;
  games?: number;
  backend?: "webgpu" | "wasm";
  startedAt: number;
  endedAt?: number;
  /** 0..1, weighted by where the time goes. */
  progress: number;
  stages: Record<string, { state: StageState; done: number; total: number }>;
  error?: string;
}

export interface StartInput {
  src: "chesscom" | "lichess" | "pgn";
  user: string;
  n: number;
  timeClasses: string[];
  pgn?: string;
}

const EMPTY_ELO: FolioElo = { meta: { model: "", population: "", maiaElos: [], note: "" }, positions: {} };
/** Share of a first run's time per stage (measured: pass 1 ~55 %, pass 2 ~5 %, candidates ~35 %). */
const WEIGHTS: Record<string, number> = { pass1: 0.55, pass2: 0.06, cand: 0.34, ladder: 0.03, book: 0.02 };

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.async = false;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`No se pudo cargar ${src}`));
    document.body.appendChild(s);
  });
}

export async function readStudy(): Promise<SavedStudy | undefined> {
  const cache = await IdbCache.open();
  const saved = await cache?.getMeta<SavedStudy>(FOLIO_KEY);
  return saved && saved.version === FOLIO_DATA_VERSION ? saved : undefined;
}

export async function bootFolio(base = "folio/"): Promise<void> {
  const w = window as unknown as Record<string, unknown>;
  const saved = await readStudy();
  w.CERNO_DATA = saved?.data ?? null;
  w.CERNO_ELO = saved?.elo ?? EMPTY_ELO;
  w.CernoApp = createApp();
  for (const s of FOLIO_SCRIPTS) await loadScript(base + s);
  const F = w.F as { render: () => void };
  window.addEventListener("hashchange", () => F.render());
  F.render();
}

function createApp() {
  const listeners = new Set<() => void>();
  let abort: AbortController | undefined;
  const live: LiveState = { status: "idle", startedAt: 0, progress: 0, stages: {} };
  const emit = () => listeners.forEach((fn) => fn());
  const set = (k: string, state: StageState, done = 0, total = 0) => (live.stages[k] = { state, done, total });
  const frac = (k: string) => {
    const s = live.stages[k];
    if (!s) return 0;
    if (s.state === "done" || s.state === "skip") return 1;
    return s.total ? s.done / s.total : 0;
  };
  const recompute = () => {
    live.progress = Object.entries(WEIGHTS).reduce((a, [k, wgt]) => a + wgt * frac(k), 0);
  };
  const finishBefore = (k: string) => {
    const order = ["fetch", "pass1", "pass2", "cand", "ladder", "book"];
    for (const o of order.slice(0, order.indexOf(k))) if (live.stages[o]?.state === "run" || live.stages[o]?.state === "wait") live.stages[o] = { ...(live.stages[o] ?? { done: 0, total: 0 }), state: "done" };
  };

  const onProgress = (p: RunProgress) => {
    switch (p.phase) {
      case "fetch":
        if (p.done && p.done === p.total) {
          live.games = p.done;
          set("fetch", "done", p.done, 0);
        } else set("fetch", "run");
        break;
      case "maia-download":
        if (p.backend) live.backend = p.backend;
        set("model", p.done >= p.total ? "done" : "run", p.done, p.total);
        break;
      case "pass1":
        finishBefore("pass1");
        set("pass1", p.done >= p.total ? "done" : "run", p.done, p.total);
        break;
      case "pass2":
        finishBefore("pass2");
        set("pass2", p.done >= p.total ? "done" : "run", p.done, p.total);
        break;
      case "done":
        finishBefore("cand");
        break;
      case "peers-maia":
        set("maia", p.done >= p.total ? "done" : "run", p.done, p.total);
        break;
      case "peers-candidates":
        finishBefore("cand");
        set("cand", p.done >= p.total ? "done" : "run", p.done, p.total);
        break;
      case "ladder":
        finishBefore("ladder");
        set("ladder", p.done >= p.total ? "done" : "run", p.done, p.total);
        break;
    }
    recompute();
    emit();
  };

  async function run(input: StartInput) {
    abort?.abort();
    abort = new AbortController();
    Object.assign(live, { status: "running", user: input.user, max: input.n, games: undefined, backend: undefined, startedAt: Date.now(), endedAt: undefined, progress: 0, stages: {}, error: undefined });
    for (const k of ["fetch", "model", "pass1", "pass2", "maia", "cand", "ladder", "book"]) set(k, "wait");
    set("fetch", "run");
    emit();
    const source: SourceInput = input.src === "pgn" ? { kind: "pgn", text: input.pgn ?? "", player: input.user } : { kind: input.src, username: input.user };
    let report: Report | undefined;
    let data: FolioData | undefined;
    try {
      const res = await runAnalysis(
        {
          source,
          max: input.n,
          timeClasses: input.timeClasses as TimeClass[],
          // The report is built once, when Maia can still draw the ladder for the positions it shows.
          ladder: (analyzed, peers) => {
            report = buildReport(analyzed, input.user, DEFAULT_SETTINGS, peers);
            data = buildFolioData(report, analyzed, peers?.decisions ?? []);
            return ladderTargets(data);
          },
        },
        onProgress,
        abort.signal,
      );
      if (!res.analyzed.length) throw new Error(input.src === "pgn" ? "No hay partidas legibles en ese PGN." : "No hay partidas con esos filtros.");
      finishBefore("book");
      set("book", "run");
      emit();
      if (!report || !data) {
        report = buildReport(res.analyzed, input.user, DEFAULT_SETTINGS, res.peers);
        data = buildFolioData(report, res.analyzed, res.peers?.decisions ?? []);
      }
      for (const k of ["maia", "cand", "ladder"]) if (live.stages[k]?.state === "wait") set(k, "skip");
      const study: SavedStudy = { version: FOLIO_DATA_VERSION, data, elo: res.ladder ?? EMPTY_ELO };
      const cache = await IdbCache.open();
      await cache?.setMeta(FOLIO_KEY, study);
      set("book", "done");
      live.status = "done";
      live.endedAt = Date.now();
      (window as unknown as { __cernoRun: unknown }).__cernoRun = { timings: res.timings };
    } catch (e) {
      live.status = "error";
      live.endedAt = Date.now();
      live.error = e instanceof DOMException && e.name === "AbortError" ? "Cancelado." : e instanceof Error ? e.message : String(e);
    }
    recompute();
    emit();
  }

  return {
    live,
    onChange(fn: () => void) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    start(input: StartInput) {
      void run(input);
    },
    cancel() {
      abort?.abort();
    },
    /** Reload so every script starts again from the new study. */
    openStudy() {
      location.hash = "#/contents";
      location.reload();
    },
    async forget() {
      await new Promise<void>((resolve) => {
        const req = indexedDB.deleteDatabase("cerno");
        req.onsuccess = req.onerror = req.onblocked = () => resolve();
      });
      try {
        Object.keys(localStorage).filter((k) => k.startsWith("cernod.ex.") || k === "cernod.lastInput").forEach((k) => localStorage.removeItem(k));
      } catch {
        // Storage blocked: nothing to delete.
      }
      location.hash = "#/";
      location.reload();
    },
  };
}
