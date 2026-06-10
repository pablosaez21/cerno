import type { PhaseStat } from "@/lib/types";
import { formatNumber, titleCase } from "@/lib/format";

const phases = ["opening", "middlegame", "endgame"];

export function PhaseStatsCards({
  stats,
}: {
  stats: Record<string, PhaseStat>;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {phases.map((phase) => {
        const item = stats[phase] ?? {};
        return (
          <article
            key={phase}
            className="rounded-[6px] border border-[#d8dfda] bg-white p-4"
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold">{titleCase(phase)}</h3>
              <span className="font-mono text-[11px] text-[#7b8982]">
                {formatNumber(item.moves, "—")} moves
              </span>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-x-3 gap-y-4">
              <Metric label="Avg. CPL" value={formatNumber(item.avg_cpl)} />
              <Metric
                label="Inaccuracies"
                value={formatNumber(item.inaccuracies, "0")}
              />
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

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase text-[#7b8982]">{label}</p>
      <p className="mt-1 font-mono text-lg font-semibold">{value}</p>
    </div>
  );
}
