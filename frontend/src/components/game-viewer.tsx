"use client";

import { KeyboardEvent, useMemo, useState } from "react";
import {
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  FlipHorizontal2,
} from "lucide-react";
import { Chess } from "chess.js";
import { Chessboard, type ChessboardOptions } from "react-chessboard";
import type { PgnAnalysis, PgnMove } from "@/lib/types";
import {
  classificationLabel,
  classificationTone,
  formatEvaluation,
  formatPawnValue,
  phaseLabel,
} from "@/lib/format";

type Orientation = "white" | "black";

type MoveRow = {
  moveNumber: number;
  white?: { move: PgnMove; ply: number };
  black?: { move: PgnMove; ply: number };
};

export function GameViewer({
  result,
  sourcePgn,
  initialOrientation,
  boardId = "cerno-analysis-board",
}: {
  result: PgnAnalysis;
  sourcePgn: string;
  initialOrientation?: Orientation;
  boardId?: string;
}) {
  const metadata = useMemo(() => readPgnMetadata(sourcePgn), [sourcePgn]);
  const positions = useMemo(
    () => buildPositions(result.moves, sourcePgn),
    [result.moves, sourcePgn],
  );
  const moveRows = useMemo(() => groupMoves(result.moves), [result.moves]);
  const firstCriticalPly = findCriticalPly(result.moves, result.critical_moments[0]);
  const [currentPly, setCurrentPly] = useState(firstCriticalPly ?? 0);
  const [orientation, setOrientation] = useState<Orientation>(
    initialOrientation ?? metadata.orientation,
  );
  const selectedMove = currentPly > 0 ? result.moves[currentPly - 1] : undefined;
  const playedSquares = getPlayedSquares(selectedMove);
  const position = positions[currentPly] ?? positions.at(-1) ?? "start";

  const boardOptions: ChessboardOptions = {
    id: boardId,
    position,
    boardOrientation: orientation,
    allowDragging: false,
    allowDrawingArrows: false,
    animationDurationInMs: 160,
    darkSquareStyle: { backgroundColor: "#344a57" },
    lightSquareStyle: { backgroundColor: "#cad4d2" },
    boardStyle: {
      border: "1px solid #6d8794",
      backgroundColor: "#071018",
    },
    alphaNotationStyle: {
      color: "#071018",
      fontFamily: "var(--font-mono-face)",
      fontWeight: 700,
    },
    numericNotationStyle: {
      color: "#071018",
      fontFamily: "var(--font-mono-face)",
      fontWeight: 700,
    },
    squareStyles: playedSquares
      ? {
          [playedSquares.from]: { boxShadow: "inset 0 0 0 4px #86aabd" },
          [playedSquares.to]: { boxShadow: "inset 0 0 0 4px #bad2dc" },
        }
      : {},
    arrows: playedSquares
      ? [
          {
            startSquare: playedSquares.from,
            endSquare: playedSquares.to,
            color: "rgba(92, 139, 162, 0.84)",
          },
        ]
      : [],
  };

  function selectPly(nextPly: number) {
    setCurrentPly(Math.max(0, Math.min(nextPly, result.moves.length)));
  }

  function handleKeyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      selectPly(currentPly - 1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      selectPly(currentPly + 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      selectPly(0);
    } else if (event.key === "End") {
      event.preventDefault();
      selectPly(result.moves.length);
    }
  }

  return (
    <section
      className="border border-[var(--line-strong)] bg-[var(--surface)]"
      aria-label="Game viewer"
      tabIndex={0}
      onKeyDown={handleKeyboard}
    >
      <header className="grid border-b border-[var(--line-strong)] md:grid-cols-[1fr_auto]">
        <div className="p-4 sm:p-5">
          <p className="eyebrow !text-[var(--accent)]">Game review / position board</p>
          <div className="mt-3 flex flex-wrap items-end gap-x-6 gap-y-2">
            <h3 className="display-type text-3xl text-[var(--text-strong)] sm:text-4xl">
              {metadata.event || "Imported game"}
            </h3>
            {metadata.white || metadata.black ? (
              <p className="font-mono text-xs font-semibold uppercase text-[var(--muted)]">
                {metadata.white || "White"} — {metadata.black || "Black"}
              </p>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          className="secondary-button m-4 md:m-0 md:border-y-0 md:border-r-0"
          onClick={() =>
            setOrientation((current) => (current === "white" ? "black" : "white"))
          }
          aria-label="Flip board"
        >
          <FlipHorizontal2 size={17} aria-hidden="true" />
          Flip board
        </button>
      </header>

      <div className="grid xl:grid-cols-[minmax(420px,1.12fr)_minmax(340px,0.88fr)]">
        <div className="bg-[var(--night-deep)] p-3 sm:p-5 xl:border-r xl:border-[var(--line-strong)]">
          <div
            className="mx-auto w-full max-w-[680px]"
            style={{ width: "min(100%, calc(100dvh - 240px), 680px)" }}
            aria-label={`Board viewed from ${orientation}'s side`}
          >
            <Chessboard options={boardOptions} />
          </div>

          <div className="mt-3 grid grid-cols-[auto_1fr_auto] border border-[var(--line-strong)] bg-[var(--surface)]">
            <div className="flex">
              <ViewerButton label="Go to start" onClick={() => selectPly(0)} disabled={currentPly === 0}>
                <ChevronFirst size={19} />
              </ViewerButton>
              <ViewerButton label="Previous move" onClick={() => selectPly(currentPly - 1)} disabled={currentPly === 0}>
                <ChevronLeft size={19} />
              </ViewerButton>
            </div>
            <div className="flex min-w-0 items-center justify-center border-x border-[var(--line-strong)] px-3 text-center font-mono text-xs font-bold text-[var(--muted-strong)]">
              {currentPly === 0 ? "START POSITION" : `${currentPly} / ${result.moves.length}`}
            </div>
            <div className="flex">
              <ViewerButton label="Next move" onClick={() => selectPly(currentPly + 1)} disabled={currentPly === result.moves.length}>
                <ChevronRight size={19} />
              </ViewerButton>
              <ViewerButton label="Go to end" onClick={() => selectPly(result.moves.length)} disabled={currentPly === result.moves.length}>
                <ChevronLast size={19} />
              </ViewerButton>
            </div>
          </div>
          <p className="mt-3 font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--muted)]">
            Use ← → to review the game · blue marks the played move
          </p>
        </div>

        <div className="grid min-h-0 border-t border-[var(--line-strong)] xl:border-t-0 xl:grid-rows-[auto_minmax(260px,1fr)]">
          <PositionReport move={selectedMove} currentPly={currentPly} />

          <div className="min-h-0 border-t border-[var(--line-strong)]">
            <div className="flex items-center justify-between border-b border-[var(--line-strong)] bg-[var(--night-deep)] px-4 py-3">
              <p className="eyebrow">Move list</p>
              <span className="font-mono text-[10px] text-[var(--accent)]">
                {result.total_moves} plies
              </span>
            </div>
            <div className="max-h-[420px] overflow-y-auto" aria-label="Game moves">
              {moveRows.map((row) => (
                <div
                  key={row.moveNumber}
                  className="grid grid-cols-[48px_1fr_1fr] border-b border-[var(--line)] last:border-b-0"
                >
                  <span className="grid min-h-11 place-items-center border-r border-[var(--line)] bg-[var(--night-deep)] font-mono text-xs font-bold text-[var(--muted)]">
                    {row.moveNumber}.
                  </span>
                  <MoveButton entry={row.white} currentPly={currentPly} onSelect={selectPly} />
                  <MoveButton entry={row.black} currentPly={currentPly} onSelect={selectPly} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-[var(--line-strong)]">
        <div className="flex items-center justify-between gap-4 p-4 sm:p-5">
          <p className="eyebrow">Critical moments</p>
          <span className="font-mono text-xs font-bold text-[var(--accent)]">
            {result.critical_moments.length}
          </span>
        </div>
        {result.critical_moments.length ? (
          <div className="grid border-t border-[var(--line-strong)] sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {result.critical_moments.map((moment, index) => {
              const ply = findCriticalPly(result.moves, moment);
              return (
                <button
                  key={`${moment.move_number}-${moment.move_uci}-${index}`}
                  type="button"
                  disabled={ply === null}
                  onClick={() => ply !== null && selectPly(ply)}
                  className={`grid min-h-24 grid-cols-[42px_1fr] gap-3 border-b border-[var(--line-strong)] p-4 text-left sm:border-r ${
                    ply === currentPly
                      ? "bg-[var(--accent-soft)]"
                      : "bg-[var(--surface)] hover:bg-[var(--surface-raised)]"
                  }`}
                >
                  <span className="font-mono text-xs font-bold text-[var(--accent)]">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span>
                    <span className="block font-mono text-sm font-bold">
                      {moment.move_number}. {moment.move_san}
                    </span>
                    <span className="mt-2 block text-xs text-[var(--muted)]">
                      {classificationLabel(moment.classification)} · {formatPawnValue(moment.cpl)} pawns
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="border-t border-[var(--line-strong)] p-5 text-sm text-[var(--muted)]">
            No inaccuracies, mistakes, or blunders were detected.
          </p>
        )}
      </div>
    </section>
  );
}

function PositionReport({ move, currentPly }: { move?: PgnMove; currentPly: number }) {
  if (!move) {
    return (
      <div className="grid min-h-64 place-items-center p-6 text-center">
        <div>
          <p className="display-type text-4xl text-[var(--text-strong)]">Start position</p>
          <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
            Advance one move or open any critical moment directly.
          </p>
        </div>
      </div>
    );
  }

  return (
    <article className="p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-xs font-bold uppercase text-[var(--accent)]">
            Ply {String(currentPly).padStart(2, "0")} · {phaseLabel(move.phase)}
          </p>
          <h4 className="display-type mt-2 text-5xl text-[var(--text-strong)]">
            {move.move_number}. {move.move_san}
          </h4>
        </div>
        <span className={classificationTone(move.classification)}>
          {classificationLabel(move.classification)}
        </span>
      </div>

      <dl className="mt-6 grid grid-cols-3 border border-[var(--line-strong)]">
        <EngineMetric label="Before" value={formatEvaluation(move.evaluation_before)} />
        <EngineMetric label="After" value={formatEvaluation(move.evaluation_after)} />
        <EngineMetric label="Loss" value={formatPawnValue(move.cpl)} accent />
      </dl>

      <p className="mt-5 border-l border-[var(--accent)] pl-4 text-sm leading-6 text-[var(--muted)]">
        The played move changes the evaluation by{" "}
        {formatPawnValue(move.cpl)}{" "}pawns from the moving side&apos;s perspective.
      </p>
      <p className="mt-4 font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--muted)]">
        The current analysis contract does not include a recommended variation.
      </p>
    </article>
  );
}

function EngineMetric({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`border-r border-[var(--line-strong)] p-3 last:border-r-0 ${accent ? "bg-[var(--accent-soft)]" : ""}`}>
      <dt className="font-mono text-[9px] font-bold uppercase tracking-[0.06em] text-[var(--muted)]">
        {label}
      </dt>
      <dd className="mt-1 font-mono text-lg font-bold text-[var(--text-strong)] sm:text-xl">{value}</dd>
    </div>
  );
}

function ViewerButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className="grid size-12 place-items-center border-r border-[var(--line-strong)] last:border-r-0 hover:bg-[var(--accent-soft)] disabled:opacity-30"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

function MoveButton({
  entry,
  currentPly,
  onSelect,
}: {
  entry?: { move: PgnMove; ply: number };
  currentPly: number;
  onSelect: (ply: number) => void;
}) {
  if (!entry) return <span className="border-r border-[var(--line)]" aria-hidden="true" />;

  return (
    <button
      type="button"
      onClick={() => onSelect(entry.ply)}
      aria-current={entry.ply === currentPly ? "step" : undefined}
      className={`border-r border-[var(--line)] px-3 py-2 text-left font-mono text-sm font-semibold last:border-r-0 ${
        entry.ply === currentPly
          ? "bg-[var(--accent-soft)] text-[var(--accent-strong)]"
          : "hover:bg-[var(--surface-raised)]"
      }`}
    >
      {entry.move.move_san}
      {entry.move.classification !== "good" ? (
        <span className="ml-2 text-[var(--warning)]" aria-label={classificationLabel(entry.move.classification)}>
          !
        </span>
      ) : null}
    </button>
  );
}

function buildPositions(moves: PgnMove[], sourcePgn: string) {
  const reconstructed = reconstructPositions(sourcePgn);
  const initial = validFen(moves[0]?.fen_before)
    ? moves[0].fen_before
    : reconstructed[0] ?? "start";

  return [
    initial,
    ...moves.map((move, index) =>
      validFen(move.fen_after) ? move.fen_after : reconstructed[index + 1] ?? initial,
    ),
  ];
}

function reconstructPositions(pgn: string) {
  if (!pgn.trim()) return [];
  try {
    const game = new Chess();
    game.loadPgn(pgn);
    const history = game.history({ verbose: true });
    if (!history.length) return [];
    return [history[0].before, ...history.map((move) => move.after)];
  } catch {
    return [];
  }
}

function readPgnMetadata(pgn: string) {
  try {
    const game = new Chess();
    game.loadPgn(pgn);
    const headers = game.getHeaders();
    const orientation = headers.Orientation?.toLowerCase() === "black" ? "black" : "white";
    return {
      event: headers.Event,
      white: headers.White,
      black: headers.Black,
      orientation: orientation as Orientation,
    };
  } catch {
    return { orientation: "white" as Orientation };
  }
}

function validFen(fen: string | undefined) {
  if (!fen) return false;
  try {
    new Chess(fen);
    return true;
  } catch {
    return false;
  }
}

function groupMoves(moves: PgnMove[]) {
  const rows = new Map<number, MoveRow>();
  moves.forEach((move, index) => {
    const row = rows.get(move.move_number) ?? { moveNumber: move.move_number };
    const fenTurn = move.fen_before?.split(" ")[1];
    const color = fenTurn === "b" || (fenTurn !== "w" && index % 2 === 1) ? "black" : "white";
    row[color] = { move, ply: index + 1 };
    rows.set(move.move_number, row);
  });
  return Array.from(rows.values());
}

function findCriticalPly(moves: PgnMove[], critical: PgnMove | undefined) {
  if (!critical) return null;
  const index = moves.findIndex(
    (move) =>
      move.move_uci === critical.move_uci &&
      move.move_number === critical.move_number &&
      move.fen_after === critical.fen_after,
  );
  return index >= 0 ? index + 1 : null;
}

function getPlayedSquares(move: PgnMove | undefined) {
  if (!move || !/^[a-h][1-8][a-h][1-8]/.test(move.move_uci)) return null;
  return {
    from: move.move_uci.slice(0, 2),
    to: move.move_uci.slice(2, 4),
  };
}
