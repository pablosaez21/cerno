/* Cerno-Folio exercises: "Exercises 1.1–1.25", solve on the board, solution upside down at the back of the book. */
(function () {
  const F = window.F, M = F.M, D = M.D, t = F.t, n = F.n, esc = F.esc;
  const es = () => F.state.lang === "es";
  const keyOf = (p) => p.id || p.key;
  const status = (p) => F.store.get("ex." + keyOf(p), null);
  const setStatus = (p, s) => { if (status(p) === "solved") return; F.store.set("ex." + keyOf(p), s); };

  /* ---------- index of sets ---------- */
  F.route(/^\/exercises$/, () => {
    const setRow = (title, href, list, sub) => {
      const done = list.filter((p) => status(p)).length;
      const solved = list.filter((p) => status(p) === "solved").length;
      return `<div class="row"><div class="v"><a href="${href}" style="text-decoration:none;color:inherit;display:block"><h2 class="h2">${title}</h2></a>
        <p class="small muted" style="margin-top:4px">${sub} · ${done ? `${solved} ${t("ex.status.solved")}, ${done - solved} ${t("ex.status.revealed")}` : `${list.length} ${es() ? "por hacer" : "to do"}`}</p>
        <div class="dots grid" style="--cols:${Math.ceil(Math.sqrt(list.length))}">${list.map((p, i) => `<a href="${href.replace(/\/1$/, "/" + (i + 1))}" class="${status(p) || ""}" aria-label="${p.no}">${i + 1}</a>`).join("")}</div>
        <a class="more" href="${href}">${done && done < list.length ? (es() ? "Seguir" : "Continue") : t("ch.allEx")}</a></div>
        <div class="r nostick desk-only"><div style="max-width:220px">${F.diagram({ p: list[0], size: "small", caption: false, number: false, mode: "fen" })}</div></div></div>`;
    };
    const html = `<div class="spread"><div class="row"><div class="v"><p class="kicker">${t("nav.exercises")}</p><h1 class="title">${t("ex.index")}</h1>
      <p class="lede">${es() ? "Tus propios errores, primero los de por debajo de tu nivel. Soluciones al final, del revés." : "Your own mistakes, below-your-level first. Solutions at the back, upside down."}</p></div><div class="r"></div></div>
      ${M.chapters.map((c) => setRow(`<span class="secno">${c.no}</span>${F.catName(c.area)}: <em>${t("toc.exercises", { a: c.no + ".1", b: c.no + "." + M.exSets[c.area].length })}</em>`, `#/exercises/${c.area}/1`, M.exSets[c.area], `${t("chapter")} ${c.no}`)).join("")}
      ${D.recommendations.map((r) => setRow(`<span class="secno">${["i", "ii", "iii"][r.rank - 1]}.</span>${window.FOLIO_I18N.recTitle[F.state.lang][M.findingById[r.findingId].key]}`, `#/train/${r.rank}/1`, M.recSets[r.rank - 1], t("nav.preface"))).join("")}
    </div>`;
    return { html, nav: "exercises", ribbon: "exercises", where: t("nav.exercises"), title: t("nav.exercises") };
  });

  F.route(/^\/exercises\/(tactics|strategy|openings|endgames)\/(\d+)$/, (area, k) => {
    const c = M.chapters.find((x) => x.area === area);
    return trainer({
      list: M.exSets[area], i: +k - 1, base: `#/exercises/${area}/`,
      setTitle: t("ex.title", { a: c.no + ".1", b: c.no + "." + M.exSets[area].length }), area,
      next: M.chapters[M.chapters.indexOf(c) + 1],
      where: `${t("chapter")} ${c.no} · ${t("exercises")}`,
    });
  });
  F.route(/^\/train\/(\d)\/(\d+)$/, (r, k) => trainer({
    list: M.recSets[+r - 1], i: +k - 1, base: `#/train/${r}/`,
    setTitle: t("ex.recTitle", { r: ["i", "ii", "iii"][+r - 1], k: M.recSets[+r - 1].length }), where: `${t("nav.preface")} · ${["i", "ii", "iii"][+r - 1]}`,
  }));
  F.route(/^\/position\/(.+)$/, (key) => {
    const [g, ply] = key.split("#");
    const p = M.pos(g, +ply);
    if (!p) return { html: "" };
    p.no = M.moveLabel(p.ply).replace(/[.…]$/, "");
    return trainer({ list: [p], i: 0, base: `#/position/${encodeURIComponent(key)}?`, setTitle: es() ? "Una posición" : "A single position", where: t("exercise"), single: true });
  });

  function trainer(o) {
    const list = o.list;
    if (o.i >= list.length) return doneCard(o);
    const p = list[o.i];
    const g = p.game;
    const st = status(p);
    const solPly = p.ply;
    const playedLab = F.mvn(p.ply, p.played.san, { cls: "bad", glyph: M.glyph(p.judgement) || "?" });
    const solLine = F.line(solPly, p.solution.san, 8);
    const bestWin = p.curve && p.curve.engine && p.curve.engine[0] ? p.curve.engine[0].win : null;
    const winTxt = p.winAfter != null && bestWin != null ? `<p class="small" style="margin-top:8px">${t("ex.winAfter", { played: F.san(p.played.san, { cls: "bad" }), after: F.pctv(p.winAfter, 1), best: F.san(p.solution.san[0]), bestWin: F.pctv(bestWin, 1) })}</p>` : "";
    const exDia = F.diagram({ p, caption: false, number: false, mode: "fen", draw: false, aria: t("exercise") + " " + p.no });
    const exId = exDia.match(/id="fig-(d\d+)"/)[1];
    const html = `<div class="spread"><div class="row"><div class="v">
      <div class="ex-head"><div><p class="kicker">${o.setTitle}</p><p class="ex-no">${o.single ? "" : t("exercise") + " "}${p.no}</p></div><p class="small muted num" style="text-align:right">${o.i + 1} / ${list.length}</p></div>
      <p class="prose" style="margin-top:10px"><span class="sc">${t("toPlay." + p.turn)}</span>. ${t("ex.prompt", { move: playedLab, loss: n(p.loss, 1) })}</p>
      <div class="ex-board" style="margin-top:16px">${exDia}</div>
      <p class="ex-msg" aria-live="polite">${st === "solved" ? `<span class="mk">✓</span>${t("ex.right", { move: F.mvn(p.ply, p.solution.san[0], { glyph: "!" }) })}` : `<span class="faint">${t("ex.yourTurn")}</span>`}</p>
      <div class="ex-btns">
        <button type="button" class="btn holdbtn" data-reveal><span class="fill"></span>${t("ex.reveal")}</button>
        <a class="btn ${st ? "primary" : "ghost"}" data-next href="${o.base}${o.i + 2}">${o.single ? t("nav.back") : t("ex.next")} <span class="arr">→</span></a>
      </div>
      ${o.single ? "" : `<div class="dots grid" style="--cols:${Math.ceil(Math.sqrt(list.length))}" aria-label="${t("ex.set")}">${list.map((x, j) => `<a href="${o.base}${j + 1}" class="${status(x) || ""} ${j === o.i ? "cur" : ""}" aria-label="${x.no}${status(x) ? " · " + t("ex.status." + status(x)) : ""}">${j + 1}</a>`).join("")}</div>`}
      <section class="back-sol" aria-label="${t("ex.back")}">
        <div class="bs-lab"><span class="kicker">${t("ex.back")}</span><span class="small faint">${es() ? "del revés" : "upside down"}</span></div>
        <div class="sol ${st ? "up" : ""}" ${st ? "" : 'aria-hidden="true"'}><p><span class="sc">${t("solution")} ${p.no}.</span> <span class="sl">${solLine}</span></p>${winTxt}</div>
      </section>
    </div><div class="r">
      <div data-ctx>${ctxBefore(p)}</div>
      <div data-fig style="margin-top:22px">${st && p.curve ? F.maiaFigure(p, { fno: "E." + (o.i + 1), dia: exId }) : ""}</div>
    </div></div></div>`;
    return {
      html, nav: "exercises", ribbon: "exercises", where: o.where, title: `${t("exercise")} ${p.no}`, footGame: null,
      after(root) {
        if (o.single) root.querySelector("[data-next]").setAttribute("href", "javascript:history.back()");
        const b = F.boards[0];
        const boardEl = root.querySelector(".ex-board .dia-board");
        const msg = root.querySelector(".ex-msg");
        const sol = root.querySelector(".sol");
        const figBox = root.querySelector("[data-fig]");
        let tries = 0, done = !!st;
        const chess = F.chess(p.fen);
        const good = new Set([(p.solution.uci[0] || "").slice(0, 4), ...((p.curve && p.curve.good) || []).map((u) => u.slice(0, 4))]);
        const maiaLine = () => { const me = M.playerElo(p); if (!p.curve || me == null) return ""; const c = M.curveAt(p.curve, me); return `<span class="small" style="display:block;margin-top:6px;color:var(--ink-2)">${t("ex.maiaLine", { elo: me, pct: F.pct(c.pGood), played: F.pct(c.pPlayed, c.pPlayed < 0.01 ? 1 : 0), san: F.san(p.played.san, { cls: "bad" }) })}</span>`; };
        const showFig = () => { const h = root.querySelector("[data-maia-hint]"); h && h.remove(); if (p.curve && !figBox.innerHTML.trim()) { figBox.innerHTML = F.maiaFigure(p, { fno: "E." + (o.i + 1), dia: exId }); F.flushAfter(); } };
        const flipUp = () => { sol.classList.add("up"); sol.removeAttribute("aria-hidden"); };
        const finish = async (uci, best) => {
          done = true;
          b.input(null);
          b.setBaseHighlight({ [uci.slice(0, 2)]: "last", [uci.slice(2, 4)]: "last" });
          const cont = best ? p.solution.uci.slice(1, 5) : [];
          if (best) {
            setStatus(p, "solved");
            msg.className = "ex-msg ok";
            msg.innerHTML = `<span class="mk">✓</span>${t("ex.right", { move: F.mvn(p.ply, p.solution.san[0], { glyph: "!" }) })} ${cont.length ? `<span class="faint">${t("ex.line")}: </span>${F.line(p.ply + 1, p.solution.san.slice(1, 5), 4)}` : ""}${maiaLine()}`;
          } else {
            setStatus(p, "solved");
            msg.className = "ex-msg ok";
            const san = F.uciSan(p.fen, uci);
            msg.innerHTML = `<span class="mk">✓</span>${t("ex.alsoGood", { move: F.mvn(p.ply, san), best: F.mvn(p.ply, p.solution.san[0], { glyph: "!" }) })}${maiaLine()}`;
            b.pencil({ seed: p.key, ink: [{ from: p.solution.uci[0].slice(0, 2), to: p.solution.uci[0].slice(2, 4) }] }, { draw: !F.reduced() });
          }
          root.querySelector("[data-next]").classList.replace("ghost", "primary");
          setTimeout(flipUp, 500);
          showFig();
          if (cont.length) {
            let fen = b.fen;
            for (const u of cont) { await sleep(F.reduced() ? 900 : 720); if (!document.body.contains(boardEl)) return; fen = CernoBoard.applyUci(fen, u); b.setFen(fen, { uci: u }); b.highlight({ [u.slice(0, 2)]: "last", [u.slice(2, 4)]: "last" }); }
          }
        };
        if (!done && chess) {
          b.input({
            turn: p.turn,
            dests: (sq) => [...new Set(chess.moves({ square: sq, verbose: true }).map((m) => m.to))],
            onMove: async (from, to) => {
              const pc = b.map[from];
              const promo = pc && pc[1] === "P" && (to[1] === "8" || to[1] === "1") ? "q" : "";
              const uci = from + to + promo;
              b.setFen(CernoBoard.applyUci(p.fen, uci), { uci });
              if (good.has(uci.slice(0, 4))) return finish(uci, uci.slice(0, 4) === p.solution.uci[0].slice(0, 4));
              tries++;
              b._input.disabled = true;
              b.pencil({ seed: uci + tries, rings: [to], glyph: { sq: to, text: "?" } }, { draw: !F.reduced() });
              msg.className = "ex-msg no";
              msg.innerHTML = `<span class="mk">✗</span>${F.mvn(p.ply, F.uciSan(p.fen, uci), { cls: "bad", glyph: "?" })} · ${tries > 1 ? t("ex.wrong2") : t("ex.wrong")}`;
              await sleep(900);
              if (!document.body.contains(boardEl)) return;
              b.setFen(p.fen); b.pencil({}, {}); b.highlight({});
              b._input.disabled = false;
            },
          });
        } else if (done) {
          b.setFen(CernoBoard.applyUci(p.fen, p.solution.uci[0]), {});
          b.pencil({ seed: p.key, ink: [{ from: p.solution.uci[0].slice(0, 2), to: p.solution.uci[0].slice(2, 4) }], pencil: [{ from: p.played.uci.slice(0, 2), to: p.played.uci.slice(2, 4) }] }, { draw: false });
          b.setFen(p.fen);
        }
        // hold to turn the page to the solution
        const rv = root.querySelector("[data-reveal]");
        let hold;
        const reveal = async () => {
          if (!done) setStatus(p, "revealed");
          done = true; b.input(null);
          rv.classList.remove("holding");
          flipUp(); showFig();
          msg.className = "ex-msg"; msg.innerHTML = `${t("solution")}: ${F.mvn(p.ply, p.solution.san[0], { glyph: "!" })} · <span class="faint">${t("ex.line")}</span> ${F.line(p.ply + 1, p.solution.san.slice(1, 4), 3)}${maiaLine()}`;
          root.querySelector("[data-next]").classList.replace("ghost", "primary");
          b.setFen(p.fen); b.highlight({});
          b.pencil(F.pencilFor(p), { draw: !F.reduced() });
          await sleep(1300);
          if (!document.body.contains(boardEl)) return;
          b.playLine(p.fen, p.solution.uci.slice(0, 5), { stepMs: 760, startDelay: 0 });
          b.pencil({}, {});
        };
        rv.addEventListener("pointerdown", (e) => { if (done) return reveal(); rv.classList.add("holding"); hold = setTimeout(reveal, 650); });
        ["pointerup", "pointerleave", "pointercancel"].forEach((ev) => rv.addEventListener(ev, () => { clearTimeout(hold); rv.classList.remove("holding"); }));
        rv.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); reveal(); } });
        // diagram flight lands on this board
        boardEl.dataset.vtTarget = "1";
        const kb = (e) => { if (e.key === "ArrowRight" && done) location.hash = o.base + (o.i + 2); if (e.key === "ArrowLeft" && o.i > 0) location.hash = o.base + o.i; };
        document.addEventListener("keydown", kb); F.onLeave(() => document.removeEventListener("keydown", kb));
      },
    };
  }
  function ctxBefore(p) {
    const g = p.game;
    const src = g ? t("ex.game", { w: esc(g.white.name), b: esc(g.black.name), date: F.date(g.endTime), move: F.mvn(p.ply, p.played.san, { cls: "bad", glyph: M.glyph(p.judgement) || "?" }) }) : "";
    const tags = (p.tags || []).filter((x) => F.lbl("tag." + x) !== "tag." + x).map((x) => F.lbl("tag." + x));
    return `${F.levelNote(p)}
      <p class="small muted" style="margin-top:16px">${src}${g ? ` <a class="link" href="#/game/${encodeURIComponent(p.gameId)}/${p.ply - 1}">${t("f.openGame")}</a>` : ""}</p>
      ${tags.length ? `<p class="small" style="margin-top:8px"><span class="sc">${es() ? "Tema" : "Theme"}</span>: ${tags.join(", ")}</p>` : ""}
      ${p.curve && !status(p) ? `<p class="small faint" data-maia-hint style="margin-top:14px">${es() ? "La curva de Maia sale al resolverlo (delata la jugada)." : "Maia’s curve shows once solved (it gives the move away)."}</p>` : ""}`;
  }
  function doneCard(o) {
    const list = o.list;
    const solved = list.filter((p) => status(p) === "solved").length;
    const html = `<div class="page"><p class="kicker">${o.setTitle}</p>
      <div class="done-card"><p class="h2">${t("ex.done", { solved, n: list.length })}</p>
      <div class="dots grid" style="--cols:${Math.ceil(Math.sqrt(list.length))};justify-content:center;margin-top:16px">${list.map((x, j) => `<a href="${o.base}${j + 1}" class="${status(x) || ""}">${j + 1}</a>`).join("")}</div></div>
      <div class="btnrow" style="margin-top:22px">${o.next ? `<a class="btn primary" href="#/exercises/${o.next.area}/1">${t("ex.doneNext")}: ${F.catName(o.next.area)} <span class="arr">→</span></a>` : ""}<a class="btn ghost" href="#/exercises">${t("ex.index")}</a></div></div>`;
    return { html, nav: "exercises", ribbon: "exercises", where: o.where, title: o.setTitle, after(root) {
      if (F.reduced()) return;
      root.querySelectorAll(".done-card .dots a").forEach((a, i) => { a.style.opacity = 0; a.style.transform = "translateY(4px)"; setTimeout(() => { a.style.transition = "opacity .3s, transform .4s cubic-bezier(.23,1,.32,1)"; a.style.opacity = 1; a.style.transform = "none"; }, 30 * i); });
    } };
  }
  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
})();
