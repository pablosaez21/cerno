PHASES = ("opening", "middlegame", "endgame")
CLASSIFICATION_COUNTERS = {
    "inaccuracy": "inaccuracies",
    "mistake": "mistakes",
    "blunder": "blunders",
}


def aggregate_game_analyses(analyses: list[dict]) -> dict:
    phase_stats = _empty_phase_stats()
    critical_moments = []

    for analysis in analyses:
        for move in analysis.get("moves", []):
            phase = move.get("phase")
            if phase not in phase_stats:
                continue

            cpl = move.get("cpl") or 0
            classification = move.get("classification", "good")
            phase_stats[phase]["total_cpl"] += cpl
            phase_stats[phase]["moves"] += 1

            counter = CLASSIFICATION_COUNTERS.get(classification)
            if counter:
                phase_stats[phase][counter] += 1

        critical_moments.extend(analysis.get("critical_moments", []))

    normalized_stats = _normalize_phase_stats(phase_stats)
    main_weakness = detect_main_weakness(normalized_stats)
    secondary_weakness = detect_secondary_weakness(normalized_stats, main_weakness)
    detected_patterns = detect_patterns(normalized_stats, critical_moments)
    recommended_focus = build_recommended_focus(
        main_weakness,
        secondary_weakness,
        detected_patterns
    )

    profile = {
        "games_analyzed": len(analyses),
        "main_weakness": main_weakness,
        "secondary_weakness": secondary_weakness,
        "phase_stats": normalized_stats,
        "detected_patterns": detected_patterns,
        "recommended_focus": recommended_focus,
    }
    profile["theory_queries"] = build_theory_queries(profile)
    return profile


def detect_main_weakness(phase_stats: dict) -> str:
    scores = {
        phase: score_phase(stats)
        for phase, stats in phase_stats.items()
    }
    return max(scores, key=scores.get) if scores else "opening"


def detect_secondary_weakness(phase_stats: dict, main_weakness: str) -> str | None:
    scores = [
        (phase, score_phase(stats))
        for phase, stats in phase_stats.items()
        if phase != main_weakness
    ]
    scores.sort(key=lambda item: item[1], reverse=True)
    if not scores or scores[0][1] <= 0:
        return None
    return scores[0][0]


def build_theory_queries(weakness_profile: dict) -> list[str]:
    main_weakness = weakness_profile.get("main_weakness", "opening")
    patterns = weakness_profile.get("detected_patterns", [])

    phase_queries = {
        "opening": [
            "basic opening principles",
            "common beginner opening mistakes",
            "how to study chess openings",
        ],
        "middlegame": [
            "middlegame tactics for beginners",
            "king safety principles",
            "piece coordination in chess",
        ],
        "endgame": [
            "basic endgame principles",
            "king and pawn endings",
            "rook endgame principles",
        ],
    }

    queries = list(phase_queries.get(main_weakness, phase_queries["opening"]))

    if "king safety" in patterns:
        queries.append("king safety opening principles")
    if "missed tactics" in patterns:
        queries.append("tactical mistakes in chess")
    if "opening discipline" in patterns:
        queries.append("opening principles development center king safety")

    return _dedupe(queries)[:5]


def score_phase(stats: dict) -> float:
    return (
        stats.get("avg_cpl", 0)
        + stats.get("inaccuracies", 0) * 10
        + stats.get("mistakes", 0) * 25
        + stats.get("blunders", 0) * 60
    )


def detect_patterns(phase_stats: dict, critical_moments: list[dict]) -> list[str]:
    patterns = []
    total_blunders = sum(stats["blunders"] for stats in phase_stats.values())
    total_mistakes = sum(stats["mistakes"] for stats in phase_stats.values())

    if total_blunders or total_mistakes >= 3:
        patterns.append("missed tactics")

    if phase_stats["opening"]["mistakes"] or phase_stats["opening"]["blunders"]:
        patterns.append("opening discipline")

    if phase_stats["middlegame"]["avg_cpl"] >= 80:
        patterns.append("king safety")
        patterns.append("poor piece coordination")

    if phase_stats["endgame"]["avg_cpl"] >= 80:
        patterns.append("conversion technique")

    if not patterns and critical_moments:
        patterns.append("calculation consistency")

    return _dedupe(patterns)


def build_recommended_focus(
    main_weakness: str,
    secondary_weakness: str | None,
    patterns: list[str],
) -> list[str]:
    focus = []

    if main_weakness == "opening":
        focus.append("opening principles")
    elif main_weakness == "middlegame":
        focus.append("middlegame tactics")
    elif main_weakness == "endgame":
        focus.append("endgame technique")

    if secondary_weakness:
        focus.append(f"{secondary_weakness} review")

    focus.extend(patterns)
    return _dedupe(focus)[:5]


def _empty_phase_stats() -> dict:
    return {
        phase: {
            "total_cpl": 0,
            "moves": 0,
            "inaccuracies": 0,
            "mistakes": 0,
            "blunders": 0,
        }
        for phase in PHASES
    }


def _normalize_phase_stats(phase_stats: dict) -> dict:
    normalized = {}
    for phase, stats in phase_stats.items():
        moves = stats["moves"]
        normalized[phase] = {
            "avg_cpl": round(stats["total_cpl"] / moves, 1) if moves else 0,
            "inaccuracies": stats["inaccuracies"],
            "mistakes": stats["mistakes"],
            "blunders": stats["blunders"],
        }
    return normalized


def _dedupe(items: list[str]) -> list[str]:
    seen = set()
    result = []
    for item in items:
        if item not in seen:
            result.append(item)
            seen.add(item)
    return result
