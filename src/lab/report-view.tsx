"use client";

import { useMemo, useState } from "react";
import { CATEGORIES } from "@/core/classify";
import type { ErrorRow, EvidenceRef, Finding, GameRow, Report } from "@/core/report";
import { LineBoard } from "./board";

const pct = (x: number | undefined, d = 0) => (x === undefined ? "–" : `${x.toFixed(d)}`);
const key = (r: EvidenceRef) => `${r.gameId}#${r.ply}`;

/** Lab view of a report: functional only, every number links to its positions. */
export function ReportView({ report }: { report: Report }) {
  const errorsByKey = useMemo(() => new Map(report.errors.map((e) => [key(e), e])), [report]);
  const gamesById = useMemo(() => new Map(report.games.map((g) => [g.id, g])), [report]);
  const [selected, setSelected] = useState<EvidenceRef | null>(null);
  const [openFinding, setOpenFinding] = useState<string | null>(null);
  const [errorFilter, setErrorFilter] = useState<string>("all");

  const select = (r: EvidenceRef) => setSelected(r);

  return (
    <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <h2>Muestra</h2>
        <p>
          {report.sample.games} partidas · {report.sample.playerMoves} jugadas propias · +{report.sample.results.win} ={report.sample.results.draw} −
          {report.sample.results.loss} · ritmos {JSON.stringify(report.sample.byTimeClass)} · motor {report.settings.engine} ({report.settings.pass1Nodes}/
          {report.settings.pass2Nodes} nodos)
        </p>

        <h2>Categorías</h2>
        <table>
          <thead>
            <tr>
              <th>categoría</th>
              <th>% prob. perdida</th>
              <th>errores /100 jug.</th>
              <th>imprecisiones</th>
              <th>errores</th>
              <th>graves</th>
              <th>partidas decididas</th>
              {report.level && <th>en alcance de Maia / por debajo de nivel / difíciles a ese nivel / pérdida evitable</th>}
            </tr>
          </thead>
          <tbody>
            {CATEGORIES.map((c) => {
              const s = report.categories[c];
              return (
                <tr key={c}>
                  <td>{c}</td>
                  <td>{pct(s.winLossShare * 100, 1)}</td>
                  <td>{s.errorsPer100}</td>
                  <td>{s.counts.inaccuracy}</td>
                  <td>{s.counts.mistake}</td>
                  <td>{s.counts.blunder}</td>
                  <td>{s.decidedGames}</td>
                  {report.level && <td>{s.level ? `${s.level.inScope} / ${s.level.belowLevel} / ${s.level.hard} / ${s.level.avoidableLoss}` : "–"}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>

        {report.level && <LevelSection report={report} />}

        <h2>Reloj</h2>
        <pre>{JSON.stringify(report.clock, null, 1)}</pre>

        <h2>Recomendaciones</h2>
        <ol>
          {report.recommendations.map((r) => (
            <li key={r.findingId}>
              <code>{r.findingId}</code> → {r.prescription.methods.join(", ")}
              {r.prescription.themes.length > 0 && ` · temas ${r.prescription.themes.join(", ")}`} · motivo: {r.reason.occurrences} casos en {r.reason.games}{" "}
              partidas, {r.reason.winLoss} puntos de prob. perdidos ({r.reason.impact} por partida){" "}
              <button onClick={() => setOpenFinding(r.findingId)}>ver evidencia</button>
            </li>
          ))}
        </ol>

        <h2>Hallazgos ({report.findings.length})</h2>
        <table>
          <thead>
            <tr>
              <th>id</th>
              <th>casos</th>
              <th>partidas</th>
              <th>prob. perdida</th>
              <th>impacto/partida</th>
              {report.level && <th>nivel: en alcance / por debajo / pérdida evitable</th>}
              <th>parámetros</th>
            </tr>
          </thead>
          <tbody>
            {report.findings.map((f) => (
              <FindingRow key={f.id} f={f} open={openFinding === f.id} toggle={() => setOpenFinding(openFinding === f.id ? null : f.id)} onSelect={select} errorsByKey={errorsByKey} />
            ))}
          </tbody>
        </table>

        <h2>Aperturas</h2>
        <table>
          <thead>
            <tr>
              <th>familia</th>
              <th>color</th>
              <th>partidas</th>
              <th>puntuación</th>
              <th>prob. al salir</th>
              <th>sale de teoría (jug.)</th>
              <th>errores en apertura</th>
            </tr>
          </thead>
          <tbody>
            {report.openings.map((o) => (
              <tr key={`${o.family}${o.color}`}>
                <td title={o.names.map((n) => `${n.eco} ${n.name} (${n.games})`).join("\n")}>{o.family}</td>
                <td>{o.color}</td>
                <td>{o.games}</td>
                <td>{o.score}</td>
                <td>{pct(o.avgWinAfterOpening, 1)}</td>
                <td>{o.avgBookExitMove}</td>
                <td>
                  {o.openingErrors} ({o.openingWinLoss})
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2>Ejercicios</h2>
        {CATEGORIES.map((c) => (
          <details key={c}>
            <summary>
              {c} ({report.exercises[c].length})
            </summary>
            {report.exercises[c].map((x) => (
              <div key={x.id}>
                <button onClick={() => select(x)}>
                  {x.id} · −{x.loss} · {x.tags.join(", ")} · solución {x.solution.san.join(" ")}
                </button>
              </div>
            ))}
          </details>
        ))}

        <h2>Errores ({report.errors.length})</h2>
        <select aria-label="Filtro de errores" value={errorFilter} onChange={(e) => setErrorFilter(e.target.value)}>
          <option value="all">todos</option>
          {CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <table>
          <thead>
            <tr>
              <th>partida#jug.</th>
              <th>juicio</th>
              <th>pérdida</th>
              <th>fase</th>
              <th>categoría</th>
              <th>etiquetas</th>
              <th>jugada / mejor</th>
              <th>reloj</th>
            </tr>
          </thead>
          <tbody>
            {report.errors
              .filter((e) => errorFilter === "all" || e.category === errorFilter)
              .map((e) => (
                <tr key={key(e)} onClick={() => select(e)} style={{ cursor: "pointer", background: selected && key(selected) === key(e) ? "#8883" : undefined }}>
                  <td>
                    {e.gameId.slice(-8)}#{e.moveNumber}
                    {e.color === "white" ? "." : "…"}
                  </td>
                  <td>{e.judgement}</td>
                  <td>{e.loss}</td>
                  <td>
                    {e.phase}
                    {e.endgameType ? `/${e.endgameType}` : ""}
                  </td>
                  <td>{e.category}</td>
                  <td>{[e.tactic?.tag, ...(e.tactic?.motifs ?? []), ...e.clockTags, e.repeated ? "repeated" : undefined].filter(Boolean).join(", ")}</td>
                  <td>
                    {e.played.san} / {e.best?.san}
                  </td>
                  <td>
                    {e.clockBefore !== undefined ? `${Math.round(e.clockBefore)}s` : "–"} ({e.timeSpent?.toFixed(1) ?? "–"}s)
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <div style={{ position: "sticky", top: 8, width: 360 }}>
        {selected ? (
          <EvidencePanel refPos={selected} error={errorsByKey.get(key(selected))} game={gamesById.get(selected.gameId)} />
        ) : (
          <p>Pulsa una evidencia para ver la posición.</p>
        )}
      </div>
    </div>
  );
}

function FindingRow({
  f,
  open,
  toggle,
  onSelect,
  errorsByKey,
}: {
  f: Finding;
  open: boolean;
  toggle: () => void;
  onSelect: (r: EvidenceRef) => void;
  errorsByKey: Map<string, ErrorRow>;
}) {
  return (
    <>
      <tr onClick={toggle} style={{ cursor: "pointer" }}>
        <td>
          <code>{f.id.length > 60 ? `${f.id.slice(0, 60)}…` : f.id}</code>
        </td>
        <td>{f.occurrences}</td>
        <td>{f.games}</td>
        <td>{f.winLoss}</td>
        <td>{f.impact}</td>
        {f.level && <td>{`${f.level.inScope} / ${f.level.belowLevel} / ${f.level.avoidableLoss}`}</td>}
        <td>
          <code>{JSON.stringify(f.params)}</code>
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={7}>
            {f.evidence.map((r) => {
              const e = errorsByKey.get(key(r));
              return (
                <button key={key(r)} onClick={() => onSelect(r)} style={{ margin: 2 }}>
                  {r.gameId.slice(-6)}#{r.ply} {e ? `${e.played.san} −${e.loss}` : "(posición)"}
                </button>
              );
            })}
          </td>
        </tr>
      )}
    </>
  );
}

function EvidencePanel({ refPos, error, game }: { refPos: EvidenceRef; error?: ErrorRow; game?: GameRow }) {
  if (!game) return null;
  if (!error) {
    return (
      <div>
        <p>
          Partida {game.white} – {game.black}, jugada (ply) {refPos.ply}. {game.url && <a href={game.url} target="_blank" rel="noreferrer">abrir partida</a>}
        </p>
        <p>Esta evidencia es una posición de la partida, no un error concreto.</p>
      </div>
    );
  }
  return (
    <div>
      <p>
        {game.white} – {game.black} ({game.result} con {game.playerColor}) · {error.moveNumber}
        {error.color === "white" ? "." : "…"} {error.played.san} · {error.judgement} −{error.loss} ({error.winBefore} → {error.winAfter}) ·{" "}
        {game.url && (
          <a href={game.url} target="_blank" rel="noreferrer">
            abrir
          </a>
        )}
      </p>
      <p>
        {error.category} · {error.phase}
        {error.endgameType ? `/${error.endgameType}` : ""} · {error.opening?.name ?? "?"}
        {error.tactic && ` · ${error.tactic.tag} ${error.tactic.motifs.join(" ")} ${error.tactic.material ? `(${error.tactic.material} peones)` : ""}${error.tactic.mateIn ? `(mate en ${error.tactic.mateIn})` : ""}`}
        {error.clockTags.length > 0 && ` · ${error.clockTags.join(", ")}`}
        {error.bestGap !== undefined && ` · diferencia 1ª-2ª: ${error.bestGap}`}
      </p>
      {error.peer && (
        <p>
          Jugadores de blitz de Lichess con Elo {error.peer.eloSelf}: harían esta jugada {(error.peer.pPlayed * 100).toFixed(1)}% de las veces; harían una jugada buena{" "}
          {(error.peer.pGood * 100).toFixed(1)}% (sin evaluar {(error.peer.pUnevaluated * 100).toFixed(1)}%) → <b>{error.peer.level ?? "sin etiqueta de nivel"}</b>, pérdida evitable{" "}
          {error.peer.avoidableLoss}
        </p>
      )}
      {error.outOfScope && <p>Fuera del alcance de Maia: {error.outOfScope}</p>}
      <LineBoard
        key={`${refPos.gameId}#${refPos.ply}`}
        fen={error.fen}
        orientation={error.color}
        lines={[
          { label: "Jugado + refutación", uci: [error.played.uci, ...error.refutation.uci], san: [error.played.san, ...error.refutation.san], color: "#d33" },
          { label: "Mejor", uci: error.bestLine.uci, san: error.bestLine.san, color: "#2a2" },
        ]}
      />
      <p>
        <code>{error.fen}</code>
      </p>
    </div>
  );
}

function LevelSection({ report }: { report: Report }) {
  const lv = report.level!;
  const byId = new Map(report.findings.map((f) => [f.id, f]));
  const alt = report.rankings;
  return (
    <>
      <h2>Comparación con jugadores de blitz de Lichess del mismo Elo (Maia-3)</h2>
      <p>
        Modelo {lv.model} · Elo de Lichess = Elo de la partida + {lv.eloOffset} · errores (errores y graves) {lv.scope.errors}, dentro del alcance {lv.scope.inScope}, fuera{" "}
        {(lv.scope.outOfScopeShare * 100).toFixed(1)}% {JSON.stringify(lv.scope.outOfScope)}
      </p>
      <h3>Por fase: pérdida real frente a la esperada a ese Elo, en las mismas posiciones (muestra)</h3>
      <table>
        <thead>
          <tr>
            <th>fase</th>
            <th>muestra (partidas)</th>
            <th>real /100 jug.</th>
            <th>esperada /100 jug.</th>
            <th>cociente [IC 95%]</th>
            <th>hallazgo</th>
            <th>cobertura</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(lv.phases).map(([ph, c]) => (
            <tr key={ph}>
              <td>{ph}</td>
              <td>
                {c.sample} ({c.games})
              </td>
              <td>{c.realLossPer100}</td>
              <td>{c.expectedLossPer100}</td>
              <td>
                {c.ratio} [{c.ratioCi95[0]}, {c.ratioCi95[1]}]
              </td>
              <td>{c.finding ?? "ninguno (el intervalo cruza 1)"}</td>
              <td>{c.meanCoverage}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {alt && (
        <>
          <h3>Top 3: orden actual (pérdida bruta) frente a orden por pérdida evitable</h3>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>actual</th>
                <th>por pérdida evitable</th>
              </tr>
            </thead>
            <tbody>
              {[0, 1, 2].map((i) => {
                const a = report.recommendations[i];
                const b = alt.recommendationsByAvoidableLoss[i];
                const fa = a && byId.get(a.findingId);
                const fb = b && byId.get(b.findingId);
                return (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td>{fa ? `${fa.id} (bruta ${fa.winLoss}, evitable ${fa.level?.avoidableLoss ?? "–"})` : "–"}</td>
                    <td>{fb ? `${fb.id} (bruta ${fb.winLoss}, evitable ${fb.level?.avoidableLoss ?? "–"})` : "–"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}
