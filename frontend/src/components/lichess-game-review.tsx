"use client";

import { useState } from "react";
import { GameViewer } from "@/components/game-viewer";
import type { CoachGameAnalysis, PgnEngineAnalysis } from "@/lib/types";
import { titleCase } from "@/lib/format";

export function LichessGameReview({ games }: { games: CoachGameAnalysis[] }) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const selected = games[selectedIndex] ?? games[0];

  if (!selected) return null;

  const boardAnalysis: PgnEngineAnalysis = {
    total_moves: selected.total_moves,
    summary: selected.summary,
    critical_moments: selected.critical_moments,
    phase_weaknesses: selected.phase_weaknesses,
    moves: selected.moves,
  };

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow !text-[var(--accent)]">02 · Analyzed games</p>
          <h3 className="display-type mt-2 text-4xl text-[var(--text-strong)] sm:text-5xl">
            Review the board
          </h3>
        </div>
        <p className="max-w-md text-xs leading-5 text-[var(--muted)]">
          Positions come from the engine FEN data and fall back to replaying the original PGN.
        </p>
      </div>

      {games.length > 1 ? (
        <div className="mb-3 grid border border-[var(--line-strong)] sm:grid-cols-2 lg:grid-cols-3">
          {games.map((game, index) => (
            <button
              key={game.game_id}
              type="button"
              aria-pressed={index === selectedIndex}
              onClick={() => setSelectedIndex(index)}
              className={`grid min-h-16 grid-cols-[42px_1fr] items-center border-b border-[var(--line)] p-3 text-left sm:border-r ${
                index === selectedIndex
                  ? "bg-[var(--accent-soft)] text-[var(--text-strong)]"
                  : "bg-[var(--surface)] hover:bg-[var(--surface-raised)]"
              }`}
            >
              <span className="font-mono text-xs font-bold text-[var(--accent)]">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span>
                <span className="block text-sm font-semibold">vs {game.opponent}</span>
                <span className="mt-1 block font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--muted)]">
                  {titleCase(game.player_color)} · {titleCase(game.result)}
                </span>
              </span>
            </button>
          ))}
        </div>
      ) : null}

      <GameViewer
        key={selected.game_id}
        boardId={`cerno-lichess-board-${selected.game_id}`}
        result={boardAnalysis}
        sourcePgn={selected.pgn}
        initialOrientation={selected.player_color}
      />
    </section>
  );
}
