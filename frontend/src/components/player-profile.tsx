"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, RotateCcw } from "lucide-react";
import { getPlayerAnalyses, getWeaknessProfile } from "@/lib/api";
import type { AnalysisHistory, WeaknessProfile } from "@/lib/types";
import { formatDate, phaseLabel, titleCase } from "@/lib/format";
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
      <main className="wide-shell py-10 sm:py-14">
        <div className="border border-[var(--line-strong)] bg-[var(--night-deep)] p-6" role="status">
          <p className="eyebrow !text-[var(--accent)]">Loading player file</p>
          <p className="display-type mt-4 text-4xl text-[var(--text-strong)]">{username}</p>
          <div className="mt-5 h-1 w-full max-w-md bg-[var(--accent)]" aria-hidden="true" />
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="shell py-12 sm:py-16">
        <ErrorState message={error} onRetry={() => void load()} />
        <Link href="/" className="secondary-button mt-5 w-fit">
          <ArrowLeft size={16} aria-hidden="true" />
          New analysis
        </Link>
      </main>
    );
  }

  if (!profile || !history) return null;

  return (
    <main className="wide-shell py-9 sm:py-14">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Link href="/" className="secondary-button w-fit">
          <ArrowLeft size={16} aria-hidden="true" />
          New analysis
        </Link>
        <button type="button" onClick={() => void load()} className="secondary-button">
          <RotateCcw size={16} aria-hidden="true" />
          Refresh
        </button>
      </div>

      <header className="mt-7 grid border border-[var(--line-strong)] bg-[var(--surface)] lg:grid-cols-[1fr_auto]">
        <div className="p-5 sm:p-8">
          <p className="section-kicker">Player file / Lichess</p>
          <h1 className="display-type mt-6 break-words text-[clamp(3.6rem,9vw,7.5rem)] text-[var(--text-strong)]">
            {profile.username}
          </h1>
        </div>
        <div className="grid min-w-72 border-t border-[var(--line-strong)] lg:border-l lg:border-t-0">
          <div className="bg-[var(--accent-soft)] p-5 sm:p-6">
            <p className="eyebrow">Games analyzed</p>
            <p className="display-type mt-3 text-6xl text-[var(--accent-strong)]">{profile.games_analyzed}</p>
          </div>
          <div className="border-t border-[var(--line-strong)] p-5 sm:p-6">
            <p className="eyebrow !text-[var(--accent)]">Current priority</p>
            <h2 className="display-type mt-3 text-4xl text-[var(--text-strong)]">{phaseLabel(profile.main_weakness)}</h2>
          </div>
        </div>
      </header>

      <section className="mt-5 grid border border-[var(--line-strong)] bg-[var(--night-deep)] lg:grid-cols-2">
        <ProfileList
          title="Recommended focus"
          items={profile.recommended_focus}
          empty="No saved focus areas yet."
        />
        <ProfileList
          title="Detected patterns"
          items={profile.detected_patterns}
          empty="No saved patterns yet."
          bordered
        />
      </section>

      <section className="mt-8">
        <div className="mb-4">
          <p className="eyebrow !text-[var(--accent)]">01 · Accumulated performance</p>
          <h2 className="display-type mt-2 text-4xl text-[var(--text-strong)] sm:text-5xl">Phase reading</h2>
        </div>
        <PhaseStatsCards stats={profile.phase_stats} showInaccuracies={false} />
      </section>

      <section className="mt-8 grid border border-[var(--line-strong)] bg-[var(--surface)] lg:grid-cols-[minmax(240px,0.5fr)_1fr]">
        <div className="bg-[var(--accent-soft)] p-5 sm:p-6">
          <p className="eyebrow !text-[var(--accent-strong)]">02 · Recent recommendations</p>
          <h2 className="display-type mt-4 text-4xl text-[var(--text-strong)]">Next training block</h2>
        </div>
        {profile.recommended_training.length ? (
          <div className="divide-y divide-[var(--line)]">
            {profile.recommended_training.map((item, index) => (
              <article
                key={`${item.title}-${index}`}
                className="grid grid-cols-[54px_1fr_auto] items-center"
              >
                <span className="grid min-h-16 self-stretch place-items-center border-r border-[var(--line-strong)] bg-[var(--night-deep)] font-mono text-sm font-bold text-[var(--accent)]">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <p className="p-4 text-sm font-semibold sm:px-5">{item.title}</p>
                <span className="mr-4 font-mono text-[10px] font-bold uppercase text-[var(--muted)]">
                  {item.priority}
                </span>
              </article>
            ))}
          </div>
        ) : (
          <p className="p-6 text-sm text-[var(--muted)]">No saved recommendations.</p>
        )}
      </section>

      <section className="mt-8 border border-[var(--line-strong)] bg-[var(--surface)]">
        <div className="flex items-end justify-between gap-4 p-5 sm:p-6">
          <div>
            <p className="eyebrow !text-[var(--accent)]">03 · History</p>
            <h2 className="display-type mt-2 text-4xl text-[var(--text-strong)] sm:text-5xl">Saved games</h2>
          </div>
          <span className="border border-[var(--line-strong)] bg-[var(--accent-soft)] px-3 py-2 font-mono text-xs font-bold text-[var(--accent-strong)]">
            {history.total}
          </span>
        </div>

        {history.analyses.length ? (
          <div className="divide-y divide-[var(--line)] border-t border-[var(--line-strong)]">
            {history.analyses.map((analysis, index) => (
              <article
                key={analysis.id}
                className="grid gap-3 p-4 sm:grid-cols-[58px_1fr_auto] sm:items-center sm:p-5"
              >
                <span className="font-mono text-xs font-bold text-[var(--accent)]">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div>
                  <p className="font-semibold text-[var(--text-strong)]">
                    {analysis.opening_name || "Game"}{" "}
                    {analysis.opponent ? `vs ${analysis.opponent}` : ""}
                  </p>
                  <p className="mt-1 font-mono text-[10px] font-semibold uppercase tracking-[0.04em] text-[var(--muted)]">
                    {analysis.color_played ? titleCase(analysis.color_played) : "Color unavailable"}
                    {" · "}
                    {analysis.result || "Result unavailable"}
                    {" · "}
                    {analysis.total_moves ?? "—"} moves
                  </p>
                </div>
                <time className="text-xs text-[var(--muted)]" dateTime={analysis.created_at}>
                  {formatDate(analysis.created_at)}
                </time>
              </article>
            ))}
          </div>
        ) : (
          <div className="border-t border-[var(--line-strong)] p-5">
            <EmptyState
              title="No saved analyses"
              description="Run an analysis with saving enabled to start this history."
            />
          </div>
        )}
      </section>

      <Link href="/#analyze" className="primary-button mt-7 w-full sm:w-fit">
        Analyze new games
        <ArrowUpRight size={17} aria-hidden="true" />
      </Link>
    </main>
  );
}

function ProfileList({
  title,
  items,
  empty,
  bordered = false,
}: {
  title: string;
  items: string[];
  empty: string;
  bordered?: boolean;
}) {
  return (
    <div className={`p-5 sm:p-6 ${bordered ? "border-t border-[var(--line)] lg:border-l lg:border-t-0" : ""}`}>
      <p className="eyebrow !text-[var(--accent)]">{title}</p>
      {items.length ? (
        <ul className="mt-5 space-y-3 text-sm">
          {items.map((item, index) => (
            <li key={`${item}-${index}`} className="grid grid-cols-[32px_1fr] gap-2 border-t border-[var(--line)] pt-3 first:border-t-0 first:pt-0">
              <span className="font-mono text-xs font-bold text-[var(--accent)]">0{index + 1}</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-[var(--muted)]">{empty}</p>
      )}
    </div>
  );
}
