import type { AnalysisSettings, AnalyzedGame, EvalCache } from "./analyze";
import { evalKey } from "./analyze";
import type { EnginePool } from "./engine";
import { EXPLANATION_VERSION, explanationProbeFens, type ExplanationProbes } from "./explain";
import { THRESHOLDS, winPercentFor } from "./winprob";

/** At most two cached searches per verified mistake/blunder. Old game caches
 * are enriched in place without repeating either of the original passes. */
export async function enrichExplanations(games: AnalyzedGame[], deps: {
  pool: EnginePool;
  settings: AnalysisSettings;
  cache?: EvalCache;
  signal?: AbortSignal;
  onProgress: (done: number, total: number) => void;
  onGame: (game: AnalyzedGame) => void;
}): Promise<void> {
  type Probe = { ply: number; kind: keyof ExplanationProbes; fen: string };
  const jobs: { game: AnalyzedGame; probes: Probe[] }[] = [];
  for (const game of games) {
    if (deps.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const probes: Probe[] = [];
    if (game.explanationVersion !== EXPLANATION_VERSION) {
      for (const [key, d] of Object.entries(game.deep)) {
        const ply = game.parsed.plies[Number(key) - 1];
        const best = d.before.lines[0]?.pv[0];
        if (!ply || ply.color !== game.game.playerColor || !best || best === ply.uci || winPercentFor(d.before.score, ply.color) - winPercentFor(d.after.score, ply.color) < THRESHOLDS.mistake) continue;
        d.explanation = { ...d.explanation };
        const fens = explanationProbeFens(ply.fenBefore, best);
        for (const kind of ["before", "best"] as const) {
          const fen = fens[kind];
          if (!fen || d.explanation[kind]) continue;
          const hit = await deps.cache?.getEval(evalKey(deps.settings, deps.settings.pass2Nodes, 1, fen));
          if (hit) d.explanation[kind] = hit;
          else probes.push({ ply: ply.ply, kind, fen });
        }
      }
    }
    jobs.push({ game, probes });
  }
  const total = jobs.reduce((s, j) => s + j.probes.length, 0);
  let done = 0;
  deps.onProgress(0, total);
  const finish = (game: AnalyzedGame) => {
    game.explanationVersion = EXPLANATION_VERSION;
    deps.onGame(game);
  };
  for (const j of jobs) if (!j.probes.length) finish(j.game);
  // One job per game retains the engine's hash locality. Identical probe FENs
  // within a game share one request, just as cached probes share eval entries.
  await deps.pool.run(jobs.filter((j) => j.probes.length), (j) => [...new Set(j.probes.map((p) => p.fen))].map((fen) => ({ fen, nodes: deps.settings.pass2Nodes, multiPv: 1 })),
    async (j, req, ev) => {
      const matched = j.probes.filter((p) => p.fen === req.fen);
      for (const p of matched) j.game.deep[p.ply].explanation![p.kind] = ev;
      await deps.cache?.setEval(evalKey(deps.settings, req.nodes, 1, req.fen), ev);
      done += matched.length;
      deps.onProgress(done, total);
      if (j.probes.every((p) => j.game.deep[p.ply].explanation?.[p.kind])) finish(j.game);
    }, deps.signal);
  if (deps.signal?.aborted) throw new DOMException("Aborted", "AbortError");
}
