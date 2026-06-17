"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
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

    Promise.all([getWeaknessProfile(username), getPlayerAnalyses(username)])
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
      <main className="shell py-16">
        <div className="card p-6 text-sm text-[var(--text-muted)]" role="status">
          Loading player profile...
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="shell py-16">
        <ErrorState message={error} onRetry={() => void load()} />
        <Link href="/" className="secondary-button mt-4 w-fit">
          <ArrowLeft size={16} />
          New analysis
        </Link>
      </main>
    );
  }

  if (!profile || !history) {
    return null;
  }

  return (
    <main className="shell py-10 sm:py-12">
      <Link href="/" className="secondary-button w-fit">
        <ArrowLeft size={16} />
        New analysis
      </Link>

      <header className="mt-8 border-b border-[var(--border)] pb-6">
        <p className="eyebrow">Player profile</p>
        <h1 className="mt-2 break-words text-3xl font-semibold tracking-[-0.01em] sm:text-4xl">
          {profile.username}
        </h1>
      </header>

      <section className="mt-6 grid gap-4 sm:grid-cols-[220px_1fr]">
        <article className="card p-5">
          <p className="eyebrow">Games analyzed</p>
          <p className="mt-3 font-mono text-3xl font-semibold">
            {profile.games_analyzed}
          </p>
        </article>

        <article className="card p-5">
          <p className="eyebrow">Current priority</p>
          <h2 className="mt-3 text-xl font-semibold">
            {profile.main_weakness}
          </h2>
          {profile.recommended_focus.length ? (
            <div className="mt-4">
              <p className="text-sm font-medium">Focus</p>
              <ul className="mt-2 space-y-2 text-sm leading-6 text-[var(--text-muted)]">
                {profile.recommended_focus.map((focus) => (
                  <li key={focus}>- {focus}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </article>
      </section>

      <section className="mt-4 card p-5">
        <p className="eyebrow">Recent recommendations</p>
        {profile.recommended_training.length ? (
          <div className="mt-4 divide-y divide-[var(--border)]">
            {profile.recommended_training.map((item, index) => (
              <article
                key={`${item.title}-${index}`}
                className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
              >
                <p className="text-sm font-medium">{item.title}</p>
                <p className="text-xs text-[var(--text-muted)]">
                  Priority: {titleCase(item.priority)}
                </p>
              </article>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-[var(--text-muted)]">
            No recommendations saved yet.
          </p>
        )}
      </section>

      <section className="mt-6">
        <PhaseStatsCards stats={profile.phase_stats} showInaccuracies={false} />
      </section>

      <section className="mt-4 card p-5">
        <div className="flex items-end justify-between gap-4">
          <p className="eyebrow">Analysis history</p>
          <span className="font-mono text-xs text-[var(--text-muted)]">
            {history.total} records
          </span>
        </div>

        {history.analyses.length ? (
          <div className="mt-4 divide-y divide-[var(--border)]">
            {history.analyses.map((analysis) => (
              <article
                key={analysis.id}
                className="grid gap-2 py-4 first:pt-0 last:pb-0 sm:grid-cols-[1fr_auto]"
              >
                <div>
                  <p className="text-sm font-medium">
                    {analysis.opening_name || "Game"}{" "}
                    {analysis.opponent ? `vs ${analysis.opponent}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    {analysis.color_played
                      ? titleCase(analysis.color_played)
                      : "Unknown color"}{" "}
                    - {analysis.result || "Result unavailable"} -{" "}
                    {analysis.total_moves ?? "N/A"} moves
                  </p>
                </div>
                <time
                  className="text-xs text-[var(--text-muted)]"
                  dateTime={analysis.created_at}
                >
                  {formatDate(analysis.created_at)}
                </time>
              </article>
            ))}
          </div>
        ) : (
          <div className="mt-4">
            <EmptyState
              title="No saved analyses yet"
              description="Run an analysis with save enabled to start building this profile."
            />
          </div>
        )}
      </section>
    </main>
  );
}
