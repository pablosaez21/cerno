// Hosts the Folio interface (plain scripts in public/folio/) inside the Next page.
// It loads the saved study, injects the scripts in order, and exposes
// `window.CernoApp`: start an analysis, follow its progress, open the result.
import { DEFAULT_SETTINGS } from "@/core/analyze";
import { IdbCache } from "@/core/browser";
import { buildFolioData, FOLIO_DATA_VERSION, ladderTargets, type FolioData, type FolioElo } from "@/core/folio-data";
import { buildReport, type Report } from "@/core/report";
import type { AnalyzedGame } from "@/core/analyze";
import type { TimeClass } from "@/core/types";
import { defaultPoolSize, type EnginePool, type LoadMode } from "@/core/engine";
import { calibrateRamp } from "./calibrate";
import { Diag } from "./diag";
import type { FindingsIn, FindingsOut } from "./findings-worker";
import { liveCurve, liveDone, type LiveGame } from "./live";
import { blockMaia, clearRun, isSmallDevice, maiaBlocked, markRun, markStage, takeCrash, unblockMaia, type RunStage } from "./mobile";
import { calibrated, DEFAULT_LOAD, estimates, formatSecs, learn, workersFor, type Pace } from "./pace";
import { hasPressure, watchPressure } from "./pressure";
import { runAnalysis, type RunProgress, type SourceInput } from "./run";

export const FOLIO_KEY = "folio";
/** Load order matters: each script reads the globals the previous ones set. */
export const FOLIO_SCRIPTS = ["vendor/chess.min.js", "labels.js", "board-folio.js", "i18n.js", "model.js", "core.js", "icons.js", "motion.js", "views.js", "train.js", "sieve.js", "cerno.js", "card.js", "ascii.js", "export.js"];

export interface SavedStudy {
  version: number;
  data: FolioData;
  elo: FolioElo;
}

type StageState = "wait" | "run" | "done" | "skip";
export interface LiveState {
  /** "crashed": the page died mid-run (the browser killed it, on a phone for lack of memory) and was reloaded. */
  status: "idle" | "running" | "done" | "error" | "crashed";
  /** After "crashed": where the run was, and whether it can be resumed (not a pasted PGN: its text is not kept). */
  crash?: { stage: RunStage; resumable: boolean };
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
  /** Engines searching at once when the brake has taken some away (CPU pressure). */
  limit?: number;
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
  /** For measurements: brake off. */
  brake?: boolean;
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

const storage = (k: "sessionStorage" | "localStorage"): Storage | undefined => {
  try {
    return window[k];
  } catch {
    return undefined;
  }
};

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
  const app = createApp();
  w.CernoApp = app;
  // A run the browser killed: open on the page that explains it, wherever the reload landed.
  if (app.live.status === "crashed") location.hash = "#/analysing";
  for (const s of FOLIO_SCRIPTS) await loadScript(base + s);
  const F = w.F as { render: () => void };
  window.addEventListener("hashchange", () => F.render());
  F.render();
}

function createApp() {
  const listeners = new Set<() => void>();
  let abort: AbortController | undefined;
  let calibrating: { abort: AbortController; done: Promise<boolean> } | undefined;
  let diag: Diag | undefined;
  const cores = () => navigator.hardwareConcurrency || 0;
  const nav = navigator as Navigator & { deviceMemory?: number };
  const small = isSmallDevice({ userAgent: nav.userAgent, maxTouchPoints: nav.maxTouchPoints, deviceMemory: nav.deviceMemory });
  const live: LiveState = { status: "idle", startedAt: 0, progress: 0, stages: {}, byId: {} };
  // A run the browser killed: say so, and on this device leave Maia out from now on if it was Maia.
  const crashed = takeCrash<StartInput>(storage("sessionStorage"));
  if (crashed) {
    if (crashed.stage === "maia") blockMaia(storage("localStorage"));
    Object.assign(live, { status: "crashed", user: crashed.input.user, max: crashed.input.n, startedAt: crashed.startedAt, crash: { stage: crashed.stage, resumable: crashed.input.src !== "pgn" } });
  }
  // A reload or a navigation the person chose is not a crash; a killed page never fires this.
  window.addEventListener("pagehide", () => clearRun(storage("sessionStorage")));
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
        // Only when Maia comes after Stockfish is a death here Maia's (alongside, it could be either).
        if (small) markStage(storage("sessionStorage"), "maia");
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
    const workers = workersFor(load, readPace(), cores());
    const level = input.level ?? (maiaBlocked(storage("localStorage")) ? false : undefined);
    Object.assign(live, { status: "running", crash: undefined, user: input.user, max: input.n, games: undefined, backend: undefined, startedAt: Date.now(), endedAt: undefined, progress: 0, stages: {}, error: undefined, workers: undefined, limit: undefined, load, grid: undefined, byId: {}, findings: undefined, final: undefined });
    lastInput = input;
    // The pasted PGN is not kept: it can be large, and a resume asks for it again.
    markRun(storage("sessionStorage"), { ...input, pgn: undefined }, live.startedAt);
    diag?.stop();
    lastTimings = undefined;
    const runDiag = (diag = new Diag({ userAgent: nav.userAgent, cores: cores(), memoryGb: nav.deviceMemory, load, workers, maiaAfter: small, pressureApi: hasPressure() }, phaseNow));
    runDiag.start();
    let pool: EnginePool | undefined;
    // The brake only in the default mode: "full" is for a computer left alone.
    const unwatch = watchPressure({
      max: load === "soft" && input.brake !== false ? workers : undefined,
      onState: (s) => runDiag.pressureState(s),
      onLimit: (n) => {
        pool?.setLimit(n);
        runDiag.limit(n);
        live.limit = n < workers ? n : undefined;
        emit();
      },
    });
    // Findings of the finished games, rebuilt now and then in a worker (findings-worker.ts): on the
    // page's thread the rebuild took up to ~210 ms at 100 games, a stall every few seconds of pass 2.
    // Without the worker, the same rebuild runs here, spaced by 25 times what it took.
    const complete: AnalyzedGame[] = [];
    let rebuild: ReturnType<typeof setTimeout> | undefined;
    let rebuildEvery = 2000;
    let fw: Worker | undefined;
    try {
      fw = new Worker("/findings-worker.js", { type: "module" });
    } catch {
      fw = undefined;
    }
    let fwBusy = false;
    let fwId = 0;
    if (fw) {
      fw.onmessage = (e: MessageEvent<FindingsOut>) => {
        fwBusy = false;
        if (e.data.id !== fwId || live.status !== "running") return;
        if (e.data.findings) live.findings = e.data.findings;
        emit();
      };
      fw.onerror = () => {
        fw?.terminate();
        fw = undefined;
        fwBusy = false;
      };
    }
    const rebuildFindings = () => {
      rebuild = undefined;
      if (live.status !== "running" || !complete.length) return;
      if (fw) {
        if (!fwBusy) {
          fwBusy = true;
          fw.postMessage({ type: "build", id: ++fwId, user: input.user } satisfies FindingsIn);
        }
        return;
      }
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
          level,
          maiaAfterStockfish: small,
          onPool: (p) => (pool = p),
          onGames: (games, workers) => {
            live.workers = workers;
            runDiag.info.games = games.length;
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
              fw?.postMessage({ type: "game", game } satisfies FindingsIn);
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
        (p) => {
          if (p.phase === "maia-download" && p.backend) runDiag.info.backend = p.backend;
          onProgress(p);
        },
        abort.signal,
      );
      lastTimings = res.timings;
      if (!res.analyzed.length) throw new Error(input.src === "pgn" ? "No hay partidas legibles en ese PGN." : "No hay partidas con esos filtros.");
      // Without Maia its stages did not run: mark them before finishBefore would call them done.
      if (!res.peers) for (const k of ["maia", "cand", "ladder"]) set(k, "skip");
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
    clearRun(storage("sessionStorage"));
    fw?.terminate();
    unwatch();
    runDiag.stop();
    recompute();
    emit();
  }
  let lastTimings: object | undefined;
  let lastInput: StartInput | undefined = crashed?.input;
  // What is running now, for the diagnostic: the stages in "run", joined ("pass1+maia").
  const phaseNow = () => {
    if (live.status !== "running") return live.status;
    return ["fetch", "model", "pass1", "pass2", "maia", "cand", "ladder", "book"].filter((k) => live.stages[k]?.state === "run").join("+") || "start";
  };

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
    /** After a crash: the same analysis again. What Stockfish finished is in the cache; Maia is
     *  left out if it was Maia that did not fit (see the crash handling above). */
    resume() {
      if (lastInput && lastInput.src !== "pgn") void run(lastInput);
    },
    /** Workers per load mode for n new games, and the time estimate of the default one (none for
     *  "full": it is not a faster option to pick, it is for a computer left alone). */
    loads(n: number) {
      const est = estimates(readPace(), cores(), n, !("gpu" in navigator));
      return {
        initial: DEFAULT_LOAD,
        soft: { ...est.soft, text: est.soft.secs === undefined ? "" : formatSecs(est.soft.secs) },
        full: { ...est.full, text: "" },
      };
    },
    /** Measures this device once (a few seconds of Stockfish, 1, 2, 3… workers until they slow down).
     *  Resolves true when new figures were stored. */
    calibrate(): Promise<boolean> {
      const pace = readPace();
      if (pace && pace.cores === cores() && pace.ramp) return Promise.resolve(false);
      if (live.status === "running") return Promise.resolve(false);
      if (calibrating) return calibrating.done;
      const ctl = new AbortController();
      const done = calibrateRamp(defaultPoolSize(cores()), ctl.signal)
        .then((nps) => {
          if (!nps) return false;
          savePace(calibrated(readPace(), cores(), nps, true));
          return true;
        })
        .catch(() => false)
        .finally(() => (calibrating = undefined));
      calibrating = { abort: ctl, done };
      return done;
    },
    /** The last analysis on this device, as text for the clipboard. Nothing is sent anywhere. */
    diagnostic(): string {
      if (!diag) return "";
      return diag.text({ status: live.status, error: live.error, timings: lastTimings });
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
        unblockMaia(localStorage);
      } catch {
        // Storage blocked: nothing to delete.
      }
      location.hash = "#/";
      location.reload();
    },
  };
}
