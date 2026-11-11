"use client";

import { useEffect, useMemo, useState } from "react";
import { IdbCache } from "@/core/browser";
import { CATEGORIES, type Category } from "@/core/classify";
import type { Report } from "@/core/report";
import { sampleForReview, scoreReview, type ReviewAnswer } from "@/core/review";
import { LineBoard } from "./board";
import { LAST_REPORT_KEY } from "./lab";

const SEED_KEY = "reviewSeed";
const ANSWERS_KEY = "reviewAnswers";

export function Review() {
  const [cache, setCache] = useState<IdbCache>();
  const [report, setReport] = useState<Report | null>();
  const [seed, setSeed] = useState<number>();
  const [answers, setAnswers] = useState<Record<string, ReviewAnswer>>({});

  useEffect(() => {
    (async () => {
      const c = await IdbCache.open();
      setCache(c);
      setReport((await c?.getMeta<Report>(LAST_REPORT_KEY)) ?? null);
      let s = await c?.getMeta<number>(SEED_KEY);
      if (s === undefined) {
        s = Math.floor(Math.random() * 2 ** 31);
        await c?.setMeta(SEED_KEY, s);
      }
      setSeed(s);
      setAnswers((await c?.getMeta<Record<string, ReviewAnswer>>(ANSWERS_KEY)) ?? {});
    })();
  }, []);

  const sample = useMemo(() => (report && seed !== undefined ? sampleForReview(report.errors, seed) : []), [report, seed]);
  const score = scoreReview(sample, answers);

  function answer(id: string, patch: Partial<ReviewAnswer>) {
    const next = { ...answers, [id]: { ...answers[id], ...patch } };
    setAnswers(next);
    cache?.setMeta(ANSWERS_KEY, next);
  }

  function exportJson() {
    const data = { player: report?.player, seed, score, items: sample.map((e) => ({ id: `${e.gameId}#${e.ply}`, fen: e.fen, played: e.played.san, best: e.best?.san, category: e.category, tactic: e.tactic, clockTags: e.clockTags, answer: answers[`${e.gameId}#${e.ply}`] })) };
    navigator.clipboard?.writeText(JSON.stringify(data, null, 1));
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "cerno-revision.json";
    a.click();
  }

  if (report === undefined) return <main style={{ padding: 16 }}>Cargando…</main>;
  if (report === null)
    return (
      <main style={{ padding: 16 }}>
        No hay informe. Analiza tus partidas en el <a href="/lab">laboratorio</a> primero.
      </main>
    );

  return (
    <main style={{ padding: 16 }}>
      <h1>Revisión de etiquetas</h1>
      <p>
        {sample.length} errores al azar de {report.player.name}. Para cada uno: ¿la categoría es la correcta? Objetivo: 85% o más.
      </p>
      <p data-testid="review-score">
        Respondidas {score.answered}/{sample.length} · categoría correcta {score.categoryCorrect}
        {score.categoryAccuracy !== undefined && ` (${Math.round(score.categoryAccuracy * 100)}%)`} · etiquetas correctas {score.tagsCorrect}/{score.tagsAnswered} · no
        eran error {score.notErrors}
      </p>
      <button onClick={exportJson}>Exportar respuestas</button>{" "}
      <button
        onClick={async () => {
          const s = Math.floor(Math.random() * 2 ** 31);
          await cache?.setMeta(SEED_KEY, s);
          await cache?.setMeta(ANSWERS_KEY, {});
          setSeed(s);
          setAnswers({});
        }}
      >
        Nueva muestra
      </button>
      {sample.map((e, i) => {
        const id = `${e.gameId}#${e.ply}`;
        const a = answers[id] ?? {};
        const game = report.games.find((g) => g.id === e.gameId);
        const tags = [e.tactic?.tag, ...(e.tactic?.motifs ?? []), ...e.clockTags].filter(Boolean);
        return (
          <section key={id} style={{ display: "flex", gap: 16, borderTop: "1px solid #8886", padding: "12px 0" }}>
            <LineBoard
              fen={e.fen}
              orientation={e.color}
              size={280}
              lines={[
                { label: "Jugado + refutación", uci: [e.played.uci, ...e.refutation.uci], san: [e.played.san, ...e.refutation.san], color: "#d33" },
                { label: "Mejor", uci: e.bestLine.uci, san: e.bestLine.san, color: "#2a2" },
              ]}
            />
            <div>
              <h3>
                {i + 1}. {e.moveNumber}
                {e.color === "white" ? "." : "…"} {e.played.san} ({e.judgement}, −{e.loss} puntos: {e.winBefore} → {e.winAfter})
              </h3>
              <p>
                Mejor: <b>{e.best?.san}</b> · fase {e.phase}
                {e.endgameType ? `/${e.endgameType}` : ""} · {e.opening?.name ?? ""} ·{" "}
                {game?.url && (
                  <a href={game.url} target="_blank" rel="noreferrer">
                    partida
                  </a>
                )}
              </p>
              <p>
                Categoría de Cerno: <b>{e.category}</b> {tags.length > 0 && <>· etiquetas: <b>{tags.join(", ")}</b></>}
                {e.tactic?.material ? ` · material ${e.tactic.material}` : ""}
                {e.tactic?.mateIn ? ` · mate en ${e.tactic.mateIn}` : ""}
              </p>
              <fieldset>
                <legend>¿Categoría correcta?</legend>
                <label>
                  <input type="radio" name={`${id}-cat`} checked={a.categoryOk === true} onChange={() => answer(id, { categoryOk: true, categoryShouldBe: undefined })} /> Sí
                </label>{" "}
                <label>
                  <input type="radio" name={`${id}-cat`} checked={a.categoryOk === false} onChange={() => answer(id, { categoryOk: false })} /> No, sería:
                </label>{" "}
                <select
                  aria-label="Categoría correcta"
                  value={a.categoryShouldBe ?? ""}
                  onChange={(ev) => answer(id, { categoryOk: false, categoryShouldBe: ev.target.value as Category })}
                >
                  <option value="">–</option>
                  {CATEGORIES.filter((c) => c !== e.category).map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </fieldset>
              {tags.length > 0 && (
                <fieldset>
                  <legend>¿Etiquetas correctas?</legend>
                  <label>
                    <input type="radio" name={`${id}-tags`} checked={a.tagsOk === true} onChange={() => answer(id, { tagsOk: true })} /> Sí
                  </label>{" "}
                  <label>
                    <input type="radio" name={`${id}-tags`} checked={a.tagsOk === false} onChange={() => answer(id, { tagsOk: false })} /> No
                  </label>
                </fieldset>
              )}
              <fieldset>
                <legend>¿Fue de verdad un error?</legend>
                <label>
                  <input type="radio" name={`${id}-real`} checked={a.realError === true} onChange={() => answer(id, { realError: true })} /> Sí
                </label>{" "}
                <label>
                  <input type="radio" name={`${id}-real`} checked={a.realError === false} onChange={() => answer(id, { realError: false })} /> No
                </label>
              </fieldset>
              <input aria-label="Nota" placeholder="nota" value={a.note ?? ""} onChange={(ev) => answer(id, { note: ev.target.value })} style={{ width: "100%" }} />
            </div>
          </section>
        );
      })}
    </main>
  );
}
