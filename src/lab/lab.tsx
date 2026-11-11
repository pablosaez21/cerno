"use client";

import { useEffect, useRef, useState } from "react";
import { IdbCache } from "@/core/browser";
import { buildReport, type Report } from "@/core/report";
import { guessPgnPlayer, type PgnPlayerGuess } from "@/core/sources";
import type { TimeClass } from "@/core/types";
import { ReportView } from "./report-view";
import { runAnalysis, type RunTimings, type SourceInput } from "./run";

const CLASSES: TimeClass[] = ["bullet", "blitz", "rapid", "classical", "daily"];
export const LAST_REPORT_KEY = "lastReport";

export function Lab() {
  const [kind, setKind] = useState<SourceInput["kind"]>("chesscom");
  const [username, setUsername] = useState("");
  const [pgnText, setPgnText] = useState("");
  const [pgnGuess, setPgnGuess] = useState<PgnPlayerGuess>();
  const [max, setMax] = useState(100);
  const [classes, setClasses] = useState<TimeClass[]>([]);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [timings, setTimings] = useState<RunTimings>();
  const [report, setReport] = useState<Report>();
  const [running, setRunning] = useState(false);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    IdbCache.open().then((c) => c?.getMeta<Report>(LAST_REPORT_KEY).then((r) => r && setReport((cur) => cur ?? r)));
  }, []);

  async function onPgnFile(file: File | undefined) {
    if (!file) return;
    const text = await file.text();
    setPgnText(text);
    const guess = guessPgnPlayer(text);
    setPgnGuess(guess);
    setUsername(guess.player ?? "");
  }

  async function start() {
    setError("");
    setTimings(undefined);
    setRunning(true);
    const t0 = performance.now();
    abort.current = new AbortController();
    try {
      const source: SourceInput = kind === "pgn" ? { kind, text: pgnText, player: username } : { kind, username };
      const res = await runAnalysis(
        { source, max, timeClasses: classes },
        (p) => setProgress(`${p.phase} ${p.done}/${p.total} · ${Math.round((performance.now() - t0) / 1000)} s`),
        abort.current.signal,
      );
      if (!res.analyzed.length) throw new Error("No hay partidas que analizar con esos filtros.");
      const r = buildReport(res.analyzed, username);
      setTimings(res.timings);
      setReport(r);
      const cache = await IdbCache.open();
      await cache?.setMeta(LAST_REPORT_KEY, r);
      (window as unknown as { __cernoLab: unknown }).__cernoLab = { timings: res.timings };
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  function download() {
    if (!report) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 1)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `cerno-${report.player.name}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main style={{ padding: 16 }}>
      <h1>Laboratorio</h1>
      <p>
        Página de pruebas, sin diseño. <a href="/review">Revisión de etiquetas</a>
      </p>
      <fieldset disabled={running}>
        <select aria-label="Fuente" value={kind} onChange={(e) => setKind(e.target.value as SourceInput["kind"])}>
          <option value="chesscom">Chess.com</option>
          <option value="lichess">Lichess</option>
          <option value="pgn">Fichero PGN</option>
        </select>{" "}
        {kind === "pgn" && <input aria-label="Fichero PGN" type="file" accept=".pgn,text/plain" onChange={(e) => onPgnFile(e.target.files?.[0])} />}
        {kind === "pgn" && pgnGuess && !pgnGuess.player && pgnGuess.candidates.length > 0 ? (
          <select aria-label="Jugador" value={username} onChange={(e) => setUsername(e.target.value)}>
            <option value="">¿Quién eres?</option>
            {pgnGuess.candidates.slice(0, 10).map((c) => (
              <option key={c.name} value={c.name}>
                {c.name} ({c.games})
              </option>
            ))}
          </select>
        ) : (
          <input aria-label="Usuario" placeholder="usuario" value={username} onChange={(e) => setUsername(e.target.value)} />
        )}{" "}
        <label>
          N <input aria-label="Partidas" type="number" min={1} max={500} value={max} onChange={(e) => setMax(Number(e.target.value))} style={{ width: 60 }} />
        </label>{" "}
        {CLASSES.map((c) => (
          <label key={c}>
            <input type="checkbox" checked={classes.includes(c)} onChange={(e) => setClasses(e.target.checked ? [...classes, c] : classes.filter((x) => x !== c))} />
            {c}{" "}
          </label>
        ))}
        <button onClick={start} disabled={!username}>
          Analizar
        </button>
      </fieldset>
      {running && <button onClick={() => abort.current?.abort()}>Cancelar</button>}
      <p data-testid="progress">{progress}</p>
      {error && <p role="alert">{error}</p>}
      {timings && <pre data-testid="timings">{JSON.stringify(timings, null, 2)}</pre>}
      {report && (
        <>
          <button onClick={download}>Descargar informe JSON</button>
          <ReportView report={report} />
        </>
      )}
    </main>
  );
}
