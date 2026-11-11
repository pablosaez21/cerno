"use client";

import { useState } from "react";
import { Chessboard } from "react-chessboard";
import { playLine, fenOf } from "@/core/chess";
import type { Color } from "@/core/types";

export interface BoardArrow {
  uci: string;
  color: string;
}

const toArrow = (a: BoardArrow) => ({ startSquare: a.uci.slice(0, 2), endSquare: a.uci.slice(2, 4), color: a.color });

export function Board({ fen, orientation, arrows = [], size = 320 }: { fen: string; orientation: Color; arrows?: BoardArrow[]; size?: number }) {
  return (
    <div style={{ width: size, height: size }}>
      <Chessboard
        options={{
          position: fen,
          boardOrientation: orientation,
          allowDragging: false,
          allowDrawingArrows: false,
          animationDurationInMs: 0,
          arrows: arrows.filter((a) => /^[a-h][1-8][a-h][1-8]/.test(a.uci)).map(toArrow),
        }}
      />
    </div>
  );
}

/** A board that can step through one line from a start position. */
export function LineBoard({
  fen,
  orientation,
  lines,
  size,
}: {
  fen: string;
  orientation: Color;
  lines: { label: string; uci: string[]; san: string[]; color: string }[];
  size?: number;
}) {
  const [active, setActive] = useState<{ line: number; step: number } | null>(null);
  let shown = fen;
  let arrows: BoardArrow[] = lines.filter((l) => l.uci[0]).map((l) => ({ uci: l.uci[0], color: l.color }));
  if (active) {
    const line = lines[active.line];
    const { positions } = playLine(fen, line.uci.slice(0, active.step));
    shown = fenOf(positions[positions.length - 1]);
    const next = line.uci[active.step];
    arrows = next ? [{ uci: next, color: line.color }] : [];
  }
  return (
    <div>
      <Board fen={shown} orientation={orientation} arrows={arrows} size={size} />
      {lines.map((l, i) => (
        <div key={l.label} style={{ marginTop: 4 }}>
          <b style={{ color: l.color }}>{l.label}:</b>{" "}
          {l.san.map((m, j) => (
            <button
              key={j}
              style={{ fontWeight: active?.line === i && active.step === j + 1 ? 700 : 400 }}
              onClick={() => setActive({ line: i, step: j + 1 })}
            >
              {m}
            </button>
          ))}
        </div>
      ))}
      {active && <button onClick={() => setActive(null)}>Volver a la posición</button>}
    </div>
  );
}
