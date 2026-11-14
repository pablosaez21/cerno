/* Cerno-Folio core: settings, i18n, notation, router, chrome, the captioned diagram, figures. */
(function () {
  const M = window.FOLIO_MODEL, I = window.FOLIO_I18N, LBL = window.CERNO_LABELS;
  const F = (window.F = { M });
  const PIECES = "folio/pieces/";

  /* ---------- settings (localStorage, wrapped) ---------- */
  const store = {
    get(k, d) { try { const v = localStorage.getItem("cernod." + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("cernod." + k, JSON.stringify(v)); } catch (e) {} },
  };
  F.store = store;
  const navLang = (navigator.language || "en").toLowerCase().startsWith("es") ? "es" : "en";
  const qs = new URLSearchParams(location.search);
  F.state = {
    lang: qs.get("lang") || store.get("lang", navLang),
    theme: qs.get("theme") || store.get("theme", "light"),
    pieces: store.get("pieces", "merida"),
    board: store.get("board", "print"),
    notation: store.get("notation", "fig"),
    motion: qs.get("motion") || store.get("motion", "auto"),
  };
  F.applySettings = () => {
    const h = document.documentElement, s = F.state;
    h.lang = s.lang;
    if (s.theme === "auto") h.removeAttribute("data-theme"); else h.setAttribute("data-theme", s.theme);
    h.setAttribute("data-board", s.board);
    h.classList.toggle("rm", s.motion === "reduced");
  };
  F.set = (k, v) => { F.state[k] = v; store.set(k, v); F.applySettings(); };
  F.reduced = () => F.state.motion === "reduced" || matchMedia("(prefers-reduced-motion: reduce)").matches;
  F.piecePath = () => PIECES + F.state.pieces;
  F.applySettings();

  /* ---------- i18n + formatting ---------- */
  F.L = () => I[F.state.lang];
  F.t = (k, p) => { const s = I[F.state.lang][k] ?? I.en[k] ?? k; return I.fill(s, p); };
  F.lbl = (k, p) => LBL.t(F.state.lang, k, p);
  F.esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const nf = {};
  F.n = (x, d = 0) => { const k = F.state.lang + d; nf[k] = nf[k] || new Intl.NumberFormat(F.state.lang, { minimumFractionDigits: d, maximumFractionDigits: d }); return nf[k].format(x); };
  F.pct = (x01, d = 0) => (F.state.lang === "es" ? F.n(x01 * 100, d) + " %" : F.n(x01 * 100, d) + "%");
  F.pctv = (x100, d = 0) => (F.state.lang === "es" ? F.n(x100, d) + " %" : F.n(x100, d) + "%");
  F.date = (ms, o = { day: "numeric", month: "short", year: "numeric" }) => new Intl.DateTimeFormat(F.state.lang === "es" ? "es-ES" : "en-GB", o).format(new Date(ms));
  F.dateShort = (ms) => F.date(ms, { day: "numeric", month: "short" });
  F.clockFmt = (s) => { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
  F.catName = (a) => F.lbl("cat." + a);
  F.findingTitle = (f) => LBL.findingTitle(F.state.lang, f);

  /* ---------- notation ---------- */
  F.san = (san, { cls = "", glyph = "" } = {}) => {
    let s = F.esc(san);
    if (F.state.notation !== "fig" && F.state.lang === "es") {
      const ES = { K: "R", Q: "D", R: "T", B: "A", N: "C" };
      s = s.replace(/^([KQRBN])/, (m, p) => ES[p]).replace(/=([QRBN])/, (m, p) => "=" + ES[p]);
    }
    if (F.state.notation === "fig") {
      s = s.replace(/^([KQRBN])/, (m, p) => `<i class="fg fg-${p}" role="img" aria-label="${p}"></i>`)
        .replace(/=([QRBN])/, (m, p) => `=<i class="fg fg-${p}" role="img" aria-label="${p}"></i>`);
    }
    return `<span class="san ${cls}">${s}${glyph ? `<span class="gl">${glyph}</span>` : ""}</span>`;
  };
  // Move with number, e.g. 19…♖ac8 — single nowrap span
  F.mvn = (ply, san, opts = {}) => {
    const inner = F.san(san, opts).replace(/^<span class="san [^"]*">/, "").replace(/<\/span>$/, "");
    return `<span class="san ${opts.cls || ""}">${M.moveLabel(ply)}${inner}</span>`;
  };
  F.line = (startPly, sans, max = 6) => {
    const out = [];
    sans.slice(0, max).forEach((s, i) => {
      const ply = startPly + i;
      const lab = i === 0 || ply % 2 === 1 ? M.moveLabel(ply) : "";
      const inner = F.san(s).replace(/^<span class="san [^"]*">/, "").replace(/<\/span>$/, "");
      out.push(`<span class="san">${lab}${inner}</span>`);
    });
    return out.join(" ") + (sans.length > max ? " …" : "");
  };
  let ChessCtor = null;
  F.chess = (fen) => { ChessCtor = ChessCtor || window.Chess; if (!ChessCtor) return null; try { const c = new ChessCtor(); return c.load(fen) ? c : new ChessCtor(fen); } catch (e) { return null; } };
  const sanCache = {};
  F.uciSan = (fen, uci) => {
    const k = fen + uci;
    if (sanCache[k]) return sanCache[k];
    const c = F.chess(fen);
    if (!c) return uci;
    const m = c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || "q" });
    return (sanCache[k] = m ? m.san : uci);
  };

  /* ---------- "(?)": long explanations live behind a tap ---------- */
  F.why = (key, p) => `<details class="why"><summary aria-label="${F.t("why.label")}">(?)</summary><span class="why-b">${F.t(key, p)} <a class="link" href="#/method">${F.t("nav.method")}</a></span></details>`;
  F.themeBtn = () => {
    const night = document.documentElement.getAttribute("data-theme") === "dark" || (F.state.theme === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
    return `<button type="button" class="themebtn" data-theme-toggle aria-pressed="${night}" aria-label="${F.t(night ? "set.theme.light" : "set.theme.dark")}" title="${F.t(night ? "set.theme.light" : "set.theme.dark")}"><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="6.5"/><path d="M10 3.5a6.5 6.5 0 0 1 0 13z"/></svg></button>`;
  };
  document.addEventListener("click", (e) => {
    if (!e.target.closest("[data-theme-toggle]")) return;
    const night = document.documentElement.getAttribute("data-theme") === "dark" || (F.state.theme === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
    F.set("theme", night ? "light" : "dark"); F._keepScroll = true; F.render();
  });

  /* ---------- toast ---------- */
  let toastT;
  F.toast = (msg) => {
    let el = document.querySelector(".toast");
    if (!el) { el = document.createElement("div"); el.className = "toast"; el.setAttribute("role", "status"); document.body.appendChild(el); }
    el.textContent = msg; el.classList.add("in");
    clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove("in"), 1800);
  };

  /* ---------- hand-drawn ring for UI words ---------- */
  F.ringSvg = (seed = 1) => {
    let h = seed * 9301 + 49297;
    const r = () => ((h = (h * 9301 + 49297) % 233280) / 233280);
    const pts = [], s0 = r() * 6.28, sw = 6.28 * 1.12;
    for (let i = 0; i <= 28; i++) { const a = s0 + (sw * i) / 28, w = 1 + (i / 28) * 0.08 + Math.sin(a * 3) * 0.02; pts.push([50 + Math.cos(a) * 48 * w, 50 + Math.sin(a) * 44 * w]); }
    const d = "M" + pts.map((p) => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" L");
    return `<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path pathLength="1" d="${d}"/></svg>`;
  };

  /* ---------- router ---------- */
  F.routes = [];
  F.route = (re, fn) => F.routes.push([re, fn]);
  F.go = (hash) => { if (location.hash === hash) F.render(); else location.hash = hash; };
  F.cleanups = [];
  F.onLeave = (fn) => F.cleanups.push(fn);
  F.cur = { path: "", area: null };
  F.render = () => {
    const path = decodeURIComponent((location.hash || "#/").slice(1)) || "/";
    // Without a saved analysis only the cover, the wait and the settings exist.
    if (M.empty && !/^\/(?:$|cover|analysing|settings)/.test(path)) { F.go("#/"); return; }
    F.cleanups.splice(0).forEach((fn) => { try { fn(); } catch (e) {} });
    F.boards.forEach((b) => b.destroy && b.stopLine && b.stopLine());
    F.boards = [];
    F.pending = {};
    F.diaCount = 0; F.figCount = 0; F._after = [];
    let html = "", after = null, meta = {};
    for (const [re, fn] of F.routes) {
      const m = path.match(re);
      if (m) { const r = fn(...m.slice(1)); html = r.html; after = r.after; meta = r; break; }
    }
    if (!html) { F.go("#/"); return; }
    const main = document.getElementById("main");
    const swap = () => {
      main.innerHTML = html;
      F.cur = { path, ...meta };
      F.chrome(meta);
      F.mountAll(main);
      F.flushAfter();
      after && after(main);
      F.footer(meta);
    };
    const samePage = F._lastPath === path;
    F._lastPath = path;
    if (F._vt && document.startViewTransition && !F.reduced()) {
      const vt = F._vt; F._vt = null;
      const tr = document.startViewTransition(() => {
        swap(); if (vt.scroll !== false) window.scrollTo(0, 0);
        const nb = main.querySelector("[data-vt-target]");
        if (nb) nb.style.viewTransitionName = "dia";
        tr && tr.finished && tr.finished.finally(() => { if (nb) nb.style.viewTransitionName = ""; });
      });
    } else {
      swap();
      if (!samePage && !F._keepScroll) window.scrollTo(0, 0);
      F._keepScroll = false;
      if (!F.reduced() && !samePage) { main.classList.remove("fade"); void main.offsetWidth; main.classList.add("fade"); }
    }
  };
  // navigate with a shared-element flight of a diagram (View Transitions)
  F.flyTo = (hash, fromEl) => {
    if (fromEl && document.startViewTransition && !F.reduced()) {
      document.querySelectorAll("[style*='view-transition-name']").forEach((e) => (e.style.viewTransitionName = ""));
      fromEl.style.viewTransitionName = "dia";
      F._vt = { scroll: true };
    }
    location.hash = hash;
  };

  /* ---------- chrome: running head, ribbon, dock ---------- */
  const DOCK = [
    ["contents", "#/contents", "§"],
    ["exercises", "#/exercises", "fgN"],
    ["games", "#/appendix", "½"],
    ["settings", "#/settings", "Aa"],
  ];
  F.langSwitch = () => `<div class="lang" role="group" aria-label="${F.t("nav.lang")}"><button type="button" data-lang="en" aria-pressed="${F.state.lang === "en"}">EN</button><span class="bar"></span><button type="button" data-lang="es" aria-pressed="${F.state.lang === "es"}">ES</button></div>`;
  F.chrome = (meta) => {
    document.body.classList.toggle("no-dock", !!meta.noDock);
    document.body.classList.toggle("no-ribbon", !!meta.noRibbon);
    document.title = (meta.title ? meta.title.replace(/<[^>]+>/g, "") + " · " : "") + "Cerno";
    // running head (mobile)
    const rh = document.getElementById("runhead");
    rh.innerHTML = `${meta.hideWm ? "<span></span>" : `<a class="wm" href="#/contents">Cerno</a>`}<div class="where">${meta.where ? `<span class="sep">/</span>${meta.where}` : ""}</div>${F.langSwitch()}${F.themeBtn()}`;
    // dock
    const dock = document.getElementById("dock");
    dock.innerHTML = DOCK.map(([k, h, ic]) => {
      const on = meta.nav === k;
      const icon = ic === "fgN" ? `<i class="fg fg-N"></i>` : ic;
      return `<a href="${h}" ${on ? 'aria-current="page"' : ""}><span class="dk-ic" aria-hidden="true">${icon}</span>${F.t("nav." + k)}</a>`;
    }).join("");
    // ribbon (desktop)
    const rb = document.getElementById("ribbon");
    const items = [
      ["#/contents", "", F.t("toc.title"), "contents"],
      ["#/preface", "", F.t("nav.preface"), "preface"],
      ...M.chapters.map((c) => ["#/chapter/" + c.area, c.no, F.catName(c.area), "ch:" + c.area]),
      ...(M.sections.profile ? [["#/level", "N", F.t("lv.title"), "level"]] : []),
      ["#/clock", "I", F.t("interlude") + ": " + F.t("clk.title").toLowerCase(), "clock"],
      ["#/exercises", "", F.t("nav.exercises"), "exercises", true],
      ["#/appendix", "A", F.t("toc.appA", { n: M.N }), "games"],
      ["#/method", "B", F.t("toc.appB"), "method"],
    ];
    const curIdx = items.findIndex((it) => it[3] === meta.ribbon);
    rb.innerHTML = `<a class="wm" href="#/">Cerno</a>
      <div class="by">${F.t("brand.sub", { n: M.N, user: `<i>${M.user}</i>` })}</div>
      <nav aria-label="${F.t("toc.title")}"><span class="fillline" style="height:calc(100% - 28px);transform:scaleY(${curIdx < 0 ? 0 : curIdx / (items.length - 1)})"></span><ol>${items
        .map((it, i) => `<li><a href="${it[0]}" class="${i < curIdx ? "past" : ""} ${it[4] ? "gap" : ""}" ${i === curIdx ? 'aria-current="page"' : ""}><span class="bul"></span><span>${it[1] !== "" ? `<span class="rn">${it[1]}</span>` : ""}${it[2]}</span></a></li>`)
        .join("")}</ol></nav>
      <div class="rb-foot"><a href="#/settings">${F.t("nav.settings")}</a>${F.langSwitch()}${F.themeBtn()}</div>`;
    // desktop running heads
    const dh = document.getElementById("deskhead");
    dh.style.display = meta.noHead ? "none" : "";
    dh.innerHTML = `<div>Cerno · ${M.user}</div><div>${meta.where || ""}</div>`;
  };
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-lang]");
    if (b) { F.set("lang", b.dataset.lang); F._keepScroll = true; F.render(); }
  });
  window.addEventListener("scroll", () => { const rh = document.getElementById("runhead"); rh && rh.classList.toggle("scrolled", scrollY > 4); }, { passive: true });

  /* ---------- the captioned diagram ---------- */
  F.boards = [];
  F.pending = {};
  F.diaCount = 0;
  let uid = 0;
  F.pencilFor = (p, mode = "mistake") => {
    if (!p) return {};
    const spec = { seed: p.key || p.fen, ink: [], pencil: [], rings: [] };
    if (mode === "fen") return spec;
    if (p.best && p.best.uci) spec.ink.push({ from: p.best.uci.slice(0, 2), to: p.best.uci.slice(2, 4) });
    else if (p.solution && p.solution.uci[0]) spec.ink.push({ from: p.solution.uci[0].slice(0, 2), to: p.solution.uci[0].slice(2, 4) });
    if (p.played) {
      spec.pencil.push({ from: p.played.uci.slice(0, 2), to: p.played.uci.slice(2, 4) });
      const ring = p.refutation && p.refutation.uci[0] ? p.refutation.uci[0].slice(2, 4) : p.played.uci.slice(2, 4);
      spec.rings.push(ring);
      spec.glyph = { sq: p.played.uci.slice(2, 4), text: M.glyph(p.judgement) || "?" };
    }
    return spec;
  };
  // One line: "18…Tg8?? permite 19.Dxe6+. Era mejor 18…Db6+."
  F.capLine = (p) => {
    const L = F.state.lang;
    const played = F.mvn(p.ply, p.played.san, { cls: "bad", glyph: M.glyph(p.judgement) || "?" });
    const bestSan = p.best ? p.best.san : p.solution.san[0];
    const best = F.mvn(p.ply, bestSan);
    if (p.refutation && p.refutation.san[0]) {
      const ref = F.mvn(p.ply + 1, p.refutation.san[0]);
      return L === "es" ? `${played} permite ${ref}. Era mejor ${best}.` : `${played} allows ${ref}. ${best} was better.`;
    }
    return L === "es" ? `${played}. Era mejor ${best}.` : `${played}. ${best} was better.`;
  };
  F.captionFor = (p) => {
    const g = p.game;
    const src = g ? `${F.esc(M.opponent(g).name)} · ${F.dateShort(g.endTime)} · ${F.t("g.game", { n: g.no })} · <span class="num">−${F.n(p.loss, 1)}</span>` : "";
    return { text: F.capLine(p), src };
  };
  /* opts: {p, mode, size:'small'|'', caption:true|string, tools:true, tap:fn, label, draw:true, interactive} */
  F.diagram = (opts) => {
    const id = "d" + ++uid;
    const p = opts.p;
    const n = opts.number === false ? null : ++F.diaCount;
    F.pending[id] = opts;
    const orient = opts.orientation || p.orientation || "white";
    const files = orient === "white" ? "abcdefgh" : "hgfedcba";
    const ranks = orient === "white" ? "87654321" : "12345678";
    let cap = "";
    if (opts.caption !== false) {
      const toPlay = F.t("toPlay." + (p.turn || p.fen.split(" ")[1]));
      const c = typeof opts.caption === "string" ? { text: opts.caption, src: "" } : p.played ? F.captionFor(p) : { text: "", src: "" };
      cap = `<figcaption><span class="lab">${opts.label || F.t("diagram") + " " + n}</span> ${c.text}${c.src ? `<span class="src">${c.src}</span>` : ""}</figcaption>`;
    }
    const tools = opts.tools ? `<div class="dia-line" data-line="${id}" aria-live="polite"></div><div class="dia-tools">${opts.tools}</div>` : "";
    return `<figure class="dia ${opts.size || ""}" id="fig-${id}"><div class="dia-frame">
      <div class="dia-ranks" aria-hidden="true">${[...ranks].map((r) => `<span>${r}</span>`).join("")}</div>
      <div class="dia-board" data-dia="${id}" ${opts.tap ? 'data-tap="1" role="button" tabindex="0"' : ""} aria-label="${F.esc(opts.aria || (F.t("diagram") + (n ? " " + n : "")))}"></div>
      <div class="dia-files" aria-hidden="true">${[...files].map((f) => `<span>${f}</span>`).join("")}</div>
    </div>${cap}${tools}</figure>`;
  };
  let io;
  F.mountAll = (root) => {
    io && io.disconnect();
    io = new IntersectionObserver((ents) => {
      ents.forEach((en) => {
        if (!en.isIntersecting) return;
        io.unobserve(en.target);
        const b = en.target._board;
        if (b && en.target._draw) b.redrawPencil(!F.reduced());
      });
    }, { rootMargin: "0px 0px -18% 0px" });
    root.querySelectorAll("[data-dia]").forEach((el) => {
      const o = F.pending[el.dataset.dia];
      if (!o) return;
      const p = o.p;
      const b = new CernoBoard(el, { pieces: F.piecePath(), orientation: o.orientation || p.orientation || "white", animMs: o.animMs ?? 220 });
      b.setFen(o.fen || p.fen);
      if (o.highlight) b.setBaseHighlight(o.highlight);
      const spec = o.pencil || F.pencilFor(p, o.mode);
      b.pencil(spec, { draw: false });
      el._board = b;
      el._draw = o.draw !== false;
      if (el._draw && !F.reduced()) { b.pen.innerHTML = ""; b._pencil = spec; io.observe(el); }
      F.boards.push(b);
      o.board = b;
      if (o.tap) {
        const fire = (e) => { o.tap(b, el, e); };
        el.addEventListener("click", fire);
        el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fire(e); } });
      }
      o.onMount && o.onMount(b, el);
    });
  };
  F.board = (id) => F.pending[id] && F.pending[id].board;

  /* Replay helpers for a diagram: refutation (what happened) and the better line */
  F.playOn = async (b, p, which, lineEl) => {
    const isRef = which === "ref";
    const seq = isRef ? [p.played.uci, ...(p.refutation ? p.refutation.uci : [])].slice(0, 7) : p.solution.uci.slice(0, 7);
    const sans = isRef ? [p.played.san, ...(p.refutation ? p.refutation.san : [])].slice(0, 7) : p.solution.san.slice(0, 7);
    b.pen.innerHTML = "";
    if (lineEl) lineEl.innerHTML = sans.map((s, i) => {
      const ply = p.ply + i, o = { cls: isRef && i === 0 ? "bad" : "", glyph: isRef && i === 0 ? M.glyph(p.judgement) : i === 0 ? "!" : "" };
      const html = i === 0 || ply % 2 === 1 ? F.mvn(ply, s, o) : F.san(s, o);
      return `<span data-i="${i}">${html}</span>`;
    }).join(" ");
    const ok = await b.playLine(p.fen, seq, {
      stepMs: F.reduced() ? 900 : 760, startDelay: 200,
      onStep: (i) => { if (!lineEl) return; lineEl.querySelectorAll("[data-i]").forEach((s) => s.classList.toggle("cur", +s.dataset.i === i)); },
    });
    return ok;
  };
  F.resetDia = (b, p, lineEl) => { b.stopLine(); b.setFen(p.fen); b.highlight({}); b.pencil(F.pencilFor(p), { draw: !F.reduced() }); if (lineEl) lineEl.innerHTML = ""; };
  F.wireDiaTools = (root, id, p) => {
    const fig = root.querySelector("#fig-" + id);
    if (!fig) return;
    const b = F.board(id), lineEl = fig.querySelector("[data-line]");
    fig.querySelectorAll("[data-act]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const act = btn.dataset.act;
        fig.querySelectorAll("[data-act]").forEach((x) => { const on = x === btn && act !== "reset"; x.classList.toggle("on", on); x.setAttribute("aria-pressed", on); });
        if (act === "reset") return F.resetDia(b, p, lineEl);
        await F.playOn(b, p, act, lineEl);
      });
    });
  };
  F.diaTools = (p, extra = "") =>
    `<div class="dia-seg" role="group"><button type="button" data-act="ref">${F.t("f.playRef")}</button><button type="button" data-act="best">${F.t("f.playBest")}</button><button type="button" data-act="reset">${F.t("f.reset")}</button></div>${extra ? `<div class="dia-nav">${extra}</div>` : ""}`;

  /* ---------- level helpers ---------- */
  F.levelKey = (p) => (p.outOfScope ? "out" : p.level === "below_level" ? "below" : p.level === "hard" ? "hard" : p.peer ? "mid" : "out");
  F.levelNote = (p) => {
    const k = F.levelKey(p);
    let body = F.t("lvl." + k + ".note");
    if (k === "out" && p.outOfScope) body = F.t("f.outScope", { why: F.t("f.why." + p.outOfScope) });
    return `<aside class="note ${k}"><span class="nt">${F.t("lvl." + k)}</span>${body}</aside>`;
  };
  F.levTag = (k, text) => `<span class="levtag ${k}"><i aria-hidden="true"></i>${text || F.t("lvl." + k)}</span>`;
  F.splitBar = (s) => {
    const tot = s.occ || 1;
    const seg = (k, v) => (v > 0 ? `<span class="${k}" style="flex:${v}" title="${F.t("lvl." + k)}: ${v}"></span>` : "");
    return `<div class="split"><div class="bar" role="img" aria-label="${F.esc(F.t("split.legend", s))}">${seg("below", s.below)}${seg("hard", s.hard)}${seg("mid", s.mid)}${seg("out", s.out)}</div>
      <div class="keys">${["below", "hard", "mid", "out"].map((k) => F.levTag(k, `<b>${s[k]}</b>&nbsp;${F.t("lvl." + k).toLowerCase()}`)).join("")}</div></div>`;
  };

  /* ---------- Figures ---------- */
  F.figCount = 0;
  // One short sentence for where an Elo axis needs it: which scale, and what Maia was asked with. Empty when they coincide.
  F.eloScaleNote = () => (M.eloScale.maiaOffset ? F.t("elo.scale", { site: "Chess.com", off: M.eloScale.maiaOffset }) : "");
  // Maia curve: % of Lichess blitz players at each Elo who find a good move; your move in red pencil.
  // The Elo axis is on the scale of the games' source (M.eloScale), as the data gives it.
  F.maiaFigure = (p, { dno, fno, dia } = {}) => {
    if (!p.curve) return `<p class="small faint" style="margin-top:14px">${F.t("f.noCurve")}</p>`;
    const id = "mf" + ++uid;
    const n = fno || ++F.figCount;
    const C = p.curve.curve, W = 440, H = 230, L = 30, R = 8, T = 22, B = 26;
    const lo = C[0].elo, hi = C[C.length - 1].elo;
    const x = (e) => L + ((e - lo) / (hi - lo)) * (W - L - R), y = (v) => T + (1 - v) * (H - T - B);
    const path = (k) => C.map((c, i) => (i ? "L" : "M") + x(c.elo).toFixed(1) + "," + y(c[k]).toFixed(1)).join(" ");
    const area = path("pGood") + ` L${x(hi)},${y(0)} L${x(lo)},${y(0)} Z`;
    const me = M.playerElo(p);
    const start = me == null ? (lo + hi) / 2 : me;
    const flip = me != null && me > lo + 0.72 * (hi - lo);
    // round marks 400 apart, whatever the scale's end points are
    const ticks = [];
    for (let e = Math.ceil(lo / 200) * 200; e <= hi; e += 400) ticks.push(e);
    const svg = `<svg viewBox="0 0 ${W} ${H}" class="scrub" data-mf="${id}" role="img" aria-label="${F.esc(F.t("fig.maia.title"))}">
      <defs><pattern id="h${id}" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="5" style="stroke:var(--ink);stroke-width:.8;opacity:.35"/></pattern></defs>
      <g class="ax">${[0, 0.3, 0.7].map((v) => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" ${v === 0.3 || v === 0.7 ? 'stroke-dasharray="2 4"' : ""}/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${Math.round(v * 100)}</text>`).join("")}
      ${ticks.map((e) => `<text x="${x(e)}" y="${H - 10}" text-anchor="middle">${e}</text>`).join("")}</g>
      <path d="${area}" fill="url(#h${id})"/>
      <path d="${path("pGood")}" style="fill:none;stroke:var(--ink);stroke-width:2.2"/>
      <path d="${path("pPlayed")}" style="fill:none;stroke:var(--red);stroke-width:1.8;stroke-dasharray:5 4"/>
      ${me == null ? "" : `<line x1="${x(me)}" x2="${x(me)}" y1="${T - 4}" y2="${H - B}" style="stroke:var(--red);stroke-width:1.4"/>
      <circle cx="${x(me)}" cy="${y(M.curveAt(p.curve, me).pGood)}" r="4.5" style="fill:var(--red)"/>
      <text x="${x(me) + (flip ? -8 : 8)}" y="${T + 6}" text-anchor="${flip ? "end" : "start"}" style="fill:var(--red);font-size:13px;font-style:italic">${F.t("fig.maia.you")} · ${me}</text>`}
      <text x="${W - R}" y="${y(C[C.length - 1].pGood) + (C[C.length - 1].pGood > 0.85 ? 17 : -8)}" text-anchor="end" style="fill:var(--ink);font-size:13px;font-style:italic">${F.t("fig.maia.find")}</text>
      <text x="${W - R}" y="${y(C[C.length - 1].pPlayed) - 7}" text-anchor="end" style="fill:var(--red);font-size:13px;font-style:italic">${F.esc(F.t("fig.maia.played", { san: p.played.san }))}</text>
      <g class="cur" style="display:none"><line y1="${T}" y2="${H - B}" style="stroke:var(--ink-3);stroke-width:1"/><circle r="3.5" style="fill:var(--ink)"/></g>
      <rect x="${L}" y="0" width="${W - L - R}" height="${H}" fill="transparent"/>
    </svg>`;
    F.after(() => {
      const el = document.querySelector(`[data-mf="${id}"]`);
      if (!el) return;
      const ro = el.closest("figure").querySelector(".readout"), cur = el.querySelector(".cur");
      const show = (elo, user) => {
        const c = M.curveAt(p.curve, elo);
        const bd = dia && F.board(dia);
        if (bd && user) {
          // the ladder: Maia's three likeliest moves for this rating, drawn on the diagram (thicker = more players)
          bd.stopLine(); bd.setFen(p.fen); bd.highlight({});
          bd.maia((c.top || []).slice(0, 3).map(([u, pr]) => ({ from: u.slice(0, 2), to: u.slice(2, 4), color: u === p.played.uci ? "var(--pen-red)" : "var(--pen-ink)", w: 5 + pr * 20, o: 0.35 + pr * 0.6 })));
          const fig = document.getElementById("fig-" + dia), ln = fig && fig.querySelector("[data-line]");
          if (ln) ln.innerHTML = `<span class="faint">${F.t("fig.maia.onBoard", { elo: c.topElo })}</span>`;
        }
        const tops = (c.top || []).slice(0, 3).map(([u, pr]) => `${F.san(F.uciSan(p.fen, u), { cls: u === p.played.uci ? "bad" : "" })} ${F.pct(pr)}`).join(" · ");
        ro.innerHTML = `<b>${F.t("fig.maia.at", { elo: Math.round(elo) })}</b>: ${F.pct(c.pGood)} ${F.t("fig.maia.find")} · ${F.pct(c.pPlayed, c.pPlayed < 0.01 ? 1 : 0)} ${F.esc(F.t("fig.maia.played", { san: "" }))}${F.san(p.played.san, { cls: "bad" })}<br><span class="faint">${F.t("fig.maia.top")}: ${tops}</span>`;
        cur.style.display = ""; cur.querySelector("line").setAttribute("x1", x(elo)); cur.querySelector("line").setAttribute("x2", x(elo));
        cur.querySelector("circle").setAttribute("cx", x(elo)); cur.querySelector("circle").setAttribute("cy", y(c.pGood));
      };
      const fromEv = (e) => { const r = el.getBoundingClientRect(); const px = ((e.clientX - r.left) / r.width) * W; return Math.max(lo, Math.min(hi, lo + ((px - L) / (W - L - R)) * (hi - lo))); };
      let down = false;
      el.addEventListener("pointerdown", (e) => { down = true; el.setPointerCapture(e.pointerId); show(fromEv(e), true); });
      el.addEventListener("pointermove", (e) => { if (down) show(fromEv(e), true); else if (e.pointerType === "mouse") show(fromEv(e)); });
      el.addEventListener("pointerup", () => (down = false));
      show(start);
    });
    return `<figure class="fig maia"><div class="ft"><span class="fno">${F.t("figure")} ${n}</span>${F.t("fig.maia.title")}</div>${svg}
      <div class="readout" aria-live="polite"></div>
      <figcaption><span class="scrubhint">${F.t(dia ? "fig.maia.scrubBoard" : "fig.maia.scrub")}</span> ${F.why("fig.maia.why", { scale: F.eloScaleNote() })}</figcaption></figure>`;
  };
  // queue of after-mount hooks used by figure builders
  F._after = [];
  F.after = (fn) => F._after.push(fn);
  F.flushAfter = () => F._after.splice(0).forEach((fn) => fn());

  /* ---------- footer: checkered band, colophon, ASCII ex libris ---------- */
  F.asciiBoard = (fen, hl = []) => {
    const { map } = CernoBoard.parseFen(fen);
    const lines = [];
    lines.push("    +------------------------+");
    for (let r = 8; r >= 1; r--) {
      let row = "  " + r + " |";
      for (let f = 0; f < 8; f++) {
        const sq = "abcdefgh"[f] + r, pc = map[sq], dark = (f + r) % 2 === 1;
        let ch = pc ? (pc[0] === "w" ? pc[1] : pc[1].toLowerCase()) : dark ? ":" : " ";
        const cell = " " + ch + " ";
        row += hl.includes(sq) ? `<span class="r">${cell}</span>` : !pc && dark ? `<span class="d">${cell}</span>` : cell;
      }
      lines.push(row + "|");
    }
    lines.push("    +------------------------+");
    lines.push("      a  b  c  d  e  f  g  h  ");
    return lines;
  };
  F.exLibris = (g, fen, hl) => {
    const W = 38;
    const pad = (s, vis) => { const l = vis ?? s.replace(/<[^>]+>/g, "").length; const left = Math.floor((W - l) / 2); return " ".repeat(Math.max(0, left)) + s + " ".repeat(Math.max(0, W - l - left)); };
    const out = [];
    out.push(" ." + "-".repeat(W) + ".");
    out.push(" |" + " ".repeat(W) + "|");
    out.push(" |" + pad("E X   L I B R I S") + "|");
    out.push(" |" + pad("· · ·") + "|");
    F.asciiBoard(fen, hl).forEach((ln) => out.push(" |" + pad(ln, ln.replace(/<[^>]+>/g, "").length + 0) + "|"));
    out.push(" |" + " ".repeat(W) + "|");
    out.push(" |" + pad(M.user) + "|");
    out.push(" |" + pad(M.N + (F.state.lang === "es" ? " partidas · " : " games · ") + M.D.sample.playerMoves + (F.state.lang === "es" ? " jugadas" : " moves")) + "|");
    const tag = "C E R N O  ·  " + new Date(M.D.sample.to).getFullYear();
    out.push(" |" + pad(tag) + "|");
    out.push(" |" + " ".repeat(W) + "|");
    out.push(" '" + "-".repeat(W) + "'");
    return out.join("\n");
  };
  F.footer = (meta) => {
    const ft = document.getElementById("colophon");
    const g = meta.footGame || M.bestGame;
    if (meta.noFooter || !g) { ft.innerHTML = ""; return; }
    const best = !meta.footGame;
    const last = g.plies[g.plies.length - 1];
    const fen = last.fen, hl = [last.uci.slice(0, 2), last.uci.slice(2, 4)];
    const resTxt = g.result === "draw" ? F.t("res.d") : M.pgnResult(g) === "1–0" ? F.t("res.w") : F.t("res.b");
    const cap = best
      ? F.t("foot.asciiCapBest", { acc: F.pctv(g.accuracy, 1), mv: Math.ceil(g.plies.length / 2), w: F.esc(g.white.name), b: F.esc(g.black.name), date: F.date(g.endTime) })
      : F.t("foot.asciiCap", { w: F.esc(g.white.name), b: F.esc(g.black.name), date: F.date(g.endTime), res: resTxt });
    const D = M.D;
    ft.innerHTML = `<div class="foot">
      <div class="checker" aria-hidden="true">${"<i></i>".repeat(32)}</div>
      <div class="exlibris" role="button" tabindex="0" aria-label="${F.esc(cap.replace(/<[^>]+>/g, ""))}"><pre aria-hidden="true">${F.exLibris(g, fen, hl)}</pre><p class="cap">${cap}</p></div>
      <div class="foot-end"><span>${F.t("foot.line", { from: F.dateShort(D.sample.from), to: F.date(D.sample.to) })}</span><a href="#" data-top>${F.t("foot.top")} ↑</a></div>
      ${F.asciiTail ? F.asciiTail() : ""}
    </div>`;
    F.mountTail && F.mountTail(ft);
    const ex = ft.querySelector(".exlibris"), pre = ex.querySelector("pre");
    let tok = 0;
    const replay = async () => {
      const my = ++tok;
      const k = Math.min(16, g.plies.length);
      const start = g.plies.length - k;
      for (let i = start - 1; i < g.plies.length; i++) {
        if (my !== tok) return;
        const f = i < 0 ? g.startFen : g.plies[i].fen;
        const h = i < start ? [] : [g.plies[i].uci.slice(0, 2), g.plies[i].uci.slice(2, 4)];
        pre.innerHTML = F.exLibris(g, f, h);
        await new Promise((r) => setTimeout(r, i < start ? 600 : F.reduced() ? 700 : 420));
      }
    };
    ex.addEventListener("click", replay);
    // the plate replays the game's last moves once, the first time it scrolls into view
    if (!F.reduced() && "IntersectionObserver" in window) {
      const io2 = new IntersectionObserver((en) => { if (en[0].isIntersecting) { io2.disconnect(); setTimeout(replay, 300); } }, { threshold: 0.6 });
      io2.observe(pre);
      F.onLeave(() => io2.disconnect());
    }
    ex.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); replay(); } });
    ft.querySelector("[data-top]").addEventListener("click", (e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: F.reduced() ? "auto" : "smooth" }); });
  };
})();
