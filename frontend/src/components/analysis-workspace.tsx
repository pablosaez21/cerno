"use client";

import { useRef, useState } from "react";
import { analyzeLichessUser, analyzePgn } from "@/lib/api";
import type { CoachAnalysis } from "@/lib/types";
import {
  AnalyzeLichessForm,
  AnalyzePgnForm,
  type LichessFormValue,
  type PgnFormValue,
} from "@/components/analysis-forms";
import { CoachResults } from "@/components/coach-results";
import { ErrorState } from "@/components/feedback-states";
import { LoadingPipeline } from "@/components/loading-pipeline";

const lichessSteps = [
  "Fetching games from Lichess",
  "Evaluating positions with Stockfish",
  "Detecting patterns and weaknesses",
  "Matching relevant theory",
  "Preparing the coaching report",
];

const pgnSteps = [
  "Reading the PGN",
  "Evaluating each move with Stockfish",
  "Detecting patterns and weaknesses",
  "Matching relevant theory",
  "Preparing the coaching report",
];

const outputSteps = [
  "Position reconstruction",
  "Stockfish evaluation",
  "Weakness diagnosis",
  "Educational study matching",
];

type Mode = "lichess" | "pgn";

export function AnalysisWorkspace() {
  const [mode, setMode] = useState<Mode>("lichess");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [coachResult, setCoachResult] = useState<CoachAnalysis | null>(null);
  const [resultSource, setResultSource] = useState<Mode>("lichess");
  const resultsRef = useRef<HTMLDivElement>(null);

  async function submitLichess(value: LichessFormValue) {
    setMode("lichess");
    setLoading(true);
    setError(null);
    setCoachResult(null);
    try {
      const result = await analyzeLichessUser(value);
      setCoachResult(result);
      setResultSource("lichess");
      window.setTimeout(
        () => resultsRef.current?.scrollIntoView({ behavior: "smooth" }),
        50,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unexpected error.");
    } finally {
      setLoading(false);
    }
  }

  async function submitPgn(value: PgnFormValue) {
    setMode("pgn");
    setLoading(true);
    setError(null);
    setCoachResult(null);
    try {
      const result = await analyzePgn(value);
      setCoachResult(result);
      setResultSource("pgn");
      window.setTimeout(
        () => resultsRef.current?.scrollIntoView({ behavior: "smooth" }),
        50,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unexpected error.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <section className="wide-shell pb-14 pt-9 sm:pb-14 sm:pt-11">
        <div className="grid items-end gap-8 border-b border-[var(--line-strong)] pb-9 lg:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.65fr)] lg:pb-12">
          <div>
            <p className="section-kicker">Chess analysis desk / 01</p>
            <h1 className="display-type mt-7 max-w-5xl text-[clamp(3.4rem,6.8vw,6.6rem)] text-[var(--text-strong)]">
              Read the position.
              <span className="block italic text-[var(--accent-strong)]">
                Train the decision.
              </span>
            </h1>
          </div>
          <div className="border-l border-[var(--accent)] pl-5 lg:mb-3">
            <p className="max-w-md text-lg font-medium leading-snug text-[var(--text-strong)] sm:text-xl">
              Engine analysis and practical coaching grounded in your actual games.
            </p>
            <p className="mt-4 max-w-md text-sm leading-6 text-[var(--muted)]">
              Import recent Lichess games or paste a PGN to inspect every recorded position.
            </p>
          </div>
        </div>

        <div id="analyze" className="scroll-mt-5 pt-8 sm:pt-10">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="eyebrow">Analysis input</p>
              <h2 className="display-type mt-2 text-4xl text-[var(--text-strong)] sm:text-5xl">
                Select your source
              </h2>
            </div>
            <p className="font-mono text-[11px] font-semibold uppercase leading-5 tracking-[0.1em] text-[var(--muted)]">
              Current cap · 3 games / depth 10
            </p>
          </div>

          <div className="grid border border-[var(--line-strong)] bg-[var(--surface)] lg:grid-cols-[minmax(0,1.35fr)_minmax(260px,0.65fr)]">
            <div className="lg:border-r lg:border-[var(--line-strong)]">
              <div
                className="analysis-tabs"
                role="tablist"
                aria-label="Analysis source"
              >
                <ModeButton
                  active={mode === "lichess"}
                  onClick={() => setMode("lichess")}
                  id="analysis-tab-lichess"
                  controls="analysis-panel-lichess"
                >
                  01 · Lichess player
                </ModeButton>
                <ModeButton
                  active={mode === "pgn"}
                  onClick={() => setMode("pgn")}
                  id="analysis-tab-pgn"
                  controls="analysis-panel-pgn"
                >
                  02 · Paste PGN
                </ModeButton>
              </div>

              <div
                id={`analysis-panel-${mode}`}
                role="tabpanel"
                aria-labelledby={`analysis-tab-${mode}`}
                aria-busy={loading}
                className="p-4 sm:p-6 lg:p-8"
              >
                {mode === "lichess" ? (
                  <AnalyzeLichessForm
                    onSubmit={submitLichess}
                    isLoading={loading && mode === "lichess"}
                  />
                ) : (
                  <AnalyzePgnForm
                    onSubmit={submitPgn}
                    isLoading={loading && mode === "pgn"}
                  />
                )}
              </div>
            </div>

            <aside className="border-t border-[var(--line-strong)] bg-[var(--night-deep)] p-6 lg:border-t-0 lg:p-8">
              <p className="eyebrow !text-[var(--accent-strong)]">Analysis pipeline</p>
              <ol className="mt-7 divide-y divide-[var(--line)] border-y border-[var(--line)]">
                {outputSteps.map((step, index) => (
                  <AsideStep
                    key={step}
                    number={String(index + 1).padStart(2, "0")}
                    text={step}
                  />
                ))}
              </ol>
              <p className="mt-6 text-xs leading-5 text-[var(--muted)]">
                Both sources feed the same coaching report. PGN analysis uses
                the side you select; Lichess resolves it from the username.
              </p>
            </aside>
          </div>

          {loading || error ? (
            <div className="mt-5">
              {loading ? (
                <LoadingPipeline
                  steps={mode === "lichess" ? lichessSteps : pgnSteps}
                />
              ) : error ? (
                <ErrorState message={error} />
              ) : null}
            </div>
          ) : null}
        </div>
      </section>

      <div ref={resultsRef} className="pb-20">
        {coachResult ? (
          <CoachResults result={coachResult} source={resultSource} />
        ) : null}
      </div>
    </>
  );
}

function ModeButton({
  active,
  children,
  onClick,
  id,
  controls,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
  id: string;
  controls: string;
}) {
  return (
    <button
      id={id}
      type="button"
      role="tab"
      aria-selected={active}
      aria-controls={controls}
      onClick={onClick}
      className="analysis-tab"
    >
      {children}
    </button>
  );
}

function AsideStep({ number, text }: { number: string; text: string }) {
  return (
    <li className="grid grid-cols-[42px_1fr] gap-3 py-4 text-sm font-medium text-[var(--text)]">
      <span className="font-mono text-xs text-[var(--accent)]">{number}</span>
      <span>{text}</span>
    </li>
  );
}
