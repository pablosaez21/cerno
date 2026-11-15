/* Cerno: export the study. Two formats from the same pages the reader sees:
 *   PDF      : the book typeset on A4 landscape sheets (one sheet = one desktop spread), with a cover,
 *              a contents page with page numbers, a running head ("Cerno") and page numbers. The browser's
 *              print dialog saves it ("Save as PDF"); we paginate ourselves so every browser gets the same pages.
 *   Markdown : the same chapters as plain text for AI agents: headings, prose, tables, and every diagram as FEN.
 * Nothing here computes a number: it re-renders the routes and moves their DOM onto sheets. */
(function () {
  const F = window.F, M = F.M, D = M.D, I = window.FOLIO_I18N;
  const t = F.t, esc = F.esc;
  const es = () => F.state.lang === "es";

  Object.assign(I.en, {
    "xp.open": "Export", "xp.title": "Export the study",
    "xp.pdf": "PDF",
    "xp.md": "Markdown",
    "xp.busy": (p) => `Typesetting… ${p.n} pages`, "xp.mdDone": "Markdown copied and downloaded",
    "xp.close": "Close", "xp.page": (p) => `${p.n} / ${p.of}`,
  });
  Object.assign(I.es, {
    "xp.open": "Exportar", "xp.title": "Exportar el estudio",
    "xp.pdf": "PDF",
    "xp.md": "Markdown",
    "xp.busy": (p) => `Maquetando… ${p.n} páginas`, "xp.mdDone": "Markdown copiado y descargado",
    "xp.close": "Cerrar", "xp.page": (p) => `${p.n} / ${p.of}`,
  });

  const strip = (s) => String(s || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  const isoDay = (ms) => new Date(ms || Date.now()).toISOString().slice(0, 10);
  const fileBase = () => `cerno-${(M.user || "study").replace(/[^\w.-]+/g, "_")}-${isoDay(D.meta && D.meta.builtAt)}`;

  /* ---------- the book's parts, in reading order ---------- */
  function parts() {
    const list = [{ path: "/preface", no: "", label: t("toc.preface") }];
    for (const c of M.chapters) list.push({ path: "/chapter/" + c.area, no: String(c.no), label: F.catName(c.area), area: c.area });
    if (M.sections.profile || D.profile) list.push({ path: "/level", no: "N", label: t("lv.title"), area: "profile" });
    list.push({ path: "/clock", no: "I", label: `${t("interlude")}: ${t("clk.title").toLowerCase()}`, area: "clock" });
    list.push({ path: "/appendix", no: "A", label: t("toc.appA", { n: M.N }) });
    list.push({ path: "/method", no: "B", label: t("toc.appB") });
    return list;
  }

  /* Renders one route into `host` the way F.render does (boards, figure hooks), without its event wiring.
   * Returns the route's meta and the diagrams it drew ({id -> options}). */
  function renderRoute(path, host) {
    let r = null;
    F.pending = {}; F.diaCount = 0; F.figCount = 0; F._after = [];
    for (const [re, fn] of F.routes) { const m = path.match(re); if (m) { r = fn(...m.slice(1)); break; } }
    if (!r || !r.html) return null;
    const box = document.createElement("div");
    box.className = "pv-flow";
    box.innerHTML = r.html;
    host.appendChild(box);
    const dias = F.pending;
    F.mountAll(box);
    F.flushAfter();
    // still pages: pencil marks drawn, figures fully drawn, explanations open, nothing waiting to rise
    box.querySelectorAll("[data-dia]").forEach((el) => { const b = el._board; if (b && b._pencil) b.pencil(b._pencil, { draw: false }); });
    box.querySelectorAll("[data-draw]").forEach((el) => { el.classList.add("dr-in"); el.classList.remove("dr-wait"); });
    // the "(?)" explanations are printed in full, without their toggle
    box.querySelectorAll("details.why").forEach((d) => { const b = d.querySelector(".why-b"); if (b) d.replaceWith(b); else d.remove(); });
    box.querySelectorAll("details").forEach((d) => (d.open = true));
    // what only works on screen goes, and so does a row left with nothing to show (the chapter's prev/next links)
    box.querySelectorAll("[data-gprev], .btnrow, .more, .paren, .dia-tools, .dia-line, .scrubhint").forEach((el) => el.remove());
    box.querySelectorAll(".row").forEach((row) => { if (!row.textContent.trim() && !row.querySelector("svg, .dia, img, .cell")) row.remove(); });
    return { meta: r, box, dias };
  }
  // F.pending and the counters belong to the page on screen: keep them across an export.
  function keepScreen(fn) {
    const saved = { pending: F.pending, dia: F.diaCount, fig: F.figCount, after: F._after };
    try { return fn(); } finally { F.pending = saved.pending; F.diaCount = saved.dia; F.figCount = saved.fig; F._after = saved.after; }
  }

  /* =============== PDF =============== */
  // Elements that never split across sheets.
  const ATOMIC = "p, h1, h2, h3, h4, figure, svg, img, tr, .split, .note, .figs, .grid-wrap, .chno, .colhead, .g-key, .strip > a, .glist > li, li.sub, .pref > li, aside, details, .state, hr, .hatchrule";
  // Headings and labels stay with what follows them.
  const KEEP = "h1, h2, h3, h4, .kicker, .chno";
  const splittable = (el) => {
    if (el.matches(ATOMIC) || !el.firstElementChild) return false;
    if (el.matches(".toc, .strip") && el.children.length <= 10) return false; // a short list or strip moves whole
    for (const n of el.childNodes) if (n.nodeType === 3 && n.textContent.trim()) return false;
    return true;
  };
  const shallow = (el) => {
    const c = el.cloneNode(false);
    if (el.tagName === "TABLE") { const th = el.querySelector(":scope > thead"); if (th) c.appendChild(th.cloneNode(true)); }
    return c;
  };
  // In a two-column row the diagram column goes first, so it stays beside the start of the text.
  const kids = (el) => {
    const k = [...el.children].filter((c) => c.tagName !== "THEAD" || el.tagName !== "TABLE");
    return el.classList.contains("row") ? k.sort((a, b) => (b.classList.contains("r") ? 1 : 0) - (a.classList.contains("r") ? 1 : 0)) : k;
  };

  function Book(root) {
    const pages = [];
    let body = null, placed = 0, head = "";
    const path = []; // [{src, el}] the open containers on the current sheet, outermost first
    const anchors = {}; // element id -> page number
    const over = () => body.scrollHeight > body.clientHeight + 1;
    function sheet(kind) {
      const s = document.createElement("section");
      s.className = "pv-page" + (kind ? " pv-" + kind : "");
      s.id = "pv-p" + (pages.length + 1);
      s.innerHTML = kind === "cover" ? `<div class="pv-body"></div>` : `<header class="pv-head"><span class="pv-org">${F.mark()}Cerno</span><span class="pv-run">${esc(head)}</span></header><div class="pv-body"></div><footer class="pv-foot"><span>${esc(M.user)} · ${F.date(D.meta && D.meta.builtAt ? D.meta.builtAt : Date.now())}</span><span class="pv-no"></span></footer>`;
      root.appendChild(s);
      pages.push(s);
      body = s.querySelector(".pv-body");
      placed = 0;
      return s;
    }
    // a new sheet, with the open containers re-created (ids only on their first sheet)
    function turn() {
      // a container opened at the foot of the last sheet that got nothing stays off that sheet
      for (let i = path.length - 1; i >= 0; i--) { const el = path[i].el; if (![...el.children].some((c) => c.tagName !== "THEAD")) el.remove(); }
      sheet();
      let parent = body;
      for (const p of path) { const c = shallow(p.src); c.removeAttribute("id"); c.classList.add("pv-cont"); parent.appendChild(c); p.el = c; parent = c; }
    }
    const container = () => (path.length ? path[path.length - 1].el : body);
    function mark(node) { if (node.id && !(node.id in anchors)) anchors[node.id] = pages.length; }
    // would `node` end a sheet with nothing of what follows it? (a probe of the next element, or of its first part)
    function orphan(next, parent) {
      while (next && getComputedStyle(next).display === "none") next = next.nextElementSibling;
      if (!next) return false;
      const probe = (splittable(next) && next.firstElementChild ? next.firstElementChild : next).cloneNode(true);
      parent.appendChild(probe);
      const o = over();
      probe.remove();
      return o;
    }
    function place(node) {
      const parent = container();
      const srcNext = node.nextElementSibling; // read before the node leaves its source
      parent.appendChild(node);
      if (!over() && placed && node.matches(KEEP) && orphan(srcNext, parent)) { node.remove(); turn(); container().appendChild(node); placed++; mark(node); return; }
      if (!over()) { placed++; mark(node); return; }
      node.remove();
      if (splittable(node)) {
        const shell = shallow(node);
        parent.appendChild(shell);
        if (over()) { shell.remove(); if (placed) turn(); container().appendChild(shell); }
        mark(node);
        path.push({ src: node, el: shell });
        for (const k of kids(node)) place(k);
        path.pop();
        return;
      }
      if (placed) { turn(); container().appendChild(node); }
      else parent.appendChild(node); // taller than a sheet: it keeps its own sheet
      placed++; mark(node);
    }
    return {
      pages, anchors,
      cover(html) { sheet("cover"); body.innerHTML = html; },
      flow(el, runningHead) { head = runningHead; path.length = 0; sheet(); place(el); },
    };
  }

  function coverHtml() {
    const rec = D.sample.results;
    const tc = t("tc.line", D.sample.byTimeClass);
    return `<div class="pv-cov">
      <div class="pv-cov-l">
        <p class="wm-big">${F.mark("big")}Cerno</p>
        <h1 class="title">${t("brand.sub", { n: M.N, user: `<em>${esc(M.user)}</em>` })}</h1>
        <p class="meta">${t("toc.meta", { n: M.N, from: F.date(D.sample.from), to: F.date(D.sample.to), tc })}</p>
        <p class="meta num">${t("record", { w: rec.win, d: rec.draw, l: rec.loss })}</p>
      </div>
      <div class="pv-cov-r"><div class="grid-wrap big">${F.gameGrid({})}</div>${F.gridLegend()}</div>
      <p class="pv-cov-foot"><span>${F.date(D.meta && D.meta.builtAt ? D.meta.builtAt : Date.now())}</span><span>cerno</span></p>
    </div>`;
  }

  // The contents page: parts and their sections, with page numbers filled in once the book is laid out.
  function contentsHtml(list) {
    const subs = (part) => {
      if (!part.area || part.area === "profile") return [];
      return (M.sections[part.area] || []).filter((f) => f.kind !== "repeated_mistake").map((f) => ({ id: "s-" + M.sectionNo[f.id], no: M.sectionNo[f.id], label: F.findingTitle(f) }));
    };
    const line = (cls, href, no, label, key) => `<li class="${cls}"><a class="tl" href="#${href}"><span class="no">${no}</span><span class="t">${label}</span><span class="ld"></span><span class="v" data-pg="${key}">00</span></a>`;
    return `<div class="page pv-toc"><h1 class="title">${t("toc.title")}</h1>
      <ul class="toc">${list.map((p, i) => `${line("ch", "pv-part" + i, p.no, p.label, "part" + i)}${subs(p).length ? `<ul class="toc">${subs(p).map((s) => `${line("sub", "pv-" + s.id, s.no, s.label, s.id)}</li>`).join("")}</ul>` : ""}</li>`).join("")}</ul></div>`;
  }

  let building = false;
  async function buildPdf(progress) {
    const old = document.getElementById("pv-book");
    if (old) old.remove();
    const root = document.createElement("div");
    root.id = "pv-book";
    document.body.appendChild(root);
    const stage = document.createElement("div");
    stage.className = "pv-stage";
    root.appendChild(stage);
    const book = Book(root);
    const list = parts();
    book.cover(coverHtml());
    // contents: laid out like any part (it may take two sheets)
    const toc = document.createElement("div");
    toc.innerHTML = contentsHtml(list);
    book.flow(toc.firstElementChild, t("toc.title"));
    const starts = [];
    for (let i = 0; i < list.length; i++) {
      const r = keepScreen(() => renderRoute(list[i].path, stage));
      if (!r) continue;
      starts[i] = book.pages.length + 1;
      book.flow(r.box, strip(r.meta.where) || list[i].label);
      progress(book.pages.length);
      await new Promise((res) => requestAnimationFrame(() => res()));
    }
    stage.remove();
    const total = book.pages.length;
    book.pages.forEach((p, i) => { const no = p.querySelector(".pv-no"); if (no) no.textContent = t("xp.page", { n: i + 1, of: total }); });
    // page numbers in the contents, and anchors for its links (the PDF keeps them)
    list.forEach((p, i) => {
      const v = root.querySelector(`[data-pg="part${i}"]`);
      if (!starts[i]) { v && v.closest("li").remove(); return; }
      if (v) v.textContent = starts[i];
      const pg = book.pages[starts[i] - 1]; if (pg) pg.setAttribute("data-part", i);
      const a = document.createElement("span"); a.id = "pv-part" + i; pg && pg.prepend(a);
    });
    root.querySelectorAll("[data-pg^='s-']").forEach((v) => {
      const id = v.dataset.pg, pg = book.anchors[id];
      if (!pg) { v.textContent = ""; return; }
      v.textContent = pg;
      const a = document.createElement("span"); a.id = "pv-" + id; book.pages[pg - 1].prepend(a);
    });
    return total;
  }

  async function whenReady(root) {
    try { await document.fonts.ready; } catch (e) {}
    const urls = new Set();
    root.querySelectorAll(".cb-pc").forEach((el) => { const m = /url\("?([^")]+)"?\)/.exec(el.style.backgroundImage); if (m) urls.add(m[1]); });
    await Promise.all([...urls].map((u) => new Promise((res) => { const im = new Image(); im.onload = im.onerror = () => res(); im.src = u; })));
  }

  async function exportPdf(onProgress) {
    if (building) return;
    building = true;
    // The book carries its own paper colours (styles.css, #pv-book): the page keeps its theme.
    const title = document.title;
    try {
      const n = await buildPdf(onProgress);
      const root = document.getElementById("pv-book");
      await whenReady(root);
      onProgress(n);
      // Cleaned up on "afterprint", or when the print media query stops matching (a second
      // signal for browsers that do not send the event); whichever comes first.
      const mq = window.matchMedia ? window.matchMedia("print") : null;
      let printed = false;
      const onMq = (e) => { if (e.matches) printed = true; else if (printed) done(); };
      const done = () => {
        window.removeEventListener("afterprint", done);
        if (mq && mq.removeEventListener) mq.removeEventListener("change", onMq);
        document.body.classList.remove("pv-printing");
        document.title = title;
        root.remove();
      };
      document.title = fileBase();
      document.body.classList.add("pv-printing");
      window.addEventListener("afterprint", done);
      if (mq && mq.addEventListener) mq.addEventListener("change", onMq);
      window.print();
    } catch (e) {
      document.title = title;
      throw e;
    } finally {
      building = false;
    }
  }

  /* =============== Markdown =============== */
  const SKIP = ".split .keys, .btn, .btnrow, .paren, .dia-tools, .dia-line, .scrubhint, summary, .more, .dia-ranks, .dia-files, .mag, .ld, .gprev, script, style, .vh, [hidden], .pv-skip";
  const BLOCK = /^(P|DIV|SECTION|ASIDE|FIGURE|FIGCAPTION|UL|OL|LI|TABLE|H1|H2|H3|H4|HR|DETAILS|BLOCKQUOTE|PRE)$/;
  const lichess = (fen) => "https://lichess.org/analysis/standard/" + fen.replace(/ /g, "_");
  function inline(n, dias) {
    if (n.nodeType === 3) return n.textContent.replace(/\s+/g, " ");
    if (n.nodeType !== 1 || n.matches(SKIP)) return "";
    if (n.tagName === "SVG" || n.tagName === "svg") return "";
    if (n.getAttribute("role") === "img" && n.getAttribute("aria-label")) return n.classList.contains("fg") ? n.getAttribute("aria-label") : " " + n.getAttribute("aria-label") + " ";
    if (n.getAttribute("aria-hidden") === "true") return "";
    // flex and grid children read as separate words; a block inside a line starts a new clause
    const disp = getComputedStyle(n).display;
    const sep = /flex|grid/.test(disp) ? " " : "";
    const inner = [...n.childNodes].map((c) => {
      const s = inline(c, dias);
      return s && c.nodeType === 1 && !sep && getComputedStyle(c).display === "block" ? " · " + s.trim() : s;
    }).join(sep);
    if (!inner.trim()) return "";
    if (n.tagName === "BR") return "\n";
    if (n.tagName === "SMALL") return " " + inner.trim();
    if (n.classList.contains("fno")) return inner.trim() + ". ";
    if (n.tagName === "B" || n.tagName === "STRONG") return `**${inner.trim()}**`;
    if ((n.tagName === "EM" || n.tagName === "I") && !n.classList.contains("fg")) return `*${inner.trim()}*`;
    if (n.tagName === "A") { const h = n.getAttribute("href") || ""; return /^https?:/.test(h) ? `[${inner.trim()}](${h})` : inner; }
    return inner;
  }
  const clean = (s) => s.replace(/[ \t]+/g, " ").replace(/ ?\n ?/g, "\n").replace(/\s+([.,;:)])/g, "$1").trim();
  function blocks(n, dias, out, depth = 0) {
    if (n.nodeType !== 1 || n.matches(SKIP) || n.getAttribute("aria-hidden") === "true") return;
    const tag = n.tagName;
    const text = () => clean(inline(n, dias));
    if (/^H[1-4]$/.test(tag)) { const s = text(); if (s) out.push("#".repeat(+tag[1] + 1) + " " + s); return; }
    if (n.classList.contains("dia")) {
      const el = n.querySelector("[data-dia]"), o = el && dias[el.dataset.dia], cap = n.querySelector("figcaption");
      const fen = o && (o.fen || (o.p && o.p.fen));
      const lines = [];
      if (cap) lines.push(clean(inline(cap, dias)));
      if (fen) lines.push(`FEN: \`${fen}\` · [${es() ? "tablero" : "board"}](${lichess(fen)})`);
      if (lines.length) out.push(lines.map((l) => "> " + l).join("\n>\n"));
      return;
    }
    if (n.getAttribute("role") === "img" && n.getAttribute("aria-label")) { out.push(clean(n.getAttribute("aria-label"))); return; }
    if (n.classList.contains("strip")) {
      const items = [...n.children].map((c) => {
        const el = c.querySelector("[data-dia]"), o = el && dias[el.dataset.dia], fen = o && (o.fen || (o.p && o.p.fen));
        const cap = clean(inline(c.querySelector(".cap") || c, dias));
        return "- " + [cap, fen && `FEN \`${fen}\``].filter(Boolean).join(" · ");
      });
      if (items.length) out.push(items.join("\n"));
      return;
    }
    if (tag === "TABLE") {
      const rows = [...n.querySelectorAll("tr")].map((tr) => [...tr.children].map((c) => clean(inline(c, dias)).replace(/\|/g, "\\|")));
      if (!rows.length) return;
      const w = Math.max(...rows.map((r) => r.length));
      const pad = (r) => r.concat(Array(w - r.length).fill(""));
      const headRow = n.querySelector("thead tr") ? rows.shift() : Array(w).fill("");
      out.push([pad(headRow), Array(w).fill("---"), ...rows.map(pad)].map((r) => "| " + r.join(" | ") + " |").join("\n"));
      return;
    }
    if (tag === "UL" || tag === "OL") {
      const items = [];
      [...n.children].forEach((li, i) => {
        const own = clean([...li.childNodes].filter((c) => !(c.nodeType === 1 && /^(UL|OL)$/.test(c.tagName))).map((c) => inline(c, dias)).join(" "));
        if (own) items.push("  ".repeat(depth) + (tag === "OL" && !li.querySelector(".rn") ? `${i + 1}. ` : "- ") + own);
        li.querySelectorAll(":scope > ul, :scope > ol").forEach((sub) => { const o2 = []; blocks(sub, dias, o2, depth + 1); items.push(...o2); });
      });
      if (items.length) out.push(items.join("\n"));
      return;
    }
    if (tag === "HR" || n.classList.contains("hatchrule")) return;
    if (tag === "ASIDE" || n.classList.contains("note")) { const s = text(); if (s) out.push("> " + s); return; }
    if (n.classList.contains("fig")) {
      const ft = n.querySelector(".ft"), cap = n.querySelector("figcaption"), ro = n.querySelector(".readout");
      const s = [ft && `**${clean(inline(ft, dias))}.**`, ro && clean(inline(ro, dias)), cap && clean(inline(cap, dias))].filter(Boolean).join(" ");
      if (s) out.push(s);
      return;
    }
    // a block: its inline runs become paragraphs, its block children recurse
    let run = "";
    const flush = () => { const s = clean(run); if (s) out.push(s); run = ""; };
    for (const c of n.childNodes) {
      if (c.nodeType === 1 && BLOCK.test(c.tagName)) { flush(); blocks(c, dias, out, depth); }
      else run += inline(c, dias);
    }
    flush();
  }

  function buildMarkdown() {
    const host = document.createElement("div");
    host.className = "pv-stage pv-md";
    document.body.appendChild(host);
    const rec = D.sample.results;
    const out = [
      `# Cerno · ${strip(t("brand.sub", { n: M.N, user: M.user }))}`,
      [t("toc.meta", { n: M.N, from: F.date(D.sample.from), to: F.date(D.sample.to), tc: t("tc.line", D.sample.byTimeClass) }), t("record", { w: rec.win, d: rec.draw, l: rec.loss })].join(" · "),
    ];
    try {
      keepScreen(() => {
        for (const part of parts()) {
          const r = renderRoute(part.path, host);
          if (!r) continue;
          out.push("---");
          const part1 = [];
          blocks(r.box, r.dias, part1);
          out.push(...part1);
          r.box.remove();
        }
      });
    } finally {
      host.remove();
    }
    return out.join("\n\n").replace(/\n{3,}/g, "\n\n") + "\n";
  }

  async function exportMarkdown() {
    const md = buildMarkdown();
    const url = URL.createObjectURL(new Blob([md], { type: "text/markdown;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = fileBase() + ".md";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    try { await navigator.clipboard.writeText(md); } catch (e) {}
    return md;
  }

  /* =============== The export sheet =============== */
  F.exportBtn = (cls = "") => (M.empty ? "" : `<button type="button" class="${cls}" data-export>${t("xp.open")}</button>`);
  function openSheet() {
    let dlg = document.getElementById("xp-dlg");
    if (dlg) dlg.remove();
    dlg = document.createElement("dialog");
    dlg.id = "xp-dlg";
    dlg.className = "xp";
    dlg.setAttribute("aria-labelledby", "xp-t");
    dlg.innerHTML = `<form method="dialog" class="xp-in">
      <div class="xp-top"><h2 class="h3" id="xp-t">${t("xp.title")}</h2><button class="xp-x" value="close" aria-label="${t("xp.close")}">×</button></div>
      <div class="xp-opts">
        <button type="button" class="xp-o" data-x="pdf">${t("xp.pdf")}</button>
        <button type="button" class="xp-o" data-x="md">${t("xp.md")}</button>
      </div>
      <p class="xp-st small muted" aria-live="polite"></p></form>`;
    document.body.appendChild(dlg);
    const st = dlg.querySelector(".xp-st");
    dlg.addEventListener("close", () => dlg.remove());
    dlg.querySelector('[data-x="pdf"]').addEventListener("click", async (e) => {
      const btns = dlg.querySelectorAll(".xp-o"); btns.forEach((b) => (b.disabled = true));
      st.textContent = t("xp.busy", { n: 0 });
      try {
        await exportPdf((n) => (st.textContent = t("xp.busy", { n })));
        dlg.close();
      } catch (err) {
        st.textContent = String(err && err.message || err);
        btns.forEach((b) => (b.disabled = false));
      }
    });
    dlg.querySelector('[data-x="md"]').addEventListener("click", async () => {
      await exportMarkdown();
      dlg.close();
      F.toast(t("xp.mdDone"));
    });
    dlg.showModal();
  }
  document.addEventListener("click", (e) => { if (e.target.closest("[data-export]")) { e.preventDefault(); openSheet(); } });

  F.exportPdf = exportPdf;
  F.buildPdf = buildPdf;
  F.buildMarkdown = buildMarkdown;
  F.exportMarkdown = exportMarkdown;
})();
