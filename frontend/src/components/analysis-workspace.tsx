"use client";

import { useRef, useState } from "react";
import { BrainCircuit, Database, Gauge, Sparkles } from "lucide-react";
import { analyzeLichessUser, analyzePgn } from "@/lib/api";
import type { CoachAnalysis, PgnAnalysis } from "@/lib/types";
import {
  AnalyzeLichessForm,
  AnalyzePgnForm,
  type LichessFormValue,
  type PgnFormValue,
} from "@/components/analysis-forms";
import { ChessMark } from "@/components/chess-mark";
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
      <section className="border-b border-[#d8dfda] bg-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-12 sm:px-8 sm:py-16 lg:grid-cols-[1fr_300px] lg:items-center">
          <div>
            <p className="mb-5 inline-flex items-center gap-2 text-xs font-semibold uppercase text-[#1f624b]">
              <Sparkles size={15} />
              AI chess coach for Lichess players
            </p>
            <h1 className="display-type max-w-3xl text-5xl leading-[0.98] sm:text-6xl lg:text-7xl">
              Find the pattern behind your mistakes.
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-[#64706a] sm:text-lg">
              Cerno reviews your games with Stockfish, detects recurring
              weaknesses, retrieves relevant chess theory, and turns it into a
              focused training week.
            </p>
            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-xs font-semibold text-[#526159]">
              <span className="flex items-center gap-2">
                <Gauge size={15} /> Engine analysis
              </span>
              <span className="flex items-center gap-2">
                <BrainCircuit size={15} /> Weakness diagnosis
              </span>
              <span className="flex items-center gap-2">
                <Database size={15} /> Curated theory
              </span>
            </div>
          </div>
          <div className="mx-auto w-full max-w-[260px] lg:mx-0 lg:justify-self-end">
            <ChessMark />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-16">
        <div className="grid gap-10 lg:grid-cols-[0.72fr_1.28fr]">
          <div>
            <p className="text-xs font-semibold uppercase text-[#1f624b]">
              Start an analysis
            </p>
            <h2 className="display-type mt-3 text-3xl sm:text-4xl">
              Your games, turned into a plan.
            </h2>
            <p className="mt-4 max-w-md text-sm leading-7 text-[#64706a]">
              Choose a small sample first. A depth of 8 is fast enough for a
              demo while still revealing meaningful patterns.
            </p>
            <div className="mt-8 hidden border-l border-[#bdc9c2] pl-5 text-sm leading-6 text-[#64706a] lg:block">
              <p className="font-semibold text-[#17211d]">What you will get</p>
              <p className="mt-2">
                A diagnosis, phase-level statistics, key mistakes, matched
                theory, and a practical weekly routine.
              </p>
            </div>
          </div>

          <div>
            <div className="rounded-[6px] border border-[#bdc9c2] bg-white p-5 shadow-[0_20px_55px_rgba(23,33,29,0.08)] sm:p-7">
              <div className="mb-6 flex items-center justify-between gap-4 border-b border-[#d8dfda] pb-5">
                <div>
                  <h3 className="font-semibold">Analyze a Lichess player</h3>
                  <p className="mt-1 text-xs text-[#64706a]">
                    Uses the player&apos;s most recent public games.
                  </p>
                </div>
                <span className="font-mono text-[11px] text-[#7b8982]">
                  PRIMARY
                </span>
              </div>
              <AnalyzeLichessForm
                onSubmit={submitLichess}
                isLoading={loading && mode === "lichess"}
              />
            </div>

            <div className="my-8 flex items-center gap-4">
              <span className="h-px flex-1 bg-[#d8dfda]" />
              <span className="text-xs font-semibold uppercase text-[#7b8982]">
                Or paste a PGN
              </span>
              <span className="h-px flex-1 bg-[#d8dfda]" />
            </div>

            <div className="rounded-[6px] border border-[#d8dfda] bg-[#eef1ee] p-5 sm:p-7">
              <div className="mb-6">
                <h3 className="font-semibold">Analyze one game manually</h3>
                <p className="mt-1 text-xs leading-5 text-[#64706a]">
                  Paste PGN notation to receive a technical Stockfish report.
                </p>
              </div>
              <AnalyzePgnForm
                onSubmit={submitPgn}
                isLoading={loading && mode === "pgn"}
              />
            </div>
          </div>
        </div>

        {loading || error ? (
          <div className="mx-auto mt-10 max-w-2xl">
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

      <div ref={resultsRef}>
        {coachResult ? <CoachResults result={coachResult} /> : null}
        {pgnResult ? <PgnAnalysisResult result={pgnResult} /> : null}
      </div>
    </>
  );
}
