// Runs the full pipeline in the browser: fetch games, Stockfish, Maia-3 peer analysis.
// With WebGPU, Maia runs on the GPU while Stockfish runs on the CPU (full mode:
// every move of both sides). Without it, only the player's judged moves are
// compared (reduced mode: no profile).
import { analyzeGames, DEFAULT_SETTINGS, gameKey, type AnalyzedGame, type Progress } from "@/core/analyze";
import { IdbCache, workerTransport } from "@/core/browser";
import { classifyGame } from "@/core/classify";
import { defaultPoolSize, EnginePool } from "@/core/engine";
import { parseGameMoves } from "@/core/game";
import { MAIA_MODELS, MaiaClient } from "@/core/maia-browser";
import { evaluatePeers, predictPeers, type PeerSkeleton } from "@/core/peer-analysis";
import type { Decision } from "@/core/peers";
import type { PeerInput } from "@/core/report";
import { eloLadder, type FolioElo } from "@/core/folio-data";
import { fetchChesscomGames, fetchLichessGames, readPgnFile } from "@/core/sources";
import type { GameRecord, TimeClass } from "@/core/types";

/** Bump when the decision record changes. */
export const PEER_VERSION = 1;

export type SourceInput =
  | { kind: "chesscom"; username: string }
  | { kind: "lichess"; username: string }
  | { kind: "pgn"; text: string; player: string };

export interface RunInput {
  source: SourceInput;
  max: number;
  timeClasses: TimeClass[];
  workers?: number;
  /** Run Maia-3. Default true. */
  level?: boolean;
  /** Stage 1: called when the Stockfish passes end, before the peer profile (plan: two-stage delivery). */
  onBase?: (analyzed: AnalyzedGame[], elapsedMs: number) => void;
  /** Positions that get Maia's Elo ladder, chosen from the finished analysis (Maia is still loaded then). */
  ladder?: (analyzed: AnalyzedGame[], peers: PeerInput | undefined) => { gameId: string; ply: number; why: "exercise" | "evidence" }[];
}

export interface RunTimings {
  fetchMs: number;
  /** Stockfish passes 1 and 2. */
  analysisMs: number;
  /** Maia-3 at five levels (overlaps the Stockfish passes in full mode). */
  maiaMs?: number;
  /** Candidate searches after the Stockfish passes. */
  candidatesMs?: number;
  /** Maia's Elo ladder for the shown positions. */
  ladderMs?: number;
  totalMs: number;
  /** When the base report (without the profile) was ready. */
  baseReadyMs?: number;
  workers: number;
  games: number;
  cachedGames: number;
  maia?: { backend: string; model: string; bytes: number; mode: "full" | "reduced" } | { error: string };
}

export type RunProgress = Progress | { phase: "fetch" | "maia-download" | "peers-maia" | "peers-candidates" | "ladder"; done: number; total: number; backend?: "webgpu" | "wasm" };

export async function fetchGames(input: RunInput, signal?: AbortSignal): Promise<GameRecord[]> {
  const opts = { max: input.max, timeClasses: input.timeClasses, signal };
  if (input.source.kind === "chesscom") return fetchChesscomGames(input.source.username, opts);
  if (input.source.kind === "lichess") return fetchLichessGames(input.source.username, opts);
  return readPgnFile(input.source.text, input.source.player, opts);
}

const peerKey = (model: string, id: string) => `${PEER_VERSION}|${model}|${gameKey(DEFAULT_SETTINGS, id)}`;

export async function runAnalysis(
  input: RunInput,
  onProgress: (p: RunProgress) => void,
  signal?: AbortSignal,
): Promise<{ games: GameRecord[]; analyzed: AnalyzedGame[]; peers?: PeerInput; ladder?: FolioElo; timings: RunTimings }> {
  const t0 = performance.now();
  const workers = input.workers ?? defaultPoolSize(navigator.hardwareConcurrency);
  const pool = new EnginePool(() => workerTransport(), workers);
  const model = MAIA_MODELS["maia3-5m"];
  // Engines and model start while the games download.
  const poolReady = pool.start();
  const maiaPromise =
    input.level === false
      ? undefined
      : MaiaClient.load(model, { onProgress: (loaded, total) => onProgress({ phase: "maia-download", done: loaded, total: total ?? model.bytes }) }).catch((e: Error) => e);
  onProgress({ phase: "fetch", done: 0, total: input.max });
  const games = await fetchGames(input, signal);
  onProgress({ phase: "fetch", done: games.length, total: games.length });
  const t1 = performance.now();
  const cache = await IdbCache.open();
  let cachedGames = 0;
  try {
    await poolReady;
    const maia = await maiaPromise;
    const client = maia instanceof MaiaClient ? maia : undefined;
    const full = client?.backend === "webgpu";
    if (client) onProgress({ phase: "maia-download", done: model.bytes, total: model.bytes, backend: client.backend });

    // Cached decisions per game; Maia runs only for the others.
    const cachedDecisions: Decision[] = [];
    const fresh: GameRecord[] = [];
    for (const g of games) {
      const c = client ? await cache?.getPeers(peerKey(model.id, g.id)) : undefined;
      if (c) cachedDecisions.push(...c);
      else fresh.push(g);
    }
    let maiaMs: number | undefined;
    const runMaia = async (gs: AnalyzedGame[]): Promise<PeerSkeleton[]> => {
      const tm = performance.now();
      const sk = await predictPeers(gs, { predict: (q) => client!.predict(q), batchSize: 256, onProgress, signal });
      maiaMs = Math.round(performance.now() - tm);
      return sk;
    };
    const parsedOnly: AnalyzedGame[] = [];
    for (const g of fresh) {
      try {
        parsedOnly.push({ game: g, parsed: parseGameMoves(g), evals: [], deep: {} });
      } catch {
        // Unreadable PGN: analyzeGames skips it too.
      }
    }
    const stockfish = analyzeGames(games, {
      pool,
      cache,
      settings: DEFAULT_SETTINGS,
      signal,
      onProgress: (p) => {
        cachedGames = p.cachedGames;
        onProgress(p);
      },
    });
    // Full mode: Maia on the GPU in parallel with Stockfish on the CPU.
    const [analyzed, skeletons] = await Promise.all([stockfish, full ? runMaia(parsedOnly) : Promise.resolve(undefined)]);
    const t2 = performance.now();
    input.onBase?.(analyzed, Math.round(t2 - t0));

    let peers: PeerInput | undefined;
    let ladder: FolioElo | undefined;
    let candidatesMs: number | undefined;
    let ladderMs: number | undefined;
    if (client) {
      try {
        let sk = skeletons;
        if (!full) {
          // Reduced mode: the player's judged moves only.
          const judged = new Set(analyzed.flatMap((g) => classifyGame(g).moves.filter((m) => m.judgement).map((m) => `${g.game.id}#${m.ply}`)));
          const freshIds = new Set(fresh.map((g) => g.id));
          sk = (await runMaia(analyzed.filter((g) => freshIds.has(g.game.id)))).filter((s) => judged.has(`${s.gameId}#${s.ply}`));
        }
        const tc = performance.now();
        const decisions = await evaluatePeers(sk ?? [], analyzed, { pool, cache, settings: DEFAULT_SETTINGS, onProgress, signal });
        candidatesMs = Math.round(performance.now() - tc);
        if (full) {
          const byGame = new Map<string, Decision[]>();
          for (const d of decisions) byGame.set(d.gameId, [...(byGame.get(d.gameId) ?? []), d]);
          for (const [id, ds] of byGame) await cache?.setPeers(peerKey(model.id, id), ds);
        }
        peers = { decisions: [...cachedDecisions, ...decisions], model: model.id, mode: full ? "full" : "reduced" };
        if (input.ladder) {
          const tl = performance.now();
          ladder = await eloLadder(input.ladder(analyzed, peers), analyzed, peers.decisions, {
            predict: (q) => client.predict(q),
            model: model.id,
            signal,
            onProgress: (done, total) => onProgress({ phase: "ladder", done, total }),
          });
          ladderMs = Math.round(performance.now() - tl);
        }
      } finally {
        client.terminate();
      }
    }
    await cache?.flush();
    const t3 = performance.now();
    return {
      games,
      analyzed,
      peers,
      ladder,
      timings: {
        fetchMs: Math.round(t1 - t0),
        analysisMs: Math.round(t2 - t1),
        maiaMs,
        candidatesMs,
        ladderMs,
        totalMs: Math.round(t3 - t0),
        baseReadyMs: Math.round(t2 - t0),
        workers,
        games: games.length,
        cachedGames,
        maia: client ? { backend: client.backend, model: model.id, bytes: model.bytes, mode: full ? "full" : "reduced" } : maia instanceof Error ? { error: maia.message } : undefined,
      },
    };
  } finally {
    pool.stop();
  }
}
