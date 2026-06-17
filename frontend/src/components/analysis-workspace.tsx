"use client";

import { useRef, useState } from "react";
import { analyzeLichessUser, analyzePgn } from "@/lib/api";
import type { CoachAnalysis, PgnAnalysis } from "@/lib/types";
import {
  AnalyzeLichessForm,
  AnalyzePgnForm,
  type LichessFormValue,
  type PgnFormValue,
} from "@/components/analysis-forms";
import { CoachResults } from "@/components/coach-results";
import { ErrorState } from "@/components/feedback-states";
import { LoadingPipeline } from "@/components/loading-pipeline";
import { PgnAnalysisResult } from "@/components/pgn-results";

const lichessSteps = [
  "Fetching Lichess games",
  "Running Stockfish analysis",
  "Detecting weaknesses",
  "Retrieving chess theory",
  "Building training plan",
];

const pgnSteps = [
  "Reading PGN",
  "Running Stockfish analysis",
  "Detecting critical moments",
  "Building analysis summary",
];

type Mode = "lichess" | "pgn";

export function AnalysisWorkspace() {
  const [mode, setMode] = useState<Mode>("lichess");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [coachResult, setCoachResult] = useState<CoachAnalysis | null>(null);
  const [pgnResult, setPgnResult] = useState<PgnAnalysis | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  async function submitLichess(value: LichessFormValue) {
    setMode("lichess");
    setLoading(true);
    setError(null);
    setCoachResult(null);
    setPgnResult(null);
    try {
      const result = await analyzeLichessUser(value);
      setCoachResult(result);
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
    setPgnResult(null);
    try {
      const result = await analyzePgn(value);
      setPgnResult(result);
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
      <section className="shell py-12 sm:py-16">
        <div className="text-center">
          <p className="text-sm font-semibold tracking-[0.18em] text-[var(--text)]">
            CERNO
          </p>
          <h1 className="mt-5 text-3xl font-semibold tracking-[-0.01em] text-[var(--text)] sm:text-4xl">
            AI chess coach for Lichess players
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-[var(--text-muted)] sm:text-base">
            Analyze your games with Stockfish, detect weaknesses, retrieve
            theory, and get a training plan.
          </p>
        </div>

        <div className="card mt-9 p-3 sm:p-4">
          <div
            className="mb-4 grid grid-cols-2 rounded-[8px] bg-[var(--surface-soft)] p-1"
            role="tablist"
            aria-label="Analysis mode"
          >
            <ModeButton
              active={mode === "lichess"}
              onClick={() => setMode("lichess")}
            >
              Lichess username
            </ModeButton>
            <ModeButton active={mode === "pgn"} onClick={() => setMode("pgn")}>
              Paste PGN
            </ModeButton>
          </div>

          <div className="px-1 pb-1 sm:px-2 sm:pb-2">
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

        {loading || error ? (
          <div className="mt-6">
            {loading ? (
              <LoadingPipeline
                steps={mode === "lichess" ? lichessSteps : pgnSteps}
              />
            ) : error ? (
              <ErrorState message={error} />
            ) : null}
          </div>
        ) : null}
      </section>

      <div ref={resultsRef} className="pb-16">
        {coachResult ? <CoachResults result={coachResult} /> : null}
        {pgnResult ? <PgnAnalysisResult result={pgnResult} /> : null}
      </div>
    </>
  );
}

function ModeButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`min-h-10 rounded-[7px] px-3 text-sm font-medium transition-colors ${
        active
          ? "bg-[var(--surface)] text-[var(--text)]"
          : "text-[var(--text-muted)] hover:text-[var(--text)]"
      }`}
    >
      {children}
    </button>
  );
}
