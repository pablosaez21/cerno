import type { PgnAnalysis } from "@/lib/types";
import { classificationTone, formatPawnValue, titleCase } from "@/lib/format";
import { PhaseStatsCards } from "@/components/phase-stats";

export function PgnAnalysisResult({ result }: { result: PgnAnalysis }) {
  return (
    <section className="result-enter shell space-y-4">
      <article className="card p-5 sm:p-6">
        <p className="eyebrow">PGN analysis</p>
        <h2 className="mt-2 text-2xl font-semibold text-[var(--text)]">
          Stockfish report
        </h2>
        <p className="mt-3 text-sm text-[var(--text-muted)]">
          Total moves:{" "}
          <span className="font-mono text-[var(--text)]">
            {result.total_moves}
          </span>
        </p>
      </article>

      <PhaseStatsCards stats={result.summary} />

      <section className="card p-5 sm:p-6">
        <p className="eyebrow">Critical moments</p>
        {result.critical_moments.length ? (
          <div className="mt-4 space-y-3">
            {result.critical_moments.slice(0, 12).map((moment, index) => (
              <details
                key={`${moment.move_number}-${moment.move_uci}-${index}`}
                className="rounded-[8px] border border-[var(--border)] bg-[var(--surface)]"
              >
                <summary className="grid cursor-pointer list-none gap-2 p-4 sm:grid-cols-[110px_1fr_auto] sm:items-center">
                  <span className="font-mono text-sm font-semibold">
                    {moment.move_number}. {moment.move_san}
                  </span>
                  <span className="text-sm text-[var(--text-muted)]">
                    {titleCase(moment.phase)} - Pawn loss:{" "}
                    <span className="font-mono text-[var(--text)]">
                      {formatPawnValue(moment.cpl)}
                    </span>
                  </span>
                  <span
                    className={`w-fit rounded-full border px-2.5 py-1 text-xs font-semibold ${classificationTone(moment.classification)}`}
                  >
                    {titleCase(moment.classification)}
                  </span>
                </summary>
                <div className="border-t border-[var(--border)] p-4">
                  <dl className="grid gap-3 text-xs">
                    <FenLine label="FEN before" value={moment.fen_before} />
                    <FenLine label="FEN after" value={moment.fen_after} />
                  </dl>
                </div>
              </details>
            ))}
          </div>
        ) : (
          <p className="mt-4 rounded-[8px] border border-dashed border-[var(--border)] p-4 text-sm text-[var(--text-muted)]">
            No inaccuracies, mistakes, or blunders detected.
          </p>
        )}
      </section>
    </section>
  );
}

function FenLine({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="mb-1 font-semibold text-[var(--text)]">{label}</dt>
      <dd className="overflow-x-auto rounded-[7px] bg-[var(--surface-soft)] p-3 font-mono text-[var(--text-muted)]">
        {value}
      </dd>
    </div>
  );
}
