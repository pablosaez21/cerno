import json
import os

from openai import AsyncOpenAI
from sqlalchemy.orm import Session

from app.db.repositories.analyses import save_critical_moves, save_game_analysis
from app.db.repositories.recommendations import save_training_recommendation
from app.db.repositories.users import get_or_create_user
from app.db.repositories.weaknesses import upsert_weakness_profile
from app.services.lichess import fetch_games
from app.services.rag import search_theory
from app.services.stockfish import analyze_game
from app.services.weakness import aggregate_game_analyses

OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")


async def analyze_user(
    username: str,
    limit: int = 3,
    depth: int = 12,
    save: bool = False,
    db: Session | None = None,
) -> dict:
    games = await fetch_games(username, limit)
    if not games:
        raise ValueError(f"No games found for Lichess user '{username}'.")

    analyses = []
    analyzed_games = []
    skipped_games = []

    for game in games:
        if not game.pgn:
            skipped_games.append({
                "game_id": game.id,
                "reason": "Game has no PGN."
            })
            continue

        try:
            analysis = await analyze_game(game.pgn, depth)
            analysis["game_id"] = game.id
            analyses.append(analysis)
            analyzed_games.append((game, analysis))
        except Exception as exc:
            skipped_games.append({
                "game_id": game.id,
                "reason": str(exc)
            })

    if not analyses:
        raise ValueError("No games could be analyzed.")

    weakness_profile = aggregate_game_analyses(analyses)
    theory_results = collect_theory_results(weakness_profile["theory_queries"])
    theory_recommendations = build_theory_recommendations(theory_results)
    training_plan = await generate_training_plan(
        username=username,
        weakness_profile=weakness_profile,
        theory_recommendations=theory_recommendations,
    )
    saved = False
    if save:
        if db is None:
            raise ValueError("Database session is required when save=true.")
        persist_coach_result(
            db=db,
            username=username,
            analyzed_games=analyzed_games,
            weakness_profile=weakness_profile,
            theory_recommendations=theory_recommendations,
            training_plan=training_plan,
        )
        saved = True

    return {
        "username": username,
        "games_requested": limit,
        "games_analyzed": len(analyses),
        "diagnosis": {
            "main_weakness": weakness_profile["main_weakness"],
            "secondary_weakness": weakness_profile["secondary_weakness"],
            "summary": build_diagnosis_summary(weakness_profile),
            "phase_stats": weakness_profile["phase_stats"],
            "detected_patterns": weakness_profile["detected_patterns"],
            "recommended_focus": weakness_profile["recommended_focus"],
        },
        "critical_moments": collect_critical_moments(analyses),
        "theory_recommendations": theory_recommendations,
        "training_plan": training_plan,
        "skipped_games": skipped_games,
        "saved": saved,
    }


def persist_coach_result(
    db: Session,
    username: str,
    analyzed_games: list[tuple],
    weakness_profile: dict,
    theory_recommendations: list[dict],
    training_plan: dict,
) -> None:
    try:
        user = get_or_create_user(db, username)

        for game, analysis in analyzed_games:
            game_analysis = save_game_analysis(db, user, game, analysis, username)
            save_critical_moves(
                db,
                game_analysis,
                analysis.get("critical_moments", []),
            )

        saved_weakness = upsert_weakness_profile(db, user, weakness_profile)
        save_training_recommendation(
            db,
            user,
            saved_weakness,
            training_plan,
            theory_recommendations,
        )
        db.commit()
    except Exception:
        db.rollback()
        raise


def collect_theory_results(queries: list[str], n_results: int = 2) -> list[dict]:
    collected = []
    seen_sources = set()

    for query in queries:
        for result in search_theory(query, n_results=n_results):
            metadata = result.get("metadata", {})
            source_key = (
                metadata.get("study_id"),
                metadata.get("chapter"),
                metadata.get("source"),
            )
            if source_key in seen_sources:
                continue

            collected.append({
                "query": query,
                "text": result.get("text", ""),
                "metadata": metadata,
                "distance": result.get("distance"),
            })
            seen_sources.add(source_key)

    return collected[:5]


def build_theory_recommendations(theory_results: list[dict]) -> list[dict]:
    recommendations = []

    for result in theory_results:
        metadata = result.get("metadata", {})
        query = result.get("query", "training focus")
        recommendations.append({
            "source": metadata.get("source"),
            "category": metadata.get("category"),
            "study_id": metadata.get("study_id"),
            "chapter": metadata.get("chapter"),
            "reason": f"Relevant for: {query}.",
            "distance": result.get("distance"),
        })

    return recommendations


def collect_critical_moments(analyses: list[dict], limit: int = 10) -> list[dict]:
    moments = []

    for analysis in analyses:
        game_id = analysis.get("game_id", "")
        for moment in analysis.get("critical_moments", []):
            moments.append({
                "game_id": game_id,
                "move_number": moment.get("move_number", 0),
                "move": moment.get("move_san") or moment.get("move_uci", ""),
                "phase": moment.get("phase", "unknown"),
                "cpl": moment.get("cpl", 0),
                "classification": moment.get("classification", "unknown"),
            })

    moments.sort(key=lambda item: item["cpl"], reverse=True)
    return moments[:limit]


def build_diagnosis_summary(weakness_profile: dict) -> str:
    main = weakness_profile["main_weakness"]
    patterns = weakness_profile.get("detected_patterns", [])
    if patterns:
        return (
            f"Your main evaluation losses appear in the {main}. "
            f"The recurring patterns are: {', '.join(patterns)}."
        )
    return f"Your main evaluation losses appear in the {main}."


async def generate_training_plan(
    username: str,
    weakness_profile: dict,
    theory_recommendations: list[dict],
) -> dict:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return build_fallback_training_plan(weakness_profile)

    client = AsyncOpenAI(api_key=api_key)
    prompt = build_training_plan_prompt(
        username,
        weakness_profile,
        theory_recommendations,
    )

    try:
        response = await client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are Cerno, a concise chess coach. "
                        "Return only valid JSON with keys priority and week_plan. "
                        "week_plan must be a list of 5 short strings."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0.3,
        )
        content = response.choices[0].message.content or ""
        parsed = json.loads(content)
        if _is_valid_training_plan(parsed):
            return parsed
    except Exception:
        return build_fallback_training_plan(weakness_profile)

    return build_fallback_training_plan(weakness_profile)


def build_training_plan_prompt(
    username: str,
    weakness_profile: dict,
    theory_recommendations: list[dict],
) -> str:
    return json.dumps({
        "username": username,
        "weakness_profile": weakness_profile,
        "theory_sources": theory_recommendations,
        "task": "Create a practical one-week chess training plan.",
    }, ensure_ascii=False)


def build_fallback_training_plan(weakness_profile: dict) -> dict:
    main = weakness_profile.get("main_weakness", "opening")
    focus = weakness_profile.get("recommended_focus", [])
    priority = focus[0] if focus else f"{main} improvement"

    phase_plan = {
        "opening": [
            "Day 1: review basic opening principles and compare them with your critical moments.",
            "Day 2: study one model line from the recommended sources.",
            "Day 3: play 3 rapid games focusing only on development, center control, and king safety.",
            "Day 4: review the opening phase of those games and mark repeated mistakes.",
            "Day 5: repeat the best line from memory and write down the plans in your own words.",
        ],
        "middlegame": [
            "Day 1: solve 20 tactical puzzles with no time pressure.",
            "Day 2: review your biggest critical moments and identify the missed candidate moves.",
            "Day 3: study king safety and piece coordination from the recommended sources.",
            "Day 4: play 3 rapid games focusing on calculation before forcing moves.",
            "Day 5: review every mistake above 100 CPL and group them by pattern.",
        ],
        "endgame": [
            "Day 1: review basic king activity and pawn ending rules.",
            "Day 2: practice simple conversion positions against an engine.",
            "Day 3: study one rook or pawn endgame theme from the recommended sources.",
            "Day 4: play training positions starting from simplified material.",
            "Day 5: review endgame critical moments and write the correct plan.",
        ],
    }

    return {
        "priority": priority,
        "week_plan": phase_plan.get(main, phase_plan["opening"]),
    }


def _is_valid_training_plan(plan: dict) -> bool:
    return (
        isinstance(plan, dict)
        and isinstance(plan.get("priority"), str)
        and isinstance(plan.get("week_plan"), list)
        and all(isinstance(item, str) for item in plan["week_plan"])
    )
