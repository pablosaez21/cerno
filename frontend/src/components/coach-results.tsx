import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { CoachAnalysis } from "@/lib/types";
import { classificationTone, formatPawnValue, titleCase } from "@/lib/format";
import { PhaseStatsCards } from "@/components/phase-stats";

export function CoachResults({ result }: { result: CoachAnalysis }) {
  return (
    <section className="result-enter shell space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">Analysis complete</p>
          <h2 className="mt-2 text-2xl font-semibold text-[var(--text)]">
            Lichess analysis
          </h2>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            {result.games_analyzed} of {result.games_requested} games analyzed
            for {result.username}.
          </p>
        </div>
        <Link
          href={`/player/${encodeURIComponent(result.username)}`}
          className="secondary-button w-fit"
        >
          View player profile
          <ArrowUpRight size={15} />
        </Link>
      </div>

      <article className="soft-card p-5 sm:p-6">
        <p className="eyebrow">Coach advice</p>
        <p className="mt-3 max-w-4xl text-sm leading-7 text-[var(--text)]">
          {result.coach_advice}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-xs font-medium text-[var(--text-muted)]">
            Main focus: {result.diagnosis.main_weakness}
          </span>
          {result.diagnosis.secondary_weakness ? (
            <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-xs font-medium text-[var(--text-muted)]">
              Secondary: {result.diagnosis.secondary_weakness}
            </span>
          ) : null}
        </div>
      </article>

      <PhaseStatsCards
        stats={result.diagnosis.phase_stats}
        showInaccuracies={false}
      />

      <section className="card p-5 sm:p-6">
        <SectionTitle title="Critical moments" />
        {result.critical_moments.length ? (
          <div className="mt-4 divide-y divide-[var(--border)]">
            {result.critical_moments.slice(0, 10).map((moment, index) => (
              <article
                key={`${moment.game_id}-${moment.move_number}-${index}`}
                className="grid gap-2 py-3 first:pt-0 last:pb-0 sm:grid-cols-[110px_1fr_auto] sm:items-center"
              >
                <p className="font-mono text-sm font-semibold">
                  {moment.move_number}. {moment.move}
                </p>
                <p className="text-sm text-[var(--text-muted)]">
                  {titleCase(moment.phase)} - Pawn loss:{" "}
                  <span className="font-mono text-[var(--text)]">
                    {formatPawnValue(moment.cpl)}
                  </span>
                </p>
                <span
                  className={`w-fit rounded-full border px-2.5 py-1 text-xs font-semibold ${classificationTone(moment.classification)}`}
                >
                  {titleCase(moment.classification)}
                </span>
              </article>
            ))}
          </div>
        ) : (
          <InlineEmpty text="No critical moments detected." />
        )}
      </section>

      <section className="soft-card p-5 sm:p-6">
        <SectionTitle title="Training plan" />
        <ol className="mt-4 space-y-3">
          {result.training_plan.week_plan.map((step, index) => (
            <li key={step} className="flex gap-3 text-sm leading-6">
              <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-[var(--surface)] font-mono text-xs font-semibold text-[var(--primary)]">
                {index + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="card p-5 sm:p-6">
        <SectionTitle title="Recommended theory" />
        {result.theory_recommendations.length ? (
          <div className="mt-4 space-y-4">
            {result.theory_recommendations.map((item, index) => (
              <article
                key={`${item.study_id}-${item.chapter}-${index}`}
                className="border-t border-[var(--border)] pt-4 first:border-t-0 first:pt-0"
              >
                <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                  <h3 className="text-sm font-semibold text-[var(--text)]">
                    {item.chapter || item.study_id || "Lichess study"}
                  </h3>
                  {item.category ? (
                    <span className="w-fit text-xs font-medium text-[var(--info)]">
                      {titleCase(item.category)}
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
                  {item.reason}
                </p>
                {item.source ? (
                  <a
                    href={item.source}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--info)] hover:underline"
                  >
                    Source
                    <ArrowUpRight size={14} />
                  </a>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <InlineEmpty text="No matching theory found." />
        )}
      </section>
    </section>
  );
}

function SectionTitle({ title }: { title: string }) {
  return (
    <div>
      <p className="eyebrow">{title}</p>
    </div>
  );
}

function InlineEmpty({ text }: { text: string }) {
  return (
    <p className="mt-4 rounded-[8px] border border-dashed border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-[var(--text-muted)]">
      {text}
    </p>
  );
}
