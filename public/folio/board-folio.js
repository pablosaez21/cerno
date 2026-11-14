/* Cerno-Folio board. Fork of shared/board.js (same API) plus:
 *   - pencil(spec, {draw})  : red-pencil marginalia (hand-drawn ring, wobbly arrow) and ink arrows, drawn in with stroke-dashoffset
 *   - input({ turn, dests(sq)->[sq], onMove(from,to) })  : drag-to-move and tap-tap with legal dots
 *   - coordinates are drawn OUTSIDE the board by the diagram frame (see app), so opts.coords defaults to false
 */
(function () {
  const FILES = "abcdefgh";
  const NS = "http://www.w3.org/2000/svg";
  const css = `
.cb{position:relative;width:100%;aspect-ratio:1;user-select:none;-webkit-user-select:none;touch-action:manipulation;overflow:visible;container-type:inline-size}
.cb-sq{position:absolute;width:12.5%;height:12.5%}
.cb-sq.l{background:var(--cb-light,#eee)}.cb-sq.d{background:var(--cb-dark,#999)}
.cb-hl{position:absolute;width:12.5%;height:12.5%;pointer-events:none}
.cb-hl-last{background:var(--cb-hl-last,rgba(0,0,0,.08))}
.cb-hl-bad{background:var(--cb-hl-bad,rgba(200,40,30,.16))}
.cb-hl-sel{background:var(--cb-hl-sel,rgba(0,0,0,.14))}
.cb-hl-dot{background:radial-gradient(circle,var(--cb-hl-dot,rgba(0,0,0,.28)) 15%,transparent 17%)}
.cb-hl-cap{background:radial-gradient(circle,transparent 62%,var(--cb-hl-dot,rgba(0,0,0,.28)) 64%,var(--cb-hl-dot,rgba(0,0,0,.28)) 70%,transparent 72%)}
.cb-pc{position:absolute;left:0;top:0;width:12.5%;height:12.5%;background-size:100% 100%;will-change:transform;pointer-events:none;
  transition:transform var(--cb-anim,220ms) cubic-bezier(.77,0,.175,1),opacity 160ms ease}
.cb-pc.cb-fade{opacity:0}
.cb-pc.cb-drag{transition:none;z-index:5;filter:drop-shadow(0 6px 6px rgba(0,0,0,.18))}
.cb-svg,.cb-pencil{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible}
.cb-pencil path,.cb-pencil line{fill:none;stroke-linecap:round;stroke-linejoin:round}
.cb-pencil .pd{stroke-dasharray:1;stroke-dashoffset:0}
.cb-pencil.draw .pd{stroke-dashoffset:1;animation:cbDraw var(--d,420ms) cubic-bezier(.45,.05,.3,1) forwards;animation-delay:var(--dl,0ms)}
.cb-pencil.draw .pf{opacity:0;animation:cbFade 220ms ease-out forwards;animation-delay:var(--dl,0ms)}
@keyframes cbDraw{to{stroke-dashoffset:0}}
@keyframes cbFade{to{opacity:1}}
.cb.cb-input{touch-action:none;cursor:pointer}
@media (prefers-reduced-motion:reduce){.cb-pencil.draw .pd{animation:none;stroke-dashoffset:0}.cb-pencil.draw .pf{animation:none;opacity:1}.cb-pc{transition:opacity 120ms}}
html.rm .cb-pencil.draw .pd{animation:none;stroke-dashoffset:0}html.rm .cb-pencil.draw .pf{animation:none;opacity:1}html.rm .cb-pc{transition:opacity 120ms}
`;
  if (!document.getElementById("cbf-style")) {
    const s = document.createElement("style");
    s.id = "cbf-style";
    s.textContent = css;
    document.head.appendChild(s);
  }

  function parseFen(fen) {
    const [placement, turn, castling, ep] = fen.split(" ");
    const map = {};
    placement.split("/").forEach((row, r) => {
      let f = 0;
      for (const ch of row) {
        if (/\d/.test(ch)) f += +ch;
        else { map[FILES[f] + (8 - r)] = (ch === ch.toUpperCase() ? "w" : "b") + ch.toUpperCase(); f++; }
      }
    });
    return { map, turn, castling, ep };
  }
  function toFen(map, turn, castling = "-", ep = "-") {
    const rows = [];
    for (let r = 8; r >= 1; r--) {
      let row = "", empty = 0;
      for (let f = 0; f < 8; f++) {
        const p = map[FILES[f] + r];
        if (!p) { empty++; continue; }
        if (empty) { row += empty; empty = 0; }
        row += p[0] === "w" ? p[1] : p[1].toLowerCase();
      }
      if (empty) row += empty;
      rows.push(row);
    }
    return `${rows.join("/")} ${turn} ${castling || "-"} ${ep || "-"} 0 1`;
  }
  function applyUci(fen, uci) {
    const { map, turn } = parseFen(fen);
    const from = uci.slice(0, 2), to = uci.slice(2, 4), promo = uci[4];
    const p = map[from];
    if (!p) return fen;
    const next = { ...map };
    delete next[from];
    if (p[1] === "P" && from[0] !== to[0] && !map[to]) delete next[to[0] + from[1]];
    if (p[1] === "K" && Math.abs(FILES.indexOf(from[0]) - FILES.indexOf(to[0])) === 2) {
      const rank = from[1];
      if (to[0] === "g") { next["f" + rank] = next["h" + rank]; delete next["h" + rank]; }
      else { next["d" + rank] = next["a" + rank]; delete next["a" + rank]; }
    }
    next[to] = promo ? p[0] + promo.toUpperCase() : p;
    return toFen(next, turn === "w" ? "b" : "w");
  }

  // deterministic noise so the same diagram is always drawn by "the same hand"
  function rng(seedStr) {
    let h = 2166136261;
    for (let i = 0; i < seedStr.length; i++) { h ^= seedStr.charCodeAt(i); h = Math.imul(h, 16777619); }
    return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 10000) / 10000; };
  }
  function catmull(pts) {
    let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += `C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
    }
    return d;
  }

  class CernoBoard {
    constructor(el, opts = {}) {
      this.el = el;
      this.opts = Object.assign({ pieces: "pieces/cburnett", orientation: "white", coords: false, animMs: 220 }, opts);
      this.orientation = this.opts.orientation;
      this.map = {}; this.fen = null; this.pieceEls = {};
      el.classList.add("cb");
      el.style.setProperty("--cb-anim", this.opts.animMs + "ms");
      this.sqLayer = document.createElement("div");
      this.hlLayer = document.createElement("div");
      this.pcLayer = document.createElement("div");
      this.svg = document.createElementNS(NS, "svg");
      this.svg.setAttribute("viewBox", "0 0 800 800");
      this.svg.setAttribute("class", "cb-svg");
      this.pen = document.createElementNS(NS, "svg");
      this.pen.setAttribute("viewBox", "0 0 800 800");
      this.pen.setAttribute("class", "cb-pencil");
      this.pen.setAttribute("aria-hidden", "true");
      el.append(this.sqLayer, this.hlLayer, this.pcLayer, this.svg, this.pen);
      el.addEventListener("click", (e) => {
        if (!this.onSquareClick || this._input) return;
        this.onSquareClick(this.squareFromPoint(e.clientX, e.clientY));
      });
      this._drawSquares();
    }
    squareFromPoint(cx, cy) {
      const r = this.el.getBoundingClientRect();
      const x = Math.floor(((cx - r.left) / r.width) * 8), y = Math.floor(((cy - r.top) / r.height) * 8);
      if (x < 0 || x > 7 || y < 0 || y > 7) return null;
      return this.squareAt(x, y);
    }
    squareAt(x, y) { return this.orientation === "white" ? FILES[x] + (8 - y) : FILES[7 - x] + (y + 1); }
    xy(sq) { const f = FILES.indexOf(sq[0]), r = +sq[1]; return this.orientation === "white" ? [f, 8 - r] : [7 - f, r - 1]; }
    _drawSquares() {
      this.sqLayer.innerHTML = "";
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
        const sq = this.squareAt(x, y);
        const d = document.createElement("div");
        const dark = (FILES.indexOf(sq[0]) + +sq[1]) % 2 === 1; // a1 is dark
        d.className = "cb-sq " + (dark ? "d" : "l");
        d.style.left = x * 12.5 + "%"; d.style.top = y * 12.5 + "%";
        this.sqLayer.appendChild(d);
      }
    }
    _place(el, sq) { const [x, y] = this.xy(sq); el.style.transform = `translate(${x * 100}%, ${y * 100}%)`; }
    _pieceEl(code, sq) {
      const el = document.createElement("div");
      el.className = "cb-pc";
      el.style.backgroundImage = `url(${this.opts.pieces}/${code}.svg)`;
      el.dataset.code = code;
      this._place(el, sq);
      return el;
    }
    setPieces(path) {
      this.opts.pieces = path;
      for (const el of Object.values(this.pieceEls)) el.style.backgroundImage = `url(${path}/${el.dataset.code}.svg)`;
    }
    setFen(fen, { uci, animate = !!uci } = {}) {
      const { map } = parseFen(fen);
      const old = this.pieceEls, next = {}, reuse = new Set();
      if (animate && uci) {
        const from = uci.slice(0, 2), to = uci.slice(2, 4);
        if (old[from]) { next[to] = old[from]; reuse.add(from); }
        const p = this.map[from];
        if (p && p[1] === "K" && Math.abs(FILES.indexOf(from[0]) - FILES.indexOf(to[0])) === 2) {
          const r = from[1], [rf, rt] = to[0] === "g" ? ["h" + r, "f" + r] : ["a" + r, "d" + r];
          if (old[rf]) { next[rt] = old[rf]; reuse.add(rf); }
        }
      }
      for (const [sq, code] of Object.entries(map)) {
        if (next[sq]) continue;
        if (old[sq] && old[sq].dataset.code === code && !reuse.has(sq)) { next[sq] = old[sq]; reuse.add(sq); }
      }
      for (const [sq, el] of Object.entries(old)) {
        if (reuse.has(sq)) continue;
        if (animate) { el.classList.add("cb-fade"); setTimeout(() => el.remove(), 180); } else el.remove();
      }
      for (const [sq, code] of Object.entries(map)) {
        let el = next[sq];
        if (!el) {
          el = this._pieceEl(code, sq);
          if (animate) { el.classList.add("cb-fade"); requestAnimationFrame(() => el.classList.remove("cb-fade")); }
          this.pcLayer.appendChild(el);
          next[sq] = el;
        } else {
          if (el.dataset.code !== code) { el.dataset.code = code; el.style.backgroundImage = `url(${this.opts.pieces}/${code}.svg)`; }
          el.classList.remove("cb-drag");
          this._place(el, sq);
        }
      }
      this.pieceEls = next; this.map = map; this.fen = fen;
      return this;
    }
    move(uci) { const fen = applyUci(this.fen, uci); this.setFen(fen, { uci }); return fen; }
    async playLine(fen, ucis, { stepMs = 650, startDelay = 250, onStep, fens } = {}) {
      this.setFen(fen);
      const tok = (this._lineToken = Symbol());
      await sleep(startDelay);
      let cur = fen;
      for (let i = 0; i < ucis.length; i++) {
        if (tok !== this._lineToken) return false;
        cur = fens ? fens[i] : applyUci(cur, ucis[i]);
        this.setFen(cur, { uci: ucis[i] });
        this.highlight({ [ucis[i].slice(0, 2)]: "last", [ucis[i].slice(2, 4)]: "last" });
        onStep && onStep(i, ucis[i]);
        await sleep(stepMs);
      }
      return tok === this._lineToken;
    }
    stopLine() { this._lineToken = null; }
    highlight(obj = {}) {
      this.hlLayer.innerHTML = "";
      for (const [sq, names] of Object.entries(obj)) {
        if (!sq || sq === "null") continue;
        for (const n of String(names).split(" ")) {
          const d = document.createElement("div");
          d.className = "cb-hl cb-hl-" + n;
          const [x, y] = this.xy(sq);
          d.style.left = x * 12.5 + "%"; d.style.top = y * 12.5 + "%";
          this.hlLayer.appendChild(d);
        }
      }
      this._hl = obj;
      return this;
    }
    arrows(list = []) { // kept for API compatibility: plain arrows
      this.svg.innerHTML = "";
      list.forEach((a) => this._inkArrow(this.svg, a.from, a.to, a.color || "var(--ink)", false, 0));
      return this;
    }
    _c(sq) { const [x, y] = this.xy(sq); return [x * 100 + 50, y * 100 + 50]; }

    /* spec: { rings:[sq], pencil:[{from,to}], ink:[{from,to,dashed}], glyph:{sq,text}, seed } */
    pencil(spec = {}, { draw = false } = {}) {
      this._pencil = spec;
      const g = this.pen;
      g.innerHTML = "";
      g.classList.remove("draw");
      const R = rng((spec.seed || "") + (this.fen || "") + this.orientation);
      let t = 80;
      for (const a of spec.ink || []) { this._inkArrow(g, a.from, a.to, "var(--pen-ink)", draw, t, a.dashed); t += 160; }
      for (const sq of spec.rings || []) { this._ring(g, sq, R, t); t += 260; }
      for (const a of spec.pencil || []) { this._pencilArrow(g, a.from, a.to, R, t); t += 300; }
      if (spec.glyph) this._glyph(g, spec.glyph.sq, spec.glyph.text, t);
      if (draw) { void g.getBoundingClientRect(); g.classList.add("draw"); }
      return this;
    }
    redrawPencil(draw = true) { if (this._pencil) this.pencil(this._pencil, { draw }); }
    _ring(g, sq, R, delay) {
      const [cx, cy] = this._c(sq);
      const start = R() * Math.PI * 2, sweep = Math.PI * 2 * (1.1 + R() * 0.12);
      const rx = 45 + R() * 5, ry = 41 + R() * 5, tilt = (R() - 0.5) * 0.5;
      const pts = [];
      for (let i = 0; i <= 40; i++) {
        const a = start + (sweep * i) / 40;
        const wob = 1 + Math.sin(a * 3 + R()) * 0.035 + (i / 40) * 0.06;
        const x = Math.cos(a) * rx * wob, y = Math.sin(a) * ry * wob;
        pts.push([cx + x * Math.cos(tilt) - y * Math.sin(tilt), cy + x * Math.sin(tilt) + y * Math.cos(tilt)]);
      }
      const p = document.createElementNS(NS, "path");
      p.setAttribute("d", catmull(pts));
      p.setAttribute("pathLength", "1");
      p.setAttribute("class", "pd");
      p.style.cssText = `stroke:var(--pen-red);stroke-width:6.5;opacity:.92;--dl:${delay}ms;--d:520ms`;
      g.appendChild(p);
    }
    _pencilArrow(g, from, to, R, delay) {
      const [x1, y1] = this._c(from), [x2, y2] = this._c(to);
      const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
      const ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
      const bend = (R() - 0.5) * 0.16 * len + 6;
      const k0 = len < 150 ? 0.45 : 1, sx = x1 + ux * 22 * k0, sy = y1 + uy * 22 * k0, ex = x2 - ux * 30 * k0, ey = y2 - uy * 30 * k0;
      const mx = (sx + ex) / 2 + nx * bend, my = (sy + ey) / 2 + ny * bend;
      const p = document.createElementNS(NS, "path");
      p.setAttribute("d", `M${sx.toFixed(1)},${sy.toFixed(1)} Q${mx.toFixed(1)},${my.toFixed(1)} ${ex.toFixed(1)},${ey.toFixed(1)}`);
      p.setAttribute("pathLength", "1");
      p.setAttribute("class", "pd");
      p.style.cssText = `stroke:var(--pen-red);stroke-width:7;opacity:.92;--dl:${delay}ms;--d:380ms`;
      g.appendChild(p);
      // arrow head: tangent at end of quadratic = end - control
      const tx = ex - mx, ty = ey - my, tl = Math.hypot(tx, ty), hx = tx / tl, hy = ty / tl;
      const head = (len < 150 ? 22 : 30) + R() * 6;
      for (const s of [-1, 1]) {
        const ang = (0.5 + R() * 0.12) * s;
        const bx = -(hx * Math.cos(ang) - hy * Math.sin(ang)) * head, by = -(hx * Math.sin(ang) + hy * Math.cos(ang)) * head;
        const h = document.createElementNS(NS, "path");
        h.setAttribute("d", `M${(ex + bx).toFixed(1)},${(ey + by).toFixed(1)} L${ex.toFixed(1)},${ey.toFixed(1)}`);
        h.setAttribute("pathLength", "1");
        h.setAttribute("class", "pd");
        h.style.cssText = `stroke:var(--pen-red);stroke-width:7;opacity:.92;--dl:${delay + 360 + (s > 0 ? 90 : 0)}ms;--d:140ms`;
        g.appendChild(h);
      }
    }
    maia(list = []) { // Maia's likeliest moves: ink arrows weighted by share of players
      const g = this.pen; g.innerHTML = ""; g.classList.remove("draw"); this._pencil = null;
      list.forEach((a) => this._inkArrow(g, a.from, a.to, a.color, false, 0, false, a.w, a.o));
      return this;
    }
    _inkArrow(g, from, to, color, draw, delay, dashed, wOver, oOver) {
      const [x1, y1] = this._c(from), [x2, y2] = this._c(to);
      const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len;
      const ex = x2 - ux * 36, ey = y2 - uy * 36;
      const l = document.createElementNS(NS, "path");
      l.setAttribute("d", `M${(x1 + ux * 14).toFixed(1)},${(y1 + uy * 14).toFixed(1)} L${ex.toFixed(1)},${ey.toFixed(1)}`);
      l.setAttribute("pathLength", "1");
      l.setAttribute("class", dashed ? "" : "pd");
      l.style.cssText = `stroke:${color};stroke-width:${wOver || (dashed ? 6 : 11)};opacity:${oOver || (dashed ? 0.55 : 0.82)};--dl:${delay}ms;--d:300ms;stroke-linecap:butt${dashed ? ";stroke-dasharray:14 12" : ""}`;
      g.appendChild(l);
      const hx = x2 - ux * 8, hy = y2 - uy * 8, w = wOver ? 10 + wOver : 22, back = wOver ? 20 + wOver : 34;
      const poly = document.createElementNS(NS, "path");
      const bx = hx - ux * back, by = hy - uy * back;
      poly.setAttribute("d", `M${hx.toFixed(1)},${hy.toFixed(1)} L${(bx - uy * w).toFixed(1)},${(by + ux * w).toFixed(1)} L${(bx + uy * w).toFixed(1)},${(by - ux * w).toFixed(1)} Z`);
      poly.setAttribute("class", "pf");
      poly.style.cssText = `fill:${color};stroke:none;opacity:${oOver || (dashed ? 0.55 : 0.82)};--dl:${delay + 260}ms`;
      g.appendChild(poly);
    }
    _glyph(g, sq, text, delay) {
      const [x, y] = this.xy(sq);
      const cx = x * 100 + 86, cy = y * 100 + 14;
      const gg = document.createElementNS(NS, "g");
      gg.setAttribute("class", "pf");
      gg.style.cssText = `--dl:${delay}ms`;
      const c = document.createElementNS(NS, "circle");
      c.setAttribute("cx", Math.min(cx, 776)); c.setAttribute("cy", Math.max(cy, 24)); c.setAttribute("r", 23);
      c.style.cssText = "fill:var(--pen-red);stroke:var(--paper);stroke-width:4";
      const tx = document.createElementNS(NS, "text");
      tx.setAttribute("x", Math.min(cx, 776)); tx.setAttribute("y", Math.max(cy, 24) + 8.5);
      tx.setAttribute("text-anchor", "middle");
      tx.style.cssText = "fill:var(--paper);font:700 25px var(--serif);letter-spacing:-1px";
      tx.textContent = text;
      gg.append(c, tx);
      g.appendChild(gg);
    }

    /* Interaction: drag or tap-tap. dests(sq) -> array of target squares; onMove(from,to) */
    input(cfg) {
      this._input = cfg;
      this.el.classList.toggle("cb-input", !!cfg);
      if (!cfg) return this;
      if (this._bound) return this;
      this._bound = true;
      let drag = null;
      const down = (e) => {
        if (!this._input || this._input.disabled) return;
        const sq = this.squareFromPoint(e.clientX, e.clientY);
        if (!sq) return;
        const pc = this.map[sq];
        if (this._sel && this._sel !== sq && (this._dests || []).includes(sq)) {
          const from = this._sel; this._select(null); this._input.onMove(from, sq); return;
        }
        if (pc && pc[0] === this._input.turn) {
          this._select(sq);
          const el = this.pieceEls[sq];
          if (el) {
            drag = { sq, el, id: e.pointerId, moved: false, x0: e.clientX, y0: e.clientY };
            this.el.setPointerCapture && this.el.setPointerCapture(e.pointerId);
          }
        } else this._select(null);
      };
      const move = (e) => {
        if (!drag || e.pointerId !== drag.id) return;
        if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 6) return;
        drag.moved = true;
        const r = this.el.getBoundingClientRect(), s = r.width / 8;
        drag.el.classList.add("cb-drag");
        drag.el.style.transform = `translate(${e.clientX - r.left - s / 2}px, ${e.clientY - r.top - s / 2}px) scale(1.08)`;
      };
      const up = (e) => {
        if (!drag || e.pointerId !== drag.id) return;
        const d = drag; drag = null;
        if (!d.moved) return;
        const to = this.squareFromPoint(e.clientX, e.clientY);
        d.el.classList.remove("cb-drag");
        if (to && to !== d.sq && (this._dests || []).includes(to)) {
          this._select(null);
          // place at the target immediately (no animation from the finger)
          d.el.style.transition = "none"; this._place(d.el, to); void d.el.offsetWidth; d.el.style.transition = "";
          this._input.onMove(d.sq, to);
        } else this._place(d.el, d.sq);
      };
      this.el.addEventListener("pointerdown", down);
      this.el.addEventListener("pointermove", move);
      this.el.addEventListener("pointerup", up);
      this.el.addEventListener("pointercancel", up);
      return this;
    }
    _select(sq) {
      this._sel = sq;
      this._dests = sq ? this._input.dests(sq) : [];
      const hl = Object.assign({}, this._baseHl || {});
      if (sq) {
        hl[sq] = (hl[sq] ? hl[sq] + " " : "") + "sel";
        for (const d of this._dests) hl[d] = (hl[d] ? hl[d] + " " : "") + (this.map[d] ? "cap" : "dot");
      }
      this.highlight(hl);
    }
    setBaseHighlight(obj) { this._baseHl = obj; this.highlight(obj); }
    setOrientation(o) {
      if (o === this.orientation) return this;
      this.orientation = o;
      this._drawSquares();
      for (const [sq, el] of Object.entries(this.pieceEls)) this._place(el, sq);
      this.highlight(this._hl || {});
      this.svg.innerHTML = "";
      this.redrawPencil(false);
      return this;
    }
    flip() { return this.setOrientation(this.orientation === "white" ? "black" : "white"); }
    destroy() { this.stopLine(); this.el.innerHTML = ""; this.el.classList.remove("cb"); }
  }
  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
  CernoBoard.parseFen = parseFen;
  CernoBoard.applyUci = applyUci;
  window.CernoBoard = CernoBoard;
})();
