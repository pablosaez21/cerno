import Link from "next/link";
import {
  ArrowUpRight,
  BookOpen,
  CheckCircle2,
  CircleAlert,
  Target,
} from "lucide-react";
import type { CoachAnalysis } from "@/lib/types";
import { classificationTone, titleCase } from "@/lib/format";
import { PhaseStatsCards } from "@/components/phase-stats";

export function CoachResults({ result }: { result: CoachAnalysis }) {
  return (
    <section className="result-enter mx-auto max-w-6xl px-5 pb-20 sm:px-8">
      <div className="mb-7 flex flex-col gap-4 border-b border-[#d8dfda] pb-7 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase text-[#1f624b]">
            Analysis complete
          </p>
          <h2 className="display-type text-3xl sm:text-4xl">
            Your coaching report
          </h2>
          <p className="mt-2 text-sm text-[#64706a]">
            {result.games_analyzed} of {result.games_requested} requested games
            analyzed for {result.username}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${
              result.saved
                ? "border-emerald-200 bg-emerald-50 text-[#24624d]"
                : "border-[#d8dfda] bg-white text-[#64706a]"
            }`}
          >
            <CheckCircle2 size={14} />
            {result.saved ? "Saved to profile" : "Not saved"}
          </span>
          <Link
            href={`/player/${encodeURIComponent(result.username)}`}
            className="inline-flex min-h-10 items-center gap-2 rounded-[6px] border border-[#17211d] bg-white px-4 text-sm font-semibold hover:bg-[#edf1ee]"
          >
            View player profile
            <ArrowUpRight size={15} />
          </Link>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
        <article className="rounded-[6px] bg-[#17211d] p-6 text-white sm:p-8">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase text-[#8fc0a8]">
            <Target size={15} />
            Main weakness
          </div>
          <h3 className="display-type mt-5 max-w-2xl text-3xl leading-tight sm:text-4xl">
            {result.diagnosis.main_weakness}
          </h3>
          <p className="mt-5 max-w-3xl text-sm leading-7 text-[#c9d4ce]">
            {result.diagnosis.summary}
          </p>
        </article>

        <article className="rounded-[6px] border border-[#d8dfda] bg-white p-6">
          <p className="text-xs font-semibold uppercase text-[#64706a]">
            Focus next
          </p>
          <ul className="mt-4 space-y-3">
            {result.diagnosis.recommended_focus.map((focus) => (
              <li key={focus} className="flex gap-3 text-sm leading-6">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-[#1f624b]" />
                {focus}
              </li>
            ))}
          </ul>
        </article>
      </div>

      <ResultSection eyebrow="Performance map" title="Where the games slipped">
        <PhaseStatsCards stats={result.diagnosis.phase_stats} />
      </ResultSection>

      <ResultSection eyebrow="Review queue" title="Critical moments">
        {result.critical_moments.length ? (
          <div className="divide-y divide-[#d8dfda] rounded-[6px] border border-[#d8dfda] bg-white">
            {result.critical_moments.slice(0, 10).map((moment, index) => (
              <article
                key={`${moment.game_id}-${moment.move_number}-${index}`}
                className="grid gap-3 p-4 sm:grid-cols-[80px_1fr_auto] sm:items-center"
              >
                <div>
                  <p className="font-mono text-xs text-[#7b8982]">MOVE</p>
                  <p className="mt-1 font-mono text-lg font-semibold">
                    {moment.move_number}. {moment.move}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-semibold">
                    {titleCase(moment.phase)}
                  </p>
                  <p className="mt-1 text-xs text-[#64706a]">
                    Game {moment.game_id} · {moment.cpl} centipawn loss
                  </p>
                </div>
                <span
                  className={`w-fit rounded-full border px-2.5 py-1 text-xs font-semibold ${classificationTone(moment.classification)}`}
                >
                  {titleCase(moment.classification)}
                </span>
              </article>
            ))}
          </div>
        ) : (
          <InlineEmpty text="No critical moments were detected in this sample." />
        )}
      </ResultSection>

      <div className="section-rule mt-12 grid gap-10 pt-10 lg:grid-cols-2">
        <div>
          <SectionHeading eyebrow="Study" title="Recommended theory" />
          <div className="mt-5 space-y-3">
            {result.theory_recommendations.length ? (
              result.theory_recommendations.map((item, index) => (
                <article
                  key={`${item.study_id}-${item.chapter}-${index}`}
                  className="rounded-[6px] border border-[#d8dfda] bg-white p-5"
                >
                  <div className="flex items-start justify-between gap-4">
                    <BookOpen className="text-[#1f624b]" size={19} />
                    {item.category ? (
                      <span className="rounded-full bg-[#edf1ee] px-2.5 py-1 text-[11px] font-semibold text-[#526159]">
                        {titleCase(item.category)}
                      </span>
                    ) : null}
                  </div>
                  <h4 className="mt-4 font-semibold">
                    {item.chapter || "Lichess study"}
                  </h4>
                  <p className="mt-2 text-sm leading-6 text-[#64706a]">
                    {item.reason}
                  </p>
                  {item.source ? (
                    <a
                      href={item.source}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-[#1f624b] hover:underline"
                    >
                      Open source <ArrowUpRight size={13} />
                    </a>
                  ) : null}
                </article>
              ))
            ) : (
              <InlineEmpty text="No matching theory was found for this analysis." />
            )}
          </div>
        </div>

        <div>
          <SectionHeading eyebrow="Practice" title="Your training week" />
          <article className="mt-5 rounded-[6px] border border-[#aac5b7] bg-[#e5f0ea] p-5 sm:p-6">
            <p className="text-xs font-semibold uppercase text-[#1f624b]">
              Priority · {result.training_plan.priority}
            </p>
            <ol className="mt-6 space-y-4">
              {result.training_plan.week_plan.map((step, index) => (
                <li key={step} className="flex gap-4 text-sm leading-6">
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-white font-mono text-xs font-semibold text-[#1f624b]">
                    {index + 1}
                  </span>
                  <span className="pt-0.5">{step}</span>
                </li>
              ))}
            </ol>
          </article>
        </div>
      </div>

      {result.diagnosis.detected_patterns.length ? (
        <div className="mt-10 flex items-start gap-3 rounded-[6px] border border-[#d8dfda] bg-white p-5">
          <CircleAlert className="mt-0.5 shrink-0 text-[#a8661f]" size={19} />
          <div>
            <p className="text-sm font-semibold">Patterns detected</p>
            <p className="mt-1 text-sm leading-6 text-[#64706a]">
              {result.diagnosis.detected_patterns.join(" · ")}
            </p>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function ResultSection({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="section-rule mt-12 pt-10">
      <SectionHeading eyebrow={eyebrow} title={title} />
      <div className="mt-5">{children}</div>
    </section>
  );
}

function SectionHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase text-[#1f624b]">{eyebrow}</p>
      <h3 className="display-type mt-2 text-2xl sm:text-3xl">{title}</h3>
    </div>
  );
}

function InlineEmpty({ text }: { text: string }) {
  return (
    <div className="rounded-[6px] border border-dashed border-[#bdc9c2] bg-white p-6 text-sm text-[#64706a]">
      {text}
    </div>
  );
}
