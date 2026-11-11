"use client";

import { useState } from "react";
import { workerTransport } from "@/core/browser";
import { defaultPoolSize } from "@/core/engine";
import { parseGameMoves } from "@/core/game";
import { MAIA_MODELS, MaiaClient } from "@/core/maia-browser";
import type { MaiaQuery } from "@/core/maia-ort";
import type { Report } from "@/core/report";

/** Player positions with 30 s or more on the clock, with their history. */
export function playerQueries(report: Report): MaiaQuery[] {
  const out: MaiaQuery[] = [];
  for (const g of report.games) {
    if (g.timeClass !== "blitz") continue;
    const { startFen, plies } = parseGameMoves({ pgn: g.pgn });
    const fens = [startFen, ...plies.map((p) => p.fenAfter)];
    let clock: number | undefined;
    for (const p of plies) {
      if (p.color !== g.playerColor) continue;
      const before = clock ?? 180;
      if (p.clockAfter !== undefined) clock = p.clockAfter;
      if (before < 30) continue;
      out.push({ fens: fens.slice(Math.max(0, p.ply - 8), p.ply), eloSelf: 1500, eloOppo: 1500 });
    }
  }
  return out;
}

/** Lab-only: measures Maia-3 throughput in this browser. */
export function MaiaBench({ report }: { report: Report }) {
  const [model, setModel] = useState<keyof typeof MAIA_MODELS>("maia3-5m");
  const [gpu, setGpu] = useState(true);
  const [batch, setBatch] = useState(128);
  const [load, setLoad] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const add = (s: string) => setLog((l) => [...l, s]);

  async function run() {
    const queries = playerQueries(report);
    const t0 = performance.now();
    const client = await MaiaClient.load(MAIA_MODELS[model], { preferWebGpu: gpu });
    const tLoad = performance.now() - t0;
    const sf = load ? Array.from({ length: defaultPoolSize(navigator.hardwareConcurrency) }, () => workerTransport()) : [];
    sf.forEach((t) => ["uci", "position startpos", "go infinite"].forEach((c) => t.send(c)));
    const t1 = performance.now();
    for (let i = 0; i < queries.length; i += batch) await client.predict(queries.slice(i, i + batch));
    const t2 = performance.now();
    sf.forEach((t) => t.terminate());
    client.terminate();
    const result = { model, backend: client.backend, batch, stockfishWorkers: sf.length, positions: queries.length, loadMs: Math.round(tLoad), inferMs: Math.round(t2 - t1), msPerPosition: +((t2 - t1) / queries.length).toFixed(2) };
    add(JSON.stringify(result));
    (window as unknown as { __maiaBench: unknown[] }).__maiaBench = [...((window as unknown as { __maiaBench?: unknown[] }).__maiaBench ?? []), result];
  }

  return (
    <section>
      <h2>Medir Maia-3</h2>
      <select aria-label="Modelo Maia" value={model} onChange={(e) => setModel(e.target.value as keyof typeof MAIA_MODELS)}>
        {Object.keys(MAIA_MODELS).map((m) => (
          <option key={m}>{m}</option>
        ))}
      </select>{" "}
      <label>
        <input type="checkbox" checked={gpu} onChange={(e) => setGpu(e.target.checked)} /> WebGPU si hay
      </label>{" "}
      <label>
        lote <input aria-label="Lote Maia" type="number" value={batch} onChange={(e) => setBatch(Number(e.target.value))} style={{ width: 60 }} />
      </label>{" "}
      <label>
        <input type="checkbox" checked={load} onChange={(e) => setLoad(e.target.checked)} /> con Stockfish en marcha
      </label>{" "}
      <button onClick={() => run().catch((e) => add(`error: ${e.message}`))}>Medir</button>
      <pre data-testid="maia-bench">{log.join("\n")}</pre>
    </section>
  );
}
