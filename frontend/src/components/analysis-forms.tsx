"use client";

import { FormEvent, useState } from "react";
import { ArrowRight, ClipboardCheck, Search } from "lucide-react";

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
  const [username, setUsername] = useState("");
  const [limit, setLimit] = useState(3);
  const [depth, setDepth] = useState(8);
  const [save, setSave] = useState(true);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit({ username: username.trim(), limit, depth, save });
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <label htmlFor="username" className="mb-2 block text-sm font-semibold">
          Lichess username
        </label>
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#7b8982]"
            size={18}
          />
          <input
            id="username"
            className="control pl-11"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="e.g. DrNykterstein"
            autoComplete="off"
            required
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-semibold">
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
        <label className="text-sm font-semibold">
          Analysis depth
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
      </div>

      <label className="flex cursor-pointer items-start gap-3 rounded-[6px] border border-[#d8dfda] bg-[#f7f9f7] p-3.5">
        <input
          type="checkbox"
          className="mt-0.5 size-4 accent-[#1f624b]"
          checked={save}
          onChange={(event) => setSave(event.target.checked)}
        />
        <span>
          <span className="block text-sm font-semibold">Save analysis</span>
          <span className="mt-0.5 block text-xs leading-5 text-[#64706a]">
            Add this result to your player profile and weakness history.
          </span>
        </span>
      </label>

      <button
        type="submit"
        disabled={isLoading}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-[6px] bg-[#1f624b] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#174b3a] disabled:cursor-wait disabled:opacity-60"
      >
        {isLoading ? "Analyzing games" : "Analyze my games"}
        <ArrowRight size={17} />
      </button>
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
        <label htmlFor="pgn" className="mb-2 block text-sm font-semibold">
          Game notation
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <label className="w-full text-sm font-semibold sm:max-w-48">
          Analysis depth
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
        <button
          type="submit"
          disabled={isLoading}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-[6px] border border-[#17211d] bg-[#17211d] px-5 text-sm font-semibold text-white hover:bg-[#2a3631] disabled:cursor-wait disabled:opacity-60 sm:flex-1"
        >
          <ClipboardCheck size={17} />
          {isLoading ? "Analyzing PGN" : "Analyze PGN"}
        </button>
      </div>
    </form>
  );
}
