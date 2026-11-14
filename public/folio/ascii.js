/* Cerno D — the last thing on every page: "cerno" lettered with Pablo's own moves (from Criba), and his 100 games
 * as . = #. It dissolves towards the bottom edge. Tap (or hover) sifts it: every move falls through except the
 * characters that belong to mistakes, which stay in the mesh, in red pencil. All generated from the real data. */
(function () {
  const F = window.F, M = F.M, t = F.t;
  const GLYPHS = {
    c: [".######.", "##....##", "##......", "##......", "##......", "##....##", ".######."],
    e: [".######.", "##....##", "##....##", "########", "##......", "##....##", ".######."],
    r: ["##.####.", "###...##", "##......", "##......", "##......", "##......", "##......"],
    n: ["##.####.", "###...##", "##....##", "##....##", "##....##", "##....##", "##....##"],
    o: [".######.", "##....##", "##....##", "##....##", "##....##", "##....##", ".######."],
  };
  const chron = [...M.D.games].reverse();
  const stream = [];
  chron.forEach((g) => {
    const errAt = Object.fromEntries((M.errorsByGame[g.id] || []).map((e) => [e.ply, e.judgement]));
    const first = (g.startFen.split(" ")[1] === "w") === (g.color === "white") ? 0 : 1;
    for (let k = first; k < g.plies.length; k += 2) {
      const j = errAt[k + 1], tag = j === "blunder" || j === "mistake" ? "m" : "";
      for (const ch of g.plies[k].san) stream.push([ch, tag]);
    }
  });
  const cache = {};
  function build(cpp) {
    if (cache[cpp]) return cache[cpp];
    const word = "cerno", rows = 7, W = word.length * 9 + 1, lines = [];
    let si = 0, kept = 0;
    for (let y = -1; y < rows + 1; y++) {
      let ln = "";
      for (let px = 0; px < W; px++) {
        const x = px - 1, li = Math.floor(x / 9), lx = x % 9;
        const on = y >= 0 && y < rows && x >= 0 && li < word.length && lx < 8 && GLYPHS[word[li]][y][lx] === "#";
        for (let k = 0; k < cpp; k++) {
          if (on) {
            const [ch, tag] = stream[si++ % stream.length];
            if (tag) kept++;
            ln += `<span class="c ${tag || "ink"}" style="--fy:${60 + ((si * 37) % 160)}px;--dl:${(px * 13 + y * 41 + k * 7) % 420}ms">${ch}</span>`;
          } else ln += `<span class="c mesh">${(px + y) % 2 === 0 && k === 0 ? "·" : " "}</span>`;
        }
      }
      lines.push(ln);
    }
    let grid = "";
    for (let r = 0; r < 10; r++) grid += chron.slice(r * 10, r * 10 + 10).map((g) => `<span class="r${g.result[0]}">${g.result === "win" ? "." : g.result === "loss" ? "#" : "="}</span>`).join(" ") + "\n";
    return (cache[cpp] = { html: lines.join("\n"), used: si, kept, grid });
  }
  F.asciiTail = () => {
    const phone = !matchMedia("(min-width: 700px)").matches;
    const b = build(phone ? 1 : 2);
    return `<div class="tail">
      <p class="tail-cap">${t("foot.tail", { k: b.kept })}</p>
      <div class="tail-art"><pre class="ascii ${phone ? "phone" : ""}" tabindex="0" role="img" aria-label="${t("foot.tailAria")}">${b.html}</pre>
      <pre class="ascii-grid" aria-label="${t("sv.grid")}">${b.grid}</pre></div></div>`;
  };
  F.mountTail = (root) => {
    const pre = root.querySelector(".ascii");
    if (!pre) return;
    const fit = () => { pre.style.zoom = 1; const avail = pre.parentElement.clientWidth; pre.style.zoom = Math.min(1.25, avail / pre.scrollWidth).toFixed(3); };
    fit();
    const ro = new ResizeObserver(fit); ro.observe(pre.parentElement); F.onLeave(() => ro.disconnect());
    const hover = matchMedia("(hover: hover)").matches;
    pre.addEventListener("pointerenter", (e) => { if (hover && e.pointerType === "mouse") pre.classList.add("sifting"); });
    pre.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") pre.classList.remove("sifting"); });
    pre.addEventListener("click", (e) => { if (!hover || e.pointerType !== "mouse") pre.classList.toggle("sifting"); });
    pre.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pre.classList.toggle("sifting"); } });
  };
})();
