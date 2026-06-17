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
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label
          htmlFor="username"
          className="mb-2 block text-sm font-medium text-[var(--text)]"
        >
          Lichess username
        </label>
        <input
          id="username"
          className="control text-base"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          placeholder="DrNykterstein"
          autoComplete="off"
          required
        />
      </div>

      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <button
          type="submit"
          disabled={isLoading}
          className="primary-button w-full"
        >
          {isLoading ? "Analyzing games" : "Analyze my games"}
          <ArrowRight size={17} />
        </button>
        <button
          type="button"
          disabled={!trimmedUsername || isLoading}
          onClick={viewAnalyses}
          className="secondary-button whitespace-nowrap"
        >
          <History size={17} />
          View my analyses
        </button>
      </div>

      <details className="group border-t border-[var(--border)] pt-3">
        <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium text-[var(--text-muted)]">
          Advanced options
          <ChevronDown
            className="transition-transform group-open:rotate-180"
            size={16}
          />
        </summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-[var(--text)]">
            Games
            <select
              className="control mt-2"
              value={limit}
              onChange={(event) => setLimit(Number(event.target.value))}
            >
              {[1, 3, 5].map((value) => (
                <option key={value} value={value}>
                  {value} {value === 1 ? "game" : "games"}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-[var(--text)]">
            Depth
            <select
              className="control mt-2"
              value={depth}
              onChange={(event) => setDepth(Number(event.target.value))}
            >
              {[6, 8, 10, 12].map((value) => (
                <option key={value} value={value}>
                  Depth {value}
                </option>
              ))}
            </select>
          </label>
          <label className="flex cursor-pointer items-center gap-3 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] p-3 sm:col-span-2">
            <input
              type="checkbox"
              className="size-4 accent-[var(--primary)]"
              checked={save}
              onChange={(event) => setSave(event.target.checked)}
            />
            <span className="text-sm font-medium">Save analysis</span>
          </label>
        </div>
      </details>
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
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label
          htmlFor="pgn"
          className="mb-2 block text-sm font-medium text-[var(--text)]"
        >
          Paste PGN
        </label>
        <textarea
          id="pgn"
          className="control textarea-control"
          value={pgn}
          onChange={(event) => setPgn(event.target.value)}
          placeholder={'[Event "Casual Game"]\n[White "You"]\n[Black "Opponent"]\n\n1. e4 e5 2. Nf3 Nc6 ...'}
          required
        />
      </div>
      <div className="space-y-3">
        <button
          type="submit"
          disabled={isLoading}
          className="primary-button w-full"
        >
          <ClipboardCheck size={17} />
          {isLoading ? "Analyzing PGN" : "Analyze PGN"}
        </button>
        <details className="group border-t border-[var(--border)] pt-3">
          <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium text-[var(--text-muted)]">
            Advanced options
            <ChevronDown
              className="transition-transform group-open:rotate-180"
              size={16}
            />
          </summary>
          <label className="mt-4 block text-sm font-medium text-[var(--text)]">
            Depth
            <select
              className="control mt-2"
              value={depth}
              onChange={(event) => setDepth(Number(event.target.value))}
            >
              {[6, 8, 10, 12].map((value) => (
                <option key={value} value={value}>
                  Depth {value}
                </option>
              ))}
            </select>
          </label>
        </details>
      </div>
    </form>
  );
}
