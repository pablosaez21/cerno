import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  CircleAlert,
} from "lucide-react";
import type { CoachAnalysis } from "@/lib/types";
import { phaseLabel, titleCase } from "@/lib/format";
import { LichessGameReview } from "@/components/lichess-game-review";

type CoachSource = CoachAnalysis["sources"][number];

export function CoachResults({
  result,
  source = "lichess",
}: {
  result: CoachAnalysis;
  source?: "lichess" | "pgn";
}) {
  const sourceById = new Map(
    result.sources.map((item) => [item.citation_id, item]),
  );
  const studies = distinctStudies(result.sources);
  const startingRecommendation = result.actionable_recommendations.find(
    (recommendation) =>
      recommendation.evidence_type === "theory" &&
      recommendation.source_ids.some((sourceId) => sourceById.has(sourceId)),
  );
  const startingStudy = startingRecommendation
    ? sourceById.get(startingRecommendation.source_ids[0])
    : undefined;
  const practiceRecommendations = startingRecommendation
    ? result.actionable_recommendations.filter(
        (recommendation) => recommendation !== startingRecommendation,
      )
    : result.actionable_recommendations;
  const sourceCount = result.sources.length;

  return (
    <section className="result-enter wide-shell space-y-5 border-t border-[var(--line-strong)] pt-7 sm:pt-10">
      <header className="grid border border-[var(--line-strong)] bg-[var(--surface)] lg:grid-cols-[1fr_auto]">
        <div className="p-5 sm:p-7">
          <p className="section-kicker">
            {source === "lichess" ? "Lichess" : "PGN"} report / complete
          </p>
          <h2 className="display-type mt-5 break-words text-[clamp(3.2rem,8vw,6.4rem)] text-[var(--text-strong)]">
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
              <p className="display-type mt-2 text-6xl text-[var(--accent-strong)]">
                {result.games_analyzed}
              </p>
            </div>
            <span className="font-mono text-xs font-bold leading-5 text-[var(--muted)]">
              /{result.games_requested}
            </span>
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
          {result.saved ? (
            <Check size={15} aria-hidden="true" />
          ) : (
            <CircleAlert size={15} aria-hidden="true" />
          )}
          {result.saved
            ? "Analysis saved to player profile"
            : "Temporary report · not saved"}
        </span>
        <span>
          {result.grounding_status === "evidence_found"
            ? `Theory evidence · ${sourceCount} ${sourceCount === 1 ? "source" : "sources"}`
            : "Game-analysis evidence only"}
        </span>
        {result.skipped_games.length ? (
          <span>{result.skipped_games.length} games skipped during analysis</span>
        ) : null}
      </div>

      <section className="border border-[var(--line-strong)] bg-[var(--surface)] p-5 sm:p-7">
        <SectionHeading number="02" title="Coach reading" />
        <p className="mt-5 max-w-5xl text-lg font-medium leading-8 text-[var(--text-strong)] sm:text-xl">
          {result.coach_advice}
        </p>
      </section>

      <section className="grid border border-[var(--line-strong)] bg-[var(--surface)] lg:grid-cols-[minmax(240px,0.55fr)_minmax(0,1.45fr)]">
        <div className="bg-[var(--accent-soft)] p-5 sm:p-6 lg:border-r lg:border-[var(--line-strong)]">
          <SectionHeading number="03" title="Diagnosis" compact />
          <p className="eyebrow mt-7 !text-[var(--muted)]">Primary weakness</p>
          <p className="display-type mt-2 text-4xl text-[var(--text-strong)]">
            {phaseLabel(result.diagnosis.main_weakness)}
          </p>
          {result.diagnosis.secondary_weakness ? (
            <p className="mt-3 font-mono text-xs font-semibold uppercase leading-5 tracking-[0.05em] text-[var(--muted-strong)]">
              Secondary · {phaseLabel(result.diagnosis.secondary_weakness)}
            </p>
          ) : null}
        </div>
        <div className="flex items-center p-5 sm:p-7">
          <p className="max-w-4xl text-base leading-7 text-[var(--muted-strong)] sm:text-lg">
            {result.diagnosis.summary}
          </p>
        </div>
      </section>

      <section className="border border-[var(--line-strong)] bg-[var(--surface)]">
        <div className="p-5 sm:p-6">
          <SectionHeading number="04" title="Weaknesses" />
        </div>
        <div className="border-t border-[var(--line-strong)]">
          <EvidenceList items={result.weaknesses} />
        </div>
      </section>

      <section className="grid border border-[var(--line-strong)] bg-[var(--night-deep)] lg:grid-cols-[minmax(230px,0.45fr)_minmax(0,1.55fr)]">
        <div className="p-5 sm:p-6 lg:border-r lg:border-[var(--line-strong)]">
          <SectionHeading number="05" title="Detected patterns" compact />
        </div>
        {result.diagnosis.detected_patterns.length ? (
          <ol className="grid divide-y divide-[var(--line)] sm:grid-cols-2 sm:divide-x sm:divide-y-0">
            {result.diagnosis.detected_patterns.map((pattern, index) => (
              <li
                key={`${pattern}-${index}`}
                className="grid min-h-20 grid-cols-[38px_1fr] items-center gap-3 p-4 sm:p-5"
              >
                <span className="font-mono text-xs font-bold leading-5 text-[var(--accent)]">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="text-sm leading-6 text-[var(--muted-strong)]">
                  {pattern}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <InlineEmpty text="No recurring pattern was detected in this sample." />
        )}
      </section>

      {result.game_analyses?.length ? (
        <LichessGameReview games={result.game_analyses} />
      ) : null}

      <section
        aria-labelledby="training-direction-title"
        className="border border-[var(--line-strong)] bg-[var(--surface)]"
      >
        <div className="grid lg:grid-cols-[minmax(280px,0.55fr)_minmax(0,1.45fr)]">
          <header className="bg-[var(--accent-soft)] p-5 sm:p-7 lg:border-r lg:border-[var(--line-strong)]">
            <p className="eyebrow !text-[var(--accent-strong)]">07 · Training direction</p>
            <h3
              id="training-direction-title"
              className="display-type mt-4 text-5xl text-[var(--text-strong)] sm:text-6xl"
            >
              So… what do we do?
            </h3>
            <p className="mt-5 border-t border-[var(--line-strong)] pt-4 text-sm leading-6 text-[var(--muted-strong)]">
              Work on the diagnosed weaknesses with the recommended interactive
              studies. Choose your own pace and revisit the board positions as
              practical evidence.
            </p>
          </header>

          <div className="min-w-0">
            {startingStudy && startingRecommendation ? (
              <aside className="border-b border-[var(--line-strong)] bg-[var(--night-deep)] p-5 sm:p-7">
                <p className="eyebrow !text-[var(--accent)]">Cerno&apos;s starting point</p>
                <h4 className="display-type mt-3 text-3xl text-[var(--text-strong)] sm:text-4xl">
                  I would personally start with “{startingStudy.title}”.
                </h4>
                <p className="mt-4 max-w-3xl text-sm leading-6 text-[var(--muted-strong)]">
                  {startingRecommendation.explanation}
                </p>
                {startingRecommendation.actions.length ? (
                  <ul className="mt-5 space-y-2 border-t border-[var(--line)] pt-4 text-sm leading-6">
                    {startingRecommendation.actions.map((action) => (
                      <li key={action} className="flex gap-3">
                        <ArrowRight
                          className="mt-1 shrink-0 text-[var(--accent)]"
                          size={15}
                          aria-hidden="true"
                        />
                        <span>{withoutSchedulePrefix(action)}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </aside>
            ) : null}

            {practiceRecommendations.length ? (
              <ol className="divide-y divide-[var(--line-strong)]">
                {practiceRecommendations.map((recommendation, index) => (
                    <li
                      key={`${recommendation.title}-${index}`}
                      className="p-5 sm:p-6"
                    >
                      <p className="eyebrow !text-[var(--accent)]">
                        {String(index + 1).padStart(2, "0")} ·{" "}
                        {recommendation.evidence_type === "theory"
                          ? "Study-backed focus"
                          : "Board-backed focus"}
                      </p>
                      <h4 className="display-type mt-3 text-3xl text-[var(--text-strong)]">
                        {recommendation.title}
                      </h4>
                      <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--muted-strong)]">
                        {recommendation.explanation}
                      </p>
                      {recommendation.actions.length ? (
                        <ul className="mt-5 space-y-3 border-t border-[var(--line)] pt-4 text-sm leading-6">
                          {recommendation.actions.map((action) => (
                            <li key={action} className="flex gap-3">
                              <ArrowRight
                                className="mt-1 shrink-0 text-[var(--accent)]"
                                size={15}
                                aria-hidden="true"
                              />
                              <span>{withoutSchedulePrefix(action)}</span>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </li>
                  ))}
              </ol>
            ) : (
              <InlineEmpty text="No actionable recommendation was generated for this sample." />
            )}

            {studies.length ? (
              <section className="border-t border-[var(--line-strong)] p-5 sm:p-7">
                <p className="eyebrow !text-[var(--accent)]">Interactive study range</p>
                <h4 className="display-type mt-3 text-3xl text-[var(--text-strong)]">
                  Explore more than one path
                </h4>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--muted)]">
                  These studies matched the diagnosed weaknesses. Start with Cerno&apos;s
                  choice, then use the others to approach the same problem from
                  different positions.
                </p>
                <div className="mt-5 grid gap-3 xl:grid-cols-2">
                  {studies.map((study) => (
                    <StudyReference key={study.source_id} source={study} />
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        </div>

        {result.grounding_status === "insufficient_evidence" ? (
          <p className="border-t border-[var(--line-strong)] bg-[var(--night-deep)] p-5 text-sm leading-6 text-[var(--muted)] sm:px-7">
            No relevant interactive study was found in the current corpus. The
            recommendations above remain based on the game analysis, without an
            unrelated theory reference.
          </p>
        ) : null}
      </section>
    </section>
  );
}

function EvidenceList({
  items,
}: {
  items: string[];
}) {
  return (
    <div className="p-5 sm:p-6">
      {items.length ? (
        <ul className="mt-4 space-y-3 text-sm leading-6 text-[var(--muted-strong)]">
          {items.map((item, index) => (
            <li
              key={`${item}-${index}`}
              className="grid grid-cols-[28px_1fr] gap-2 border-t border-[var(--line)] pt-3 first:border-t-0 first:pt-0"
            >
              <span className="font-mono text-xs font-bold leading-5 text-[var(--accent)]">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
          None identified in this sample.
        </p>
      )}
    </div>
  );
}

function StudyReference({ source }: { source: CoachSource }) {
  return (
    <aside className="border border-[var(--line-strong)] bg-[var(--night-deep)] p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="eyebrow !text-[var(--accent)]">Interactive study</p>
        <span className="font-mono text-xs font-bold leading-5 text-[var(--accent-strong)]">
          {source.citation_id}
        </span>
      </div>
      <h5 className="display-type mt-3 text-2xl text-[var(--text-strong)]">
        {source.title}
      </h5>
      {source.chapter && source.chapter !== source.title ? (
        <p className="mt-2 text-sm font-semibold leading-5 text-[var(--muted-strong)]">
          {source.chapter}
        </p>
      ) : null}
      <p className="mt-3 text-xs leading-5 text-[var(--muted)]">
        {source.author || "Source author not supplied"}
        {source.category ? ` · ${titleCase(source.category)}` : ""}
        {source.content_license ? ` · ${source.content_license}` : ""}
      </p>
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
        {source.canonical_url ? (
          <a
            href={source.canonical_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 font-mono text-xs font-bold uppercase leading-5 text-[var(--accent)] hover:text-[var(--accent-strong)] hover:underline"
          >
            <BookOpen size={14} aria-hidden="true" />
            Open study
          </a>
        ) : null}
        {source.attribution && source.attribution !== source.canonical_url ? (
          <a
            href={source.attribution}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 font-mono text-xs font-bold uppercase leading-5 text-[var(--muted)] hover:text-[var(--text-strong)] hover:underline"
          >
            Author profile
            <ArrowUpRight size={14} aria-hidden="true" />
          </a>
        ) : null}
        {source.license_url ? (
          <a
            href={source.license_url}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-xs font-bold uppercase leading-5 text-[var(--muted)] hover:text-[var(--text-strong)] hover:underline"
          >
            License
          </a>
        ) : null}
      </div>
    </aside>
  );
}

function SectionHeading({
  number,
  title,
  compact = false,
}: {
  number: string;
  title: string;
  compact?: boolean;
}) {
  return (
    <div>
      <p className="eyebrow !text-[var(--accent)]">{number} · Report</p>
      <h3
        className={`display-type mt-2 text-[var(--text-strong)] ${
          compact ? "text-3xl sm:text-4xl" : "text-4xl sm:text-5xl"
        }`}
      >
        {title}
      </h3>
    </div>
  );
}

function InlineEmpty({ text }: { text: string }) {
  return (
    <p className="m-5 border border-dashed border-[var(--line-strong)] bg-[var(--night-deep)] p-5 text-sm leading-6 text-[var(--muted)]">
      {text}
    </p>
  );
}

function withoutSchedulePrefix(action: string): string {
  return action.replace(/^(?:day|week)\s+\d+\s*[:.–-]\s*/i, "");
}

function distinctStudies(sources: CoachSource[]): CoachSource[] {
  const studies = new Map<string, CoachSource>();
  for (const source of sources) {
    const key = source.source_id || source.canonical_url || source.citation_id;
    if (!studies.has(key)) studies.set(key, source);
  }
  return [...studies.values()];
}
