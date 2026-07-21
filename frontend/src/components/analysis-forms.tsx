"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ChevronDown, ClipboardCheck, History } from "lucide-react";

export type LichessFormValue = {
  username: string;
  limit: number;
  depth: number;
  save: boolean;
};

export type PgnFormValue = {
  pgn: string;
  depth: number;
};

export function AnalyzeLichessForm({
  onSubmit,
  isLoading,
}: {
  onSubmit: (value: LichessFormValue) => void;
  isLoading: boolean;
}) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [limit, setLimit] = useState(3);
  const [depth, setDepth] = useState(8);
  const [save, setSave] = useState(true);
  const trimmedUsername = username.trim();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit({ username: trimmedUsername, limit, depth, save });
  }

  function viewAnalyses() {
    if (!trimmedUsername) return;
    router.push(`/player/${encodeURIComponent(trimmedUsername)}`);
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <label htmlFor="username" className="eyebrow mb-2 block">
          Lichess username
        </label>
        <input
          id="username"
          className="control text-base"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          placeholder="lichess_username"
          autoComplete="off"
          required
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <button
          type="submit"
          disabled={isLoading}
          className="primary-button w-full"
        >
          {isLoading ? "Analyzing games" : "Analyze games"}
          <ArrowRight size={18} aria-hidden="true" />
        </button>
        <button
          type="button"
          disabled={!trimmedUsername || isLoading}
          onClick={viewAnalyses}
          className="secondary-button whitespace-nowrap"
        >
          <History size={17} aria-hidden="true" />
          View profile
        </button>
      </div>

      <AnalysisOptions>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-semibold text-[var(--muted-strong)]">
            Recent games
            <select
              className="control mt-2"
              value={limit}
              onChange={(event) => setLimit(Number(event.target.value))}
            >
              {[1, 2, 3].map((value) => (
                <option key={value} value={value}>
                  {value} {value === 1 ? "game" : "games"}
                </option>
              ))}
            </select>
          </label>
          <DepthSelect value={depth} onChange={setDepth} />
          <label className="flex min-h-14 cursor-pointer items-center gap-3 border border-[var(--line-strong)] bg-[var(--night-deep)] p-3 sm:col-span-2">
            <input
              type="checkbox"
              className="size-5 accent-[var(--accent)]"
              checked={save}
              onChange={(event) => setSave(event.target.checked)}
            />
            <span>
              <span className="block text-sm font-semibold">Save analysis</span>
              <span className="mt-0.5 block text-xs text-[var(--muted)]">
                Updates this player&apos;s profile and analysis history.
              </span>
            </span>
          </label>
        </div>
      </AnalysisOptions>
    </form>
  );
}

export function AnalyzePgnForm({
  onSubmit,
  isLoading,
}: {
  onSubmit: (value: PgnFormValue) => void;
  isLoading: boolean;
}) {
  const [pgn, setPgn] = useState("");
  const [depth, setDepth] = useState(8);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit({ pgn: pgn.trim(), depth });
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <label htmlFor="pgn" className="eyebrow mb-2 block">
          Game notation
        </label>
        <textarea
          id="pgn"
          className="control textarea-control"
          value={pgn}
          onChange={(event) => setPgn(event.target.value)}
          placeholder={'[Event "Game"]\n[White "White"]\n[Black "Black"]\n\n1. e4 e5 2. Nf3 Nc6 ...'}
          required
        />
      </div>

      <button
        type="submit"
        disabled={isLoading}
        className="primary-button w-full"
      >
        <ClipboardCheck size={18} aria-hidden="true" />
        {isLoading ? "Analyzing PGN" : "Analyze PGN"}
      </button>

      <AnalysisOptions>
        <DepthSelect value={depth} onChange={setDepth} />
      </AnalysisOptions>
    </form>
  );
}

function AnalysisOptions({ children }: { children: React.ReactNode }) {
  return (
    <details className="group border-t border-[var(--line)] pt-4">
      <summary className="flex cursor-pointer list-none items-center justify-between font-mono text-xs font-semibold uppercase tracking-[0.08em] text-[var(--muted-strong)]">
        Analysis settings
        <ChevronDown
          className="transition-transform group-open:rotate-180"
          size={17}
          aria-hidden="true"
        />
      </summary>
      <div className="mt-5">{children}</div>
    </details>
  );
}

function DepthSelect({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="text-sm font-semibold text-[var(--muted-strong)]">
      Engine depth
      <select
        className="control mt-2"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      >
        {[6, 8, 10].map((depth) => (
          <option key={depth} value={depth}>
            Depth {depth}
          </option>
        ))}
      </select>
    </label>
  );
}
