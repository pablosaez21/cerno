/* Cerno-Folio data model: indexes and derived facts over the REAL report (window.CERNO_DATA, window.CERNO_ELO).
 * Nothing here invents a number; everything is looked up or summed from the shared files. */
(function () {
  // No saved analysis yet: an empty book, so only the cover and the wait can open.
  const EMPTY = {
    player: { name: "", sources: [] },
    sample: { games: 0, playerMoves: 0, byTimeClass: {}, results: { win: 0, draw: 0, loss: 0 } },
    settings: {}, categories: {}, clock: {}, openings: [], findings: [], recommendations: [], exercises: {}, errors: [], positions: {}, games: [],
  };
  const D = window.CERNO_DATA || EMPTY;
  D.positions = D.positions || {};
  const E = (window.CERNO_ELO && window.CERNO_ELO.positions) || {};
  const M = { D, E, empty: !window.CERNO_DATA };

  M.N = D.sample.games;
  M.user = D.player.name;
  M.games = D.games; // newest first
  M.gameById = {};
  D.games.forEach((g, i) => { g.no = D.games.length - i; M.gameById[g.id] = g; }); // numbered in the order played
  M.err = {};
  M.errorsByGame = {};
  D.errors.forEach((e) => {
    M.err[e.gameId + "#" + e.ply] = e;
    (M.errorsByGame[e.gameId] = M.errorsByGame[e.gameId] || []).push(e);
  });
  M.findingById = {};
  D.findings.forEach((f) => (M.findingById[f.id] = f));

  // Chapters ordered by share of win% lost (the smart contents)
  M.chapters = Object.entries(D.categories)
    .sort((a, b) => b[1].winLossShare - a[1].winLossShare)
    .map(([area, c], i) => ({ area, no: i + 1, ...c }));
  M.chapterNo = {};
  M.chapters.forEach((c) => (M.chapterNo[c.area] = c.no));
  M.totalWinLoss = Object.values(D.categories).reduce((s, c) => s + c.winLoss, 0);

  // Sections: findings grouped by area, numbered n.k ; clock = interlude "I"
  M.sections = {};
  M.sectionNo = {};
  // Peer profile and style traits share one chapter ("N": against your opponents).
  M.sectionArea = (f) => (f.area === "style" ? "profile" : f.area);
  for (const f of D.findings) (M.sections[M.sectionArea(f)] = M.sections[M.sectionArea(f)] || []).push(f);
  for (const [area, list] of Object.entries(M.sections)) {
    list.forEach((f, i) => (M.sectionNo[f.id] = (area === "clock" ? "I" : area === "profile" ? "N" : M.chapterNo[area]) + "." + (i + 1)));
  }
  M.sectionOrder = [...M.chapters.map((c) => c.area), "profile", "clock"].flatMap((a) => M.sections[a] || []);

  // Position helpers
  M.moveNo = (ply) => Math.ceil(ply / 2);
  M.moveLabel = (ply) => (ply % 2 ? M.moveNo(ply) + "." : M.moveNo(ply) + "…");
  M.glyph = (j) => ({ blunder: "??", mistake: "?", inaccuracy: "?!", b: "??", m: "?", i: "?!" }[j] || "");
  M.fenBefore = (g, ply) => (ply <= 1 ? g.startFen : g.plies[ply - 2].fen);

  /* A "position" is what a diagram or exercise shows: always the position BEFORE the player's move. */
  M.posFromError = (e) => {
    if (!e) return null;
    const g = M.gameById[e.gameId];
    const key = e.gameId + "#" + e.ply;
    return {
      key, gameId: e.gameId, ply: e.ply, game: g, fen: e.fen, orientation: e.color, turn: e.color[0],
      played: e.played, best: e.best,
      solution: { uci: e.bestLineUci || [e.best.uci], san: e.bestLine || [e.best.san] },
      refutation: e.refutationUci ? { uci: e.refutationUci, san: e.refutation } : null,
      loss: e.loss, judgement: e.judgement, winBefore: e.winBefore, winAfter: e.winAfter,
      level: e.peer ? e.peer.level : null, peer: e.peer || null, outOfScope: e.outOfScope || null,
      category: e.category, phase: e.phase, tactic: e.tactic || null, clockBefore: e.clockBefore, timeSpent: e.timeSpent,
      curve: E[key] || null, error: e,
    };
  };
  M.pos = (gameId, ply) => M.posFromError(M.err[gameId + "#" + ply] || D.positions[gameId + "#" + ply]);

  // Exercises: chapter sets, numbered n.k
  M.exSets = {};
  for (const c of M.chapters) {
    M.exSets[c.area] = (D.exercises[c.area] || []).map((x, i) => {
      const p = M.pos(x.gameId, x.ply) || {};
      return Object.assign({}, p, {
        id: x.id, no: c.no + "." + (i + 1), idx: i, fen: x.fen, orientation: x.orientation, turn: x.fen.split(" ")[1],
        played: x.played, solution: x.solution, loss: x.loss, tags: x.tags, level: x.level || p.level || null,
        curve: E[x.gameId + "#" + x.ply] || null, game: M.gameById[x.gameId], gameId: x.gameId, ply: x.ply,
      });
    });
  }
  // Recommendation sessions: prescription positions, from errors[]
  M.recSets = D.recommendations.map((r) => r.prescription.positions.map((p) => M.pos(p.gameId, p.ply)).filter(Boolean).map((p, i) => Object.assign(p, { no: "P" + r.rank + "." + (i + 1), idx: i })));

  // Opening records from the games themselves (+W =D −L)
  M.record = (ids) => {
    const r = { w: 0, d: 0, l: 0 };
    ids.forEach((id) => { const g = M.gameById[id]; if (g) r[g.result === "win" ? "w" : g.result === "draw" ? "d" : "l"]++; });
    return r;
  };
  M.openingByKey = {};
  D.openings.forEach((o) => { o.rec = M.record(o.gameIds); M.openingByKey[o.family + ":" + o.color] = o; });

  // Every Elo here is on the scale of the games' source (D.eloScale); the data already carries it converted
  // (src/core/folio-data.ts). Maia's own Elo (Lichess) stays in the fields named maiaElo*.
  M.eloScale = D.eloScale || { shown: "lichess", maiaOffset: 0 };
  // Elo curve interpolation between the ladder's points (17 points, 100 apart). `topElo`: the point `top` comes from.
  M.curveAt = (curve, elo) => {
    const c = curve.curve, at = (k) => Object.assign({}, k, { topElo: k.elo });
    if (elo <= c[0].elo) return at(c[0]);
    if (elo >= c[c.length - 1].elo) return at(c[c.length - 1]);
    const i = Math.floor((elo - c[0].elo) / 100), a = c[i], b = c[i + 1], t = (elo - a.elo) / 100;
    return { elo, pGood: a.pGood + (b.pGood - a.pGood) * t, pPlayed: a.pPlayed + (b.pPlayed - a.pPlayed) * t, top: t < 0.5 ? a.top : b.top, topElo: t < 0.5 ? a.elo : b.elo };
  };
  // The player's rating in that game, as the source gives it. null when the game has none: no mark is drawn.
  M.playerElo = (p) => {
    if (p && p.peer) return p.peer.elo;
    const g = p && p.game, r = g && (g.color === "white" ? g.white.rating : g.black.rating);
    return r || null;
  };

  // Results
  M.score = (g) => (g.result === "win" ? 1 : g.result === "draw" ? 0.5 : 0);
  M.pgnResult = (g) => {
    if (g.result === "draw") return "½–½";
    const whiteWon = (g.result === "win") === (g.color === "white");
    return whiteWon ? "1–0" : "0–1";
  };
  M.opponent = (g) => (g.color === "white" ? g.black : g.white);
  M.me = (g) => (g.color === "white" ? g.white : g.black);

  // Best game: highest accuracy win (used by the ASCII ex libris)
  const withMoves = D.games.filter((g) => g.plies && g.plies.length);
  M.bestGame = withMoves.filter((g) => g.result === "win" && g.termination === "checkmate").sort((a, b) => (b.accuracy || 0) - (a.accuracy || 0))[0]
    || withMoves.filter((g) => g.result === "win").sort((a, b) => (b.accuracy || 0) - (a.accuracy || 0))[0] || withMoves[0];

  // Order evidence: positions with a Maia curve first (keeps the report order otherwise)
  M.evidence = (f) => {
    const list = f.evidence.map((ev) => M.pos(ev.gameId, ev.ply)).filter(Boolean);
    return list;
  };
  M.split = (lv, occ) => {
    const mid = Math.max(0, lv.inScope - lv.belowLevel - lv.hard);
    return { occ, below: lv.belowLevel, hard: lv.hard, mid, out: Math.max(0, occ - lv.inScope), inScope: lv.inScope };
  };

  // Frontispiece: the costliest "below your level" evidence of the top finding that has a Maia curve
  M.frontispiece = (() => {
    const f = D.findings.find((x) => M.evidence(x).length);
    if (!f) return null;
    const cands = M.evidence(f).filter((p) => p.curve && p.level === "below_level");
    return cands.sort((a, b) => b.loss - a.loss)[0] || M.evidence(f)[0];
  })();

  window.FOLIO_MODEL = M;
})();
