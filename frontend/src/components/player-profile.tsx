"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CalendarDays,
  CircleDot,
  History,
  LoaderCircle,
  Target,
} from "lucide-react";
import { getPlayerAnalyses, getWeaknessProfile } from "@/lib/api";
import type { AnalysisHistory, WeaknessProfile } from "@/lib/types";
import { formatDate, titleCase } from "@/lib/format";
import { EmptyState, ErrorState } from "@/components/feedback-states";
import { PhaseStatsCards } from "@/components/phase-stats";

export function PlayerProfile({ username }: { username: string }) {
  const [profile, setProfile] = useState<WeaknessProfile | null>(null);
  const [history, setHistory] = useState<AnalysisHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [profileResult, historyResult] = await Promise.all([
        getWeaknessProfile(username),
        getPlayerAnalyses(username),
      ]);
      setProfile(profileResult);
      setHistory(historyResult);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unexpected error.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;

    Promise.all([
      getWeaknessProfile(username),
      getPlayerAnalyses(username),
    ])
      .then(([profileResult, historyResult]) => {
        if (!active) return;
        setProfile(profileResult);
        setHistory(historyResult);
      })
      .catch((caught: unknown) => {
        if (!active) return;
        setError(caught instanceof Error ? caught.message : "Unexpected error.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [username]);

  if (loading) {
    return (
      <main className="grid min-h-[70vh] place-items-center px-5">
        <div className="text-center" role="status">
          <LoaderCircle
            className="mx-auto animate-spin text-[#1f624b]"
            size={28}
          />
          <p className="mt-4 text-sm font-semibold">Loading player profile</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="mx-auto max-w-xl px-5 py-20">
        <ErrorState message={error} onRetry={() => void load()} />
        <Link
          href="/"
          className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[#1f624b]"
        >
          <ArrowLeft size={16} /> Back to analysis
        </Link>
      </main>
    );
  }

  if (!profile || !history) {
    return null;
  }

  return (
    <main className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
      <Link
        href="/"
        className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-[#526159] hover:text-[#17211d]"
      >
        <ArrowLeft size={16} /> New analysis
      </Link>

      <header className="mt-7 grid gap-6 border-b border-[#d8dfda] pb-9 sm:grid-cols-[1fr_auto] sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase text-[#1f624b]">
            Player profile
          </p>
          <h1 className="display-type mt-3 break-words text-4xl sm:text-6xl">
            {profile.username}
          </h1>
          <p className="mt-3 text-sm text-[#64706a]">
            A cumulative view of saved Cerno analyses.
          </p>
        </div>
        <div className="rounded-[6px] border border-[#d8dfda] bg-white px-5 py-4">
          <p className="text-xs font-semibold uppercase text-[#7b8982]">
            Games analyzed
          </p>
          <p className="mt-1 font-mono text-3xl font-semibold">
            {profile.games_analyzed}
          </p>
        </div>
      </header>

      <section className="mt-10 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <article className="rounded-[6px] bg-[#17211d] p-6 text-white sm:p-8">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase text-[#8fc0a8]">
            <Target size={15} /> Current priority
          </div>
          <h2 className="display-type mt-5 text-3xl sm:text-4xl">
            {profile.main_weakness}
          </h2>
          {profile.recommended_focus.length ? (
            <ul className="mt-6 space-y-3 text-sm leading-6 text-[#c9d4ce]">
              {profile.recommended_focus.map((focus) => (
                <li key={focus} className="flex gap-3">
                  <CircleDot className="mt-1 shrink-0" size={14} />
                  {focus}
                </li>
              ))}
            </ul>
          ) : null}
        </article>

        <article className="rounded-[6px] border border-[#d8dfda] bg-white p-6">
          <p className="text-xs font-semibold uppercase text-[#1f624b]">
            Recent recommendations
          </p>
          {profile.recommended_training.length ? (
            <div className="mt-5 divide-y divide-[#d8dfda]">
              {profile.recommended_training.map((item, index) => (
                <div key={`${item.title}-${index}`} className="py-3 first:pt-0">
                  <p className="text-sm font-semibold">{item.title}</p>
                  <p className="mt-1 text-xs text-[#64706a]">
                    Priority: {titleCase(item.priority)}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-sm leading-6 text-[#64706a]">
              New recommendations will appear after saved analyses.
            </p>
          )}
        </article>
      </section>

      <section className="section-rule mt-12 pt-10">
        <p className="text-xs font-semibold uppercase text-[#1f624b]">
          Performance map
        </p>
        <h2 className="display-type mt-2 text-2xl sm:text-3xl">
          Phase statistics
        </h2>
        <div className="mt-5">
          <PhaseStatsCards stats={profile.phase_stats} />
        </div>
      </section>

      <section className="section-rule mt-12 pt-10">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase text-[#1f624b]">
              Saved work
            </p>
            <h2 className="display-type mt-2 text-2xl sm:text-3xl">
              Analysis history
            </h2>
          </div>
          <span className="font-mono text-xs text-[#7b8982]">
            {history.total} records
          </span>
        </div>

        {history.analyses.length ? (
          <div className="mt-5 divide-y divide-[#d8dfda] rounded-[6px] border border-[#d8dfda] bg-white">
            {history.analyses.map((analysis) => (
              <article
                key={analysis.id}
                className="grid gap-4 p-4 sm:grid-cols-[1fr_auto] sm:items-center sm:p-5"
              >
                <div className="flex min-w-0 gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-[6px] bg-[#edf1ee] text-[#526159]">
                    <History size={17} />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      {analysis.opening_name || "Lichess game"}{" "}
                      {analysis.opponent ? `vs ${analysis.opponent}` : ""}
                    </p>
                    <p className="mt-1 text-xs text-[#64706a]">
                      {analysis.color_played
                        ? titleCase(analysis.color_played)
                        : "Unknown color"}{" "}
                      · {analysis.result || "Result unavailable"} ·{" "}
                      {analysis.total_moves ?? "—"} moves
                    </p>
                  </div>
                </div>
                <time
                  className="flex items-center gap-2 text-xs text-[#7b8982]"
                  dateTime={analysis.created_at}
                >
                  <CalendarDays size={14} />
                  {formatDate(analysis.created_at)}
                </time>
              </article>
            ))}
          </div>
        ) : (
          <div className="mt-5">
            <EmptyState
              title="No saved analyses yet"
              description="Run an analysis with the save option enabled to start building this player profile."
            />
          </div>
        )}
      </section>
    </main>
  );
}
