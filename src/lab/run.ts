// Runs the full pipeline in the browser: fetch games, analyse, build report.
import { analyzeGames, DEFAULT_SETTINGS, type AnalyzedGame, type Progress } from "@/core/analyze";
import { IdbCache, workerTransport } from "@/core/browser";
import { defaultPoolSize, EnginePool } from "@/core/engine";
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
}

export interface RunTimings {
  fetchMs: number;
  analysisMs: number;
  workers: number;
  games: number;
  cachedGames: number;
}

export async function fetchGames(input: RunInput, signal?: AbortSignal): Promise<GameRecord[]> {
  const opts = { max: input.max, timeClasses: input.timeClasses, signal };
  if (input.source.kind === "chesscom") return fetchChesscomGames(input.source.username, opts);
  if (input.source.kind === "lichess") return fetchLichessGames(input.source.username, opts);
  return readPgnFile(input.source.text, input.source.player, opts);
}

export async function runAnalysis(
  input: RunInput,
  onProgress: (p: Progress | { phase: "fetch"; done: number; total: number }) => void,
  signal?: AbortSignal,
): Promise<{ games: GameRecord[]; analyzed: AnalyzedGame[]; timings: RunTimings }> {
  const t0 = performance.now();
  onProgress({ phase: "fetch", done: 0, total: input.max });
  const games = await fetchGames(input, signal);
  const t1 = performance.now();
  const workers = input.workers ?? defaultPoolSize(navigator.hardwareConcurrency);
  const cache = await IdbCache.open();
  const pool = new EnginePool(() => workerTransport(), workers);
  let cachedGames = 0;
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
    await cache?.flush();
    const t2 = performance.now();
    return {
      games,
      analyzed,
      timings: { fetchMs: Math.round(t1 - t0), analysisMs: Math.round(t2 - t1), workers, games: games.length, cachedGames },
    };
  } finally {
    pool.stop();
  }
}
