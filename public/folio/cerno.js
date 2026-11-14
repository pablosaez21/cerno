/* Cerno: what the prototype did not have. The real wait (#/analysing, driven by the
 * analysis in src/folio/host.ts through window.CernoApp), the chapter against your
 * opponents (#/level: Maia-3 peer profile, style, repertoire) and the labels and prose
 * for the report v3 finding kinds. Copy is terse on purpose (owner: too much text). */
(function () {
  const F = window.F, M = F.M, D = M.D, I = window.FOLIO_I18N, LBL = window.CERNO_LABELS;
  const t = F.t, n = F.n, esc = F.esc;
  const es = () => F.state.lang === "es";

  /* ---------- strings ---------- */
  Object.assign(I.en, {
    "lv.title": "Against your opponents",
    "lv.kicker": "Chapter N",
    "lv.lede": "Each class of decisions, compared with your opponents in the same games. Maia-3 sets the scale: Lichess blitz players at your level.",
    "lv.overall": (p) => `Overall: ${p.gap} Elo against your opponents (95 %: ${p.lo} to ${p.hi}).`,
    "lv.col.class": "Decisions", "lv.col.gap": "Elo", "lv.col.ci": "95 %", "lv.col.grade": "Grade", "lv.col.n": "Moves",
    "lv.grade": "A: confirmed. B: suggestive. C: no evidence.",
    "lv.clock": "By clock", "lv.style": "Style", "lv.styleLede": "Moves you choose more or less often than players at your level, after discounting what your opponents do.",
    "lv.noStyle": "No style trait passes the threshold.",
    "lv.repertoire": "Repertoire", "lv.repLede": "Positions you reach in three or more games before move 12.",
    "lv.col.pos": "Position", "lv.col.you": "You", "lv.col.plus": "+400 play", "lv.col.engine": "Engine", "lv.col.games": "Games",
    "lv.none": (p) => (p.reduced ? "No profile: without WebGPU, Maia-3 only checks your judged moves." : `No profile yet: it needs ${p.min} blitz games with ratings, and this study has ${p.blitz}.`),
    "m.maiaBody": (p) => `Maia-3 predicts what Lichess blitz players of a given rating play: it describes that population, not you. ${p.scale}Of your ${p.errors} mistakes and blunders, ${p.inScope} were asked; ${p.out} came from games that are not blitz.`,
    "m.eloScale": (p) => `Ratings in this book are ${p.site}’s; Maia is asked ${p.off} higher (${p.lo} to ${p.hi}), an equivalence measured on a single player rated ${p.at}. `,
    "m.eloScale.pgn": "Ratings are the PGN’s; Maia is asked with them unconverted. ",
    "elo.scale": (p) => `The axis is in ${p.site} rating: Maia is asked ${p.off} higher. `,
    "lvl.out.note": "Not a blitz game, or no rating: Maia isn’t asked.",
    "tc.line": (p) => Object.entries(p).map(([k, v]) => `${v} ${k}`).join(", "),
    "lv.trait.more": (p) => `More ${p.what} than players at your level: ${p.obs} vs ${p.exp}.`,
    "lv.trait.less": (p) => `Fewer ${p.what} than players at your level: ${p.obs} vs ${p.exp}.`,
    "cls.phase:opening": "Opening", "cls.phase:middlegame": "Middlegame", "cls.phase:endgame": "Endgame",
    "cls.standing:ahead": "When ahead", "cls.standing:level": "When level", "cls.standing:behind": "When behind",
    "cls.demand:forcing": "Forcing positions", "cls.demand:pawn": "Pawn decisions", "cls.demand:piece": "Piece decisions",
    "cls.choice:one_good": "Only one good move", "cls.choice:several_good": "Several good moves",
    "cls.clock:>=60": "60 s or more on the clock", "cls.clock:30-60": "30–60 s", "cls.clock:<30": "Under 30 s", "cls.all": "All decisions",
    "st.capture": "captures", "st.check": "checks", "st.pawn_move": "pawn moves", "st.equal_trade": "equal trades", "st.queen_trade": "queen trades",
    "st.castling": "castling", "st.king_move": "king moves", "st.knight_move": "knight moves", "st.bishop_move": "bishop moves", "st.rook_move": "rook moves",
    "st.queen_move": "queen moves", "st.retreat": "retreats", "st.advance": "advances", "st.to_attacked_square": "moves to attacked squares", "st.king_side_pawn_move": "king-side pawn moves",
    "pg.weaker": (p) => `${p.gap} Elo against your opponents in the same games (95 %: ${p.lo} to ${p.hi}; grade ${p.grade}).`,
    "pg.stronger": (p) => `+${p.gap} Elo against your opponents in the same games (95 %: ${p.lo} to ${p.hi}; grade ${p.grade}).`,
    "rl.claim": (p) => `${p.played} here in ${p.games} games. Players 400 above your rating play ${p.fav}; the engine prefers ${p.best}.`,
    "err.run.t": "The analysis stopped",
    "err.noPgn": "Paste the PGN first.",
    "cover.open": (p) => `Open the last study: ${p.user}, ${p.n} games${p.date ? ", " + p.date : ""}`,
    "set.data": "Your data", "set.newRun": "New analysis", "set.forget": "Delete everything saved",
    "set.forgetAsk": "Delete the saved study and the engine cache from this browser?",
    "set.dataNote": "The study and the engine cache live only in this browser.",
    "m.noProfile": "No per-phase comparison: the peer profile did not run.",
    "m.phases": "By phase, against your opponents",
    "m.phasesBody": "Gap in Elo between you and your opponents in the same games, on Maia-3's scale. 0 = like them.",
    "m.phaseFig": "Each phase, against your opponents",
    "m.phaseCap": (p) => `${p.k} of ${p.n} intervals cross 0.`,
    "demoTag": "Replay",
    "sv.t.done": () => `Sifted. <em>${D.recommendations.length}</em> things to train.`,
    "method.play_vs_maia": "Play these positions against Maia-3 at your opponents' rating",
    "lvx.title": "Analysing", "lvx.cancel": "Cancel", "lvx.open": "Open the study",
    "lvx.s.fetch": "Games", "lvx.s.model": "Maia-3 model", "lvx.s.pass1": "Stockfish, every position", "lvx.s.pass2": "Stockfish, the costly moves",
    "lvx.s.maia": "Maia-3, five ratings", "lvx.s.cand": "Candidate moves", "lvx.s.ladder": "Elo ladder", "lvx.s.book": "Typesetting",
    "lvx.lead.fetch": "Reading your games.", "lvx.lead.pass1": "Stockfish reads every position.", "lvx.lead.pass2": "A second, deeper look at the costly moves.",
    "lvx.lead.cand": "Weighing what players at your level would play.", "lvx.lead.ladder": "Building the Elo ladder.", "lvx.lead.book": "Typesetting the study.",
    "lvx.lead.done": "Done.", "lvx.lead.error": "The analysis stopped.",
    "lvx.leave": "Keep this tab open. Every game is cached as it ends.",
    "lvx.games": (p) => `${p.n} games`, "lvx.elapsed": "elapsed",
    "lvx.noGpu": "No WebGPU: Maia-3 runs on the processor and only checks your judged moves. No profile against your opponents.",
    "lvx.idle": "No analysis running.",
  });
  Object.assign(I.es, {
    "lv.title": "Frente a tus rivales",
    "lv.kicker": "Capítulo N",
    "lv.lede": "Cada tipo de decisión, comparado con tus rivales de las mismas partidas. La escala la pone Maia-3: jugadores de blitz de Lichess de tu nivel.",
    "lv.overall": (p) => `En conjunto: ${p.gap} de Elo frente a tus rivales (95 %: de ${p.lo} a ${p.hi}).`,
    "lv.col.class": "Decisiones", "lv.col.gap": "Elo", "lv.col.ci": "95 %", "lv.col.grade": "Grado", "lv.col.n": "Jugadas",
    "lv.grade": "A: confirmado. B: indicio. C: sin pruebas.",
    "lv.clock": "Según el reloj", "lv.style": "Estilo", "lv.styleLede": "Jugadas que eliges más o menos que los jugadores de tu nivel, descontando lo que hacen tus rivales.",
    "lv.noStyle": "Ningún rasgo de estilo pasa el umbral.",
    "lv.repertoire": "Repertorio", "lv.repLede": "Posiciones a las que llegas en tres partidas o más antes de la jugada 12.",
    "lv.col.pos": "Posición", "lv.col.you": "Tú", "lv.col.plus": "+400 juegan", "lv.col.engine": "Motor", "lv.col.games": "Partidas",
    "lv.none": (p) => (p.reduced ? "Sin perfil: sin WebGPU, Maia-3 solo revisa tus jugadas marcadas." : `Aún sin perfil: hacen falta ${p.min} partidas de blitz con Elo, y este estudio tiene ${p.blitz}.`),
    "m.maiaBody": (p) => `Maia-3 predice qué juegan los jugadores de blitz de Lichess de un Elo dado: describe a esa población, no a ti. ${p.scale}De tus ${p.errors} errores y errores graves, se le preguntaron ${p.inScope}; ${p.out} eran de partidas que no son blitz.`,
    "m.eloScale": (p) => `Los Elo del libro son de ${p.site}; a Maia se le pregunta con ${p.off} más (entre ${p.lo} y ${p.hi}), una equivalencia medida con un solo jugador de ${p.at}. `,
    "m.eloScale.pgn": "Los Elo son los del PGN; a Maia se le pregunta con ellos sin convertir. ",
    "elo.scale": (p) => `El eje va en Elo de ${p.site}: a Maia se le pregunta con ${p.off} más. `,
    "lvl.out.note": "No es blitz o no hay Elo: no se le pregunta a Maia.",
    "tc.line": (p) => Object.entries(p).map(([k, v]) => `${v} ${{ bullet: "bala", blitz: "blitz", rapid: "rápidas", classical: "clásicas", daily: "diarias" }[k] || k}`).join(", "),
    "lv.trait.more": (p) => `Más ${p.what} que los jugadores de tu nivel: ${p.obs} frente a ${p.exp}.`,
    "lv.trait.less": (p) => `Menos ${p.what} que los jugadores de tu nivel: ${p.obs} frente a ${p.exp}.`,
    "cls.phase:opening": "Apertura", "cls.phase:middlegame": "Medio juego", "cls.phase:endgame": "Final",
    "cls.standing:ahead": "Yendo por delante", "cls.standing:level": "Con la partida igualada", "cls.standing:behind": "Yendo por detrás",
    "cls.demand:forcing": "Posiciones forzantes", "cls.demand:pawn": "Decisiones de peones", "cls.demand:piece": "Decisiones de piezas",
    "cls.choice:one_good": "Una sola buena jugada", "cls.choice:several_good": "Varias buenas jugadas",
    "cls.clock:>=60": "60 s o más en el reloj", "cls.clock:30-60": "Entre 30 y 60 s", "cls.clock:<30": "Menos de 30 s", "cls.all": "Todas las decisiones",
    "st.capture": "capturas", "st.check": "jaques", "st.pawn_move": "jugadas de peón", "st.equal_trade": "cambios iguales", "st.queen_trade": "cambios de damas",
    "st.castling": "enroques", "st.king_move": "jugadas de rey", "st.knight_move": "jugadas de caballo", "st.bishop_move": "jugadas de alfil", "st.rook_move": "jugadas de torre",
    "st.queen_move": "jugadas de dama", "st.retreat": "retiradas", "st.advance": "avances", "st.to_attacked_square": "jugadas a casillas atacadas", "st.king_side_pawn_move": "jugadas de peón del flanco de rey",
    "pg.weaker": (p) => `${p.gap} de Elo frente a tus rivales de las mismas partidas (95 %: de ${p.lo} a ${p.hi}; grado ${p.grade}).`,
    "pg.stronger": (p) => `+${p.gap} de Elo frente a tus rivales de las mismas partidas (95 %: de ${p.lo} a ${p.hi}; grado ${p.grade}).`,
    "rl.claim": (p) => `${p.played} aquí en ${p.games} partidas. Los jugadores 400 por encima de tu Elo juegan ${p.fav}; el motor prefiere ${p.best}.`,
    "err.run.t": "El análisis se ha parado",
    "err.noPgn": "Pega primero el PGN.",
    "cover.open": (p) => `Abrir el último estudio: ${p.user}, ${p.n} partidas${p.date ? ", " + p.date : ""}`,
    "set.data": "Tus datos", "set.newRun": "Nuevo análisis", "set.forget": "Borrar todo lo guardado",
    "set.forgetAsk": "¿Borrar de este navegador el estudio guardado y la caché del motor?",
    "set.dataNote": "El estudio y la caché del motor solo están en este navegador.",
    "m.noProfile": "Sin comparación por fases: el perfil frente a rivales no se calculó.",
    "m.phases": "Por fases, frente a tus rivales",
    "m.phasesBody": "Diferencia en Elo entre tú y tus rivales de las mismas partidas, en la escala de Maia-3. 0 = como ellos.",
    "m.phaseFig": "Cada fase, frente a tus rivales",
    "m.phaseCap": (p) => `${p.k} de ${p.n} intervalos cruzan el 0.`,
    "demoTag": "Repetición",
    "sv.t.done": () => `Cribado. <em>${D.recommendations.length}</em> cosas que entrenar.`,
    "method.play_vs_maia": "Juega estas posiciones contra Maia-3 al Elo de tus rivales",
    "lvx.title": "Analizando", "lvx.cancel": "Cancelar", "lvx.open": "Abrir el estudio",
    "lvx.s.fetch": "Partidas", "lvx.s.model": "Modelo Maia-3", "lvx.s.pass1": "Stockfish, cada posición", "lvx.s.pass2": "Stockfish, las jugadas caras",
    "lvx.s.maia": "Maia-3, cinco niveles", "lvx.s.cand": "Jugadas candidatas", "lvx.s.ladder": "Escalera de Elo", "lvx.s.book": "Composición",
    "lvx.lead.fetch": "Leyendo tus partidas.", "lvx.lead.pass1": "Stockfish lee cada posición.", "lvx.lead.pass2": "Segunda mirada, más profunda, a las jugadas caras.",
    "lvx.lead.cand": "Pesando qué jugarían los de tu nivel.", "lvx.lead.ladder": "Montando la escalera de Elo.", "lvx.lead.book": "Componiendo el estudio.",
    "lvx.lead.done": "Hecho.", "lvx.lead.error": "El análisis se ha parado.",
    "lvx.leave": "Deja esta pestaña abierta. Cada partida se guarda al terminar.",
    "lvx.games": (p) => `${p.n} partidas`, "lvx.elapsed": "transcurrido",
    "lvx.noGpu": "Sin WebGPU: Maia-3 va por el procesador y solo revisa tus jugadas marcadas. Sin perfil frente a rivales.",
    "lvx.idle": "No hay ningún análisis en marcha.",
  });
  I.recTitle.en["phase:opening"] = "Fix your openings"; I.recTitle.es["phase:opening"] = "Arregla tus aperturas";
  I.recTitle.en["phase:middlegame"] = "Play the middlegame like your opponents"; I.recTitle.es["phase:middlegame"] = "Juega el medio juego como tus rivales";
  I.recTitle.en["demand:pawn"] = "Decide better with pawns"; I.recTitle.es["demand:pawn"] = "Decide mejor con los peones";
  I.recTitle.en["demand:piece"] = "Decide better with pieces"; I.recTitle.es["demand:piece"] = "Decide mejor con las piezas";
  I.recTitle.en["standing:level"] = "Hold level positions"; I.recTitle.es["standing:level"] = "Sostén las posiciones igualadas";
  I.recTitle.en["choice:one_good"] = "Find the only move"; I.recTitle.es["choice:one_good"] = "Encuentra la única jugada";

  /* ---------- labels for the v3 kinds ---------- */
  const sign = (v) => (v > 0 ? "+" : "") + n(v);
  const clsName = (id) => t("cls." + id);
  const baseTitle = LBL.findingTitle, baseDesc = LBL.findingDesc;
  LBL.findingTitle = (lang, f) => {
    const T = (k, p) => I.fill(I[lang][k] ?? I.en[k] ?? k, p);
    if (f.kind === "profile_gap") return T("cls." + f.key);
    if (f.kind === "style_trait") {
      const what = T("st." + f.key);
      return (f.params.observed > f.params.expected ? (lang === "es" ? "Más " : "More ") : (lang === "es" ? "Menos " : "Fewer ")) + what;
    }
    if (f.kind === "repertoire_leak") return (lang === "es" ? "Repertorio: " : "Repertoire: ") + (f.params.played || f.key);
    return baseTitle(lang, f);
  };
  LBL.findingDesc = (lang, f) => (["profile_gap", "style_trait", "repertoire_leak"].includes(f.kind) ? "" : baseDesc(lang, f));
  const baseClaim = F.claim;
  F.claim = (f) => {
    if (f.kind === "profile_gap") {
      const p = f.params;
      return t(p.gap < 0 ? "pg.weaker" : "pg.stronger", { cls: clsName(f.key), gap: n(p.gap < 0 ? p.gap : p.gap), lo: sign(p.ciLow), hi: sign(p.ciHigh), grade: p.grade });
    }
    if (f.kind === "style_trait") {
      const p = f.params;
      return t(p.observed > p.expected ? "lv.trait.more" : "lv.trait.less", { what: t("st." + f.key), obs: F.pct(p.observed, 1), exp: F.pct(p.expected, 1) });
    }
    if (f.kind === "repertoire_leak") {
      const p = f.params;
      return t("rl.claim", { played: F.san(p.played, { cls: "bad" }), games: f.games, fav: F.san(p.favouritePlus400), best: F.san(p.best) });
    }
    return baseClaim(f);
  };

  /* ---------- an empty grid for the cover before any analysis ---------- */
  F.blankGrid = (k) => `<div class="grid10" role="img" aria-label="${t("sv.grid")}">${'<span class="cell s-q"></span>'.repeat(k)}</div>`;

  /* =============== Chapter N: against your opponents =============== */
  F.route(/^\/level$/, () => {
    const P = D.profile;
    const findingOf = (id) => M.findingById["profile:" + id];
    const row = (c) => {
      const f = findingOf(c.id);
      const name = f ? `<a class="link" href="${F.findingUrl(f)}">${esc(clsName(c.id))}</a>` : esc(clsName(c.id));
      const hot = c.grade === "A" || c.grade === "B";
      return `<tr class="${hot && c.gap < 0 ? "hot" : ""}"><td>${name}</td><td class="r num">${c.insufficient ? "–" : sign(c.gap)}</td><td class="r num faint">${c.ci95 ? `${sign(c.ci95[0])} · ${sign(c.ci95[1])}` : ""}</td><td class="r">${c.grade || "–"}</td><td class="r num faint">${n(c.decisions || 0)}</td></tr>`;
    };
    const table = (list) => `<table class="bk"><thead><tr><th>${t("lv.col.class")}</th><th class="r">${t("lv.col.gap")}</th><th class="r">${t("lv.col.ci")}</th><th class="r">${t("lv.col.grade")}</th><th class="r">${t("lv.col.n")}</th></tr></thead><tbody>${list.map(row).join("")}</tbody></table>`;
    if (!P) {
      return { html: `<div class="page"><p class="kicker">${t("lv.kicker")}</p><h1 class="title">${t("lv.title")}</h1><p class="lede">${t("lv.none", { reduced: D.level && D.level.mode === "reduced", min: 30, blitz: (D.sample.byTimeClass && D.sample.byTimeClass.blitz) || 0 })}</p></div>`, nav: "contents", ribbon: "level", where: t("lv.title"), title: t("lv.title") };
    }
    const o = P.overall;
    const traits = (P.style || []).filter((s) => s.trait);
    const rep = (D.repertoireFixes || []);
    const html = `<div class="spread"><div class="row"><div class="v">
      <p class="kicker">${t("chapter")}</p>
      <p class="chno" aria-hidden="true">N${F.icon("level", "chico")}</p>
      <h1 class="title">${t("lv.title")}</h1>
      <p class="lede">${t("lv.lede")}</p>
      ${o && o.ci95 ? `<p class="claim" style="margin-top:14px">${t("lv.overall", { gap: sign(o.gap), lo: sign(o.ci95[0]), hi: sign(o.ci95[1]) })}</p>` : ""}
      <div style="margin-top:20px">${table(P.classes)}</div>
      <p class="small muted" style="margin-top:8px">${t("lv.grade")}</p>
      <h2 class="h2" style="margin-top:30px">${t("lv.clock")}</h2>
      <div style="margin-top:10px">${table(P.clock.classes)}</div>
    </div><div class="r nostick">
      <h2 class="h2">${t("lv.style")}</h2><p class="small muted" style="margin:6px 0 10px">${t("lv.styleLede")}</p>
      ${traits.length ? `<ul class="toc">${traits.map((s) => { const f = M.findingById["style:" + s.attribute]; const txt = esc(t(s.observed > s.expected ? "lv.trait.more" : "lv.trait.less", { what: t("st." + s.attribute), obs: F.pct(s.observed, 1), exp: F.pct(s.expected, 1) })); return `<li class="sub"><div class="tl" style="padding-left:0"><span class="t">${f ? `<a class="link" href="${F.findingUrl(f)}">${txt}</a>` : txt}</span></div></li>`; }).join("")}</ul>` : `<p class="small faint">${t("lv.noStyle")}</p>`}
      ${rep.length ? `<h2 class="h2" style="margin-top:30px">${t("lv.repertoire")}</h2><p class="small muted" style="margin:6px 0 10px">${t("lv.repLede")}</p>
      <table class="bk"><thead><tr><th>${t("lv.col.pos")}</th><th>${t("lv.col.you")}</th><th>${t("lv.col.plus")}</th><th>${t("lv.col.engine")}</th><th class="r">${t("lv.col.games")}</th></tr></thead><tbody>${rep.map((x) => {
        const f = M.findingById["repertoire:" + x.fen.split(" ").slice(0, 4).join(" ") + "|" + (x.evidence[0] ? (M.err[x.evidence[0].gameId + "#" + x.evidence[0].ply] || D.positions[x.evidence[0].gameId + "#" + x.evidence[0].ply] || {}).played?.uci : "")];
        const ev = x.evidence[0];
        return `<tr class="${x.habitBelowLevel ? "hot" : ""}"><td>${ev ? `<a class="link" href="#/game/${encodeURIComponent(ev.gameId)}/${ev.ply}">${M.moveLabel(x.ply)}</a>` : M.moveLabel(x.ply)}</td><td>${f ? `<a class="link" href="${F.findingUrl(f)}">${F.san(x.played, { cls: "bad" })}</a>` : F.san(x.played, { cls: "bad" })}</td><td>${F.san(x.favouritePlus400)}</td><td>${F.san(x.engineBest)}</td><td class="r">${x.count}</td></tr>`;
      }).join("")}</tbody></table>` : ""}
    </div></div>
    ${(M.sections.profile || []).length ? `<div class="row full"><div class="v"><hr class="rule"><ul class="toc">${M.sections.profile.map((f) => `<li class="sub"><a class="tl" style="padding-left:0" href="${F.findingUrl(f)}"><span class="no">${M.sectionNo[f.id]}</span><span class="t">${F.findingTitle(f)}</span><span class="ld"></span><span class="v"></span></a></li>`).join("")}</ul></div></div>` : ""}
    </div>`;
    return { html, nav: "contents", ribbon: "level", where: `${t("chapter")} N · ${t("lv.title")}`, title: t("lv.title") };
  });

  /* =============== The real wait: the demo's sieve, fed by the analysis =============== */
  // Same markup and CSS as the demo (sieve.js): the grid fills with each game's win % curve once
  // Stockfish has read it, the counters and the feed move as games complete, and the galley
  // board shows the latest costly mistake. Everything comes from CernoApp.live (src/folio/host.ts).
  Object.assign(I.en, {
    "lvx.sf": (p) => `Stockfish 19 · ${p.w} workers`, "lvx.maiaCpu": "Maia-3 · processor",
    "lvx.grid": (p) => `Your ${p.n} games, one square each`,
    "lvx.whyWait": (p) => `${p.w} Stockfish workers take the games in order: a fast pass on every move, a deep one on the costly moves. Then Maia-3 looks at your mistakes. Each game is saved as soon as it is done.`,
    "lvx.done": (p) => (p.n ? `Sifted. <em>${["One", "Two", "Three", "Four", "Five"][p.n - 1] || p.n}</em> ${p.n === 1 ? "thing" : "things"} to train.` : "Sifted."),
  });
  Object.assign(I.es, {
    "lvx.sf": (p) => `Stockfish 19 · ${p.w} procesos`, "lvx.maiaCpu": "Maia-3 · procesador",
    "lvx.grid": (p) => `Tus ${p.n} partidas, un cuadro cada una`,
    "lvx.whyWait": (p) => `${p.w} procesos de Stockfish toman las partidas en orden: una pasada rápida en cada jugada y otra profunda en las caras. Después Maia-3 mira tus errores. Cada partida se guarda al terminar.`,
    "lvx.done": (p) => (p.n ? `Cribado. <em>${["Una", "Dos", "Tres", "Cuatro", "Cinco"][p.n - 1] || p.n}</em> ${p.n === 1 ? "cosa" : "cosas"} que entrenar.` : "Cribado."),
  });
  const fmt = (ms) => F.clockFmt(ms / 1000);
  const STG = ["dl", "sf", "maia", "pat", "ex"];
  const pathOf = (c) => {
    const N = c.length, step = Math.max(1, Math.floor(N / 48)), W = 40, H = 40, P = 3;
    if (N < 2) return "";
    let d = "";
    for (let i = 0; i < N; i += step) d += (d ? "L" : "M") + (P + (i / (N - 1)) * (W - 2 * P)).toFixed(1) + " " + (P + (1 - c[i] / 100) * (H - 2 * P)).toFixed(1);
    return d + "L" + (W - P) + " " + (P + (1 - c[N - 1] / 100) * (H - 2 * P)).toFixed(1);
  };
  // A finished error (study data) or a live move, as a position the pencil and caption helpers take.
  const posOf = (e, gameId) => {
    const ref = e.refutationUci || e.refutation;
    const after = CernoBoard.applyUci(e.fen, e.played.uci);
    const refSan = e.refutationUci ? e.refutation : ref && ref[0] ? [F.uciSan(after, ref[0])] : null;
    return {
      key: (gameId || e.gameId) + "#" + e.ply, ply: e.ply, fen: e.fen, orientation: e.color, judgement: e.judgement, played: e.played, best: e.best,
      solution: { uci: e.best ? [e.best.uci] : [], san: e.best ? [e.best.san] : [] },
      refutation: ref && ref[0] ? { uci: ref, san: refSan } : null,
    };
  };
  // What the feed has printed for a run survives leaving the page and coming back.
  let mem = null;
  F.route(/^\/analysing$/, () => {
    const app = window.CernoApp;
    const L0 = app && app.live;
    if (!L0 || L0.status === "idle") return { html: `<div class="page"><p class="lede">${t("lvx.idle")}</p><a class="btn" href="#/">${t("set.newRun")}</a></div>`, noDock: true, noRibbon: true, title: t("lvx.title") };
    if (!mem || mem.run !== L0.startedAt) mem = { run: L0.startedAt, lines: [], seen: new Set(), pats: new Set(), galley: null, galleyAt: 0, drawn: new Set(), final: false };
    const N = L0.max || 100;
    const ctr = (k) => `<div class="ctr" data-k="${k}"><b class="num">0</b><span>${t("sv.c." + k)}</span></div>`;
    const html = `<div class="sift"><div class="col col-l">
      <div class="w-a">
        <p class="kicker">${t("lvx.title")} · ${esc(L0.user || "")}</p>
        <h1 class="ts-lead" data-lead aria-live="polite"></h1>
        <p class="sub num"><b data-clk>0:00</b> <span data-eta></span></p>
        <div class="done-cta" hidden><a class="btn primary" href="#/contents" data-open>${t("lvx.open")} <span class="arr">→</span></a></div>
      </div>
      <div class="w-d"><ol class="stages">${STG.map((k) => `<li data-st="${k}"><span class="mk">○</span><span data-lb>${t("sv.s." + k)}</span><span class="ct num" data-ct></span></li>`).join("")}</ol>
        <div class="small faint leave">${t("lvx.leave")} <span data-why></span></div>
        <p class="small muted" data-nogpu hidden style="margin-top:8px">${t("lvx.noGpu")}</p>
        <div data-err></div></div>
      </div><div class="col col-c">
      <div class="w-b"><div class="grid-wrap pips-off">${F.blankGrid(N)}</div><div data-legend>${F.gridLegend(false)}</div></div>
      </div><div class="col col-r">
      <figure class="w-g galley"><div class="gl-board">${F.diagram({ p: { fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", orientation: "white", turn: "w" }, size: "small", caption: false, number: false, mode: "fen", draw: false, animMs: 0 })}</div>
        <figcaption><span class="gk">${t("ts.galley")}</span><span data-gcap>${t("sv.gwait")}</span></figcaption></figure>
      <div class="w-k counters">${["games", "moves", "judged", "mist", "pat", "train"].map(ctr).join("")}</div>
      <div class="w-f"><ul class="feed" aria-label="${t("sv.found")}"></ul></div>
      </div>
      <div class="ts-ctrl" role="group"><span style="flex:1"></span><button type="button" class="btn sm ghost" data-cancel>${t("lvx.cancel")}</button><span class="progressline" aria-hidden="true"></span></div>
    </div>`;
    return {
      html, noDock: true, noRibbon: true, noFooter: true, where: t("lvx.title"), title: t("lvx.title"),
      after(root) {
        const $ = (s) => root.querySelector(s);
        const rm = F.reduced();
        const desk = matchMedia("(min-width: 1000px)").matches;
        const b = F.boards[0];
        const gw = $(".grid-wrap"), feed = $(".feed"), gcap = $("[data-gcap]"), lead = $("[data-lead]");
        const C = {}; root.querySelectorAll(".ctr").forEach((c) => (C[c.dataset.k] = c.querySelector("b")));
        const st = {}; root.querySelectorAll("[data-st]").forEach((li) => (st[li.dataset.st] = li));
        let cells = null, drawT = 0, tick = 0;
        const animUntil = {};

        const stage = (k, cls, ct, label) => {
          const li = st[k];
          li.className = cls || "";
          li.querySelector(".mk").textContent = cls === "done" ? "✓" : cls === "run" ? "●" : cls === "skip" ? "–" : "○";
          li.querySelector("[data-ct]").textContent = ct == null ? "" : ct;
          if (label) li.querySelector("[data-lb]").textContent = label;
        };
        let lastLead = "";
        const setLead = (html) => { if (html === lastLead) return; const first = !lastLead; lastLead = html; lead.innerHTML = html; if (!first) F.swapIn(lead); };
        const paintLine = (x) => {
          const li = document.createElement("li"); li.className = x.cls || "";
          li.innerHTML = `<span class="gn">${x.no != null ? x.no : ""}</span><span>${x.html}</span>`;
          feed.prepend(li);
          while (feed.children.length > (desk ? 7 : 4)) feed.lastChild.remove();
        };
        const line = (html, cls, no) => { const x = { html, cls, no }; mem.lines.push(x); paintLine(x); };
        mem.lines.slice(-(desk ? 7 : 4)).forEach(paintLine);
        const showGalley = (p, no) => {
          b.setOrientation(p.orientation); b.setFen(p.fen); b.highlight({});
          b.pencil(F.pencilFor(p), { draw: !rm });
          gcap.innerHTML = `<b class="num">${no}</b> · ${F.capLine(p)}`;
          F.swapIn(gcap);
        };
        if (mem.galley) { const g = mem.galley; b.setOrientation(g.p.orientation); b.setFen(g.p.fen); b.pencil(F.pencilFor(g.p), { draw: false }); gcap.innerHTML = `<b class="num">${g.no}</b> · ${F.capLine(g.p)}`; }
        const mv = (m) => F.mvn(m.ply, m.played.san, { cls: "bad", glyph: M.glyph(m.judgement) });
        const counts = { fork: 0, hang: 0 };
        const noteHtml = (nt) => {
          if (!nt) return null;
          if (nt.kind === "fork") return t("sv.n.fork", { mv: mv(nt.move), k: ++counts.fork });
          if (nt.kind === "hang") return t("sv.n.hang", { mv: mv(nt.move), k: ++counts.hang });
          if (nt.kind === "mate") return t("sv.n.mate", { mv: mv(nt.move) });
          if (nt.kind === "lwtl") return t("sv.n.lwtl", { c: F.clockFmt(nt.clock) });
          if (nt.kind === "worst") return t("sv.n.worst", { mv: mv(nt.move), l: n(nt.move.loss, 0) });
          return t("sv.n.clean");
        };

        const buildGrid = (ids, byId) => {
          gw.innerHTML = `<div class="grid10" role="img" aria-label="${t("lvx.grid", { n: ids.length })}">${ids.map((id) => `<span class="cell s-q r-${byId[id].result}" data-id="${esc(id)}"><svg viewBox="0 0 40 40" preserveAspectRatio="none" aria-hidden="true"><line x1="0" x2="40" y1="20" y2="20" class="mid"/><path pathLength="1"/></svg><span class="pips"></span></span>`).join("")}</div>`;
          cells = {}; gw.querySelectorAll(".cell").forEach((c) => (cells[c.dataset.id] = c));
        };

        const draw = () => {
          const L = app.live, now = performance.now();
          const S = (k) => L.stages[k] || { state: "wait", done: 0, total: 0 };
          const G = L.games || N;
          const ids = L.grid;
          if (ids && !cells) buildGrid(ids, L.byId);
          const why = $("[data-why]");
          if (L.workers && !why.firstChild) why.innerHTML = F.why("lvx.whyWait", { w: L.workers });
          // ---- grid: the next games Stockfish takes are marked; a curve draws itself in red, then settles in ink
          let soonest = Infinity;
          if (cells) {
            const working = new Set();
            if (S("pass1").state === "run") for (const id of ids.slice().reverse()) { if (working.size >= (L.workers || 4)) break; if (L.byId[id].state === "q") working.add(id); }
            for (const id of ids) {
              const g = L.byId[id], c = cells[id];
              let s = "s-q";
              if (g.state === "q") s = working.has(id) ? "s-a" : "s-q";
              else {
                if (!mem.drawn.has(id)) {
                  mem.drawn.add(id);
                  c.querySelector("path").setAttribute("d", pathOf(g.curve || []));
                  if (!rm && L.status === "running") { animUntil[id] = now + 1150; c.classList.remove("s-a"); void c.offsetWidth; }
                }
                s = animUntil[id] > now ? "s-a" : "s-d";
                if (animUntil[id] > now) soonest = Math.min(soonest, animUntil[id] - now);
              }
              const cls = `cell r-${g.result} ${s}${c.classList.contains("mx") ? " mx" : ""}`;
              if (c.className !== cls) c.className = cls;
            }
          }
          if (soonest < Infinity) { clearTimeout(drawT); drawT = setTimeout(draw, soonest + 20); }

          // ---- counters and feed, from the games that are complete
          const tot = { games: 0, moves: 0, judged: 0, mist: 0, pat: (L.findings || []).length, train: L.final ? L.final.recommendations.length : 0 };
          let newest = null;
          for (const id of (ids || []).slice().reverse()) {
            const g = L.byId[id];
            if (g.state !== "d") continue;
            tot.games++; tot.moves += g.playerMoves || 0; tot.judged += g.judged || 0; tot.mist += g.mistakes || 0;
            if (!mem.seen.has(id)) {
              mem.seen.add(id);
              const h = noteHtml(g.note); if (h) line(h, "", g.no);
              if (g.worst) newest = g;
            }
          }
          if (L.status === "running") for (const f of L.findings || []) {
            if (mem.pats.has(f.id)) continue;
            mem.pats.add(f.id);
            line(t("sv.n.pat", { f: F.findingTitle(f), o: f.occurrences, g: f.games }), "pat");
          }
          if (newest && now - mem.galleyAt > 1100) { const p = posOf(newest.worst, newest.id); mem.galley = { p, no: newest.no }; mem.galleyAt = now; showGalley(p, newest.no); }
          Object.keys(C).forEach((k) => { C[k].textContent = n(tot[k]); C[k].parentElement.classList.toggle("live", tot[k] > 0); });

          // ---- stages, in the demo's five
          const fe = S("fetch"), p1 = S("pass1"), p2 = S("pass2"), mx = ["maia", "cand", "ladder"].map(S), mo = S("model"), bk = S("book");
          const curves = ids ? ids.filter((id) => L.byId[id].state !== "q").length : 0;
          stage("dl", fe.state === "done" ? "done" : "run", L.games ? `${L.games}/${L.games}` : "");
          stage("sf", p2.state === "done" ? "done" : p1.state === "run" || p2.state === "run" ? "run" : "", `${curves}/${G}`, t("lvx.sf", { w: L.workers || "–" }));
          const maiaOff = mx.every((x) => x.state === "skip");
          const mRun = mx.find((x) => x.state === "run");
          const mDone = !mRun && mx.some((x) => x.state === "done") && !mx.some((x) => x.state === "wait");
          stage("maia", maiaOff ? "skip" : mRun ? "run" : mDone ? "done" : "",
            maiaOff ? "–" : mRun ? `${n(mRun.done)}/${n(mRun.total)}` : mo.state === "run" && mo.total ? Math.round((100 * mo.done) / mo.total) + " %" : "",
            maiaOff ? t("sv.s.maiaOff") : L.backend === "wasm" ? t("lvx.maiaCpu") : t("sv.s.maia"));
          stage("pat", bk.state === "done" ? "done" : bk.state === "run" ? "run" : "", String(tot.pat));
          stage("ex", L.final ? "done" : "", L.final ? String(L.final.exercises) : "–");
          $("[data-nogpu]").hidden = L.backend !== "wasm";

          // ---- lead, clock, progress
          const elapsed = (L.endedAt || Date.now()) - L.startedAt;
          $("[data-clk]").textContent = fmt(elapsed);
          const p = Math.min(1, L.progress || 0);
          $("[data-eta]").textContent = L.status === "done" ? t("sv.cached") : L.status === "running" && p > 0.04 ? t("sv.eta", { t: fmt((elapsed * (1 - p)) / p) }) : "";
          $(".progressline").style.transform = `scaleX(${L.status === "done" ? 1 : p})`;
          if (L.status === "error") setLead(t("lvx.lead.error"));
          else if (L.status === "done") setLead(t("lvx.done", { n: L.final ? L.final.recommendations.length : 0 }));
          else if (bk.state === "run") setLead(t("sv.t.pat"));
          else if (mRun) setLead(t("sv.t.maia"));
          else if (fe.state === "done") setLead(t("sv.t.sf", { n: G }));
          else setLead(t("sv.t.dl", { n: N }));

          if (L.status === "error") {
            $("[data-err]").innerHTML = `<div class="formerr" role="alert"><p class="et">${t("err.run.t")}</p><p>${esc(L.error || "")}</p><div class="btnrow" style="margin-top:10px"><a class="btn sm" href="#/">${t("set.newRun")}</a></div></div>`;
            $("[data-cancel]").hidden = true;
          }
          if (L.status === "done" && L.final) finish(L, maiaOff);
        };

        // ---- last frame: level marks under each square, the costliest mistake below your level, what to train
        const finish = (L, maiaOff) => {
          $(".done-cta").hidden = false; $("[data-cancel]").hidden = true;
          C.train.parentElement.classList.add("fin");
          if (maiaOff) $("[data-legend]").innerHTML = F.gridLegend(true);
          const errs = L.final.errors.filter((e) => e.judgement !== "inaccuracy");
          if (cells && !maiaOff) {
            const byGame = {};
            errs.filter((e) => e.peer && (e.peer.level === "below_level" || e.peer.level === "hard")).forEach((e) => (byGame[e.gameId] = byGame[e.gameId] || []).push(e));
            for (const [id, es2] of Object.entries(byGame)) if (cells[id]) cells[id].querySelector(".pips").innerHTML = es2.sort((a, c) => a.ply - c.ply).slice(0, 5).map((e) => `<i class="pip ${e.peer.level === "below_level" ? "pip-s" : "pip-h"}"></i>`).join("");
            gw.classList.remove("pips-off"); Object.values(cells).forEach((c) => c.classList.add("mx"));
          }
          if (mem.final) return;
          mem.final = true;
          const front = errs.filter((e) => e.peer && e.peer.level === "below_level").sort((a, c) => c.loss - a.loss)[0] || errs.slice().sort((a, c) => c.loss - a.loss)[0];
          if (front) { const p = posOf(front); const no = (L.byId[front.gameId] || {}).no; mem.galley = { p, no }; showGalley(p, no); }
          if (maiaOff) line(t("sv.n.noMaia"), "pat");
          const fById = {}; L.final.findings.forEach((f) => (fById[f.id] = f));
          L.final.recommendations.slice().reverse().forEach((r) => {
            const f = fById[r.findingId]; if (!f) return;
            line(t("sv.n.rec", { r: ["i", "ii", "iii", "iv", "v"][r.rank - 1] || r.rank, f: (I.recTitle[F.state.lang] || {})[f.key] || F.findingTitle(f) }), "pat");
          });
        };

        const off = app.onChange(() => { cancelAnimationFrame(tick); tick = requestAnimationFrame(draw); });
        const clock = setInterval(draw, 1000);
        draw();
        $("[data-cancel]").addEventListener("click", () => app.cancel());
        $("[data-open]").addEventListener("click", (e) => { e.preventDefault(); app.openStudy(); });
        F.onLeave(() => { off(); clearInterval(clock); clearTimeout(drawT); cancelAnimationFrame(tick); });
      },
    };
  });
})();
