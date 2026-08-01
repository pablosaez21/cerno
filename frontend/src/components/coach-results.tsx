import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  CircleAlert,
  Target,
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
  const additionalStudies = startingStudy
    ? studies.filter((study) => study.source_id !== startingStudy.source_id)
    : studies;
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
          <h2 className="display-type break-words text-[clamp(3.2rem,8vw,6.4rem)] text-[var(--text-strong)]">
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
        <SectionHeading title="Coach reading" />
        <p className="mt-5 max-w-5xl text-lg font-medium leading-8 text-[var(--text-strong)] sm:text-xl">
          {result.coach_advice}
        </p>
      </section>

      <section className="border border-[var(--line-strong)] bg-[var(--surface)]">
        <div className="p-5 sm:p-6">
          <SectionHeading title="Diagnosis" />
        </div>
        <div className="grid border-t border-[var(--line-strong)] sm:grid-cols-2">
          <DiagnosisFocus
            label="Primary weakness"
            phase={result.diagnosis.main_weakness}
            emphasized
          />
          <DiagnosisFocus
            label="Secondary weakness"
            phase={result.diagnosis.secondary_weakness}
          />
        </div>
      </section>

      <section className="border border-[var(--line-strong)] bg-[var(--surface)]">
        <div className="p-5 sm:p-6">
          <SectionHeading title="Weaknesses" />
        </div>
        <div className="border-t border-[var(--line-strong)]">
          <EvidenceList items={result.weaknesses} />
        </div>
      </section>

      <section className="border border-[var(--line-strong)] bg-[var(--night-deep)]">
        <div className="p-5 sm:p-6">
          <SectionHeading title="Detected patterns" />
        </div>
        {result.diagnosis.detected_patterns.length ? (
          <ul
            aria-label="Patterns found in the analyzed games"
            className="flex flex-wrap gap-3 border-t border-[var(--line-strong)] p-4 sm:p-5"
          >
            {result.diagnosis.detected_patterns.map((pattern, index) => (
              <li
                key={`${pattern}-${index}`}
                className="flex min-h-14 min-w-[min(100%,16rem)] flex-1 items-center gap-3 border border-[var(--line-strong)] bg-[var(--surface)] px-4 py-3"
              >
                <span className="grid size-9 shrink-0 place-items-center bg-[var(--accent-soft)] text-[var(--accent-strong)]">
                  <Target size={17} aria-hidden="true" />
                </span>
                <span className="text-sm font-semibold leading-5 text-[var(--text-strong)]">
                  {titleCase(pattern)}
                </span>
              </li>
            ))}
          </ul>
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
        <header className="border-b border-[var(--line-strong)] bg-[var(--accent-soft)] p-5 sm:p-7">
          <h3
            id="training-direction-title"
            className="display-type text-5xl text-[var(--text-strong)] sm:text-6xl"
          >
            So… what do we do?
          </h3>
        </header>

        <div className="min-w-0">
            {startingStudy && startingRecommendation ? (
              <aside
                aria-label="Recommended starting study"
                className="border-b border-[var(--line-strong)] bg-[var(--night-deep)] p-5 sm:p-7"
              >
                <p className="eyebrow !text-[var(--accent)]">Cerno&apos;s pick</p>
                <h4 className="display-type mt-3 text-3xl text-[var(--text-strong)] sm:text-4xl">
                  {startingStudy.title}
                </h4>
                {startingStudy.author || startingStudy.category ? (
                  <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
                    {[startingStudy.author, startingStudy.category ? titleCase(startingStudy.category) : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                ) : null}
                <p className="mt-4 max-w-3xl text-sm leading-6 text-[var(--muted-strong)]">
                  {conciseStudyRationale(startingRecommendation.explanation)}
                </p>
                <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
                  {startingStudy.canonical_url ? (
                    <a
                      href={startingStudy.canonical_url}
                      target="_blank"
                      rel="noreferrer"
                      className="primary-button w-fit"
                    >
                      Open recommended study
                      <ArrowUpRight size={17} aria-hidden="true" />
                    </a>
                  ) : null}
                  {startingStudy.attribution &&
                  startingStudy.attribution !== startingStudy.canonical_url ? (
                    <a
                      href={startingStudy.attribution}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono text-xs font-bold uppercase leading-5 text-[var(--muted)] hover:text-[var(--text-strong)] hover:underline"
                    >
                      Author profile
                    </a>
                  ) : null}
                  {startingStudy.license_url ? (
                    <a
                      href={startingStudy.license_url}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono text-xs font-bold uppercase leading-5 text-[var(--muted)] hover:text-[var(--text-strong)] hover:underline"
                    >
                      License
                    </a>
                  ) : null}
                </div>
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
                      <h4 className="display-type text-3xl text-[var(--text-strong)]">
                        {recommendation.title}
                      </h4>
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

            {additionalStudies.length ? (
              <section className="border-t border-[var(--line-strong)] p-5 sm:p-7">
                <h4 className="display-type text-3xl text-[var(--text-strong)]">
                  More interactive studies
                </h4>
                <div className="mt-5 grid gap-3 xl:grid-cols-2">
                  {additionalStudies.map((study) => (
                    <StudyReference key={study.source_id} source={study} />
                  ))}
                </div>
              </section>
            ) : null}
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

function DiagnosisFocus({
  label,
  phase,
  emphasized = false,
}: {
  label: string;
  phase?: string | null;
  emphasized?: boolean;
}) {
  return (
    <div
      className={`border-t border-[var(--line-strong)] p-5 first:border-t-0 sm:border-r sm:border-t-0 sm:p-6 sm:last:border-r-0 ${
        emphasized ? "bg-[var(--accent-soft)]" : "bg-[var(--night-deep)]"
      }`}
    >
      <p className="eyebrow !text-[var(--muted)]">{label}</p>
      <p className="display-type mt-2 text-4xl text-[var(--text-strong)]">
        {phase ? phaseLabel(phase) : "None detected"}
      </p>
    </div>
  );
}

function StudyReference({ source }: { source: CoachSource }) {
  return (
    <aside className="border border-[var(--line-strong)] bg-[var(--night-deep)] p-4">
      <h5 className="display-type text-2xl text-[var(--text-strong)]">
        {source.title}
      </h5>
      {source.chapter && source.chapter !== source.title ? (
        <p className="mt-2 text-sm font-semibold leading-5 text-[var(--muted-strong)]">
          {source.chapter}
        </p>
      ) : null}
      {source.author || source.category || source.content_license ? (
        <p className="mt-3 text-xs leading-5 text-[var(--muted)]">
          {[source.author, source.category ? titleCase(source.category) : null, source.content_license]
            .filter(Boolean)
            .join(" · ")}
        </p>
      ) : null}
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

function SectionHeading({ title }: { title: string }) {
  return (
    <div>
      <h3 className="display-type text-4xl text-[var(--text-strong)] sm:text-5xl">
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

function conciseStudyRationale(explanation: string): string {
  const concise = explanation
    .replace(/^I (?:would|(?:'|’)d) (?:begin|start) here because\s+/i, "")
    .trim();
  return concise
    ? `${concise.charAt(0).toUpperCase()}${concise.slice(1)}`
    : "This study best matches the main weakness detected in the analysis.";
}

function distinctStudies(sources: CoachSource[]): CoachSource[] {
  const studies = new Map<string, CoachSource>();
  for (const source of sources) {
    const key = source.source_id || source.canonical_url || source.citation_id;
    if (!studies.has(key)) studies.set(key, source);
  }
  return [...studies.values()];
}
