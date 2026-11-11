// Runs the full pipeline in the browser: fetch games, analyse, level analysis.
import { analyzeGames, DEFAULT_SETTINGS, type AnalyzedGame, type Progress } from "@/core/analyze";
import { IdbCache, workerTransport } from "@/core/browser";
import { classifyGame } from "@/core/classify";
import { defaultPoolSize, EnginePool } from "@/core/engine";
import { analyzeLevels, type LevelData } from "@/core/level-analysis";
import { MAIA_MODELS, MaiaClient } from "@/core/maia-browser";
import { fetchChesscomGames, fetchLichessGames, readPgnFile } from "@/core/sources";
import type { GameRecord, TimeClass } from "@/core/types";

export type SourceInput =
  | { kind: "chesscom"; username: string }
  | { kind: "lichess"; username: string }
  | { kind: "pgn"; text: string; player: string };

export interface RunInput {
  source: SourceInput;
  max: number;
  timeClasses: TimeClass[];
  workers?: number;
  /** Run Maia-3 level metrics. Default true. */
  level?: boolean;
}

export interface RunTimings {
  fetchMs: number;
  analysisMs: number;
  /** Model download + level analysis. */
  levelMs?: number;
  totalMs: number;
  workers: number;
  games: number;
  cachedGames: number;
  maia?: { backend: string; model: string; bytes: number } | { error: string };
}

export type RunProgress = Progress | { phase: "fetch" | "maia-download" | "maia" | "candidates"; done: number; total: number };

export async function fetchGames(input: RunInput, signal?: AbortSignal): Promise<GameRecord[]> {
  const opts = { max: input.max, timeClasses: input.timeClasses, signal };
  if (input.source.kind === "chesscom") return fetchChesscomGames(input.source.username, opts);
  if (input.source.kind === "lichess") return fetchLichessGames(input.source.username, opts);
  return readPgnFile(input.source.text, input.source.player, opts);
}

export async function runAnalysis(
  input: RunInput,
  onProgress: (p: RunProgress) => void,
  signal?: AbortSignal,
): Promise<{ games: GameRecord[]; analyzed: AnalyzedGame[]; level?: LevelData; timings: RunTimings }> {
  const t0 = performance.now();
  onProgress({ phase: "fetch", done: 0, total: input.max });
  const games = await fetchGames(input, signal);
  const t1 = performance.now();
  const workers = input.workers ?? defaultPoolSize(navigator.hardwareConcurrency);
  const cache = await IdbCache.open();
  const pool = new EnginePool(() => workerTransport(), workers);
  let cachedGames = 0;
  // The model downloads while Stockfish works.
  const model = MAIA_MODELS["maia3-5m"];
  const maiaPromise =
    input.level === false
      ? undefined
      : MaiaClient.load(model, { onProgress: (loaded, total) => onProgress({ phase: "maia-download", done: loaded, total: total ?? model.bytes }) }).catch((e: Error) => e);
  try {
    await pool.start();
    const analyzed = await analyzeGames(games, {
      pool,
      cache,
      settings: DEFAULT_SETTINGS,
      signal,
      onProgress: (p) => {
        cachedGames = p.cachedGames;
        onProgress(p);
      },
    });
    const t2 = performance.now();
    let level: LevelData | undefined;
    let maiaInfo: RunTimings["maia"];
    const maia = await maiaPromise;
    if (maia instanceof MaiaClient) {
      maiaInfo = { backend: maia.backend, model: maia.model.id, bytes: maia.model.bytes };
      try {
        level = await analyzeLevels(analyzed, {
          predict: (q) => maia.predict(q),
          maiaCache: cache,
          model: maia.model.id,
          pool,
          cache,
          settings: DEFAULT_SETTINGS,
          judged: (g) => new Set(classifyGame(g).moves.filter((m) => m.judgement).map((m) => m.ply)),
          onProgress,
          signal,
        });
      } finally {
        maia.terminate();
      }
    } else if (maia) {
      maiaInfo = { error: maia.message }; // The report is built without level fields.
    }
    await cache?.flush();
    const t3 = performance.now();
    return {
      games,
      analyzed,
      level,
      timings: {
        fetchMs: Math.round(t1 - t0),
        analysisMs: Math.round(t2 - t1),
        levelMs: maiaPromise ? Math.round(t3 - t2) : undefined,
        totalMs: Math.round(t3 - t0),
        workers,
        games: games.length,
        cachedGames,
        maia: maiaInfo,
      },
    };
  } finally {
    pool.stop();
  }
}
