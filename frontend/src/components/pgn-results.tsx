import type { PgnAnalysis } from "@/lib/types";
import { phaseLabel } from "@/lib/format";
import { PhaseStatsCards } from "@/components/phase-stats";
import { GameViewer } from "@/components/game-viewer";

export function PgnAnalysisResult({
  result,
  sourcePgn,
}: {
  result: PgnAnalysis;
  sourcePgn: string;
}) {
  return (
    <section className="result-enter wide-shell space-y-5 border-t border-[var(--line-strong)] pt-7 sm:pt-10">
      <header className="grid border border-[var(--line-strong)] bg-[var(--surface)] sm:grid-cols-[1fr_auto]">
        <div className="p-5 sm:p-7">
          <p className="section-kicker">PGN report / complete</p>
          <h2 className="display-type mt-5 text-[clamp(3.4rem,8vw,6.6rem)] text-[var(--text-strong)]">
            Game analysis
          </h2>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-[var(--muted)]">
            Positions, evaluations, and critical moments reconstructed from the supplied PGN and engine output.
          </p>
        </div>
        <div className="flex min-w-56 items-end justify-between gap-5 border-t border-[var(--line-strong)] bg-[var(--accent-soft)] p-5 sm:border-l sm:border-t-0 sm:p-6">
          <div>
            <p className="eyebrow">Analyzed plies</p>
            <p className="display-type mt-2 text-6xl text-[var(--accent-strong)]">{result.total_moves}</p>
          </div>
          <span className="font-mono text-xs font-bold text-[var(--muted)]">PLY</span>
        </div>
      </header>

      <GameViewer result={result} sourcePgn={sourcePgn} />

      <div className="pt-3">
        <p className="eyebrow !text-[var(--accent)]">02 · Phase performance</p>
        <h3 className="display-type mt-2 text-4xl text-[var(--text-strong)] sm:text-5xl">Engine summary</h3>
      </div>
      <PhaseStatsCards stats={result.summary} />

      {result.phase_weaknesses.length ? (
        <section className="grid border border-[var(--line-strong)] bg-[var(--accent-soft)] sm:grid-cols-[minmax(220px,0.45fr)_1fr]">
          <div className="p-5 sm:border-r sm:border-[var(--line-strong)] sm:p-6">
            <p className="eyebrow !text-[var(--accent-strong)]">Priority phases</p>
            <h3 className="display-type mt-3 text-4xl text-[var(--text-strong)]">Where the losses cluster</h3>
          </div>
          <ul className="grid divide-y divide-[var(--line-strong)] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {result.phase_weaknesses.map((phase, index) => (
              <li key={phase} className="flex items-end justify-between gap-4 p-5">
                <span className="display-type text-3xl text-[var(--text-strong)]">{phaseLabel(phase)}</span>
                <span className="font-mono text-xs font-bold text-[var(--accent)]">0{index + 1}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </section>
  );
}
