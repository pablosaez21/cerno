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
              <code>{r.findingId}</code> {r.basis && <i>({r.basis})</i>} → {r.prescription.methods.join(", ")}
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
          Jugadores de blitz de Lichess con Elo de Lichess {error.peer.eloSelf}, según Maia-3: harían esta jugada {(error.peer.pPlayed * 100).toFixed(1)}% de las veces; encontrarían una jugada
          buena {(error.peer.pGood * 100).toFixed(0)}% (con +200: {(error.peer.pGoodNext * 100).toFixed(0)}%, con +400: {(error.peer.pGoodPlus400 * 100).toFixed(0)}%; evaluado{" "}
          {(error.peer.pEvaluated * 100).toFixed(0)}% de la probabilidad) → <b>{error.peer.level ?? "sin etiqueta de nivel"}</b>
          {error.peer.nextLevel && " · next_level"} · pérdida evitable {error.peer.avoidableLoss} · la evitan los de +200: {error.peer.nextLevelLoss}
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
        Modelo {lv.model} ({lv.mode === "full" ? "todas las jugadas de los dos bandos" : "modo reducido: solo tus errores, sin WebGPU"}) · Elo de Lichess = Elo de la partida + {lv.eloOffset}
        {lv.opponentsTotalShift !== undefined && ` (comprobación con tus rivales: ${lv.opponentsTotalShift}${lv.offsetWarning ? ", AVISO: la escala no encaja" : ""})`} · errores (errores y graves) {lv.scope.errors}, dentro del alcance {lv.scope.inScope}, fuera{" "}
        {(lv.scope.outOfScopeShare * 100).toFixed(1)}% {JSON.stringify(lv.scope.outOfScope)}
      </p>
      {report.profile && <ProfileSection report={report} />}
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

function ProfileSection({ report }: { report: Report }) {
  const p = report.profile!;
  const rows = [p.overall, ...p.classes];
  return (
    <>
      <h3>Tu perfil comparado con tus rivales en estas partidas</h3>
      <p>
        Desplazamiento de Elo de calidad: con qué Elo de jugadores de blitz de Lichess (según Maia-3) encaja la calidad de las jugadas, comparado con tus rivales en estas
        mismas {p.games} partidas. Negativo = peor que tus rivales. Grado A confirmado, B sugestivo, C dentro del ruido. {p.decisions.player} decisiones tuyas,{" "}
        {p.decisions.opponents} de tus rivales. {p.warnings.length > 0 && `Avisos: ${p.warnings.join(", ")}`}
      </p>
      <table>
        <thead>
          <tr>
            <th>clase</th>
            <th>decisiones (tú / rivales)</th>
            <th>diferencia [IC 95%]</th>
            <th>grado</th>
            <th>detectable</th>
            <th>partidas para confirmar</th>
            <th>pérdida/partida (tú / rivales)</th>
            <th>lo que ganan los de +200 por partida</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id}>
              <td>{c.id}</td>
              <td>
                {c.decisions} / {c.opponentDecisions}
              </td>
              <td>{c.insufficient ? "muestra insuficiente" : `${c.gap} [${c.ci95![0]}, ${c.ci95![1]}]`}</td>
              <td>{c.grade ?? "–"}</td>
              <td>{c.detectableGap ?? "–"}</td>
              <td>{c.gamesToConfirm ?? "–"}</td>
              <td>
                {c.cost.lossPerGame} / {c.cost.opponentsLossPerGame}
              </td>
              <td>{c.nextLevel.gainPerGame}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h4>Estilo: qué eliges más o menos que jugadores de blitz de Lichess de tu Elo (Maia-3) en las mismas posiciones, comparado con tus rivales</h4>
      <table>
        <thead>
          <tr>
            <th>atributo</th>
            <th>tú</th>
            <th>esperado (−400 / tu Elo / +400)</th>
            <th>z tú</th>
            <th>z rivales</th>
            <th>z controlado</th>
            <th>rasgo</th>
          </tr>
        </thead>
        <tbody>
          {p.style.map((t) => (
            <tr key={t.attribute} style={{ fontWeight: t.trait ? 700 : 400 }}>
              <td>{t.attribute}</td>
              <td>{(t.observed * 100).toFixed(1)}%</td>
              <td>
                {(t.expectedMinus400 * 100).toFixed(1)} / {(t.expected * 100).toFixed(1)} / {(t.expectedPlus400 * 100).toFixed(1)}%
              </td>
              <td>{t.z}</td>
              <td>{t.zOpponents}</td>
              <td>{t.zControlled}</td>
              <td>{t.trait ? "sí" : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h4>Repertorio: posiciones que repites (3 partidas o más, hasta la jugada 12)</h4>
      <table>
        <thead>
          <tr>
            <th>jugada (ply)</th>
            <th>partidas · puntuación</th>
            <th>lo que juegas: veces, pérdida media, probabilidad a −400 / tu Elo / +400</th>
            <th>favorita a +400</th>
            <th>motor</th>
          </tr>
        </thead>
        <tbody>
          {p.repertoire.map((n) => (
            <tr key={n.fen}>
              <td>{n.ply}</td>
              <td>
                {n.games} · {n.score}
              </td>
              <td>
                {n.moves.map((m) => (
                  <div key={m.uci} style={{ fontWeight: m.leak ? 700 : 400 }}>
                    {m.san} ×{m.count} · −{m.meanLoss} · {m.pMinus400} / {m.p0} / {m.pPlus400}
                    {m.leak ? " · FUGA" : ""}
                    {m.habitBelowLevel ? " · los fuertes la abandonan" : ""}
                  </div>
                ))}
              </td>
              <td>
                {n.favouritePlus400.san} ({n.favouritePlus400.p}, −{n.favouritePlus400.loss})
              </td>
              <td>{n.engineBest.san}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h4>Reloj (descriptivo: tú menos tu rival en la misma partida; hallazgo solo con |z| ≥ 3)</h4>
      <table>
        <tbody>
          {p.clock.paired.map((c) => (
            <tr key={c.id}>
              <td>{c.id}</td>
              <td>{c.games} partidas</td>
              <td>
                {c.mean} ± {c.se}
              </td>
              <td>z {c.z}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
