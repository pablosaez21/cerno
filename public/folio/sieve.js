/* Cerno D · Criba × Folio — the sieve, printed.
 * Ported from Criba: the 10×10 grid of win% curves (one square per game), the funnel counters, and the wait
 * (9 Stockfish workers, real per-game results revealed game by game). Redrawn as ink on paper, with Folio's
 * galley proof (the latest mistake on a small diagram, in red pencil) set in a corner. */
(function () {
  const F = window.F, M = F.M, D = M.D, t = F.t, n = F.n, esc = F.esc;
  const es = () => F.state.lang === "es";

  // ---------- data ----------
  const chron = [...D.games].reverse(); // game 1 (oldest) … 100
  M.chron = chron;
  const myCurve = (g) => (g.color === "white" ? g.winCurve : g.winCurve.map((v) => 100 - v));
  const mistakes = D.errors.filter((e) => e.judgement !== "inaccuracy");
  M.funnel = {
    games: D.sample.games, moves: D.sample.playerMoves, judged: D.errors.length,
    mistakes: mistakes.length, patterns: D.findings.length, train: D.recommendations.length,
  };

  // ---------- one square per game ----------
  const curveCache = {};
  function curvePath(g) {
    if (curveCache[g.id]) return curveCache[g.id];
    const c = myCurve(g), N = c.length, step = Math.max(1, Math.floor(N / 48)), W = 40, H = 40, P = 3;
    let d = "";
    for (let i = 0; i < N; i += step) d += (d ? "L" : "M") + (P + (i / (N - 1)) * (W - 2 * P)).toFixed(1) + " " + (P + (1 - c[i] / 100) * (H - 2 * P)).toFixed(1);
    d += "L" + (W - P) + " " + (P + (1 - c[N - 1] / 100) * (H - 2 * P)).toFixed(1);
    return (curveCache[g.id] = d);
  }
  function pips(g) {
    return (M.errorsByGame[g.id] || [])
      .filter((e) => e.judgement !== "inaccuracy" && e.peer && (e.peer.level === "below_level" || e.peer.level === "hard"))
      .sort((a, b) => a.ply - b.ply).slice(0, 5)
      .map((e) => `<i class="pip ${e.peer.level === "below_level" ? "pip-s" : "pip-h"}"></i>`).join("");
  }
  const resWord = (r) => F.lbl("result." + r).toLowerCase();
  // opts: {state(g)->'q'|'a'|'d', hl:Set, link, pips, cls}
  F.gameGrid = (opts = {}) => {
    const st = opts.state || (() => "d");
    const cells = chron.map((g) => {
      const s = st(g), dim = opts.hl && !opts.hl.has(g.id) ? " dim" : "";
      const inner = `<svg viewBox="0 0 40 40" preserveAspectRatio="none" aria-hidden="true"><line x1="0" x2="40" y1="20" y2="20" class="mid"/><path d="${curvePath(g)}" pathLength="1"/></svg>${opts.pips === false ? "" : `<span class="pips">${pips(g)}</span>`}`;
      const lab = `${t("g.game", { n: g.no })} · ${resWord(g.result)} · ${esc(M.opponent(g).name)}`;
      return opts.link
        ? `<a href="#/game/${encodeURIComponent(g.id)}" class="cell r-${g.result} s-${s}${dim}" data-id="${g.id}" aria-label="${lab}" title="${lab}">${inner}</a>`
        : `<span class="cell r-${g.result} s-${s}${dim}" data-id="${g.id}">${inner}</span>`;
    }).join("");
    return `<div class="grid10 ${opts.cls || ""}" ${opts.link ? `role="list"` : `role="img" aria-label="${t("sv.grid")}"`}>${cells}</div>`;
  };
  F.gridLegend = (noMaia) => `<p class="g-key"><span><i class="lg r-win"></i>${t("sv.win")}</span><span><i class="lg r-draw"></i>${t("sv.draw")}</span><span><i class="lg r-loss"></i>${t("sv.loss")}</span>${noMaia ? "" : `<span><i class="pip pip-s"></i>${t("sv.lgBelow")}</span><span><i class="pip pip-h"></i>${t("sv.lgHard")}</span>`}</p>`;

  // ---------- the sieve figure (Contents) ----------
  F.sieveFigure = (fno) => {
    const f = M.funnel, max = Math.log10(f.moves);
    const rows = [
      [f.games, t("sv.l.games"), "#/appendix"],
      [f.moves, t("sv.l.moves"), "#/appendix"],
      [f.judged, t("sv.l.judged"), "#/method"],
      [f.mistakes, t("sv.l.mistakes"), "#/method"],
      [f.patterns, t("sv.l.patterns"), "#/contents#toc"],
      [f.train, t("sv.l.train"), "#/preface"],
    ];
    return `<figure class="fig sieve"><div class="ft"><span class="fno">${t("figure")} ${fno}</span>${t("sv.fig")}</div>
      <ol class="sv-rows">${rows.map(([v, l, h], i) => `<li class="${i === rows.length - 1 ? "fin" : ""}"><a href="${h}"><span class="v num">${n(v)}</span><span class="l">${l}</span><span class="bar"><i style="width:${Math.max(3, (Math.log10(v) / max) * 100).toFixed(1)}%"></i></span></a></li>`).join("")}</ol>
      <figcaption>${t("sv.cap")} ${F.why("sv.why")}</figcaption></figure>`;
  };

  // ---------- the wait (accelerated, real data) ----------
  const REAL = { download: 6, stockfish: 196, maia: 38, patterns: 3, exercises: 3 }; // s of real time (≈4:06)
  function plan(mode, failSet) {
    const subset = mode === "new" ? chron.filter((g) => g.no > 88) : chron;
    const totalPlies = subset.reduce((s, g) => s + g.plies.length, 0);
    const sf = mode === "new" ? 26 : REAL.stockfish, dl = mode === "new" ? 2 : REAL.download, W = 9;
    const workers = new Array(W).fill(dl), ev = [];
    subset.forEach((g) => {
      let k = 0; for (let i = 1; i < W; i++) if (workers[i] < workers[k]) k = i;
      const dur = (g.plies.length / totalPlies) * sf * W;
      ev.push({ g, start: workers[k], end: workers[k] + dur, dur, fail: failSet.has(g.no) });
      workers[k] += dur;
    });
    const sfEnd = Math.max(...workers), maiaEnd = sfEnd + (mode === "new" ? 5 : REAL.maia);
    return { subset, ev, dl, sfEnd, maiaEnd, patEnd: maiaEnd + REAL.patterns, exEnd: maiaEnd + REAL.patterns + REAL.exercises };
  }
  const sift = (mode, q) => {
    const noMaia = q.get("s") === "nomaia";
    const failSet = new Set(q.get("s") === "fail" ? [37, 64] : []);
    const P = plan(mode, failSet);
    const inSub = new Set(P.subset.map((g) => g.id));
    const nEx = Object.values(D.exercises).flat().length;
    const ctr = (k) => `<div class="ctr" data-k="${k}"><b class="num">0</b><span>${t("sv.c." + k)}</span></div>`;
    const STG = ["dl", "sf", "maia", "pat", "ex"];
    const first = chron[chron.length - 1];
    const html = `<div class="sift"><div class="col col-l">
      <div class="w-a">
        <p class="kicker">${mode === "new" ? `<span class="red">${t("ed2.kicker")}</span> · ` : ""}${t("ts.title")} <span class="demo-tag">${t("demoTag")}</span></p>
        <h1 class="ts-lead" data-lead aria-live="polite"></h1>
        <p class="sub num"><b data-clk>0:00</b> <span data-eta></span></p>
        <div class="done-cta" hidden><a class="btn primary" href="#/contents">${t("ts.open")} <span class="arr">→</span></a><a class="more" href="#/appendix">${t("sv.toGrid")}</a></div>
      </div>
        <div class="w-d"><ol class="stages">${STG.map((k) => `<li data-st="${k}"><span class="mk">○</span><span>${k === "maia" && noMaia ? t("sv.s.maiaOff") : t("sv.s." + k)}</span><span class="ct num" data-ct></span></li>`).join("")}</ol>
        <div class="small faint leave">${t("sv.leave")} ${F.why("sv.whyWait")}</div></div>
      </div><div class="col col-c">
      <div class="w-b"><div class="grid-wrap ${noMaia ? "nomaia" : "pips-off"}">${F.gameGrid({ state: (g) => (inSub.has(g.id) ? "q" : "d") })}</div>${F.gridLegend(noMaia)}</div>
      </div><div class="col col-r">
      <figure class="w-g galley"><div class="gl-board">${F.diagram({ p: { fen: first.startFen, orientation: "white", turn: "w" }, size: "small", caption: false, number: false, mode: "fen", draw: false, animMs: 0 })}</div>
        <figcaption><span class="gk">${t("ts.galley")}</span><span data-gcap>${t("sv.gwait")}</span></figcaption></figure>
      <div class="w-k counters">${["games", "moves", "judged", "mist", "pat", "train"].map(ctr).join("")}</div>
      <div class="w-f"><ul class="feed" aria-label="${t("sv.found")}"></ul></div>
      </div>
      <div class="ts-ctrl" role="group" aria-label="${t("ts.speed")}">
        <button type="button" class="btn sm" data-pause>${t("ts.pause")}</button>
        <div class="seg" role="group" aria-label="${t("ts.speed")}">${[4, 8, 16].map((s) => `<button type="button" data-speed="${s}" aria-pressed="${s === 8}">${s}×</button>`).join("")}</div>
        <span style="flex:1"></span>
        <a class="btn sm ghost" href="#/contents" data-skip>${t("ts.skip")} <span class="arr">→</span></a>
        <span class="progressline" aria-hidden="true"></span>
      </div>
    </div>`;
    return {
      html, noDock: true, noRibbon: true, where: t("ts.title"), title: t("ts.title"), noFooter: true,
      after(root) {
        const $ = (s) => root.querySelector(s);
        const rm = F.reduced();
        const cells = {}; root.querySelectorAll(".cell").forEach((c) => (cells[c.dataset.id] = c));
        const C = {}; root.querySelectorAll(".ctr").forEach((c) => (C[c.dataset.k] = c.querySelector("b")));
        const st = {}; root.querySelectorAll("[data-st]").forEach((li) => (st[li.dataset.st] = li));
        const lead = $("[data-lead]"), clk = $("[data-clk]"), eta = $("[data-eta]"), feed = $(".feed"), gcap = $("[data-gcap]"), pl = $(".progressline");
        const gw = $(".grid-wrap");
        const b = F.boards[0];
        const desk = matchMedia("(min-width: 1000px)").matches;
        let speed = +F.store.get("speed", 8), paused = false, T = 0, last = 0, raf = 0, finished = false, lastGalley = -1e9;
        root.querySelectorAll("[data-speed]").forEach((x) => x.setAttribute("aria-pressed", +x.dataset.speed === speed));
        // running totals
        const tot = { games: 0, moves: 0, judged: 0, mist: 0, pat: 0, train: 0 };
        const add = (g) => { tot.games++; tot.moves += g.playerMoves; const es2 = M.errorsByGame[g.id] || []; tot.judged += es2.length; tot.mist += es2.filter((e) => e.judgement !== "inaccuracy").length; };
        const MS = D.settings.minSample;
        const fst = D.findings.map((f) => {
          const need = f.kind === "opening_line" ? [MS.openingGames, MS.openingGames] : f.kind === "repeated_mistake" ? [MS.repeatedGames, MS.repeatedGames] : [MS.occurrences, MS.games];
          const per = {};
          if (f.kind === "opening_line") { const o = M.openingByKey[f.params.family + ":" + f.params.color]; (o ? o.gameIds : []).forEach((id) => (per[id] = 1)); }
          else if (f.kind === "game_pattern") D.games.filter((g) => g.patterns.some((p) => p.pattern === f.key)).forEach((g) => (per[g.id] = 1));
          else f.evidence.forEach((x) => (per[x.gameId] = (per[x.gameId] || 0) + 1));
          return { f, need, per, occ: 0, gs: 0, crossed: false };
        });
        const cross = (g, quiet) => {
          const out = [];
          fst.forEach((s) => { if (s.per[g.id]) { s.occ += s.per[g.id]; s.gs++; } if (!s.crossed && s.occ >= s.need[0] && s.gs >= s.need[1]) { s.crossed = true; tot.pat++; if (!quiet) out.push(s); } });
          return out;
        };
        chron.filter((g) => !inSub.has(g.id)).forEach((g) => { add(g); cross(g, true); });
        const render = () => Object.keys(C).forEach((k) => { C[k].textContent = n(tot[k]); C[k].parentElement.classList.toggle("live", tot[k] > 0); });
        render();
        const line = (html, cls = "", no) => {
          const li = document.createElement("li"); li.className = cls;
          li.innerHTML = `<span class="gn">${no != null ? no : ""}</span><span>${html}</span>`;
          feed.prepend(li);
          while (feed.children.length > (desk ? 7 : 4)) feed.lastChild.remove();
        };
        const seen = { fork: 0, hang: 0 };
        const note = (g) => {
          const e2 = M.errorsByGame[g.id] || [];
          const fork = e2.find((e) => e.tactic && e.tactic.tag === "allowed_tactic" && e.tactic.motifs.includes("fork"));
          const hang = e2.find((e) => e.tactic && e.tactic.tag === "hanging_piece");
          const mate = e2.find((e) => e.tactic && e.tactic.tag === "allowed_mate");
          const lw = g.patterns.find((p) => p.pattern === "lost_with_time_left");
          const mv = (e) => F.mvn(e.ply, e.played.san, { cls: "bad", glyph: M.glyph(e.judgement) });
          if (fork) { seen.fork++; return t("sv.n.fork", { mv: mv(fork), k: seen.fork }); }
          if (hang) { seen.hang++; return t("sv.n.hang", { mv: mv(hang), k: seen.hang }); }
          if (mate) return t("sv.n.mate", { mv: mv(mate) });
          if (lw) return t("sv.n.lwtl", { c: F.clockFmt(lw.value) });
          const w = e2.slice().sort((a, c) => c.loss - a.loss)[0];
          if (w && w.loss >= 15) return t("sv.n.worst", { mv: mv(w), l: n(w.loss, 0) });
          if (!e2.length) return t("sv.n.clean");
          return null;
        };
        const galley = (g) => {
          const e2 = (M.errorsByGame[g.id] || []).filter((e) => e.judgement !== "inaccuracy").sort((a, c) => c.loss - a.loss);
          const e = e2[0];
          if (!e) return false;
          const p = M.posFromError(e);
          b.setOrientation(e.color); b.setFen(e.fen); b.highlight({});
          b.pencil(F.pencilFor(p), { draw: !rm });
          gcap.innerHTML = `<b class="num">${g.no}</b> · ${F.capLine(p)}`;
          return true;
        };
        const fmt = (s) => { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
        let lastTitle = "";
        const title = (k, p) => { if (lastTitle === k) return; lastTitle = k; lead.innerHTML = t("sv.t." + k, p); };
        const stage = (k, cls, ct) => { const li = st[k]; li.className = cls || ""; li.querySelector(".mk").textContent = cls === "done" ? "✓" : cls === "run" ? "●" : "○"; if (ct != null) li.querySelector("[data-ct]").textContent = ct; };
        const ev = P.ev.slice().sort((a, c) => a.start - c.start);
        const state = new Map(), failN = [];
        const order = chron.filter((g) => inSub.has(g.id)).map((g) => g.id);
        let maiaShown = 0;
        const inScope = mistakes.filter((e) => e.peer).length;
        const sub = P.subset.length;
        const nNew = mode === "new" ? sub : M.N;
        const step = (now) => {
          const analysing = [];
          ev.forEach((e) => {
            const s = state.get(e.g.id) || "q";
            if (s === "q" && T >= e.start) { state.set(e.g.id, "a"); const c = cells[e.g.id]; c.className = c.className.replace(/s-\w/, "s-a"); c.style.setProperty("--cell-ms", Math.max(200, (e.dur / speed) * 1000) + "ms"); }
            if (state.get(e.g.id) === "a") {
              if (T >= e.end) {
                state.set(e.g.id, "d");
                const c = cells[e.g.id];
                if (e.fail) { c.className = c.className.replace(/s-\w/, "s-q") + " failed"; failN.push(e.g.no); line(t("sv.n.fail"), "", e.g.no); return; }
                c.className = c.className.replace(/s-\w/, "s-d");
                add(e.g);
                const nt = note(e.g); if (nt) line(nt, "", e.g.no);
                cross(e.g).slice(0, 1).forEach((s) => line(t("sv.n.pat", { f: F.findingTitle(s.f), o: s.occ, g: s.gs }), "pat"));
                if (now - lastGalley > 1100 && galley(e.g)) lastGalley = now;
                render();
              } else analysing.push(e);
            }
          });
          const doneN = [...state.values()].filter((v) => v === "d").length;
          if (T < P.dl) { stage("dl", "run", `${Math.floor((T / P.dl) * sub)}/${sub}`); title("dl", { n: nNew }); } else stage("dl", "done", `${sub}/${sub}`);
          if (T >= P.dl && T < P.sfEnd) { stage("sf", "run", `${doneN}/${sub}`); title("sf", { n: nNew }); }
          else if (T >= P.sfEnd) stage("sf", "done", `${sub - failN.length}/${sub}`); else stage("sf", "", `0/${sub}`);
          if (T >= P.sfEnd && T < P.maiaEnd) {
            if (noMaia) stage("maia", "", "–");
            else {
              const fr = (T - P.sfEnd) / (P.maiaEnd - P.sfEnd);
              stage("maia", "run", `${Math.floor(fr * inScope)}/${inScope}`);
              gw.classList.remove("pips-off");
              while (maiaShown < fr * order.length) { const c = cells[order[maiaShown++]]; c && c.classList.add("mx"); }
              title("maia");
            }
          } else if (T >= P.maiaEnd) stage("maia", noMaia ? "" : "done", noMaia ? "–" : `${inScope}/${inScope}`); else stage("maia", "", noMaia ? "–" : `0/${inScope}`);
          if (T >= P.maiaEnd && T < P.patEnd) { stage("pat", "run", String(tot.pat)); title("pat"); } else if (T >= P.patEnd) stage("pat", "done", String(tot.pat)); else stage("pat", "", String(tot.pat));
          if (T >= P.patEnd && T < P.exEnd) stage("ex", "run", `${Math.floor(((T - P.patEnd) / (P.exEnd - P.patEnd)) * nEx)}/${nEx}`); else if (T >= P.exEnd) stage("ex", "done", String(nEx)); else stage("ex", "", "–");
          clk.textContent = fmt(T);
          eta.textContent = P.exEnd - T > 1 ? t("sv.eta", { t: fmt(P.exEnd - T) }) : "";
          pl.style.transform = `scaleX(${Math.min(1, T / P.exEnd)})`;
          if (T >= P.exEnd && !finished) finish();
        };
        const finish = () => {
          finished = true;
          ev.forEach((e) => {
            if (state.get(e.g.id) === "d") return;
            state.set(e.g.id, "d");
            const c = cells[e.g.id];
            if (e.fail) { c.className = c.className.replace(/s-\w/, "s-q") + " failed"; if (!failN.includes(e.g.no)) failN.push(e.g.no); }
            else { c.className = c.className.replace(/s-\w/, "s-d"); add(e.g); cross(e.g, true); }
          });
          if (!noMaia) { gw.classList.remove("pips-off"); Object.values(cells).forEach((c) => c.classList.add("mx")); }
          tot.train = D.recommendations.length; render();
          C.train.parentElement.classList.add("fin");
          STG.forEach((k) => stage(k, k === "maia" && noMaia ? "" : "done"));
          stage("sf", "done", `${sub - failN.length}/${sub}`); stage("pat", "done", String(tot.pat)); stage("ex", "done", String(nEx));
          if (!noMaia) stage("maia", "done", `${inScope}/${inScope}`);
          lead.innerHTML = failN.length ? t("sv.t.donePart", { k: 100 - failN.length }) : t("sv.t.done");
          clk.textContent = fmt(P.exEnd); eta.textContent = t("sv.cached");
          pl.style.transform = "scaleX(1)";
          if (failN.length) line(t("sv.n.failEnd", { a: failN.join(es() ? " y " : " and "), k: 100 - failN.length }), "pat");
          if (noMaia) line(t("sv.n.noMaia"), "pat");
          D.recommendations.slice().reverse().forEach((r) => line(t("sv.n.rec", { r: ["i", "ii", "iii"][r.rank - 1], f: window.FOLIO_I18N.recTitle[F.state.lang][M.findingById[r.findingId].key] || F.findingTitle(M.findingById[r.findingId]) }), "pat"));
          // the galley shows the frontispiece: the costliest below-your-level mistake
          const fp = M.frontispiece; b.setOrientation(fp.orientation); b.setFen(fp.fen); b.pencil(F.pencilFor(fp), { draw: !rm });
          gcap.innerHTML = `<b class="num">${fp.game.no}</b> · ${F.capLine(fp)}`;
          $(".done-cta").hidden = false; $(".ts-ctrl").hidden = true;
        };
        const loop = (now) => {
          raf = 0;
          const dt = Math.min(0.1, (now - (last || now)) / 1000); last = now;
          if (!paused && !finished) { T += dt * speed; step(now); }
          if (!finished) raf = requestAnimationFrame(loop);
        };
        title("dl", { n: nNew });
        const at = q.get("at");
        if (at) { T = P.exEnd * Math.min(0.999, +at); step(performance.now()); }
        raf = requestAnimationFrame(loop);
        F.onLeave(() => cancelAnimationFrame(raf));
        root.querySelectorAll("[data-speed]").forEach((btn) => btn.addEventListener("click", () => {
          speed = +btn.dataset.speed; F.store.set("speed", speed);
          root.querySelectorAll("[data-speed]").forEach((x) => x.setAttribute("aria-pressed", x === btn));
        }));
        const pb = $("[data-pause]");
        pb.addEventListener("click", () => { paused = !paused; pb.textContent = paused ? t("ts.resume") : t("ts.pause"); root.querySelectorAll(".cell.s-a path").forEach((p) => (p.style.animationPlayState = paused ? "paused" : "running")); });
        $("[data-skip]").addEventListener("click", (e) => { e.preventDefault(); T = P.exEnd; step(performance.now()); });
      },
    };
  };
  const qOf = () => new URLSearchParams((location.hash.split("?")[1]) || "");
  F.route(/^\/(?:typesetting|sift)(?:\/(second))?(?:\?.*)?$/, (m) => sift(m === "second" || qOf().get("mode") === "new" ? "new" : "all", qOf()));
})();
