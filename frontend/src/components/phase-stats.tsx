import type { PhaseStat } from "@/lib/types";
import { formatNumber, formatPawnValue, phaseLabel } from "@/lib/format";
import { Info } from "lucide-react";

const phases = ["opening", "middlegame", "endgame"];

export function PhaseStatsCards({
  stats,
  showInaccuracies = true,
}: {
  stats: Record<string, PhaseStat>;
  showInaccuracies?: boolean;
}) {
  return (
    <div className="border border-[var(--line-strong)] bg-[var(--surface)]">
      <div className="grid divide-y divide-[var(--line-strong)] md:grid-cols-3 md:divide-x md:divide-y-0">
        {phases.map((phase, index) => {
          const item = stats[phase] ?? {};
          return (
            <article key={phase} className="p-4 sm:p-5">
              <div className="flex items-baseline justify-between gap-3 border-b border-[var(--line)] pb-3">
                <h3 className="display-type text-3xl text-[var(--text-strong)]">{phaseLabel(phase)}</h3>
                <span className="font-mono text-xs font-bold text-[var(--accent)]">
                  0{index + 1}
                </span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-4">
                <Metric
                  label="Average loss"
                  value={formatPawnValue(item.avg_cpl)}
                  info={{
                    title: "Average loss per move",
                    body: "Compares each played move with Stockfish's preferred move and reports the difference in pawns. Lower is better.",
                    href: "https://www.chessprogramming.org/Centipawns",
                    linkLabel: "Technical note: centipawns",
                  }}
                />
                {showInaccuracies ? (
                  <Metric
                    label="Inaccuracies"
                    value={formatNumber(item.inaccuracies, "0")}
                  />
                ) : null}
                <Metric label="Mistakes" value={formatNumber(item.mistakes, "0")} />
                <Metric
                  label="Blunders"
                  value={formatNumber(item.blunders, "0")}
                />
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  info,
}: {
  label: string;
  value: string;
  info?: {
    title: string;
    body: string;
    href: string;
    linkLabel: string;
  };
}) {
  return (
    <div>
      <div className="flex min-h-5 items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.04em] text-[var(--muted)]">
        <span>{label}</span>
        {info ? <MetricInfo info={info} /> : null}
      </div>
      <p className="mt-1 font-mono text-2xl font-bold leading-7 text-[var(--text-strong)]">{value}</p>
    </div>
  );
}

function MetricInfo({
  info,
}: {
  info: {
    title: string;
    body: string;
    href: string;
    linkLabel: string;
  };
}) {
  return (
    <details className="group relative inline-flex">
      <summary
        aria-label={`What ${info.title} means`}
        className="flex size-5 cursor-pointer list-none items-center justify-center border border-[var(--line-strong)] bg-[var(--accent-soft)] text-[var(--accent-strong)] [&::-webkit-details-marker]:hidden"
      >
        <Info size={12} strokeWidth={2.5} aria-hidden="true" />
      </summary>
      <div className="absolute left-0 top-7 z-20 w-64 border border-[var(--line-strong)] bg-[var(--night-deep)] p-3 text-left text-xs normal-case leading-5 sm:left-1/2 sm:-translate-x-1/2">
        <p className="font-semibold text-[var(--text-strong)]">{info.title}</p>
        <p className="mt-1 text-[var(--muted)]">{info.body}</p>
        <a
          href={info.href}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex font-semibold text-[var(--accent)] underline-offset-2 hover:text-[var(--accent-strong)] hover:underline"
        >
          {info.linkLabel}
        </a>
      </div>
    </details>
  );
}
