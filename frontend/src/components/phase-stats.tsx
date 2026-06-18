import type { PhaseStat } from "@/lib/types";
import { formatNumber, formatPawnValue, titleCase } from "@/lib/format";
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
    <div className="grid gap-3 md:grid-cols-3">
      {phases.map((phase) => {
        const item = stats[phase] ?? {};
        return (
          <article key={phase} className="card p-4">
            <h3 className="text-sm font-semibold">{titleCase(phase)}</h3>
            <div className="mt-5 grid grid-cols-2 gap-x-3 gap-y-4">
              <Metric
                label="Avg. loss"
                value={formatPawnValue(item.avg_cpl)}
                info={{
                  title: "Average loss per move",
                  body: "This estimates how much value your moves lost compared with Stockfish's preferred move. It uses the same pawn-based evaluation idea as the engine bar: 0.30 is a small slip, 1.0 is usually serious. Lower is better.",
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
              <Metric
                label="Mistakes"
                value={formatNumber(item.mistakes, "0")}
              />
              <Metric
                label="Blunders"
                value={formatNumber(item.blunders, "0")}
              />
            </div>
          </article>
        );
      })}
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
      <div className="flex min-h-5 items-center gap-1.5 text-[11px] font-medium uppercase text-[var(--text-muted)]">
        <span>{label}</span>
        {info ? <MetricInfo info={info} /> : null}
      </div>
      <p className="mt-1 font-mono text-lg font-semibold leading-6">{value}</p>
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
        aria-label={`What is ${info.title}?`}
        className="flex size-5 cursor-pointer list-none items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-soft)] text-[var(--info)] transition-colors hover:border-[var(--info)] hover:bg-[var(--info-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--info)] [&::-webkit-details-marker]:hidden"
      >
        <Info size={13} strokeWidth={2.25} aria-hidden="true" />
      </summary>
      <div className="absolute left-0 top-7 z-20 w-64 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] p-3 text-left text-xs normal-case leading-5 text-[var(--text)] shadow-sm sm:left-1/2 sm:-translate-x-1/2">
        <p className="font-semibold">{info.title}</p>
        <p className="mt-1 text-[var(--text-muted)]">{info.body}</p>
        <a
          href={info.href}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex text-[var(--info)] underline-offset-2 hover:underline"
        >
          {info.linkLabel}
        </a>
      </div>
    </details>
  );
}
