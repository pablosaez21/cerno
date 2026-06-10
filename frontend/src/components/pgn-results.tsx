import { Activity, Braces } from "lucide-react";
import type { PgnAnalysis } from "@/lib/types";
import { classificationTone, titleCase } from "@/lib/format";
import { PhaseStatsCards } from "@/components/phase-stats";

export function PgnAnalysisResult({ result }: { result: PgnAnalysis }) {
  return (
    <section className="result-enter mx-auto max-w-6xl px-5 pb-20 sm:px-8">
      <div className="mb-7 border-b border-[#d8dfda] pb-7">
        <p className="text-xs font-semibold uppercase text-[#1f624b]">
          Engine report
        </p>
        <h2 className="display-type mt-2 text-3xl sm:text-4xl">PGN analysis</h2>
        <p className="mt-2 text-sm text-[#64706a]">
          Stockfish reviewed {result.total_moves} half-moves across the game.
        </p>
      </div>

      <PhaseStatsCards stats={result.summary} />

      {result.phase_weaknesses.length ? (
        <div className="mt-5 flex flex-wrap gap-2">
          {result.phase_weaknesses.map((weakness) => (
            <span
              key={weakness}
              className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-[#8b561f]"
            >
              {weakness}
            </span>
          ))}
        </div>
      ) : null}

      <div className="section-rule mt-12 pt-10">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase text-[#1f624b]">
          <Activity size={15} />
          Critical moments
        </div>
        <div className="mt-5 space-y-3">
          {result.critical_moments.length ? (
            result.critical_moments.slice(0, 12).map((moment, index) => (
              <details
                key={`${moment.move_number}-${moment.move_uci}-${index}`}
                className="group rounded-[6px] border border-[#d8dfda] bg-white"
              >
                <summary className="grid cursor-pointer list-none gap-3 p-4 sm:grid-cols-[100px_1fr_auto] sm:items-center">
                  <span className="font-mono font-semibold">
                    {moment.move_number}. {moment.move_san}
                  </span>
                  <span className="text-sm text-[#64706a]">
                    {titleCase(moment.phase)} · {moment.cpl} CPL ·{" "}
                    {moment.evaluation_before} → {moment.evaluation_after}
                  </span>
                  <span
                    className={`w-fit rounded-full border px-2.5 py-1 text-xs font-semibold ${classificationTone(moment.classification)}`}
                  >
                    {titleCase(moment.classification)}
                  </span>
                </summary>
                <div className="border-t border-[#d8dfda] px-4 py-4">
                  <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-[#64706a]">
                    <Braces size={14} />
                    Position data
                  </div>
                  <dl className="grid gap-3 text-xs">
                    <div>
                      <dt className="mb-1 font-semibold">FEN before</dt>
                      <dd className="overflow-x-auto rounded-[5px] bg-[#f3f5f2] p-3 font-mono text-[#526159]">
                        {moment.fen_before}
                      </dd>
                    </div>
                    <div>
                      <dt className="mb-1 font-semibold">FEN after</dt>
                      <dd className="overflow-x-auto rounded-[5px] bg-[#f3f5f2] p-3 font-mono text-[#526159]">
                        {moment.fen_after}
                      </dd>
                    </div>
                  </dl>
                </div>
              </details>
            ))
          ) : (
            <p className="rounded-[6px] border border-dashed border-[#bdc9c2] bg-white p-6 text-sm text-[#64706a]">
              Stockfish found no inaccuracies, mistakes, or blunders.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
