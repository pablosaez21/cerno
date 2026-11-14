/* Cerno-Folio screens (except the typesetting and the exercises, see typeset.js and train.js). */
(function () {
  const F = window.F, M = F.M, D = M.D, I = window.FOLIO_I18N;
  const t = F.t, n = F.n, esc = F.esc;
  const es = () => F.state.lang === "es";
  const roman = ["i", "ii", "iii", "iv", "v"];
  const findingUrl = (f) => "#/finding/" + encodeURIComponent(f.id);
  F.findingUrl = findingUrl;
  const pp = (x) => n(x, 1); // win% points

  /* ---------- prose rules for a finding ---------- */
  F.claim = (f) => {
    const P = I.prose[F.state.lang];
    const p = { occ: f.occurrences, games: f.games, n: M.N, impact: pp(f.impact), pct: F.pct(f.winLoss / M.totalWinLoss), fork: f.params.fork || 0, brm: f.params.back_rank_mate || 0 };
    if (f.kind === "strategy_errors") return P.middlegame_no_tactic({ ...p, level: f.params.whenLevel, ahead: f.params.whenAhead, behind: f.params.whenBehind });
    if (f.kind === "endgame_type") return P.endgame_type({ ...p, type: F.lbl("eg." + f.key).toLowerCase() });
    if (f.kind === "opening_line") {
      const o = M.openingByKey[f.params.family + ":" + f.params.color];
      return P.opening_line({ ...p, family: f.params.family, color: F.t(f.params.color === "white" ? "asWhite" : "asBlack"), score: F.pct(f.params.score), rec: t("record", o.rec), after: F.pctv(f.params.avgWinAfterOpening, 1), weakExit: f.params.weakExit });
    }
    if (f.kind === "repeated_mistake") return P.repeated_mistake({ ...p, played: F.san(f.params.played, { cls: "bad" }), best: F.san(f.params.best) });
    if (f.key === "lost_with_time_left") return P.lost_with_time_left({ ...p, losses: D.sample.results.loss });
    const fn = P[f.key];
    return fn ? fn(p) : F.findingDesc(f);
  };
  F.findingDesc = (f) => window.CERNO_LABELS.findingDesc(F.state.lang, f);
  const areaLabel = (a) => (a === "clock" ? t("interlude") + " · " + t("clk.title") : a === "profile" || a === "style" ? t("chapter") + " N · " + t("lv.title") : t("chapter") + " " + M.chapterNo[a] + " · " + F.catName(a));
  const areaUrl = (a) => (a === "clock" ? "#/clock" : a === "profile" || a === "style" ? "#/level" : "#/chapter/" + a);
  F.areaUrl = areaUrl;
  const exStatus = (id) => F.store.get("ex." + id, null);

  /* =============== Cover / entry =============== */
  F.route(/^\/?$/, () => cover());
  F.route(/^\/cover\/?(error|down)?$/, (e) => cover(e));
  function cover(err) {
    const last = F.store.get("lastInput", null);
    const st = F.coverState || (F.coverState = { src: (last && last.src) || "chesscom", user: (last && last.user) || M.user, n: (last && last.n) || 100, tc: (last && last.tc) || { bullet: false, blitz: true, rapid: true, daily: false }, err: null, msg: "" });
    if (err === "error") st.err = "notfound";
    if (err === "down") st.err = "down";
    const srcBtn = (k, label) => `<button type="button" data-src="${k}" aria-pressed="${st.src === k}" class="${st.src === k && F._srcChanged ? "draw" : ""}">${label}${st.src === k ? F.ringSvg(k.length) : ""}</button>`;
    const srcName = { chesscom: "Chess.com", lichess: "Lichess", pgn: "PGN" }[st.src];
    const errHtml = st.err === "notfound"
      ? `<div class="formerr" role="alert"><p class="et">${t("err.notfound.t", { user: esc(st.user), src: srcName })}</p><p>${t("err.notfound.b")}</p></div>`
      : st.err === "run"
        ? `<div class="formerr" role="alert"><p class="et">${t("err.run.t")}</p><p>${esc(st.msg)}</p></div>`
      : st.err === "down"
        ? `<div class="formerr" role="alert"><p class="et">${t("err.down.t")}</p><p>${t("err.down.b")}</p><div class="btnrow" style="margin-top:10px"><button class="btn sm" data-retry>${t("err.retry")}</button><button class="btn sm ghost" data-src="pgn">${t("err.usePgn")}</button></div></div>`
        : "";
    const html = `<div class="cover">
      <div class="cover-tools">${F.langSwitch()}${F.themeBtn()}</div>
      <div>
        <h1 class="wm-big">Cerno</h1>
        <hr class="rule2">
        <form class="madlib" id="coverForm" autocomplete="off" novalidate>
          ${t("cover.title.a")} <span class="fld pick" data-pick><span class="vh" id="cnl">${t("cover.games")}</span><button type="button" class="pick-b" id="cn" aria-haspopup="listbox" aria-expanded="false" aria-controls="cnlist" aria-labelledby="cnl cn"><span class="pick-v">${st.n}</span><svg viewBox="0 0 10 6" aria-hidden="true"><path d="M1 1l4 4 4-4"/></svg></button><input type="hidden" name="n" value="${st.n}"><ul class="pick-l" role="listbox" id="cnlist" aria-labelledby="cnl" tabindex="-1">${[25, 50, 100, 200].map((v) => `<li role="option" id="cn-${v}" data-v="${v}" aria-selected="${v === st.n}"><span class="ring">${v}${v === st.n ? F.ringSvg(v) : ""}</span></li>`).join("")}</ul></span>
          ${t("cover.title.b")} <span class="fld"><label class="vh" for="cu">${t("cover.user.ph")}</label><input id="cu" name="user" type="text" value="${esc(st.user)}" placeholder="${t("cover.user.ph")}" spellcheck="false" autocapitalize="off"></span>
          ${t("cover.title.c")} <span class="paren" role="group" aria-label="Source">${srcBtn("chesscom", "Chess.com")}${srcBtn("lichess", "Lichess")}${srcBtn("pgn", "PGN")}</span>
          ${st.src === "pgn" ? `<label class="small muted" for="pgn" style="display:block;margin-top:8px;font-style:normal">${t("cover.pgn.label")}</label><textarea id="pgn" class="pgn-area" placeholder="${esc(t("cover.pgn.ph"))}"></textarea>` : `
          <fieldset class="tcs" style="border:0;padding:0;margin:8px 0 0"><legend class="vh">${t("cover.tc")}</legend>
            ${["bullet", "blitz", "rapid", "daily"].map((k) => `<label><input type="checkbox" name="tc" value="${k}" ${st.tc[k] ? "checked" : ""}>${t("cover.tc." + k)}</label>`).join("")}
          </fieldset>`}
          <div style="margin-top:22px" class="btnrow"><button class="btn primary" type="submit">${t("cover.go")} <span class="arr">→</span></button></div>
        </form>
        ${errHtml}
        <p class="assure">${t("cover.time")} ${t("cover.local")}</p>
        ${M.empty ? "" : `<p class="assure"><a class="link" href="#/contents">${t("cover.open", { user: esc(M.user), n: M.N, date: D.sample.to ? F.date(D.sample.to) : "" })}</a></p>`}
      </div>
      <div class="cover-r">
        <p class="defn">${es() ? "<b>cernō</b>: cribar, distinguir." : "<b>cernō</b>: to sift, to discern."}</p>
        <figure class="fig cover-grid">${M.empty ? F.blankGrid(100) : F.gameGrid({ state: () => "q", pips: false })}<figcaption>${t("cover.sieve")}</figcaption></figure>
      </div>
    </div>`;
    return {
      html, noDock: true, noRibbon: true, noHead: true, hideWm: true, title: "Cerno", where: "",
      after(root) {
        const form = root.querySelector("#coverForm");
        root.querySelectorAll("[data-src]").forEach((b) => b.addEventListener("click", () => { F._srcChanged = !F.reduced(); st.src = b.dataset.src; st.err = null; F._keepScroll = true; F.render(); }));
        F.picker(root.querySelector("[data-pick]"), (v) => { st.n = v; });
        form.addEventListener("input", () => { st.user = form.user ? form.user.value : st.user; form.querySelectorAll("[name=tc]").forEach((c) => (st.tc[c.value] = c.checked)); });
        const retry = root.querySelector("[data-retry]");
        retry && retry.addEventListener("click", () => { st.err = null; F._keepScroll = true; F.render(); });
        form.addEventListener("submit", (e) => {
          e.preventDefault();
          const u = (form.user ? form.user.value : "").trim();
          const pgn = form.querySelector("#pgn");
          if (!u) { st.err = "notfound"; st.user = u; F._keepScroll = true; F.render(); return; }
          if (st.src === "pgn" && !(pgn && pgn.value.trim())) { st.err = "run"; st.msg = t("err.noPgn"); F._keepScroll = true; F.render(); return; }
          st.err = null; st.user = u;
          F.store.set("lastInput", { src: st.src, user: u, n: st.n, tc: st.tc });
          const tcs = Object.keys(st.tc).filter((k) => st.tc[k]);
          window.CernoApp.start({ src: st.src, user: u, n: st.n, timeClasses: tcs, pgn: pgn ? pgn.value : "" });
          F.go("#/analysing");
        });
      },
    };
  }

  /* =============== Second edition (returning visit, simulated) =============== */
  F.route(/^\/cover\/second$/, () => {
    const html = `<div class="cover"><div class="cover-tools">${F.langSwitch()}${F.themeBtn()}</div><div>
      <p class="kicker"><span class="red">${t("ed2.kicker")}</span></p>
      <h1 class="wm-big">Cerno</h1>
      <hr class="rule2">
      <p class="madlib" style="font-size:inherit">${t("brand.sub", { n: M.N, user: `<i>${M.user}</i>` })}</p>
      <div class="ed-sheet"><span class="demo-tag stamp" style="position:absolute;top:-10px;right:12px;background:var(--paper)">${t("demoTag")}</span>
        <h2 class="h2">${t("ed2.title", { n: 12, date: F.date(D.sample.to, { day: "numeric", month: "long" }) })}</h2>
        <p class="prose" style="margin-top:10px">${t("ed2.body", { old: M.N, total: M.N })}</p>
        <div class="btnrow" style="margin-top:18px"><a class="btn primary" href="#/typesetting/second">${t("ed2.go")} <span class="arr">→</span></a></div>
        <p class="small muted" style="margin-top:10px">${t("ed2.est")} <a class="link" href="#/typesetting">${t("ed2.full", { total: M.N })}</a></p>
      </div>
      <div class="ed-sheet old"><p class="kicker">${t("ed2.first")}</p>
        <p class="small" style="margin-top:4px">${M.N} ${t("cover.games")} · ${F.date(D.sample.from)} – ${F.date(D.sample.to)} · ${D.findings.length} ${es() ? "hallazgos" : "findings"} · ${Object.values(D.exercises).flat().length} ${t("exercises").toLowerCase()}</p>
        <a class="more" href="#/contents">${t("nav.contents")}</a></div>
      <p class="small faint" style="margin-top:16px">${t("ed2.demo")}</p>
    </div><div class="cover-r"><blockquote style="margin:34px 0 0;font:italic 400 21px/1.4 var(--serif);color:var(--ink-2)">${es() ? "Solo se leen las partidas nuevas. Lo demás ya está en tu estantería." : "Only the new games are read. The rest is already on your shelf."}</blockquote></div></div>`;
    return { html, noDock: true, noRibbon: true, noHead: true, title: t("ed2.kicker") };
  });

  /* =============== Contents (overview) =============== */
  F.route(/^\/contents$/, () => {
    const top = D.findings[0];
    const tact = M.chapters[0] || { area: "tactics", winLossShare: 0 };
    const fp = M.frontispiece;
    const tcLine = t("tc.line", D.sample.byTimeClass);
    const rec = D.sample.results;
    const maxShare = tact.winLossShare || 1;
    const subs = (area) => (M.sections[area] || []).filter((f) => f.kind !== "repeated_mistake");
    const repeated = (M.sections.openings || []).filter((f) => f.kind === "repeated_mistake");
    const subLine = (f) => `<li class="sub"><a class="tl" href="${findingUrl(f)}"><span class="no">${M.sectionNo[f.id]}</span><span class="t">${F.findingTitle(f)}</span><span class="ld"></span><span class="v">${pp(f.impact)}</span></a></li>`;
    const exLine = (c) => { const k = (M.exSets[c.area] || []).length; return k ? `<li class="sub ex"><a class="tl" href="#/exercises/${c.area}/1"><span class="no"></span><span class="t">${t("toc.exercises", { a: c.no + ".1", b: c.no + "." + k })}</span><span class="ld"></span><span class="v">${exProgress(c.area)}</span></a></li>` : ""; };
    const chLine = (c) => `<li class="ch"><a class="tl" href="#/chapter/${c.area}"><span class="no">${c.no}</span><span class="t">${F.catName(c.area)}</span><span class="ld"></span><span class="v">${F.pct(c.winLossShare, 1)}</span></a>
      <div class="mag ${c.no === 1 ? "red" : ""}" style="width:calc((100% - 1.75em) * ${(c.winLossShare / maxShare).toFixed(3)})" aria-hidden="true"></div>
      <ul class="toc">${subs(c.area).map(subLine).join("")}${c.area === "openings" && repeated.length ? `<li class="sub"><a class="tl" href="#/chapter/openings#repeated"><span class="no"></span><span class="t">${t("ch.repeated")} <span class="faint">(${repeated.length})</span></span><span class="ld"></span><span class="v">${pp(repeated.reduce((s, f) => s + f.impact, 0))}</span></a></li>` : ""}${exLine(c)}</ul></li>`;
    const toc = `<div class="colhead"><span></span><span>${t("toc.colShare")} · ${t("toc.colImpact")}</span></div>
      <ul class="toc">
        <li class="ch"><a class="tl" href="#/preface"><span class="no"></span><span class="t">${t("toc.preface")}</span><span class="ld"></span><span class="v">3</span></a></li>
        ${M.chapters.map(chLine).join("")}
        ${M.sections.profile ? `<li class="ch"><a class="tl" href="#/level"><span class="no">N</span><span class="t">${t("lv.title")}</span><span class="ld"></span><span class="v"></span></a><ul class="toc">${M.sections.profile.map(subLine).join("")}</ul></li>` : ""}
        <li class="ch"><a class="tl" href="#/clock"><span class="no">I</span><span class="t">${t("interlude")}: ${t("clk.title").toLowerCase()}</span><span class="ld"></span><span class="v"></span></a>
          <ul class="toc">${(M.sections.clock || []).map(subLine).join("")}</ul></li>
        <li class="ch"><a class="tl" href="#/appendix"><span class="no">A</span><span class="t">${t("toc.appA", { n: M.N })}</span><span class="ld"></span><span class="v">${t("record", { w: rec.win, d: rec.draw, l: rec.loss })}</span></a></li>
        <li class="ch"><a class="tl" href="#/method"><span class="no">B</span><span class="t">${t("toc.appB")}</span><span class="ld"></span><span class="v"></span></a></li>
      </ul>`;
    const pref = `<p class="kicker">${t("toc.preface")}</p><ol class="pref">${D.recommendations.map((r) => {
      const f = M.findingById[r.findingId];
      return `<li><span class="rn">${roman[r.rank - 1]}.</span><a href="#/preface#rec${r.rank}"><span class="pt">${I.recTitle[F.state.lang][f.key] || F.findingTitle(f)}</span><span class="pr">${t("pre.because")} ${F.findingTitle(f).toLowerCase()}: ${r.reason.occurrences} ${t("f.numbers.times")} · ${r.reason.games} ${t("f.numbers.games")}</span></a></li>`;
    }).join("")}</ol>`;
    const html = `<div class="spread">
      <div class="row"><div class="v">
        <p class="kicker">${t("toc.title")}</p>
        <h1 class="title">${t("brand.sub", { n: M.N, user: `<em>${M.user}</em>` })}</h1>
        <p class="meta">${t("toc.meta", { n: M.N, from: F.date(D.sample.from), to: F.date(D.sample.to), tc: tcLine })} · <span class="num">${t("record", { w: rec.win, d: rec.draw, l: rec.loss })}</span></p>
        <p class="verdict">${t("toc.verdict", { share: F.pct(tact.winLossShare, 1) })}</p>
        <div class="btnrow" style="margin-top:22px"><a class="btn primary" href="#/exercises/${tact.area}/1">${t("toc.start")} <span class="arr">→</span></a><a class="btn ghost" href="#/preface">${t("nav.preface")}</a></div>
        <div style="margin-top:30px">${F.sieveFigure(1)}</div>
      </div><div class="r">
        ${fp ? F.diagram({ p: fp, label: t("toc.frontispiece"), tap: (b, el) => F.flyTo(trainHrefFor(fp), el) }) : ""}
        ${fp ? `<div style="margin-top:14px">${F.levelNote(fp)}</div>` : ""}
      </div></div>
      <div class="row"><div class="v">${pref}<h2 class="h2" style="margin:34px 0 14px">${t("toc.title")}</h2>${toc}</div>
        <div class="r">${fp ? F.maiaFigure(fp, { dno: es() ? "el frontispicio" : "the frontispiece", fno: 2 }) : ""}</div></div>
    </div>`;
    return { html, nav: "contents", ribbon: "contents", where: t("toc.title"), title: t("toc.title") };
  });
  function exProgress(area) {
    const set = M.exSets[area] || [];
    const done = set.filter((x) => exStatus(x.id)).length;
    return done ? `${done}/${set.length}` : `${set.length}`;
  }
  // Where "train this position" goes: its chapter exercise if one exists, else a one-off position trainer.
  function trainHrefFor(p) {
    for (const c of M.chapters) {
      const i = (M.exSets[c.area] || []).findIndex((x) => x.gameId === p.gameId && x.ply === p.ply);
      if (i >= 0) return `#/exercises/${c.area}/${i + 1}`;
    }
    return `#/position/${encodeURIComponent(p.gameId + "#" + p.ply)}`;
  }
  F.trainHrefFor = trainHrefFor;

  /* =============== Preface: recommendations =============== */
  F.route(/^\/preface(?:#\w+)?$/, () => {
    const rows = D.recommendations.map((r) => {
      const f = M.findingById[r.findingId];
      const set = M.recSets[r.rank - 1];
      const s = M.split(r.reason.level, r.reason.occurrences);
      const p0 = set[0];
      return `<div class="row" id="rec${r.rank}"><div class="v">
        <p class="chno" style="font-size:54px;color:var(--red)">${roman[r.rank - 1]}.</p>
        <h2 class="title" style="font-size:32px;margin-top:4px">${I.recTitle[F.state.lang][f.key] || F.findingTitle(f)}</h2>
        <p class="kicker" style="margin-top:20px">${t("pre.because")}</p>
        <p class="claim"><a class="link" href="${findingUrl(f)}">${F.findingTitle(f)}</a>. ${t("pre.reason", { occ: r.reason.occurrences, games: r.reason.games, n: r.reason.gamesAnalysed, impact: pp(r.reason.impact), below: r.reason.level.belowLevel, inScope: r.reason.level.inScope })}.</p>
        ${F.splitBar(s)}
        <p class="kicker" style="margin-top:24px">${t("pre.train")}</p>
        <ol class="pref" style="margin-top:2px">${r.prescription.methods.map((m, i) => `<li><span class="rn">${i + 1}</span><span class="pt" style="font-size:17.5px">${F.lbl("method." + m)}</span></li>`).join("")}</ol>
        <p class="kicker" style="margin-top:20px">${t("pre.positions", { n: set.length })}</p>
        <div class="strip">${set.slice(0, 6).map((p, i) => `<a href="#/train/${r.rank}/${i + 1}">${F.diagram({ p, size: "small", caption: false, number: false })}<p class="cap"><b>${p.no}</b> ${F.mvn(p.ply, p.played.san, { cls: "bad", glyph: M.glyph(p.judgement) })}</p></a>`).join("")}</div>
        <div class="btnrow" style="margin-top:20px"><a class="btn primary" href="#/train/${r.rank}/1">${t("pre.go", { n: set.length })} <span class="arr">→</span></a></div>
      </div><div class="r desk-only">${F.diagram({ p: p0, tools: F.diaTools(p0) })}</div></div>`;
    }).join("");
    const html = `<div class="spread"><div class="row"><div class="v"><p class="kicker">${t("nav.preface")}</p><h1 class="title">${es() ? "Qué trabajar" : "What to work on"}</h1><p class="lede">${t("pre.lede")}</p></div><div class="r"></div></div>${rows}</div>`;
    return {
      html, nav: "contents", ribbon: "preface", where: t("nav.preface"), title: t("pre.title"),
      after(root) {
        Object.entries(F.pending).forEach(([id, o]) => { if (o.tools) F.wireDiaTools(root, id, o.p); });
        const m = location.hash.match(/#(rec\d)$/); if (m) setTimeout(() => document.getElementById(m[1])?.scrollIntoView(), 30);
      },
    };
  });

  /* =============== Chapter =============== */
  F.route(/^\/chapter\/(tactics|strategy|openings|endgames)(?:#\w+)?$/, (area) => chapter(area));
  function chapter(area) {
    const c = M.chapters.find((x) => x.area === area);
    const secs = M.sections[area] || [];
    const main = secs.filter((f) => f.kind !== "repeated_mistake");
    const repeated = secs.filter((f) => f.kind === "repeated_mistake");
    const total = c.counts.inaccuracy + c.counts.mistake + c.counts.blunder;
    const lede = t("ch.lede", { share: F.pct(c.winLossShare, 1), total, b: c.counts.blunder, m: c.counts.mistake, i: c.counts.inaccuracy, per100: n(c.errorsPer100, 1) }) + (c.decidedGames ? t("ch.decided", { cat: t("cat." + area + ".lc"), d: c.decidedGames }) : "");
    const s = M.split(c.level, total);
    const first = main[0] ? M.evidence(main[0])[0] : null;
    const notes = area === "strategy" ? `<aside class="note" style="margin-top:20px"><span class="nt">${es() ? "Una advertencia" : "A caution"}</span>${t("ch.strategyNote")}</aside>`
      : area === "endgames" ? `<aside class="note out" style="margin-top:20px"><span class="nt">${es() ? "Muestra pequeña" : "Small sample"}</span>${t("ch.endgameNote", { n: c.level.inScope })}</aside>` : "";
    let html = `<div class="spread"><div class="row"><div class="v">
      <p class="kicker">${t("chapter")}</p>
      <p class="chno" aria-hidden="true">${c.no}</p>
      <h1 class="title">${F.catName(area)}</h1>
      <p class="lede">${lede}</p>
      <p class="kicker" style="margin-top:26px">${t("ch.maia")}</p>
      ${F.splitBar(s)}
      ${notes}
      <p class="kicker" style="margin-top:26px">${t("ch.sections")}</p>
      <ul class="toc">${main.map((f) => `<li class="sub"><a class="tl" style="padding-left:0" href="#s-${M.sectionNo[f.id]}" data-jump="s-${M.sectionNo[f.id]}"><span class="no">${M.sectionNo[f.id]}</span><span class="t">${F.findingTitle(f)}</span><span class="ld"></span><span class="v">${pp(f.impact)}</span></a></li>`).join("")}
      ${(M.exSets[area] || []).length ? `<li class="sub ex"><a class="tl" style="padding-left:0" href="#/exercises/${area}/1"><span class="no"></span><span class="t">${t("toc.exercises", { a: c.no + ".1", b: c.no + "." + M.exSets[area].length })}</span><span class="ld"></span><span class="v">${exProgress(area)}</span></a></li>` : ""}</ul>
    </div><div class="r">${first ? F.diagram({ p: first, tools: F.diaTools(first) }) : ""}</div></div>`;
    if (area === "openings") html += repertoireRow();
    html += main.map((f, i) => sectionRow(f, i === 0 ? M.evidence(f)[1] : null)).join("");
    if (repeated.length) {
      html += `<div class="row full" id="repeated"><div class="v"><h2 class="h2">${t("ch.repeated")}</h2><p class="prose muted" style="margin-top:8px;max-width:40em">${t("ch.repeatedLede")}</p>
        <div class="strip" style="margin-top:20px">${repeated.map((f) => { const p = M.evidence(f)[0]; return `<a href="${findingUrl(f)}">${F.diagram({ p, size: "small", caption: false, number: false })}<p class="cap"><b>§${M.sectionNo[f.id]}</b> ${F.san(f.params.played, { cls: "bad", glyph: "?" })} ×${f.games} · ${es() ? "mejor" : "better"} ${F.san(f.params.best)}</p></a>`; }).join("")}</div></div></div>`;
    }
    html += exercisesRow(area, c);
    const idx = M.chapters.indexOf(c), prev = M.chapters[idx - 1], next = M.chapters[idx + 1];
    html += `<div class="row full"><div class="v"><hr class="rule"><div style="display:flex;justify-content:space-between;gap:12px">${prev ? `<a class="more" href="#/chapter/${prev.area}" style="flex-direction:row-reverse">← ${prev.no} ${F.catName(prev.area)}</a>` : `<a class="more" href="#/contents">${t("toc.title")}</a>`}${next ? `<a class="more" href="#/chapter/${next.area}">${next.no} ${F.catName(next.area)}</a>` : `<a class="more" href="#/clock">${t("interlude")}: ${t("clk.title").toLowerCase()}</a>`}</div></div></div></div>`;
    return {
      html, nav: "contents", ribbon: "ch:" + area, where: `${t("chapter")} ${c.no} · ${F.catName(area)}`, title: F.catName(area),
      after(root) {
        Object.entries(F.pending).forEach(([id, o]) => { if (o.tools) F.wireDiaTools(root, id, o.p); });
        root.querySelectorAll("[data-jump]").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); document.getElementById(a.dataset.jump).scrollIntoView({ behavior: F.reduced() ? "auto" : "smooth" }); }));
        root.querySelectorAll("[data-fly]").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); F.flyTo(a.getAttribute("href"), a.querySelector(".dia-board")); }));
        if (location.hash.endsWith("#repeated")) document.getElementById("repeated")?.scrollIntoView();
      },
    };
  }
  function sectionRow(f, pOverride) {
    const ev = M.evidence(f);
    const p = pOverride || ev[0];
    const no = M.sectionNo[f.id];
    const s = M.split(f.level, f.occurrences);
    return `<div class="row sect" id="s-${no}"><div class="v">
      <h2 class="h2"><span class="secno">§${no}</span>${F.findingTitle(f)}</h2>
      <p class="claim">${F.claim(f)}</p>
      ${F.splitBar(s)}
      <a class="more" style="margin-top:10px" href="${findingUrl(f)}">${t("ch.readMore", { n: no, k: f.evidence.length })}</a>
    </div><div class="r">${p ? F.diagram({ p, tools: F.diaTools(p) }) : ""}</div></div>`;
  }
  function exercisesRow(area, c) {
    const set = M.exSets[area] || [];
    if (!set.length) return `<div class="row full"><div class="v"><div class="state"><div class="lab">${t("er.noEx")}</div><p class="small">${t("er.noExBody")}</p></div></div></div>`;
    return `<div class="row full"><div class="v"><div class="hatchrule"></div>
      <h2 class="h2">${t("ch.exEnd")}: <em>${t("toc.exercises", { a: c.no + ".1", b: c.no + "." + set.length })}</em></h2>
      <p class="prose muted" style="margin-top:8px">${t("ch.exLede", { k: set.length })}</p>
      <div class="strip">${set.slice(0, 8).map((x, i) => `<a href="#/exercises/${area}/${i + 1}" data-fly>${F.diagram({ p: x, size: "small", caption: false, number: false, mode: "fen" })}<p class="cap"><b>${x.no}</b> · ${t("toPlay." + x.turn).replace(/^\S+ \S+ /, "") === t("toPlay." + x.turn) ? "" : ""}${F.t("toPlay." + x.turn)}${exStatus(x.id) ? " · " + t("ex.status." + exStatus(x.id)) : ""}</p></a>`).join("")}</div>
      <div class="btnrow" style="margin-top:20px"><a class="btn primary" href="#/exercises/${area}/1">${t("ch.allEx")} <span class="arr">→</span></a></div></div></div>`;
  }
  function repertoireRow() {
    const rows = D.openings.map((o) => {
      const hot = M.findingById["openings:line:" + o.family + ":" + o.color];
      return `<tr class="${hot ? "hot" : ""}"><td>${hot ? `<a class="link" href="${findingUrl(hot)}">${esc(o.family)}</a>` : esc(o.family)} <span class="faint">${o.color === "white" ? "♙" : "♟&#xFE0E;"}</span></td><td class="r">${o.games}</td><td class="r">${t("record", o.rec)}</td><td class="r">${F.pctv(o.avgWinAfterOpening, 0)}</td></tr>`;
    }).join("");
    const caro = D.openings.slice().sort((a, b) => b.games - a.games)[0];
    if (!caro) return "";
    const fam = caro.family;
    return `<div class="row"><div class="v"><h2 class="h2">${t("ch.repertoire")}</h2><p class="small muted" style="margin:6px 0 12px">${t("ch.repertoireLede")}</p>
      <table class="bk"><thead><tr><th>${t("ch.col.line")}</th><th class="r">${t("ch.col.games")}</th><th class="r">${t("ch.col.score")}</th><th class="r">${t("ch.col.after")}</th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="r nostick"><p class="kicker">${es() ? `Variantes de ${esc(fam)} que jugaste` : `${esc(fam)} variations you met`}</p><ul class="toc" style="margin-top:6px">${caro.names.map((x) => `<li class="sub"><div class="tl" style="padding-left:0"><span class="no">${x.eco}</span><span class="t">${esc(x.name.replace(fam + ": ", "").replace(fam, es() ? "Línea principal" : "Main line"))}</span><span class="ld"></span><span class="v">${x.games}</span></div></li>`).join("")}</ul>
      <p class="small muted" style="margin-top:12px">${es() ? `Sales del libro de media en la jugada ${n(caro.avgBookExitMove, 1)} y cometes ${caro.openingErrors} errores de apertura en ${caro.games} partidas.` : `On average you leave the book on move ${n(caro.avgBookExitMove, 1)}, with ${caro.openingErrors} opening errors in ${caro.games} games.`}</p></div></div>`;
  }

  /* =============== Interlude: the clock =============== */
  F.route(/^\/clock$/, () => {
    const C = D.clock;
    const secs = M.sections.clock || [];
    const html = `<div class="spread"><div class="row"><div class="v">
      <p class="kicker">${t("interlude")}</p>
      <p class="chno" aria-hidden="true" style="font-size:70px">I</p>
      <h1 class="title">${t("clk.title")}</h1>
      <p class="lede">${t("clk.lede", { trouble: C.movesInTimeTrouble, normal: n(C.errorsPer100Normal, 1), inTrouble: n(C.errorsPer100InTrouble, 1) })}</p>
      <p class="lede">${t("clk.lede2", { left: C.lostWithTimeLeft, onTime: C.lostOnTime })}</p>
      <div class="figs"><div class="red"><b>${C.lostWithTimeLeft}</b><span>${es() ? "derrotas con medio reloj o más" : "losses with half the clock or more"}</span></div><div><b>${C.fastCriticalErrors}</b><span>${es() ? "errores críticos jugados demasiado rápido" : "critical errors played too fast"}</span></div><div><b>${C.lostOnTime}</b><span>${es() ? "perdidas por tiempo" : "lost on time"}</span></div></div>
    </div><div class="r">${clockScatter()}</div></div>
    ${secs.map((f) => sectionRow(f)).join("")}</div>`;
    return { html, nav: "contents", ribbon: "clock", where: `${t("interlude")} · ${t("clk.title")}`, title: t("clk.title"), after(root) { Object.entries(F.pending).forEach(([id, o]) => { if (o.tools) F.wireDiaTools(root, id, o.p); }); } };
  });
  function clockScatter() {
    const W = 600, H = 300, L = 36, R = 12, T = 12, B = 34, XMAX = 200;
    const pts = D.errors.filter((e) => e.timeClass === "blitz" && e.clockBefore != null);
    const x = (s) => L + (Math.min(s, XMAX) / XMAX) * (W - L - R), y = (v) => T + (1 - v / 100) * (H - T - B);
    const mark = (e) => {
      const k = e.outOfScope ? "out" : e.peer ? (e.peer.level === "below_level" ? "below" : e.peer.level === "hard" ? "hard" : "mid") : "out";
      const cx = x(e.clockBefore).toFixed(1), cy = y(e.loss).toFixed(1);
      if (k === "below") return `<circle cx="${cx}" cy="${cy}" r="3.6" style="fill:var(--red)"/>`;
      if (k === "hard") return `<circle cx="${cx}" cy="${cy}" r="3.6" style="fill:url(#chh);stroke:var(--ink);stroke-width:1"/>`;
      if (k === "mid") return `<circle cx="${cx}" cy="${cy}" r="3.2" style="fill:var(--paper);stroke:var(--ink);stroke-width:1"/>`;
      return `<circle cx="${cx}" cy="${cy}" r="2.4" style="fill:var(--ink-3);opacity:.5"/>`;
    };
    const rapid = D.errors.length - pts.length;
    return `<figure class="fig"><div class="ft"><span class="fno">${t("figure")} I.1</span>${t("clk.fig")}</div>
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t("clk.fig"))}" data-draw>
      <defs><pattern id="chh" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="3" style="stroke:var(--ink);stroke-width:1"/></pattern>
      <pattern id="chz" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" style="stroke:var(--ink);stroke-width:.7;opacity:.25"/></pattern></defs>
      <rect x="${x(0)}" y="${T}" width="${x(30) - x(0)}" height="${H - T - B}" fill="url(#chz)"/>
      <text x="${x(15)}" y="${H - B - 6}" text-anchor="middle" style="fill:var(--ink-3);font-size:11px;font-style:italic">&lt;30 s</text>
      <g class="ax">${[0, 25, 50, 75, 100].map((v) => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" ${v ? 'stroke-dasharray="2 4"' : ""}/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`).join("")}
      ${[0, 30, 60, 90, 120, 150, 180].map((s) => `<text x="${x(s)}" y="${H - 14}" text-anchor="middle">${s}</text>`).join("")}
      <text x="${W - R}" y="${H - 1}" text-anchor="end">${t("clk.axisX")} →</text><text x="${L}" y="${T - 2}" text-anchor="start" dy="-2">↑ ${t("clk.axisY")}</text></g>
      <g class="wipe">${pts.map(mark).join("")}</g>
      </svg><figcaption>${t("clk.figCap", { n: pts.length })} ${F.why("clk.why", { rapid })}</figcaption></figure>`;
  }

  /* =============== Finding (section) =============== */
  F.route(/^\/finding\/(.+)$/, (id) => {
    const f = M.findingById[id];
    if (!f) return { html: notFoundPage() };
    const ev = M.evidence(f);
    const show = F._evShow && F._evShow.id === id ? F._evShow.k : 6;
    const s = M.split(f.level, f.occurrences);
    const no = M.sectionNo[f.id];
    const order = M.sectionOrder, i = order.indexOf(f), prev = order[i - 1], next = order[i + 1];
    const p0 = ev[0];
    let html = `<div class="spread"><div class="row"><div class="v">
      <p class="kicker"><a href="${areaUrl(f.area)}" style="text-decoration:none">${areaLabel(f.area)}</a></p>
      <h1 class="title"><span class="secno">§${no}</span>${F.findingTitle(f)}</h1>
      <p class="claim" style="margin-top:16px">${F.claim(f)}</p>
      <div class="figs">
        <div><b>${f.occurrences}</b><span>${t("f.numbers.times")}</span></div>
        <div><b>${f.games}</b><span>${t("f.numbers.games")} ${t("of")} ${M.N}</span></div>
        <div class="red"><b>${pp(f.impact)}</b><span>${t("f.numbers.perGame")}</span></div>
        <div><b>${F.pct(f.winLoss / M.totalWinLoss, 1)}</b><span>${t("f.numbers.ofAll")}</span></div>
      </div>
      ${f.kind === "game_pattern" ? `<p class="small muted" style="margin-top:14px">${t("f.patternNote")}</p>` : ""}
      ${f.kind === "strategy_errors" ? `<aside class="note" style="margin-top:16px"><span class="nt">${es() ? "Sin motivo inventado" : "No invented reasons"}</span>${t("ch.strategyNote")}</aside>` : ""}
      <p class="kicker" style="margin-top:24px">${t("f.maiaSplit")}</p>
      ${F.splitBar(s)}
    </div><div class="r">${gamesFigure(f)}</div></div>
    <div class="row full"><div class="v"><div class="hatchrule" style="margin:8px 0 22px"></div><h2 class="h2">${t("f.evidence")}</h2>
      <p class="small muted" style="margin-top:6px">${t("f.evidenceLede", { k: ev.length, s: Math.min(show, ev.length) })}</p></div></div>`;
    html += ev.slice(0, show).map((p, k) => {
      const dh = F.diagram({ p, tools: F.diaTools(p, `<a href="${trainHrefFor(p)}" data-fly-train>${t("f.trainThis")}</a><a href="#/game/${encodeURIComponent(p.gameId)}/${p.ply}">${t("f.openGame")}</a>`) });
      const did = dh.match(/id="fig-(d\d+)"/)[1];
      return `<div class="row"><div class="v">${dh}</div>
      <div class="r">${F.levelNote(p)}${p.curve ? `<div style="margin-top:20px">${F.maiaFigure(p, { dno: k + 1, dia: did })}</div>` : ""}</div></div>`;
    }).join("");
    if (ev.length > show) html += `<div class="row full"><div class="v"><button class="btn" data-more>${t("f.more", { k: Math.min(6, ev.length - show) })}</button></div></div>`;
    html += `<div class="row full"><div class="v"><hr class="rule"><div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap">${prev ? `<a class="more" href="${findingUrl(prev)}">← §${M.sectionNo[prev.id]} ${F.findingTitle(prev)}</a>` : "<span></span>"}${next ? `<a class="more" href="${findingUrl(next)}">§${M.sectionNo[next.id]} ${F.findingTitle(next)}</a>` : ""}</div></div></div></div>`;
    return {
      html, nav: "contents", ribbon: f.area === "clock" ? "clock" : f.area === "profile" || f.area === "style" ? "level" : "ch:" + f.area, where: `§${no} · ${F.findingTitle(f)}`, title: F.findingTitle(f),
      after(root) {
        Object.entries(F.pending).forEach(([did, o]) => { if (o.tools) F.wireDiaTools(root, did, o.p); });
        const more = root.querySelector("[data-more]");
        more && more.addEventListener("click", () => { F._evShow = { id, k: show + 6 }; F._keepScroll = true; F.render(); });
        root.querySelectorAll("[data-fly-train]").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); F.flyTo(a.getAttribute("href"), a.closest("figure").querySelector(".dia-board")); }));
      },
    };
  });
  // Figure: the 100 games as a crosstable, the ones where this finding happened marked
  function gamesFigure(f) {
    const ids = new Set(f.evidence.map((e) => e.gameId));
    if (f.kind === "opening_line") { const o = M.openingByKey[f.params.family + ":" + f.params.color]; if (o) o.gameIds.forEach((id) => ids.add(id)); }
    if (f.kind === "game_pattern") D.games.filter((g) => g.patterns.some((p) => p.pattern === f.key)).forEach((g) => ids.add(g.id));
    return `<figure class="fig"><div class="ft"><span class="fno">${t("figure")} ${++F.figCount}</span>${es() ? "Dónde pasó" : "Where it happened"}</div>
      <div class="grid-wrap small">${F.gameGrid({ hl: ids, link: true, pips: false })}</div>
      <figcaption>${es() ? `En ${ids.size} de ${M.N} partidas.` : `In ${ids.size} of ${M.N} games.`}</figcaption></figure>`;
  }
  function notFoundPage() { return `<div class="page"><p class="kicker">${t("toc.errata")}</p><h1 class="title">${es() ? "Esta página no existe." : "This page does not exist."}</h1><a class="more" href="#/contents">${t("toc.title")}</a></div>`; }

  /* =============== Appendix A: the games =============== */
  F.route(/^\/appendix(?:\/(wins|losses|draws))?$/, (filter) => {
    const list = D.games.filter((g) => !filter || (filter === "wins" ? g.result === "win" : filter === "losses" ? g.result === "loss" : g.result === "draw"));
    const hl = filter ? new Set(list.map((g) => g.id)) : null;
    const byColor = (c) => M.record(D.games.filter((g) => g.color === c).map((g) => g.id));
    const rec = D.sample.results;
    const html = `<div class="spread"><div class="row"><div class="v">
      <p class="kicker">${t("appendix")} A</p>
      <h1 class="title">${t("app.title", { n: M.N })}</h1>
      <p class="lede">${t("app.lede")}</p>
      <div class="paren" role="group" aria-label="Filter" style="margin-top:14px">${[["", "all"], ["wins", "wins"], ["losses", "losses"], ["draws", "draws"]].map(([k, l]) => `<a href="#/appendix${k ? "/" + k : ""}" aria-current="${(filter || "") === k}">${t("app." + l)}</a>`).join("")}</div>
      <figure class="fig" style="margin-top:8px"><div class="grid-wrap big">${F.gameGrid({ link: true, hl })}</div>${F.gridLegend()}
</figure>
    </div><div class="r">
      <div class="gprev" data-gprev></div>
      <p class="kicker" style="margin-top:22px">${t("toc.record")}</p>
      <p class="title num" style="font-size:40px">${t("record", { w: rec.win, d: rec.draw, l: rec.loss })}</p>
      <table class="bk" style="margin-top:12px"><tbody>
        <tr><td>${t("white")}</td><td class="r">${t("record", byColor("white"))}</td></tr>
        <tr><td>${t("black")}</td><td class="r">${t("record", byColor("black"))}</td></tr>
        ${Object.entries(D.sample.byTimeClass).map(([k, v]) => `<tr><td>${esc(F.lbl("tc." + k) === "tc." + k ? k : F.lbl("tc." + k))}</td><td class="r">${v}</td></tr>`).join("")}
        ${(() => { const acc = D.games.filter((g) => g.accuracy != null); return acc.length ? `<tr><td>${es() ? "Precisión media" : "Mean accuracy"}</td><td class="r">${F.pctv(acc.reduce((s, g) => s + g.accuracy, 0) / acc.length, 1)}</td></tr>` : ""; })()}
      </tbody></table>
    </div></div>
    <div class="row full"><div class="v">
      ${list.length ? `<ul class="glist">${list.map((g) => {
        const o = M.opponent(g), sc = M.score(g);
        return `<li><a href="#/game/${encodeURIComponent(g.id)}" data-gid="${g.id}"><span class="gn">${g.no}.</span><span class="go">${esc(o.name)}<small>${o.rating}</small></span><span class="gr ${sc === 0 ? "l" : ""}">${sc === 0.5 ? "½" : sc} <span class="faint" style="font-size:13px">${g.color === "white" ? (es() ? "bl." : "W") : (es() ? "ng." : "B")}</span></span>
          <span class="gd">${esc(g.opening.family)} · ${F.pctv(g.accuracy, 1)} · ${F.dateShort(g.endTime)}</span></a></li>`;
      }).join("")}</ul>` : `<p class="muted">${t("app.none")}</p>`}
    </div></div></div>`;
    return {
      html, nav: "games", ribbon: "games", where: `${t("appendix")} A · ${t("app.title", { n: M.N })}`, title: t("app.title", { n: M.N }),
      after(root) {
        const box = root.querySelector("[data-gprev]");
        if (!box || !matchMedia("(min-width: 1000px)").matches) { box && box.remove(); return; }
        const show = (id) => {
          const g = M.gameById[id]; if (!g) return;
          const last = g.plies[g.plies.length - 1];
          const e = (M.errorsByGame[g.id] || []).filter((x) => x.judgement !== "inaccuracy").sort((a, c) => c.loss - a.loss)[0];
          const p = e ? M.posFromError(e) : { fen: last.fen, orientation: g.color, turn: "w" };
          box.innerHTML = F.diagram({ p, size: "small", caption: false, number: false, mode: e ? "mistake" : "fen", draw: false }) + `<p class="small" style="margin-top:8px"><b class="num">${g.no}.</b> ${F.lbl("result." + g.result)} · ${esc(M.opponent(g).name)} · ${F.dateShort(g.endTime)}</p><p class="small muted">${e ? F.capLine(p) : es() ? "Sin errores graves." : "No serious errors."}</p>`;
          F.mountAll(box);
          F.swapIn(box);
        };
        let cur = null;
        const over = (ev) => { const c = ev.target.closest("[data-id],[data-gid]"); if (!c) return; const id = c.dataset.id || c.dataset.gid; if (id !== cur) { cur = id; show(id); } };
        root.addEventListener("pointerover", over);
        show(M.frontispiece.gameId);
      },
    };
  });

  /* =============== Game viewer =============== */
  F.route(/^\/game\/([^/]+)(?:\/(\d+))?$/, (id, plyStr) => {
    const g = M.gameById[id];
    if (!g) return { html: notFoundPage() };
    const errs = (M.errorsByGame[id] || []).slice().sort((a, b) => a.ply - b.ply);
    const errByPly = {}; errs.forEach((e) => (errByPly[e.ply] = e));
    const me = M.me(g), op = M.opponent(g);
    const start = plyStr ? Math.min(+plyStr, g.plies.length) : 0;
    const resTxt = g.result === "draw" ? t("res.d") : M.pgnResult(g) === "1–0" ? t("res.w") : t("res.b");
    // score with inline variations for mistakes/blunders
    let score = "";
    g.plies.forEach((pl, i) => {
      const ply = i + 1, mine = (ply % 2 === 1) === (g.color === "white");
      const lab = ply % 2 === 1 ? `<span class="mn">${M.moveNo(ply)}.</span>` : i === 0 ? `<span class="mn">1…</span>` : "";
      const e = mine ? errByPly[ply] : null;
      const gl = pl.j ? M.glyph(pl.j) : "";
      score += `<span class="pair">${lab}<button class="mv ${mine ? "" : "op"}" data-ply="${ply}">${F.san(pl.san, { cls: gl ? "bad" : "", glyph: gl })}</button></span> `;
      if (e && (e.judgement === "blunder" || e.judgement === "mistake")) {
        const ln = F.line(ply, e.bestLine, 4).replace(/<\/span>/, '<span class="gl">!</span></span>');
        score += `<span class="var"><span class="brk">(</span>${ln}<span class="brk">)</span></span> `;
        if (ply % 2 === 1 && i + 1 < g.plies.length) score += `<span class="mn">${M.moveNo(ply)}…</span>`;
      }
    });
    score += ` <b class="num">${M.pgnResult(g)}</b>`;
    const head = `<p class="kicker">${t("appendix")} A · ${t("g.game", { n: g.no })}</p>
      <p class="players"><span class="${g.color === "white" ? "me" : ""}">${esc(g.white.name)}</span> <span class="rt">${g.white.rating}</span> – <span class="${g.color === "black" ? "me" : ""}">${esc(g.black.name)}</span> <span class="rt">${g.black.rating}</span> <b class="num" style="margin-left:6px">${M.pgnResult(g)}</b></p>
      <p class="meta">${esc(g.opening.name)} (${g.opening.eco}) · ${g.timeClass} ${g.tc.base / 60}+${g.tc.increment} · ${F.date(g.endTime)} · ${F.pctv(g.accuracy, 1)} ${t("g.accuracy")} · ${t("g.errors", { b: g.errors.blunder, m: g.errors.mistake, i: g.errors.inaccuracy })}</p>`;
    const pos0 = { fen: start ? g.plies[start - 1].fen : g.startFen, orientation: g.color, turn: "w" };
    const curveFig = winCurve(g, errs);
    const pats = g.patterns.length ? `<p class="kicker" style="margin-top:20px">${t("g.patterns")}</p><ul class="toc">${g.patterns.map((pt) => { const f = D.findings.find((x) => x.key === pt.pattern); return `<li class="sub"><a class="tl" style="padding-left:0" href="${f ? findingUrl(f) : "#"}"><span class="t">${F.lbl("finding." + pt.pattern + ".title")}</span><span class="ld"></span><span class="v">${M.moveLabel(pt.ply).replace(/[.…]$/, "")}</span></a></li>`; }).join("")}</ul>` : "";
    const html = `<div class="spread gv">
      <div class="row"><div class="v gv-left"><div class="gv-head" style="margin-bottom:18px">${head}</div>
        <div class="gv-sticky">
          <div class="gv-board">${F.diagram({ p: pos0, caption: false, number: false, mode: "fen", draw: false, aria: t("g.game", { n: g.no }) })}</div>
          <div class="ctrl" role="toolbar" aria-label="${t("g.game", { n: g.no })}">
            <button type="button" data-nav="first" aria-label="${t("g.first")}">⇤</button><button type="button" data-nav="prev" aria-label="${t("g.prev")}">←</button><button type="button" data-nav="next" aria-label="${t("g.next")}">→</button><button type="button" data-nav="err" aria-label="${t("g.nextErr")}" style="color:var(--red)">??</button><button type="button" data-nav="flip" aria-label="${t("g.flip")}">⇅</button>
          </div>
          <p class="dia-line" data-cur style="margin-top:8px"></p>
        </div>
        <div class="gv-curve">${curveFig}</div>
      </div><div class="r nostick gv-right">
        <h2 class="h2" style="margin-top:6px">${t("g.score")}</h2>
        <div class="score">${score}</div>
        ${pats}
        <p style="margin-top:18px"><a class="more" href="${g.url}" target="_blank" rel="noopener">${t("g.onChess")} ↗</a></p>
      </div></div></div>`;
    return {
      html, nav: "games", ribbon: "games", where: `${t("appendix")} A · ${t("g.game", { n: g.no })}`, title: t("g.game", { n: g.no }), footGame: g,
      after(root) {
        const b = F.boards[0];
        let ply = start;
        const curEl = root.querySelector("[data-cur]");
        const cursor = root.querySelector("[data-wc-cur]");
        const W = 600, L = 8, R = 8;
        const xOf = (pl) => L + (pl / g.plies.length) * (W - L - R);
        const setPly = (pl, anim) => {
          pl = Math.max(0, Math.min(g.plies.length, pl));
          const prev = ply; ply = pl;
          const fen = pl ? g.plies[pl - 1].fen : g.startFen;
          if (anim && pl === prev + 1) b.setFen(fen, { uci: g.plies[pl - 1].uci }); else b.setFen(fen);
          const hl = {};
          if (pl) { const u = g.plies[pl - 1].uci; hl[u.slice(0, 2)] = "last"; hl[u.slice(2, 4)] = "last"; }
          b.highlight(hl);
          const e = errByPly[pl];
          const mine = pl && ((pl % 2 === 1) === (g.color === "white"));
          if (e && (e.judgement !== "inaccuracy")) {
            b.pencil({ seed: e.gameId + pl, rings: e.refutationUci ? [e.refutationUci[0].slice(2, 4)] : [], pencil: [], ink: [{ from: e.best.uci.slice(0, 2), to: e.best.uci.slice(2, 4), dashed: true }], glyph: { sq: e.played.uci.slice(2, 4), text: M.glyph(e.judgement) } }, { draw: !F.reduced() });
          } else b.pencil({}, {});
          root.querySelectorAll(".mv").forEach((m) => m.classList.toggle("cur", +m.dataset.ply === pl));
          const curBtn = root.querySelector(`.mv[data-ply="${pl}"]`);
          if (curBtn && innerWidth >= 1000) { const r = curBtn.getBoundingClientRect(); if (r.top < 60 || r.bottom > innerHeight - 20) curBtn.scrollIntoView({ block: "center" }); }
          const pl0 = g.plies[pl - 1];
          curEl.innerHTML = pl ? `${F.mvn(pl, pl0.san, { cls: pl0.j ? "bad" : "", glyph: pl0.j ? M.glyph(pl0.j) : "" })}${pl0.clk != null ? ` <span class="faint num">· ${F.clockFmt(pl0.clk)} ${es() ? "en el reloj" : "on the clock"}${pl0.t != null ? ` · ${n(pl0.t, 1)} s` : ""}</span>` : ""}${e ? ` · <span class="faint">${t("g.var")}</span> ${F.san(e.best.san)} <span class="faint num">(−${n(e.loss, 1)})</span>` : ""}${!mine ? "" : ""}`
            : `<span class="faint">${es() ? "Posición inicial" : "Starting position"}</span>`;
          if (cursor) { cursor.setAttribute("x1", xOf(pl)); cursor.setAttribute("x2", xOf(pl)); }
          history.replaceState(null, "", `#/game/${encodeURIComponent(id)}/${pl}`);
          F._lastPath = decodeURIComponent(location.hash.slice(1));
        };
        root.querySelectorAll(".mv").forEach((m) => m.addEventListener("click", () => setPly(+m.dataset.ply, +m.dataset.ply === ply + 1)));
        root.querySelectorAll("[data-nav]").forEach((btn) => btn.addEventListener("click", () => {
          const a = btn.dataset.nav;
          if (a === "first") setPly(0); else if (a === "prev") setPly(ply - 1); else if (a === "next") setPly(ply + 1, true);
          else if (a === "flip") { b.flip(); root.querySelector(".dia-ranks").append(...[...root.querySelector(".dia-ranks").children].reverse()); root.querySelector(".dia-files").append(...[...root.querySelector(".dia-files").children].reverse()); setPly(ply); }
          else if (a === "err") { const nx = errs.find((e) => e.ply > ply && e.judgement !== "inaccuracy") || errs.find((e) => e.judgement !== "inaccuracy"); if (nx) setPly(nx.ply); }
        }));
        const key = (e) => { if (e.target.closest("input,textarea,select")) return; if (e.key === "ArrowRight") { setPly(ply + 1, true); e.preventDefault(); } else if (e.key === "ArrowLeft") { setPly(ply - 1); e.preventDefault(); } else if (e.key === "Home") setPly(0); else if (e.key === "End") setPly(g.plies.length); };
        document.addEventListener("keydown", key);
        F.onLeave(() => document.removeEventListener("keydown", key));
        const svg = root.querySelector("[data-wc]");
        if (svg) {
          let down = false;
          const fromEv = (e) => { const r = svg.getBoundingClientRect(); return Math.round((((e.clientX - r.left) / r.width) * W - L) / (W - L - R) * g.plies.length); };
          svg.addEventListener("pointerdown", (e) => { down = true; svg.setPointerCapture(e.pointerId); setPly(fromEv(e)); });
          svg.addEventListener("pointermove", (e) => { if (down) setPly(fromEv(e)); });
          svg.addEventListener("pointerup", () => (down = false));
          svg.querySelectorAll("[data-jump]").forEach((m) => m.addEventListener("click", () => setPly(+m.dataset.jump)));
        }
        setPly(start);
      },
    };
  });
  function winCurve(g, errs) {
    const W = 600, H = 170, L = 8, R = 8, T = 10, B = 18, N = g.plies.length;
    const x = (pl) => L + (pl / N) * (W - L - R), y = (v) => T + (1 - v / 100) * (H - T - B);
    const pts = g.winCurve.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
    const area = `M${x(0)},${y(0)} L${pts.join(" L")} L${x(g.winCurve.length - 1)},${y(0)} Z`;
    const marks = errs.filter((e) => e.judgement !== "inaccuracy").map((e) => {
      const vx = x(e.ply).toFixed(1), vy = y(g.winCurve[Math.min(e.ply, g.winCurve.length - 1)]).toFixed(1);
      return `<g data-jump="${e.ply}" style="cursor:pointer"><line x1="${vx}" x2="${vx}" y1="${T}" y2="${H - B}" style="stroke:var(--red);stroke-width:1;opacity:.5"/><circle cx="${vx}" cy="${vy}" r="4" style="fill:var(--red)"/>${e.judgement === "blunder" ? `<text x="${vx}" y="${H - 4}" text-anchor="middle" style="fill:var(--red);font-size:11px;font-weight:600">??</text>` : ""}</g>`;
    }).join("");
    // time spent per player move
    const mine = g.plies.map((p, i) => ({ p, ply: i + 1 })).filter(({ ply }) => (ply % 2 === 1) === (g.color === "white"));
    const tmax = Math.max(10, ...mine.map((m) => m.p.t || 0));
    const bars = mine.map(({ p, ply }) => `<rect x="${(x(ply) - 1.5).toFixed(1)}" y="${(44 - ((p.t || 0) / tmax) * 40).toFixed(1)}" width="3" height="${(((p.t || 0) / tmax) * 40).toFixed(1)}" style="fill:${p.j === "b" || p.j === "m" ? "var(--red)" : "var(--ink)"};opacity:${p.j ? 1 : 0.55}"/>`).join("");
    return `<figure class="fig" style="margin-top:22px"><div class="ft"><span class="fno">${t("figure")} A.${g.no}</span>${t("g.curve")}</div>
      <svg viewBox="0 0 ${W} ${H}" data-wc data-draw class="scrub" role="img" aria-label="${esc(t("g.curve"))}">
        <defs><pattern id="wch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="4" style="stroke:var(--ink);stroke-width:.8;opacity:.45"/></pattern></defs>
        <rect x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}" fill="url(#wch)"/>
        <rect class="wipe-r" x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}" style="fill:var(--paper)"/>
        <path class="wipe" d="${area}" style="fill:var(--paper)"/>
        <path class="wipe" d="M${pts.join(" L")}" style="fill:none;stroke:var(--ink);stroke-width:1.6"/>
        <line x1="${L}" x2="${W - R}" y1="${y(50)}" y2="${y(50)}" style="stroke:var(--ink-3);stroke-dasharray:3 4"/>
        <rect x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}" style="fill:none;stroke:var(--ink);stroke-width:1"/>
        <g class="late">${marks}</g>
        <line data-wc-cur x1="${L}" x2="${L}" y1="${T}" y2="${H - B}" style="stroke:var(--ink);stroke-width:1.5"/>
      </svg>
      <svg viewBox="0 0 ${W} 48" style="margin-top:6px" aria-hidden="true" data-draw><g class="wipe">${bars}</g><line x1="${L}" x2="${W - R}" y1="44.5" y2="44.5" style="stroke:var(--rule)"/></svg>
      <figcaption>${t("g.curveCap")} ${t("g.timeCap")}</figcaption></figure>`;
  }

  /* =============== Appendix B: method =============== */
  F.route(/^\/method$/, () => {
    const L = D.level || { scope: { errors: 0, inScope: 0, outOfScope: {}, outOfScopeShare: 0 } }, S = D.settings;
    const ES = M.eloScale, ci = ES.maiaOffsetCi95 || [];
    const scale = ES.maiaOffset ? t("m.eloScale", { site: "Chess.com", off: ES.maiaOffset, lo: ci[0], hi: ci[1], at: ES.measuredAt }) : ES.shown === "pgn" ? t("m.eloScale.pgn") : "";
    const html = `<div class="spread"><div class="row"><div class="v">
      <p class="kicker">${t("appendix")} B</p><h1 class="title">${t("m.title")}</h1><p class="lede">${t("m.lede")}</p>
      <h2 class="h3" style="margin-top:28px">${t("m.engine")}</h2><p class="prose" style="margin-top:6px">${t("m.engineBody", { p1: n(S.pass1Nodes), p2: n(S.pass2Nodes) })}</p>
      <h2 class="h3" style="margin-top:22px">${t("m.samples")}</h2><p class="prose" style="margin-top:6px">${t("m.samplesBody", { occ: S.minSample.occurrences, games: S.minSample.games, og: S.minSample.openingGames, rg: S.minSample.repeatedGames })}</p>
      <h2 class="h3" style="margin-top:22px">${t("m.maia")}</h2><p class="prose" style="margin-top:6px">${t("m.maiaBody", { scale, errors: L.scope.errors, inScope: L.scope.inScope, out: L.scope.errors - L.scope.inScope, share: F.pct(L.scope.outOfScopeShare, 1), clock: L.scope.outOfScope.clock || 0, tc: L.scope.outOfScope.time_class || 0 })}</p>
      <h2 class="h3" style="margin-top:22px">${t("m.strategy")}</h2><p class="prose" style="margin-top:6px">${t("m.strategyBody")}</p>
      <h2 class="h3" style="margin-top:22px">${t("m.endgames")}</h2><p class="prose" style="margin-top:6px">${t("m.endgamesBody", { n: D.categories.endgames && D.categories.endgames.level ? D.categories.endgames.level.inScope : 0, od: D.categories.openings ? D.categories.openings.decidedGames : 0 })}</p>
      <p class="prose" style="margin-top:22px;font-style:italic">${t("m.noLLM")}</p>
    </div><div class="r">
      <h2 class="h3">${t("m.phases")}</h2><p class="small muted" style="margin-top:6px">${t("m.phasesBody")}</p>
      ${forest()}
    </div></div></div>`;
    return { html, nav: "contents", ribbon: "method", where: `${t("appendix")} B · ${t("m.title")}`, title: t("m.title") };
  });
  // Per-phase gap against the opponents of the same games (peer profile), in Elo, with its 95% interval.
  function forest() {
    const cls = (D.profile && D.profile.classes) || [];
    const ph = ["opening", "middlegame", "endgame"].map((k) => [k, cls.find((c) => c.id === "phase:" + k)]).filter(([, c]) => c && c.ci95);
    if (!ph.length) return `<p class="small faint" style="margin-top:14px">${t("m.noProfile")}</p>`;
    const lo = Math.min(-400, ...ph.map(([, c]) => c.ci95[0])), hi = Math.max(400, ...ph.map(([, c]) => c.ci95[1]));
    const W = 600, H = 70 + ph.length * 48, L = 120, R = 110, x = (v) => L + ((v - lo) / (hi - lo)) * (W - L - R);
    const sg = (v) => (v > 0 ? "+" : "") + n(v);
    const rows = ph.map(([k, c], i) => {
      const y = 40 + i * 48;
      return `<text x="${L - 14}" y="${y + 4}" text-anchor="end" style="font-size:14px;fill:var(--ink)">${F.lbl("phase." + k)}</text>
        <line x1="${x(c.ci95[0])}" x2="${x(c.ci95[1])}" y1="${y}" y2="${y}" style="stroke:var(--ink);stroke-width:2"/>
        <line x1="${x(c.ci95[0])}" x2="${x(c.ci95[0])}" y1="${y - 6}" y2="${y + 6}" style="stroke:var(--ink);stroke-width:1.5"/><line x1="${x(c.ci95[1])}" x2="${x(c.ci95[1])}" y1="${y - 6}" y2="${y + 6}" style="stroke:var(--ink);stroke-width:1.5"/>
        <rect x="${x(c.gap) - 5}" y="${y - 5}" width="10" height="10" style="fill:${c.grade === "A" ? "var(--red)" : "var(--ink)"}"/>
        <text x="${W - R + 10}" y="${y + 4}" style="font-size:13px">${sg(c.gap)} <tspan style="fill:var(--ink-3)">(${sg(c.ci95[0])} a ${sg(c.ci95[1])})</tspan></text>
        <text x="${L - 14}" y="${y + 19}" text-anchor="end" style="font-size:11px;fill:var(--ink-3);font-style:italic">n=${c.decisions}</text>`;
    }).join("");
    const crossing = ph.filter(([, c]) => c.ci95[0] < 0 && c.ci95[1] > 0).length;
    const ticks = [-400, -200, 0, 200, 400].filter((v) => v >= lo && v <= hi);
    return `<figure class="fig" style="margin-top:16px"><div class="ft"><span class="fno">${t("figure")} B.1</span>${t("m.phaseFig")}</div>
      <svg viewBox="0 0 ${W} ${H}" class="forest" role="img" aria-label="${esc(t("m.phaseFig"))}">
      <line x1="${x(0)}" x2="${x(0)}" y1="14" y2="${H - 26}" style="stroke:var(--red);stroke-width:1.2;stroke-dasharray:4 3"/>
      ${ticks.map((v) => `<text x="${x(v)}" y="${H - 8}" text-anchor="middle" ${v === 0 ? 'style="fill:var(--red);font-style:italic"' : ""}>${v === 0 ? (es() ? "0 = como tus rivales" : "0 = like your opponents") : sg(v)}</text>`).join("")}
      ${rows}</svg><figcaption>${t("m.phaseCap", { k: crossing, n: ph.length })}</figcaption></figure>`;
  }

  /* =============== Errata: states =============== */
  F.route(/^\/errata$/, () => {
    const p = M.frontispiece;
    const html = `<div class="page">
      <p class="kicker">${t("toc.errata")}</p><h1 class="title">${t("er.title")}</h1><p class="lede">${t("er.lede")}</p>
      <div class="state"><div class="lab">${t("er.notfound")}</div><div class="formerr" style="margin-top:0"><p class="et">${t("err.notfound.t", { user: "nobody", src: "Chess.com" })}</p><p>${t("err.notfound.b")}</p></div></div>
      <div class="state"><div class="lab">${t("er.down")}</div><div class="formerr" style="margin-top:0"><p class="et">${t("err.down.t")}</p><p>${t("err.down.b")}</p><div class="btnrow" style="margin-top:10px"><button class="btn sm">${t("err.retry")}</button><button class="btn sm ghost">${t("err.usePgn")}</button></div></div></div>
      <div class="state"><div class="lab">${t("er.empty")}</div><p class="prose">${t("er.emptyBody")}</p></div>
      <div class="state"><div class="lab">${t("er.partial")}</div><p class="prose">${t("er.partialBody")}</p><button class="btn sm" style="margin-top:10px">${t("er.retry2")}</button></div>
      <div class="state" aria-busy="true"><div class="lab">${t("er.loading")}</div><div class="skel h"></div><div class="skel"></div><div class="skel" style="width:86%"></div><div class="skel" style="width:60%"></div><div class="skel b" style="margin-top:16px"></div></div>
      <div class="state"><div class="lab">${t("er.noEx")}</div><p class="prose">${t("er.noExBody")}</p></div>
      <div class="state"><div class="lab">${t("er.scope")}</div>${F.levelNote({ outOfScope: "clock" })}</div>
      <div class="state"><div class="lab">${t("er.inconclusive")}</div><p class="prose">${t("er.inconclusiveBody")}</p><a class="more" href="#/method">${t("toc.appB")}</a></div>
      <div class="state"><div class="lab">${t("er.noSecond")}</div><p class="prose">${t("er.noSecondBody")}</p></div>
      <div class="state"><div class="lab">${t("er.webgpu")}</div><p class="prose">${t("er.webgpuBody")}</p></div>
      <div class="state"><div class="lab">${es() ? "Sin curva de Maia" : "No Maia curve"}</div><p class="prose">${t("f.noCurve")}</p></div>
    </div>`;
    return { html, nav: "settings", ribbon: "errata", where: t("toc.errata"), title: t("er.title") };
  });

  /* =============== Settings =============== */
  F.route(/^\/settings$/, () => {
    const S = F.state;
    const opt = (k, v, label, extra = "") => `<button type="button" class="opt" data-k="${k}" data-v="${v}" aria-pressed="${S[k] === v}">${extra}${label}</button>`;
    const sets = ["merida", "cburnett", "mpchess", "kiwen-suwi", "chessnut", "fantasy", "shapes"];
    const sw = (b) => { const st = { print: ["var(--sq-light)", "repeating-linear-gradient(-45deg,var(--hatch) 0 1px,transparent 1px 3px)"], grey: ["oklch(0.93 0.004 260)", "oklch(0.74 0.006 260)"], pencil: ["var(--paper)", "color-mix(in oklch,var(--ink) 16%,var(--paper))"], wood: ["#f0d9b5", "#b58863"] }[b]; return `<span class="sw"><i style="background:${st[0]}"></i><i style="background:${st[1]}"></i><i style="background:${st[1]}"></i><i style="background:${st[0]}"></i></span>`; };
    const html = `<div class="page">
      <p class="kicker">${t("nav.settings")}</p><h1 class="title">${t("set.title")}</h1><p class="lede">${t("set.lede")}</p>
      <div class="set-group" style="margin-top:26px"><div class="lab">${t("set.lang")}</div><div class="opts">${opt("lang", "en", "English")}${opt("lang", "es", "Español")}</div></div>
      <div class="set-group"><div class="lab">${t("set.theme")}</div><div class="opts">${opt("theme", "light", t("set.theme.light"))}${opt("theme", "dark", t("set.theme.dark"))}${opt("theme", "auto", t("set.theme.auto"))}</div></div>
      <div class="set-group"><div class="lab">${t("set.pieces")}</div><div class="opts">${sets.map((s) => opt("pieces", s, s, `<img src="folio/pieces/${s}/wN.svg" alt="">`)).join("")}</div></div>
      <div class="set-group"><div class="lab">${t("set.board")}</div><div class="opts">${["print", "grey", "pencil", "wood"].map((b) => opt("board", b, t("set.board." + b), sw(b))).join("")}</div>
        <div style="max-width:240px;margin-top:16px">${F.diagram({ p: M.frontispiece || { fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", orientation: "white", turn: "w" }, caption: false, number: false, mode: "fen" })}</div></div>
      <div class="set-group"><div class="lab">${t("set.notation")}</div><div class="opts">${opt("notation", "fig", t("set.notation.fig") + " · " + F.state.notation === "fig" ? "" : "", `<span>${t("set.notation.fig")} <span class="san"><i class="fg fg-N"></i>f3</span></span>`)}${opt("notation", "letters", "", `<span>${t("set.notation.letters")} <span class="san">Nf3</span></span>`)}</div></div>
      <div class="set-group"><div class="lab">${t("set.motion")}</div><div class="opts">${opt("motion", "auto", t("set.motion.auto"))}${opt("motion", "reduced", t("set.motion.reduced"))}</div></div>
      <div class="set-group"><div class="lab">${t("set.data")}</div><div class="btnrow">
        <a class="btn sm" href="#/">${t("set.newRun")}</a>${M.empty ? "" : `<a class="btn sm" href="#/typesetting">${t("set.replay")}</a>`}<button class="btn sm ghost" data-reset>${t("set.resetEx")}</button><button class="btn sm ghost" data-forget>${t("set.forget")}</button></div>
        <p class="small muted" style="margin-top:8px">${t("set.dataNote")}</p></div>
    </div>`;
    return {
      html, nav: "settings", ribbon: "", where: t("set.title"), title: t("set.title"),
      after(root) {
        root.querySelectorAll(".opt").forEach((b) => b.addEventListener("click", () => { if (b.dataset.k === "theme") { F.themeTo(b.dataset.v); F.toast(t("set.saved")); return; } F.crossfade(() => { F.set(b.dataset.k, b.dataset.v); F._keepScroll = true; F.render(); }); F.toast(t("set.saved")); }));
        root.querySelector("[data-forget]").addEventListener("click", async () => { if (!confirm(t("set.forgetAsk"))) return; await window.CernoApp.forget(); });
        root.querySelector("[data-reset]").addEventListener("click", () => { try { Object.keys(localStorage).filter((k) => k.startsWith("cernod.ex.")).forEach((k) => localStorage.removeItem(k)); } catch (e) {} F.toast(t("set.saved")); });
      },
    };
  });
})();
