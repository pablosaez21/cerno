// Hosts the Folio interface (plain scripts in public/folio/) inside the Next page.
// It loads the saved study, injects the scripts in order, and exposes
// `window.CernoApp`: start an analysis, follow its progress, open the result.
import { DEFAULT_SETTINGS } from "@/core/analyze";
import { IdbCache } from "@/core/browser";
import { buildFolioData, FOLIO_DATA_VERSION, ladderTargets, type FolioData, type FolioElo } from "@/core/folio-data";
import { buildReport, type Report } from "@/core/report";
import type { AnalyzedGame } from "@/core/analyze";
import type { TimeClass } from "@/core/types";
import { poolSizeFor, type LoadMode } from "@/core/engine";
import { calibrate } from "./calibrate";
import { liveCurve, liveDone, type LiveGame } from "./live";
import { calibrated, DEFAULT_LOAD, estimates, formatSecs, learn, type Pace } from "./pace";
import { runAnalysis, type RunProgress, type SourceInput } from "./run";

export const FOLIO_KEY = "folio";
/** Load order matters: each script reads the globals the previous ones set. */
export const FOLIO_SCRIPTS = ["vendor/chess.min.js", "labels.js", "board-folio.js", "i18n.js", "model.js", "core.js", "icons.js", "motion.js", "views.js", "train.js", "sieve.js", "cerno.js", "ascii.js", "export.js"];

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
  /** Stockfish workers in use, and the load mode that chose them. */
  workers?: number;
  load?: LoadMode;
  /** Game ids in the order played (oldest first): one square each on the wait's grid. */
  grid?: string[];
  /** Per game: what the wait shows of it so far. */
  byId: Record<string, LiveGame>;
  /** Findings of the games finished so far (rebuilt every few seconds), then of the study. */
  findings?: FolioData["findings"];
  /** The finished study, for the wait's last frame (level marks, the costliest mistake, what to train). */
  final?: Pick<FolioData, "findings" | "recommendations" | "errors"> & { exercises: number };
}

export interface StartInput {
  src: "chesscom" | "lichess" | "pgn";
  user: string;
  n: number;
  timeClasses: string[];
  pgn?: string;
  load?: LoadMode;
  /** Run Maia-3 (default true). Not offered in the interface: for measurements. */
  level?: boolean;
}

const PACE_KEY = "cerno.pace";
function readPace(): Pace | undefined {
  try {
    const p = JSON.parse(localStorage.getItem(PACE_KEY) ?? "null") as Pace | null;
    return p && p.calib && p.run ? p : undefined;
  } catch {
    return undefined;
  }
}
function savePace(p: Pace | undefined) {
  try {
    if (p) localStorage.setItem(PACE_KEY, JSON.stringify(p));
  } catch {
    // Storage blocked: the estimate is measured again next time.
  }
}

const EMPTY_ELO: FolioElo = { meta: { model: "", population: "", maiaElos: [], note: "" }, positions: {} };
/** Share of a first run's time per stage, WebGPU (measured: pass 1 ~55 %, pass 2 ~5 %, candidates ~35 %; Maia runs alongside pass 1). */
const WEIGHTS: Record<string, number> = { pass1: 0.55, pass2: 0.06, cand: 0.34, ladder: 0.03, book: 0.02 };
/** Without WebGPU Maia runs on the processor after Stockfish and takes most of the time
 *  (measured once, 25 games, Chromium: Stockfish ~45 s, Maia ~105 s, candidates ~15 s). */
const WEIGHTS_WASM: Record<string, number> = { pass1: 0.22, pass2: 0.03, maia: 0.58, cand: 0.1, ladder: 0.04, book: 0.03 };

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
  let calibrating: { abort: AbortController; done: Promise<boolean> } | undefined;
  const cores = () => navigator.hardwareConcurrency || 0;
  const live: LiveState = { status: "idle", startedAt: 0, progress: 0, stages: {}, byId: {} };
  const emit = () => listeners.forEach((fn) => fn());
  const set = (k: string, state: StageState, done = 0, total = 0) => (live.stages[k] = { state, done, total });
  const frac = (k: string) => {
    const s = live.stages[k];
    if (!s) return 0;
    if (s.state === "done" || s.state === "skip") return 1;
    return s.total ? s.done / s.total : 0;
  };
  const recompute = () => {
    live.progress = Object.entries(live.backend === "wasm" ? WEIGHTS_WASM : WEIGHTS).reduce((a, [k, wgt]) => a + wgt * frac(k), 0);
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
    // A calibration still running would share the processor with the analysis: drop it.
    calibrating?.abort.abort();
    const load = input.load ?? DEFAULT_LOAD;
    const workers = poolSizeFor(load, navigator.hardwareConcurrency);
    Object.assign(live, { status: "running", user: input.user, max: input.n, games: undefined, backend: undefined, startedAt: Date.now(), endedAt: undefined, progress: 0, stages: {}, error: undefined, workers: undefined, load, grid: undefined, byId: {}, findings: undefined, final: undefined });
    // Findings of the finished games, rebuilt now and then: the report is pure, no engine work, but it
    // runs on the page's thread and grows with the games (up to ~350 ms at 100 games, measured), so
    // the pause between rebuilds grows with it and the page stays responsive.
    const complete: AnalyzedGame[] = [];
    let rebuild: ReturnType<typeof setTimeout> | undefined;
    let rebuildEvery = 2000;
    const rebuildFindings = () => {
      rebuild = undefined;
      if (live.status !== "running" || !complete.length) return;
      const t0 = performance.now();
      try {
        live.findings = buildFolioData(buildReport(complete, input.user, DEFAULT_SETTINGS), complete, []).findings;
        emit();
      } catch {
        // A partial sample the report cannot take yet: wait for more games.
      }
      rebuildEvery = Math.max(2000, 25 * (performance.now() - t0));
    };
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
          workers,
          level: input.level,
          onGames: (games, workers) => {
            live.workers = workers;
            // fetched newest first, numbered in the order played
            games.forEach((g, i) => (live.byId[g.id] = { id: g.id, no: games.length - i, result: g.result, state: "q" }));
            live.grid = games.map((g) => g.id).reverse();
            emit();
          },
          onGame: ({ pass, game }) => {
            const lg = live.byId[game.game.id];
            if (!lg) return;
            if (pass === 1) Object.assign(lg, { state: "c", curve: liveCurve(game) });
            else {
              Object.assign(lg, liveDone(game), { state: "d" });
              complete.push(game);
              rebuild ??= setTimeout(rebuildFindings, rebuildEvery);
            }
            emit();
          },
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
      if (rebuild) clearTimeout(rebuild);
      live.findings = data.findings;
      live.final = { findings: data.findings, recommendations: data.recommendations, errors: data.errors, exercises: Object.values(data.exercises).flat().length };
      const study: SavedStudy = { version: FOLIO_DATA_VERSION, data, elo: res.ladder ?? EMPTY_ELO };
      const cache = await IdbCache.open();
      await cache?.setMeta(FOLIO_KEY, study);
      set("book", "done");
      live.status = "done";
      live.endedAt = Date.now();
      (window as unknown as { __cernoRun: unknown }).__cernoRun = { timings: res.timings };
      const t = res.timings;
      savePace(learn(readPace(), cores(), { workers: t.workers, nodes: t.nodes, stockfishMs: t.analysisMs + (t.candidatesMs ?? 0), freshGames: t.games - t.cachedGames }));
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
    /** Workers and estimated time per load mode for n new games; secs is undefined until measured. */
    loads(n: number) {
      const est = estimates(readPace(), cores(), n, !("gpu" in navigator));
      const show = (m: LoadMode) => ({ ...est[m], text: est[m].secs === undefined ? "" : formatSecs(est[m].secs!) });
      return { initial: DEFAULT_LOAD, soft: show("soft"), full: show("full") };
    },
    /** Measures this device once (about 2 s of Stockfish). Resolves true when new figures were stored. */
    calibrate(): Promise<boolean> {
      const counts = (["soft", "full"] as LoadMode[]).map((m) => poolSizeFor(m, navigator.hardwareConcurrency));
      const pace = readPace();
      if (pace && pace.cores === cores() && counts.every((c) => pace.calib[c])) return Promise.resolve(false);
      if (live.status === "running") return Promise.resolve(false);
      if (calibrating) return calibrating.done;
      const ctl = new AbortController();
      const done = calibrate(counts, ctl.signal)
        .then((nps) => {
          if (!nps) return false;
          savePace(calibrated(readPace(), cores(), nps));
          return true;
        })
        .catch(() => false)
        .finally(() => (calibrating = undefined));
      calibrating = { abort: ctl, done };
      return done;
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
