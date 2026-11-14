/* Shared EN/ES labels for Cerno report keys. Prototypes may restyle or rephrase, but
 * these keep facts consistent with the report contract (REPORT.md v2).
 *   CERNO_LABELS.t("en", "finding.allowed_tactic.title")
 */
(function () {
  const L = {
    en: {
      "cat.tactics": "Tactics", "cat.openings": "Openings", "cat.endgames": "Endgames", "cat.strategy": "Strategy", "cat.clock": "Clock",
      "judg.inaccuracy": "Inaccuracy", "judg.mistake": "Mistake", "judg.blunder": "Blunder",
      "phase.opening": "Opening", "phase.middlegame": "Middlegame", "phase.endgame": "Endgame",
      "level.below_level": "Below your level", "level.hard": "Hard at your level",
      "level.below_level.long": "Most Lichess blitz players at your level find a good move here.",
      "level.hard.long": "Most Lichess blitz players at your level also go wrong here.",
      "finding.allowed_tactic.title": "You allow tactics", "finding.allowed_tactic.desc": "After your move, the opponent wins material by force.",
      "finding.missed_tactic.title": "You miss tactics", "finding.missed_tactic.desc": "You had a forcing line that won material and played something else.",
      "finding.hanging_piece.title": "You leave pieces hanging", "finding.hanging_piece.desc": "Your move leaves a piece undefended and the opponent takes it.",
      "finding.missed_capture.title": "You miss free captures", "finding.missed_capture.desc": "An undefended or more valuable piece was there to take.",
      "finding.allowed_mate.title": "You allow mates", "finding.allowed_mate.desc": "After your move, the opponent has mate in 5 or fewer.",
      "finding.missed_mate.title": "You miss mates", "finding.missed_mate.desc": "You had mate in 5 or fewer and let it go.",
      "finding.middlegame_no_tactic.title": "Quiet middlegame errors", "finding.middlegame_no_tactic.desc": "Middlegame moves that lose ground without a short tactical refutation. The engine shows the better plan, not the reason.",
      "finding.lost_with_time_left.title": "You lose with time left", "finding.lost_with_time_left.desc": "Lost games (not on time) with half your base time or more still on the clock.",
      "finding.fast_critical.title": "Too fast in critical moments", "finding.fast_critical.desc": "Mistakes in positions with only one good move, played in under half your usual time.",
      "finding.time_trouble.title": "Time trouble", "finding.time_trouble.desc": "Your error rate rises when the clock runs low.",
      "finding.equal_endgame_lost.title": "Equal endgames you lose", "finding.equal_endgame_lost.desc": "Entered the endgame level (35–65%) and lost.",
      "finding.winning_endgame_not_converted.title": "Winning endgames not converted", "finding.winning_endgame_not_converted.desc": "Reached 85%+ and the decisive slip came in the endgame.",
      "finding.advantage_not_converted.title": "Advantages not converted", "finding.advantage_not_converted.desc": "Reached 85%+ after the opening and did not win.",
      "finding.drift.title": "Slow drift", "finding.drift.desc": "Games lost little by little, without a single blunder.",
      "finding.lost_on_time.title": "Lost on time", "finding.lost_on_time.desc": "Games lost on the clock.",
      "finding.opening_line.title": "{family} as {color}", "finding.opening_line.desc": "This line costs you more than the rest of your repertoire.",
      "finding.repeated_mistake.title": "Same mistake, again", "finding.repeated_mistake.desc": "Same position, same bad move, in different games.",
      "finding.endgame_type.title": "{type} endgames", "finding.endgame_type.desc": "Errors in this type of endgame, with no tactic involved.",
      "eg.pawn": "Pawn", "eg.rook": "Rook", "eg.minor": "Minor-piece", "eg.queen": "Queen", "eg.rook_minor": "Rook and minor-piece", "eg.mixed": "Mixed",
      "method.blunder_check": "Blunder check before every move", "method.puzzles": "Themed puzzles", "method.own_positions": "Replay your own mistakes",
      "method.repertoire_fix": "Fix the repeated line", "method.repertoire_study": "Study the line", "method.endgame_theory": "Endgame theory",
      "method.convert_advantage": "Convert won positions", "method.defend_endgames": "Defend equal endgames", "method.review_games": "Review whole games",
      "method.time_management": "Clock management", "method.slow_down_critical": "Slow down when it matters",
      "tag.fork": "Fork", "tag.back_rank_mate": "Back-rank mate", "tag.time_trouble": "Time trouble", "tag.fast_critical": "Too fast",
      "color.white": "White", "color.black": "Black",
      "result.win": "Win", "result.loss": "Loss", "result.draw": "Draw",
      "unit.winpct": "win %", "unit.perGame": "per game",
    },
    es: {
      "cat.tactics": "Táctica", "cat.openings": "Aperturas", "cat.endgames": "Finales", "cat.strategy": "Estrategia", "cat.clock": "Reloj",
      "judg.inaccuracy": "Imprecisión", "judg.mistake": "Error", "judg.blunder": "Error grave",
      "phase.opening": "Apertura", "phase.middlegame": "Medio juego", "phase.endgame": "Final",
      "level.below_level": "Por debajo de tu nivel", "level.hard": "Difícil para tu nivel",
      "level.below_level.long": "La mayoría de jugadores de blitz de Lichess de tu nivel encuentra aquí una buena jugada.",
      "level.hard.long": "La mayoría de jugadores de blitz de Lichess de tu nivel también falla aquí.",
      "finding.allowed_tactic.title": "Permites tácticas", "finding.allowed_tactic.desc": "Tras tu jugada, el rival gana material por fuerza.",
      "finding.missed_tactic.title": "No ves tácticas", "finding.missed_tactic.desc": "Tenías una línea forzada que ganaba material y jugaste otra cosa.",
      "finding.hanging_piece.title": "Dejas piezas colgadas", "finding.hanging_piece.desc": "Tu jugada deja una pieza sin defensa y el rival se la come.",
      "finding.missed_capture.title": "No ves capturas gratis", "finding.missed_capture.desc": "Había una pieza sin defensa, o de más valor, para capturar.",
      "finding.allowed_mate.title": "Permites mates", "finding.allowed_mate.desc": "Tras tu jugada, el rival tiene mate en 5 o menos.",
      "finding.missed_mate.title": "No ves mates", "finding.missed_mate.desc": "Tenías mate en 5 o menos y lo dejaste pasar.",
      "finding.middlegame_no_tactic.title": "Errores sin táctica en el medio juego", "finding.middlegame_no_tactic.desc": "Jugadas del medio juego que pierden terreno sin refutación táctica a corto plazo. El motor enseña el plan mejor, no el porqué.",
      "finding.lost_with_time_left.title": "Pierdes con tiempo de sobra", "finding.lost_with_time_left.desc": "Partidas perdidas (no por tiempo) con la mitad o más de tu tiempo base en el reloj.",
      "finding.fast_critical.title": "Demasiado rápido en momentos críticos", "finding.fast_critical.desc": "Errores en posiciones con una sola buena jugada, hechos en menos de la mitad de tu tiempo habitual.",
      "finding.time_trouble.title": "Apuros de tiempo", "finding.time_trouble.desc": "Fallas más cuando se te acaba el reloj.",
      "finding.equal_endgame_lost.title": "Finales igualados que pierdes", "finding.equal_endgame_lost.desc": "Entraste en el final igualado (35-65 %) y perdiste.",
      "finding.winning_endgame_not_converted.title": "Finales ganados que no rematas", "finding.winning_endgame_not_converted.desc": "Llegaste al 85 % o más y el fallo decisivo llegó en el final.",
      "finding.advantage_not_converted.title": "Ventajas que no conviertes", "finding.advantage_not_converted.desc": "Llegaste al 85 % o más tras la apertura y no ganaste.",
      "finding.drift.title": "Deriva", "finding.drift.desc": "Partidas que se pierden poco a poco, sin un error grave.",
      "finding.lost_on_time.title": "Pierdes por tiempo", "finding.lost_on_time.desc": "Partidas perdidas por reloj.",
      "finding.opening_line.title": "{family} con {color}", "finding.opening_line.desc": "Esta línea te cuesta más que el resto de tu repertorio.",
      "finding.repeated_mistake.title": "El mismo error, otra vez", "finding.repeated_mistake.desc": "Misma posición y misma mala jugada en partidas distintas.",
      "finding.endgame_type.title": "Finales de {type}", "finding.endgame_type.desc": "Errores en este tipo de final, sin táctica de por medio.",
      "eg.pawn": "peones", "eg.rook": "torres", "eg.minor": "piezas menores", "eg.queen": "damas", "eg.rook_minor": "torre y pieza menor", "eg.mixed": "material mixto",
      "method.blunder_check": "Revisión antes de cada jugada", "method.puzzles": "Problemas por tema", "method.own_positions": "Repite tus propios errores",
      "method.repertoire_fix": "Corrige la línea repetida", "method.repertoire_study": "Estudia la línea", "method.endgame_theory": "Teoría de finales",
      "method.convert_advantage": "Convierte posiciones ganadas", "method.defend_endgames": "Defiende finales igualados", "method.review_games": "Revisa partidas enteras",
      "method.time_management": "Gestión del reloj", "method.slow_down_critical": "Frena cuando importa",
      "tag.fork": "Doble ataque", "tag.back_rank_mate": "Mate del pasillo", "tag.time_trouble": "Apuro de tiempo", "tag.fast_critical": "Demasiado rápido",
      "color.white": "blancas", "color.black": "negras",
      "result.win": "Victoria", "result.loss": "Derrota", "result.draw": "Tablas",
      "unit.winpct": "% de victoria", "unit.perGame": "por partida",
    },
  };
  function t(lang, key, params) {
    let s = (L[lang] && L[lang][key]) ?? L.en[key] ?? key;
    if (params) for (const [k, v] of Object.entries(params)) s = s.replace("{" + k + "}", v);
    return s;
  }
  // Title for a Finding object from the report.
  function findingTitle(lang, f) {
    if (f.kind === "opening_line") return t(lang, "finding.opening_line.title", { family: f.params.family, color: t(lang, "color." + f.params.color) });
    if (f.kind === "endgame_type") return t(lang, "finding.endgame_type.title", { type: t(lang, "eg." + f.key) });
    if (f.kind === "repeated_mistake") return t(lang, "finding.repeated_mistake.title");
    if (f.kind === "strategy_errors") return t(lang, "finding.middlegame_no_tactic.title");
    return t(lang, "finding." + f.key + ".title");
  }
  function findingDesc(lang, f) {
    if (f.kind === "strategy_errors") return t(lang, "finding.middlegame_no_tactic.desc");
    if (["opening_line", "endgame_type", "repeated_mistake"].includes(f.kind)) return t(lang, "finding." + f.kind + ".desc");
    return t(lang, "finding." + f.key + ".desc");
  }
  window.CERNO_LABELS = { L, t, findingTitle, findingDesc };
})();
