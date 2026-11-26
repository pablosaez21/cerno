/* Cerno: the player card (#/card), the page before the preface. Rating, type of player, a
 * sentence and the pentagon: five axes against the opponents of the same games. Everything
 * comes from D.card (src/core/card.ts); this file only writes the words. A vertex moves only by
 * the grade: on the line when the gap is within noise (C), one step for B, two for A. */
(function () {
  const F = window.F, M = F.M, D = M.D, I = window.FOLIO_I18N;
  const t = F.t, n = F.n, esc = F.esc;
  const es = () => F.state.lang === "es";

  /* ---------- strings ---------- */
  const TRAIT = {
    en: {
      capture: ["capture more", "capture less"], check: ["give more checks", "give fewer checks"], pawn_move: ["move your pawns more", "move your pawns less"],
      equal_trade: ["trade pieces more", "trade pieces less"], queen_trade: ["trade queens more", "trade queens less"], castling: ["castle more", "castle less"],
      king_move: ["move your king more", "move your king less"], knight_move: ["lean on your knights", "use your knights less"], bishop_move: ["lean on your bishops", "use your bishops less"],
      rook_move: ["move your rooks more", "move your rooks less"], queen_move: ["move your queen more", "move your queen less"], retreat: ["retreat more", "retreat less"],
      advance: ["push your pieces forward more", "push your pieces forward less"], to_attacked_square: ["put pieces on attacked squares more", "put pieces on attacked squares less"],
      king_side_pawn_move: ["push the pawns in front of your king more", "push the pawns in front of your king less"],
    },
    es: {
      capture: ["capturas más", "capturas menos"], check: ["das más jaques", "das menos jaques"], pawn_move: ["mueves más los peones", "mueves menos los peones"],
      equal_trade: ["cambias más piezas", "cambias menos piezas"], queen_trade: ["cambias más las damas", "cambias menos las damas"], castling: ["enrocas más", "enrocas menos"],
      king_move: ["mueves más el rey", "mueves menos el rey"], knight_move: ["te apoyas más en los caballos", "usas menos los caballos"], bishop_move: ["te apoyas más en los alfiles", "usas menos los alfiles"],
      rook_move: ["mueves más las torres", "mueves menos las torres"], queen_move: ["mueves más la dama", "mueves menos la dama"], retreat: ["retiras más piezas", "retiras menos piezas"],
      advance: ["avanzas más las piezas", "avanzas menos las piezas"], to_attacked_square: ["llevas más piezas a casillas atacadas", "llevas menos piezas a casillas atacadas"],
      king_side_pawn_move: ["empujas más los peones de tu enroque", "empujas menos los peones de tu enroque"],
    },
  };
  const TYPE = {
    en: {
      attacker: ["Attacker", "You go for the king: checks and moves that force."], simplifier: ["Simplifier", "You trade pieces to reach simple positions."],
      manoeuvrer: ["Manoeuvrer", "You move your pieces without hurry and avoid trades."], pawn_stormer: ["Pawn stormer", "You push the pawns on your king’s side."],
      structural: ["Structural", "You play with your pawns and the structure."], cautious: ["Cautious", "Safety first: you castle, retreat and don’t expose yourself."],
      active_king: ["Active king", "You use your king as one more piece."], balanced: ["Balanced", "You choose like players at your level; nothing stands out."],
      none: ["No clear type", ""],
    },
    es: {
      attacker: ["Atacante", "Vas a por el rey: jaques y jugadas que obligan."], simplifier: ["Simplificador", "Cambias piezas para llegar a posiciones sencillas."],
      manoeuvrer: ["Maniobrero", "Mueves las piezas sin prisa y evitas cambiar."], pawn_stormer: ["Lanzapeones", "Empujas los peones del lado de tu rey."],
      structural: ["Estructural", "Juegas con los peones y la estructura."], cautious: ["Prudente", "Primero la seguridad: enrocas, retiras y no te expones."],
      active_king: ["Rey activo", "Usas el rey como una pieza más."], balanced: ["Equilibrado", "Eliges como los jugadores de tu nivel; nada destaca."],
      none: ["Sin tipo definido", ""],
    },
  };
  const AXIS = {
    en: {
      "phase:opening": ["Opening", "the opening", "While the game is still in known theory."], "phase:middlegame": ["Middlegame", "the middlegame", "Between the opening and the endgame."],
      "phase:endgame": ["Endgame", "the endgame", "Six pieces or fewer, not counting kings and pawns."], "demand:forcing": ["Tactics", "tactics", "Positions where the best move was a capture or a check."],
      "demand:quiet": ["Strategy", "strategy", "Positions where the best move was quiet: neither a capture nor a check."],
    },
    es: {
      "phase:opening": ["Apertura", "la apertura", "Mientras la partida sigue en teoría conocida."], "phase:middlegame": ["Medio juego", "el medio juego", "Entre la apertura y el final."],
      "phase:endgame": ["Final", "el final", "Con seis piezas o menos, sin contar reyes ni peones."], "demand:forcing": ["Táctica", "la táctica", "Posiciones donde la mejor jugada era capturar o dar jaque."],
      "demand:quiet": ["Estrategia", "la estrategia", "Posiciones donde la mejor jugada era tranquila: ni capturar ni dar jaque."],
    },
  };
  Object.assign(I.en, {
    "pc.title": "Player card", "pc.type": "Type of player", "pc.rating": (p) => `Blitz rating<br>${p.site}`, "pc.noRating": "No rating",
    "pc.record": (p) => `${p.n} blitz games · ${p.w} won, ${p.d} drawn, ${p.l} lost`,
    "pc.w.weaker.confirmed": "worse than your opponents", "pc.w.weaker.suggestive": "looks worse", "pc.w.stronger.confirmed": "better than your opponents", "pc.w.stronger.suggestive": "looks better",
    "pc.w.unresolved": "no clear difference", "pc.w.insufficient": "not enough data yet", "pc.w.missing": "not computed",
    "pc.line": "like your opponents",
    "pc.key.out": "Outwards: better than your opponents", "pc.key.in": "Inwards: worse", "pc.key.a": "Confirmed", "pc.key.b": "Looks so", "pc.key.rec": "What to train",
    "pc.traits": (p) => `Compared with players at your level, you ${p.list}.`,
    "pc.pace.faster": "You also play faster than your opponents.", "pc.pace.slower": "You also play slower than your opponents.",
    "pc.weakA": (p) => `you play worse than your opponents in ${p.list}`, "pc.weakB": (p) => `everything points to you playing worse than your opponents in ${p.list}`,
    "pc.strongA": (p) => `in ${p.list} you are better than them`, "pc.strongB": (p) => `in ${p.list} you seem to be better than them`,
    "pc.though": (p) => `Although ${p.weak}, ${p.strong}.`, "pc.unresolved": (p) => `In ${p.list} there is no clear difference yet.`,
    "pc.allUnresolved": "With these games there is no clear difference with your opponents yet.",
    "pc.loss": (p) => `What costs you most is ${p.area}: ${p.share} of what you lose.`,
    "pc.tap.A": (p) => `You play ${p.dir} than your opponents: like someone ${p.gap} points ${p.side} them.`,
    "pc.tap.B": (p) => `You seem to play ${p.dir} than your opponents: like someone ${p.gap} points ${p.side} them, but it is not certain yet.`,
    "pc.tap.C": "No clear difference with your opponents: these games cannot tell yet.",
    "pc.tap.N": (p) => `Not enough moves yet: you have ${p.k} and it takes ${p.min}.`, "pc.tap.M": "Not computed in this study.",
    "pc.worse": "worse", "pc.better": "better", "pc.below": "below", "pc.above": "above",
    "pc.nums": "Numbers", "pc.numsBody": (p) => `${p.gap} Elo; 95 %: ${p.lo} to ${p.hi}; grade ${p.grade}; smallest detectable difference ${p.dg}. Your opponents: those of these same games, all together.`,
    "pc.train": "Train it",
    "loss.tactics": "tactics", "loss.strategy": "strategy", "loss.openings": "the openings", "loss.endgames": "the endgames",
  });
  Object.assign(I.es, {
    "pc.title": "Ficha del jugador", "pc.type": "Tipo de jugador", "pc.rating": (p) => `Elo blitz<br>${p.site}`, "pc.noRating": "Sin Elo",
    "pc.record": (p) => `${p.n} partidas de blitz · ${p.w} ganadas, ${p.d} tablas, ${p.l} perdidas`,
    "pc.w.weaker.confirmed": "peor que tus rivales", "pc.w.weaker.suggestive": "parece peor", "pc.w.stronger.confirmed": "mejor que tus rivales", "pc.w.stronger.suggestive": "parece mejor",
    "pc.w.unresolved": "sin diferencia clara", "pc.w.insufficient": "sin datos aún", "pc.w.missing": "sin calcular",
    "pc.line": "igual que tus rivales",
    "pc.key.out": "Hacia fuera: mejor que tus rivales", "pc.key.in": "Hacia dentro: peor", "pc.key.a": "Seguro", "pc.key.b": "Parece", "pc.key.rec": "Lo que toca entrenar",
    "pc.traits": (p) => `Frente a los jugadores de tu nivel, ${p.list}.`,
    "pc.pace.faster": "Y juegas más rápido que tus rivales.", "pc.pace.slower": "Y juegas más despacio que tus rivales.",
    "pc.weakA": (p) => `juegas peor que tus rivales en ${p.list}`, "pc.weakB": (p) => `todo apunta a que juegas peor que tus rivales en ${p.list}`,
    "pc.strongA": (p) => `en ${p.list} eres mejor que ellos`, "pc.strongB": (p) => `en ${p.list} parece que eres mejor que ellos`,
    "pc.though": (p) => `Aunque ${p.weak}, ${p.strong}.`, "pc.unresolved": (p) => `En ${p.list} aún no se ve una diferencia clara.`,
    "pc.allUnresolved": "Con estas partidas aún no se ve una diferencia clara con tus rivales.",
    "pc.loss": (p) => `Lo que más te cuesta es ${p.area}: el ${p.share} de lo que pierdes.`,
    "pc.tap.A": (p) => `Juegas ${p.dir} que tus rivales: como alguien ${p.gap} puntos por ${p.side} de ellos.`,
    "pc.tap.B": (p) => `Parece que juegas ${p.dir} que tus rivales: como alguien ${p.gap} puntos por ${p.side} de ellos, pero aún no es seguro.`,
    "pc.tap.C": "Sin diferencia clara con tus rivales: con estas partidas aún no se puede saber.",
    "pc.tap.N": (p) => `Aún no hay jugadas suficientes: tienes ${p.k} y hacen falta ${p.min}.`, "pc.tap.M": "No se ha calculado en este estudio.",
    "pc.worse": "peor", "pc.better": "mejor", "pc.below": "debajo", "pc.above": "encima",
    "pc.nums": "Números", "pc.numsBody": (p) => `${p.gap} de Elo; 95 %: de ${p.lo} a ${p.hi}; grado ${p.grade}; diferencia mínima detectable ${p.dg}. Tus rivales: los de estas mismas partidas, todos juntos.`,
    "pc.train": "Entrénalo",
    "loss.tactics": "la táctica", "loss.strategy": "la estrategia", "loss.openings": "la apertura", "loss.endgames": "el final",
  });

  const L = () => F.state.lang === "es" ? "es" : "en";
  const sign = (v) => (v > 0 ? "+" : v < 0 ? "−" : "") + n(Math.abs(v));
  const list = (xs) => (xs.length < 2 ? xs.join("") : xs.slice(0, -1).join(", ") + (es() ? " y " : " and ") + xs[xs.length - 1]);
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const axName = (id) => AXIS[L()][id][0];
  const axLow = (id) => AXIS[L()][id][1];
  const word = (a) => (a.state === "confirmed" || a.state === "suggestive" ? t(`pc.w.${a.direction}.${a.state}`) : t("pc.w." + a.state));
  const SITE = { chesscom: "Chess.com", lichess: "Lichess", pgn: "PGN" };
  // Axes that the preface already prescribes: they get the red pencil ring and a link.
  const recOf = (id) => D.recommendations.find((r) => r.findingId === "profile:" + id);

  /* ---------- the sentence: rules over the card's data ---------- */
  F.cardSentence = (c) => {
    const out = [];
    const p = c.profile;
    if (p) {
      if (p.traits.length) out.push(t("pc.traits", { list: list(p.traits.map((x) => TRAIT[L()][x.attribute][x.more ? 0 : 1])) }));
      if (p.pace) out.push(t("pc.pace." + p.pace));
      const pick = (state, dir) => p.axes.filter((a) => a.state === state && a.direction === dir).map((a) => axLow(a.id));
      const wA = pick("confirmed", "weaker"), wB = pick("suggestive", "weaker"), sA = pick("confirmed", "stronger"), sB = pick("suggestive", "stronger");
      const unres = p.axes.filter((a) => a.state === "unresolved").map((a) => axLow(a.id));
      const weak = wA.length ? t("pc.weakA", { list: list(wA) }) : wB.length ? t("pc.weakB", { list: list(wB) }) : "";
      const strong = sA.length ? t("pc.strongA", { list: list(sA) }) : sB.length ? t("pc.strongB", { list: list(sB) }) : "";
      if (weak && strong) out.push(t("pc.though", { weak, strong }));
      else if (weak || strong) out.push(cap(weak || strong.replace(es() ? " ellos" : " them", es() ? " tus rivales" : " your opponents")) + ".");
      if (unres.length && (weak || strong)) out.push(t("pc.unresolved", { list: list(unres) }));
      else if (!weak && !strong) out.push(t("pc.allUnresolved"));
    }
    if (c.mainLoss) out.push(t("pc.loss", { area: t("loss." + c.mainLoss.area), share: F.pct(c.mainLoss.share) }));
    return out.join(" ");
  };

  /* ---------- the pentagon ---------- */
  function pentagon(axes, sel) {
    const k = axes.length, CX = 400, CY = 335, R0 = 120, STEP = 42, RO = R0 + 2 * STEP + 12;
    const pt = (r, i) => { const a = (2 * Math.PI * i) / k; return [CX + r * Math.sin(a), CY - r * Math.cos(a)]; };
    const P = (xy) => xy.map((v) => v.toFixed(1)).join(" ");
    const rv = axes.map((a) => R0 + a.step * STEP);
    const nd = (a) => a.state === "insufficient" || a.state === "missing";
    let g = `<circle class="pc-outer" cx="${CX}" cy="${CY}" r="${RO}"/>`;
    axes.forEach((_, i) => { const [x, y] = pt(RO, i); g += `<line class="pc-spoke" x1="${CX}" y1="${CY}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"/>`; });
    g += `<polygon class="pc-riv" points="${axes.map((_, i) => P(pt(R0, i))).join(" ")}"/>`;
    const [l1, l2] = t("pc.line").split(/ (?=\S+ \S+$)/);
    g += `<text class="pc-rivl" x="${CX}" y="${CY + 4}" text-anchor="middle">${esc(l1)}</text><text class="pc-rivl" x="${CX}" y="${CY + 24}" text-anchor="middle">${esc(l2 || "")}</text>`;
    g += `<polygon class="pc-you" points="${axes.map((_, i) => P(pt(rv[i], i))).join(" ")}"/>`;
    axes.forEach((a, i) => {
      const j = (i + 1) % k, [x0, y0] = pt(rv[i], i), [x1, y1] = pt(rv[j], j);
      g += `<line class="pc-edge${nd(a) || nd(axes[j]) ? " pc-nd" : ""}" x1="${x0.toFixed(1)}" y1="${y0.toFixed(1)}" x2="${x1.toFixed(1)}" y2="${y1.toFixed(1)}"/>`;
    });
    axes.forEach((a, i) => {
      const [x, y] = pt(rv[i], i);
      if (a.state === "confirmed") g += `<circle class="pc-v pc-a" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="7.5"/>`;
      else if (a.state === "suggestive") g += `<circle class="pc-v pc-b" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="7"/>`;
      else if (nd(a)) g += `<rect class="pc-v pc-n" x="${(x - 6).toFixed(1)}" y="${(y - 6).toFixed(1)}" width="12" height="12" transform="rotate(45 ${x.toFixed(1)} ${y.toFixed(1)})"/>`;
      if (recOf(a.id)) g += `<path class="pc-pen" d="M7 25C5 11 15 4 25 5c11 1 16 9 15 19-2 12-11 17-20 16C10 39 4 33 8 21" transform="translate(${(x - 28).toFixed(1)} ${(y - 27).toFixed(1)}) scale(1.24)"/>`;
    });
    axes.forEach((a, i) => {
      const [x, y] = pt(RO + 30, i), s = Math.sin((2 * Math.PI * i) / k), co = Math.cos((2 * Math.PI * i) / k);
      const anchor = Math.abs(s) < 0.2 ? "middle" : s > 0 ? "start" : "end";
      const top = co > 0.2 ? y - 26 : co < -0.2 ? y + 18 : y - 2;
      const bw = 210, bx = anchor === "middle" ? x - bw / 2 : anchor === "start" ? x - 12 : x - bw + 12;
      g += `<g class="pc-ax${nd(a) ? " pc-none" : ""}${a.direction === "weaker" ? " pc-weak" : ""}${sel === a.id ? " pc-sel" : ""}" data-axis="${a.id}" role="button" tabindex="0" aria-pressed="${sel === a.id}" aria-label="${esc(axName(a.id))}: ${esc(word(a))}">
        <rect class="pc-hit" x="${bx.toFixed(1)}" y="${(top - 28).toFixed(1)}" width="${bw}" height="62" rx="4"/>
        <text class="pc-lb" text-anchor="${anchor}" x="${x.toFixed(1)}" y="${top.toFixed(1)}">${esc(axName(a.id))}</text>
        <text class="pc-st" text-anchor="${anchor}" x="${x.toFixed(1)}" y="${(top + 29).toFixed(1)}">${esc(word(a))}</text></g>`;
    });
    return `<svg class="pc-pent" viewBox="-40 0 880 670" role="group" aria-label="${esc(t("pc.title"))}">${g}</svg>`;
  }

  function tap(a) {
    const name = `<b>${esc(axName(a.id))}.</b> `;
    const def = `<span class="pc-def">${esc(AXIS[L()][a.id][2])}</span>`;
    if (a.state === "missing") return `<p class="pc-tap">${name}${t("pc.tap.M")} ${def}</p>`;
    if (a.state === "insufficient") return `<p class="pc-tap">${name}${t("pc.tap.N", { k: n(a.decisions), min: n(a.minDecisions) })} ${def}</p>`;
    let s;
    if (a.state === "unresolved") s = t("pc.tap.C");
    else {
      const weaker = a.direction === "weaker";
      s = t(a.state === "confirmed" ? "pc.tap.A" : "pc.tap.B", { dir: t(weaker ? "pc.worse" : "pc.better"), gap: n(Math.abs(a.gap)), side: t(weaker ? "pc.below" : "pc.above") });
    }
    const r = recOf(a.id);
    const nums = `<details class="pc-nums"><summary>${t("pc.nums")}</summary><p class="num">${t("pc.numsBody", { gap: sign(a.gap), lo: sign(a.ci95[0]), hi: sign(a.ci95[1]), grade: a.grade, dg: n(a.detectableGap) })}</p></details>`;
    return `<p class="pc-tap">${name}${s} ${def}</p>${r ? `<a class="more" href="#/preface#rec${r.rank}">${t("pc.train")}</a>` : ""}${nums}`;
  }

  const pen = `<svg viewBox="0 0 45 45" preserveAspectRatio="none" aria-hidden="true"><path class="pc-pen" d="M7 25C5 11 15 4 25 5c11 1 16 9 15 19-2 12-11 17-20 16C10 39 4 33 8 21"/></svg>`;
  const key = (axes) => `<div class="pc-key"><span>${t("pc.key.out")}</span><span>${t("pc.key.in")}</span>
    <span><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" class="pc-v pc-a"/></svg>${t("pc.key.a")}</span>
    <span><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.5" class="pc-v pc-b"/></svg>${t("pc.key.b")}</span>
    ${axes.some((a) => recOf(a.id)) ? `<span>${pen}${t("pc.key.rec")}</span>` : ""}</div>`;

  /* =============== #/card =============== */
  F.route(/^\/card$/, () => {
    const c = D.card;
    if (!c) return { html: `<div class="page"><h1 class="title">${t("pc.title")}</h1></div>`, nav: "contents", ribbon: "card", where: t("pc.title"), title: t("pc.title") };
    const r = c.rating;
    const head = `<p class="kicker">${t("pc.title")}</p>
      <div class="pc-head"><div class="pc-elo num">${r ? String(r.value) : "–"}<small>${r ? t("pc.rating", { site: SITE[r.source] || r.source }) : t("pc.noRating")}</small></div>
      <div class="pc-who"><b>${esc(c.player)}</b><span class="num">${t("pc.record", { n: c.record.games, w: c.record.win, d: c.record.draw, l: c.record.loss })}</span></div></div>`;
    const p = c.profile;
    const ty = p ? (p.type || (p.traits.length ? "none" : null)) : null;
    const typeBlock = `<div class="pc-type">${ty ? `<p class="k">${t("pc.type")}</p><h1>${esc(TYPE[L()][ty][0])}</h1>${TYPE[L()][ty][1] ? `<p class="tw">${esc(TYPE[L()][ty][1])}</p>` : ""}` : ""}
      <p class="pc-sent">${F.cardSentence(c)}</p>
      ${p ? "" : `<p class="small muted" style="margin-top:12px">${t("lv.none", { reduced: D.level && D.level.mode === "reduced", min: 30, blitz: c.record.games })}</p>`}</div>`;
    const sel0 = p && (p.axes.find((a) => recOf(a.id)) || p.axes.find((a) => a.state === "confirmed" || a.state === "suggestive") || p.axes[0]);
    const right = p ? `<figure class="fig pc-fig"><div data-pent>${pentagon(p.axes, sel0.id)}</div><div data-tap aria-live="polite">${tap(sel0)}</div>${key(p.axes)}</figure>` : "";
    const html = `<div class="spread"><div class="row"><div class="v">${head}${typeBlock}</div><div class="r">${right}</div></div>
      <div class="row full"><div class="v"><hr class="rule"><div style="display:flex;justify-content:flex-end"><a class="more" href="#/preface">${t("nav.preface")}</a></div></div></div></div>`;
    return {
      html, nav: "contents", ribbon: "card", where: t("pc.title"), title: t("pc.title"),
      after(root) {
        if (!p) return;
        const box = root.querySelector("[data-pent]"), tapBox = root.querySelector("[data-tap]");
        const pick = (el) => {
          const a = p.axes.find((x) => x.id === el.dataset.axis); if (!a) return;
          box.innerHTML = pentagon(p.axes, a.id); tapBox.innerHTML = tap(a);
          box.querySelector(`[data-axis="${a.id}"]`)?.focus();
        };
        box.addEventListener("click", (e) => { const el = e.target.closest("[data-axis]"); if (el) pick(el); });
        box.addEventListener("keydown", (e) => { if (e.key !== "Enter" && e.key !== " ") return; const el = e.target.closest("[data-axis]"); if (el) { e.preventDefault(); pick(el); } });
      },
    };
  });
})();
