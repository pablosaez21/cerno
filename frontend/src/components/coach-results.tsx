import Link from "next/link";
import { ArrowUpRight, Check, CircleAlert } from "lucide-react";
import type { CoachAnalysis } from "@/lib/types";
import {
  classificationLabel,
  classificationTone,
  formatPawnValue,
  phaseLabel,
  titleCase,
} from "@/lib/format";
import { LichessGameReview } from "@/components/lichess-game-review";
import { PhaseStatsCards } from "@/components/phase-stats";

export function CoachResults({
  result,
  source = "lichess",
}: {
  result: CoachAnalysis;
  source?: "lichess" | "pgn";
}) {
  return (
    <section className="result-enter wide-shell space-y-5 border-t border-[var(--line-strong)] pt-7 sm:pt-10">
      <header className="grid border border-[var(--line-strong)] bg-[var(--surface)] lg:grid-cols-[1fr_auto]">
        <div className="p-5 sm:p-7">
          <p className="section-kicker">
            {source === "lichess" ? "Lichess" : "PGN"} report / complete
          </p>
          <h2 className="display-type mt-5 break-words text-[clamp(3.4rem,8vw,6.6rem)] text-[var(--text-strong)]">
            {result.username}
          </h2>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-[var(--muted)]">
            Diagnosis built from {result.games_analyzed} of {result.games_requested}{" "}
            {result.games_requested === 1 ? "requested game" : "requested games"}.
          </p>
        </div>
        <div className="grid min-w-64 border-t border-[var(--line-strong)] lg:border-l lg:border-t-0">
          <div className="flex items-end justify-between gap-5 bg-[var(--accent-soft)] p-5 sm:p-6">
            <div>
              <p className="eyebrow">Games analyzed</p>
              <p className="display-type mt-2 text-6xl text-[var(--accent-strong)]">{result.games_analyzed}</p>
            </div>
            <span className="font-mono text-xs font-bold text-[var(--muted)]">/{result.games_requested}</span>
          </div>
          {source === "lichess" ? (
            <Link
              href={`/player/${encodeURIComponent(result.username)}`}
              className="header-link !border-l-0 border-t border-[var(--line-strong)] !px-5"
            >
              View profile
              <ArrowUpRight size={17} aria-hidden="true" />
            </Link>
          ) : (
            <div className="header-link !cursor-default !border-l-0 border-t border-[var(--line-strong)] !px-5">
              Uploaded PGN
              <CircleAlert size={17} aria-hidden="true" />
            </div>
          )}
        </div>
      </header>

      <div className="status-strip" role="status">
        <span className="flex items-center gap-2">
          {result.saved ? <Check size={15} aria-hidden="true" /> : <CircleAlert size={15} aria-hidden="true" />}
          {result.saved ? "Analysis saved to player profile" : "Temporary report · not saved"}
        </span>
        {result.skipped_games.length ? (
          <span>{result.skipped_games.length} games skipped during analysis</span>
        ) : null}
      </div>

      <section className="grid border border-[var(--line-strong)] bg-[var(--surface)] lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
        <article className="p-5 sm:p-7 lg:border-r lg:border-[var(--line-strong)]">
          <p className="eyebrow !text-[var(--accent)]">01 · Coach reading</p>
          <p className="mt-5 max-w-4xl text-lg font-medium leading-8 text-[var(--text-strong)] sm:text-xl">
            {result.coach_advice}
          </p>
        </article>
        <aside className="border-t border-[var(--line-strong)] bg-[var(--night-deep)] p-5 sm:p-7 lg:border-t-0">
          <p className="eyebrow !text-[var(--accent-strong)]">Diagnosis</p>
          <h3 className="display-type mt-4 text-4xl text-[var(--text-strong)]">
            {phaseLabel(result.diagnosis.main_weakness)}
          </h3>
          {result.diagnosis.secondary_weakness ? (
            <p className="mt-2 font-mono text-xs uppercase tracking-[0.06em] text-[var(--muted)]">
              Secondary · {phaseLabel(result.diagnosis.secondary_weakness)}
            </p>
          ) : null}
          <p className="mt-5 border-t border-[var(--line)] pt-4 text-sm leading-6 text-[var(--muted-strong)]">
            {result.diagnosis.summary}
          </p>
          {result.diagnosis.detected_patterns.length ? (
            <div className="mt-5">
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--accent)]">
                Detected patterns
              </p>
              <ul className="mt-3 space-y-2 text-sm">
                {result.diagnosis.detected_patterns.map((pattern) => (
                  <li key={pattern} className="flex gap-2">
                    <span className="text-[var(--accent)]">◆</span>
                    <span>{pattern}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </aside>
      </section>

      {result.game_analyses?.length ? (
        <LichessGameReview games={result.game_analyses} />
      ) : null}

      <ReportHeading number="03" title="Phase performance" />
      <PhaseStatsCards stats={result.diagnosis.phase_stats} showInaccuracies={false} />

      <section className="border border-[var(--line-strong)] bg-[var(--surface)]">
        <ReportHeading
          number="04"
          title="Critical moments"
          count={result.critical_moments.length}
          inset
        />
        {result.critical_moments.length ? (
          <div className="divide-y divide-[var(--line)] border-t border-[var(--line-strong)]">
            {result.critical_moments.slice(0, 10).map((moment, index) => (
              <article
                key={`${moment.game_id}-${moment.move_number}-${index}`}
                className="grid gap-3 p-4 sm:grid-cols-[70px_120px_1fr_auto] sm:items-center sm:p-5"
              >
                <span className="font-mono text-xs font-bold text-[var(--accent)]">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <p className="font-mono text-base font-bold">
                  {moment.move_number}. {moment.move}
                </p>
                <p className="text-sm text-[var(--muted)]">
                  {phaseLabel(moment.phase)} · {formatPawnValue(moment.cpl)} pawns lost
                </p>
                <span className={classificationTone(moment.classification)}>
                  {classificationLabel(moment.classification)}
                </span>
              </article>
            ))}
          </div>
        ) : (
          <InlineEmpty text="No critical moments were detected." />
        )}
      </section>

      <section className="grid border border-[var(--line-strong)] lg:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)]">
        <div className="bg-[var(--accent-soft)] p-5 sm:p-7">
          <p className="eyebrow !text-[var(--accent-strong)]">05 · Weekly plan</p>
          <h3 className="display-type mt-5 text-5xl text-[var(--text-strong)] sm:text-6xl">Train with intent.</h3>
          <p className="mt-5 border-t border-[var(--line-strong)] pt-4 text-sm leading-6 text-[var(--muted-strong)]">
            Current priority: {result.training_plan.priority}
          </p>
          {result.diagnosis.recommended_focus.length ? (
            <ul className="mt-5 space-y-2 font-mono text-xs font-semibold uppercase text-[var(--accent-strong)]">
              {result.diagnosis.recommended_focus.map((focus) => (
                <li key={focus}>→ {focus}</li>
              ))}
            </ul>
          ) : null}
        </div>
        <ol className="divide-y divide-[var(--line)] bg-[var(--surface)]">
          {result.training_plan.week_plan.map((step, index) => (
            <li key={`${step}-${index}`} className="grid grid-cols-[54px_1fr] items-stretch">
              <span className="grid min-h-16 place-items-center border-r border-[var(--line-strong)] bg-[var(--night-deep)] font-mono text-sm font-bold text-[var(--accent)]">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="flex items-center p-4 text-sm font-medium leading-6 sm:px-6">
                {step}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className="border border-[var(--line-strong)] bg-[var(--surface)]">
        <ReportHeading
          number="06"
          title="Recommended theory"
          count={result.theory_recommendations.length}
          inset
        />
        {result.theory_recommendations.length ? (
          <div className="grid border-t border-[var(--line-strong)] md:grid-cols-2">
            {result.theory_recommendations.map((item, index) => (
              <article
                key={`${item.study_id}-${item.chapter}-${index}`}
                className="border-b border-[var(--line)] p-5 odd:md:border-r last:md:border-b-0"
              >
                <div className="flex items-start justify-between gap-4">
                  <h3 className="display-type text-2xl text-[var(--text-strong)]">
                    {item.chapter || item.study_id || "Lichess study"}
                  </h3>
                  <span className="font-mono text-xs font-bold text-[var(--accent)]">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                </div>
                {item.category ? (
                  <p className="mt-3 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
                    {titleCase(item.category)}
                  </p>
                ) : null}
                <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{item.reason}</p>
                {item.source ? (
                  <a
                    href={item.source}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-4 inline-flex items-center gap-2 font-mono text-xs font-bold uppercase text-[var(--accent)] hover:text-[var(--accent-strong)] hover:underline"
                  >
                    Open source
                    <ArrowUpRight size={14} aria-hidden="true" />
                  </a>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <InlineEmpty text="No related theory was found." />
        )}
      </section>
    </section>
  );
}

function ReportHeading({
  number,
  title,
  count,
  inset = false,
}: {
  number: string;
  title: string;
  count?: number;
  inset?: boolean;
}) {
  return (
    <div className={`flex items-end justify-between gap-4 ${inset ? "p-5 sm:p-6" : "pt-2"}`}>
      <div>
        <p className="eyebrow !text-[var(--accent)]">{number} · Report</p>
        <h3 className="display-type mt-2 text-4xl text-[var(--text-strong)] sm:text-5xl">{title}</h3>
      </div>
      {typeof count === "number" ? (
        <span className="border border-[var(--line-strong)] bg-[var(--accent-soft)] px-3 py-2 font-mono text-xs font-bold text-[var(--accent-strong)]">{count}</span>
      ) : null}
    </div>
  );
}

function InlineEmpty({ text }: { text: string }) {
  return (
    <p className="m-5 border border-dashed border-[var(--line-strong)] bg-[var(--night-deep)] p-5 text-sm text-[var(--muted)]">
      {text}
    </p>
  );
}
