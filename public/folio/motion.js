/* Cerno D — quiet motion. One entrance language for the whole book, taken from the Maia figure:
 * things fade up a few pixels out of a soft blur, once, when they scroll into view; rules and leaders draw
 * from the left; the games grid fills row by row; numbers count up the first time they are seen.
 *
 * Safety: everything is gated by html.mo, which core sets only when motion is allowed (no reduced-motion
 * preference, the app's "reduced" setting off) and IntersectionObserver exists. Without html.mo nothing is
 * ever hidden. Units are marked hidden only after JS has measured them, and a fallback timer reveals
 * anything on screen the observer has missed. After a unit has revealed, every trace is removed from the DOM.
 */
(function () {
  const F = window.F;
  const html = document.documentElement;

  // Coarse units: the blocks a page is made of.
  const COARSE = ".spread > .row > .v > *, .spread > .row > .r, .page > *, .cover > div > *";
  // Fine units: when a coarse block holds these, it is split and these reveal one by one. [selector, kind, step ms]
  const FINE = [
    [".toc .tl", "u", 40], [".toc .mag", "x", 40], [".pref > li", "u", 40], [".sv-rows > li", "u", 40],
    [".figs > div", "u", 50], [".strip > a", "u", 50], [".split", "u", 50],
    [".fig > .ft", "b", 50], [".fig > figcaption", "u", 50], [".dia", "u", 60],
    ["hr.rule, hr.rule2, .hatchrule", "x", 50], [".set-group, .state, .ed-sheet", "u", 50],
    ["table.bk, .glist, .colhead", "u", 50], [".grid10", "g", 60],
  ];
  const FINE_SEL = FINE.map((f) => f[0]).join(", ");
  // Work surfaces and things with their own motion stay still.
  const EXCL = ".sift, .gv, .ex-board, .ex-msg, .ex-btns, .back-sol, .done-card, .mfig, .fig.maia .readout, .ts-ctrl, script, style, br";
  const BLUR = ".kicker, .title, .chno, .verdict, .wm-big, .h2, .ex-no, .defn, .ft";
  const COUNT = ".figs b, .sv-rows .v, .title.num";
  const SKIP_TAGS = /^(BR|SCRIPT|STYLE|TEMPLATE)$/;

  const fineOf = (el) => { for (const [s, k, st] of FINE) if (el.matches(s)) return { kind: k, step: st }; return null; };
  function refine(el, out) {
    if (SKIP_TAGS.test(el.tagName) || el.matches(EXCL)) return;
    const f = fineOf(el);
    if (f) { out.push({ el, kind: f.kind === "u" && el.matches(BLUR) ? "b" : f.kind, step: f.step }); return; }
    if (el.querySelector(FINE_SEL + ", " + EXCL)) { for (const c of el.children) refine(c, out); return; }
    out.push({ el, kind: el.matches(BLUR) ? "b" : "u", step: 55 });
  }
  function collect(root) {
    const out = [];
    const coarse = [...root.querySelectorAll(COARSE)].filter((el) => !el.closest(EXCL));
    // keep the outermost coarse units only (a .page inside a .cover, etc.)
    coarse.filter((el) => !coarse.some((o) => o !== el && o.contains(el))).forEach((el) => refine(el, out));
    return out;
  }

  /* ---------- numbers count up, once per page per session ---------- */
  const counted = new Set();
  const easeOut = (t) => 1 - Math.pow(1 - t, 4);
  function parseNum(tok) {
    const es = F.state.lang === "es";
    const dec = es ? "," : ".", grp = es ? "." : ",";
    const s = tok.split(grp).join("");
    const i = s.indexOf(dec);
    return { v: parseFloat(i < 0 ? s : s.replace(dec, ".")), d: i < 0 ? 0 : s.length - i - 1 };
  }
  function countUp(el, delay) {
    if (el.childElementCount || el._counting) return;
    const final = el.textContent;
    const parts = final.split(/(\d[\d.,]*\d|\d)/);
    const nums = [];
    parts.forEach((p, i) => { if (i % 2) nums.push({ i, ...parseNum(p) }); });
    if (!nums.length || nums.some((x) => !isFinite(x.v))) return;
    // hold the final width so nothing beside the number moves while it grows
    const rg = document.createRange(); rg.selectNodeContents(el);
    const w = rg.getBoundingClientRect().width;
    el._counting = true;
    const prevMin = el.style.minWidth;
    if (getComputedStyle(el).display !== "inline") el.style.minWidth = Math.ceil(w) + "px";
    const frame = (k) => { const q = parts.slice(); nums.forEach((x) => (q[x.i] = F.n(x.v * k, x.d))); el.textContent = q.join(""); };
    frame(0);
    const dur = 900;
    let t0 = 0;
    const tick = (now) => {
      if (!el.isConnected) return;
      t0 = t0 || now;
      const t = Math.min(1, (now - t0 - delay) / dur);
      if (t < 1) { if (t > 0) frame(easeOut(t)); requestAnimationFrame(tick); }
      else { el.textContent = final; el.style.minWidth = prevMin; el._counting = false; }
    };
    requestAnimationFrame(tick);
  }

  /* ---------- reveal ---------- */
  let io = null, timers = [];
  const pendingUnits = new Set();
  function finish(u) {
    const el = u.el;
    el.classList.add("rv-done");
    el.removeAttribute("data-rv"); el.classList.remove("rv-in", "rv-done");
    el.style.removeProperty("--rv-d");
    if (!el.getAttribute("style")) el.removeAttribute("style");
    if (!el.getAttribute("class")) el.removeAttribute("class");
  }
  function reveal(list, countOn) {
    let d = 0;
    list.forEach((u) => {
      if (!pendingUnits.has(u)) return;
      pendingUnits.delete(u);
      io && io.unobserve(u.el);
      const el = u.el;
      el.style.setProperty("--rv-d", Math.round(d) + "ms");
      el.classList.add("rv-in");
      if (countOn) (el.matches(COUNT) ? [el] : el.querySelectorAll(COUNT)).forEach((c) => countUp(c, d + 60));
      timers.push(setTimeout(() => finish(u), d + (u.kind === "g" ? 1900 : 1300)));
      d = Math.min(d + u.step, 560);
    });
  }
  const inView = (el, vh) => { const r = el.getBoundingClientRect(); return r.width + r.height > 0 && r.bottom > 0 && r.top < vh * 0.92; };

  F.motion = {
    /* entrance: a new page (stagger what is on screen now); otherwise (a re-render of the same page, or a step
     * within a set) what is on screen stays put and only what is further down reveals as it scrolls in. */
    mount(root, { entrance = true, path = "" } = {}) {
      io && io.disconnect(); io = null;
      timers.forEach(clearTimeout); timers = [];
      pendingUnits.clear();
      if (!html.classList.contains("mo")) return;
      const vh = innerHeight;
      const units = collect(root);
      const now = [], later = [];
      units.forEach((u) => (inView(u.el, vh) ? now : later).push(u));   // measured while everything is still visible
      const marked = entrance ? units : later;
      marked.forEach((u) => { u.el.setAttribute("data-rv", u.kind); pendingUnits.add(u); });
      if (!marked.length) return;
      const countOn = !counted.has(path);
      counted.add(path);
      void root.offsetWidth; // commit the hidden state so the reveal transitions run
      if (entrance) reveal(now, countOn);
      io = new IntersectionObserver((ents) => {
        const hit = ents.filter((e) => e.isIntersecting).map((e) => [...pendingUnits].find((u) => u.el === e.target)).filter(Boolean);
        if (hit.length) reveal(hit.sort((a, b) => (a.el.compareDocumentPosition(b.el) & 4 ? -1 : 1)), countOn);
      }, { rootMargin: "0px 0px -8% 0px" });
      later.forEach((u) => io.observe(u.el));
      // belt and braces: whatever is on screen and still hidden after a moment is shown
      const sweep = () => { const vis = [...pendingUnits].filter((u) => inView(u.el, innerHeight)); if (vis.length) reveal(vis, countOn); };
      timers.push(setTimeout(sweep, 2200));
    },
    revealAll() { reveal([...pendingUnits], false); },
  };
  window.addEventListener("beforeprint", () => F.motion.revealAll());

  /* restart a short "new content" animation on an element whose content was just replaced */
  F.swapIn = (el) => {
    if (!el || !html.classList.contains("mo")) return;
    el.classList.remove("sw-in"); void el.offsetWidth; el.classList.add("sw-in");
  };

  /* figures that draw once when they scroll into view: [data-draw] gets .dr-in (curve wipes, marks fade up) */
  F.drawIn = (root) => {
    const els = root.querySelectorAll("[data-draw]");
    if (!els.length) return;
    if (!html.classList.contains("mo")) { els.forEach((e) => e.classList.add("dr-in")); return; }
    els.forEach((el) => el.classList.add("dr-wait"));
    const o = new IntersectionObserver((en) => en.forEach((e) => {
      if (!e.isIntersecting) return;
      o.unobserve(e.target);
      const el = e.target;
      requestAnimationFrame(() => { el.classList.add("dr-in"); el.classList.remove("dr-wait"); });
    }), { threshold: 0.25 });
    els.forEach((el) => o.observe(el));
    F.onLeave(() => o.disconnect());
    // fallback: never leave a figure undrawn
    const tm = setTimeout(() => els.forEach((el) => { if (el.classList.contains("dr-wait") && inView(el, innerHeight)) { el.classList.add("dr-in"); el.classList.remove("dr-wait"); } }), 2500);
    F.onLeave(() => clearTimeout(tm));
  };
})();
