import hashlib
import io
import json
from dataclasses import dataclass

import chess.pgn
from openai import AsyncOpenAI
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.repositories.analyses import save_critical_moves, save_game_analysis
from app.db.repositories.recommendations import save_training_recommendation
from app.db.repositories.users import get_or_create_user
from app.db.repositories.weaknesses import upsert_weakness_profile
from app.schemas.game import Game, Player
from app.services.lichess import fetch_games
from app.services.rag import search_theory
from app.services.stockfish import analyze_game
from app.services.weakness import (
    aggregate_game_analyses,
    project_analysis_for_player,
)


@dataclass(frozen=True)
class AnalyzedPlayerGame:
    game: Game
    full_analysis: dict
    player_analysis: dict
    player_color: str


def build_full_game_coaching(analysis: dict) -> dict:
    """Build neutral coaching when a PGN does not identify the user's side."""
    summary = analysis.get("summary", {})
    critical_moments = analysis.get("critical_moments", [])
    phase_weaknesses = analysis.get("phase_weaknesses", [])
    focus_phase = (
        phase_weaknesses[0] if phase_weaknesses else _highest_loss_phase(summary)
    )
    blunders = sum(
        1 for moment in critical_moments if moment.get("classification") == "blunder"
    )
    mistakes = sum(
        1 for moment in critical_moments if moment.get("classification") == "mistake"
    )

    if critical_moments:
        explanation = (
            "Across both sides, the largest evaluation losses in this game "
            f"cluster in the {focus_phase}. Stockfish identified "
            f"{len(critical_moments)} critical "
            f"{'move' if len(critical_moments) == 1 else 'moves'}, including "
            f"{blunders} {'blunder' if blunders == 1 else 'blunders'} and "
            f"{mistakes} {'mistake' if mistakes == 1 else 'mistakes'}. "
            "Because the PGN does not identify which side belongs to you, this "
            "coaching reviews the whole game without assigning either side's "
            "errors to the player."
        )
        recommendations = [
            f"Replay the critical {focus_phase} positions from both sides and "
            "write down at least two candidate moves before checking the engine.",
            "Start with the highest-loss move, compare the played continuation "
            "with a safer alternative, and record the tactical idea that was missed.",
        ]
    else:
        explanation = (
            "Stockfish did not identify a major evaluation loss in this game. "
            "Because the PGN does not identify which side belongs to you, this "
            "coaching reviews both sides rather than attributing decisions to "
            "the player."
        )
        recommendations = [
            f"Replay the {focus_phase} from both sides and note where either "
            "side could have improved piece activity or reduced counterplay."
        ]

    return {
        "scope": "full_game",
        "explanation": explanation,
        "recommendations": recommendations,
    }


def _highest_loss_phase(summary: dict) -> str:
    if not summary:
        return "opening"

    return max(
        summary,
        key=lambda phase: (
            summary.get(phase, {}).get("avg_cpl", 0),
            summary.get(phase, {}).get("blunders", 0),
            summary.get(phase, {}).get("mistakes", 0),
        ),
    )


async def analyze_user(
    username: str,
    limit: int = 3,
    depth: int = 12,
    save: bool = False,
    db: Session | None = None,
) -> dict:
    limit = settings.clamp_games_limit(limit)
    depth = settings.clamp_stockfish_depth(depth)

    games = await fetch_games(username, limit)
    if not games:
        raise ValueError(f"No games found for Lichess user '{username}'.")

    return await analyze_player_games(
        username=username,
        games=games,
        limit=limit,
        depth=depth,
        save=save,
        db=db,
    )


async def analyze_pgn_for_player(
    pgn: str,
    player_color: str,
    depth: int = 12,
) -> dict:
    """Run an uploaded PGN through the same structured coach pipeline."""
    if player_color not in {"white", "black"}:
        raise ValueError(f"Unsupported player color: {player_color}.")

    depth = settings.clamp_stockfish_depth(depth)
    game = build_uploaded_game(pgn)
    username = game.white.username if player_color == "white" else game.black.username

    return await analyze_player_games(
        username=username,
        games=[game],
        limit=1,
        depth=depth,
        save=False,
        db=None,
        player_color_override=player_color,
    )


def build_uploaded_game(pgn: str) -> Game:
    parsed = chess.pgn.read_game(io.StringIO(pgn))
    if parsed is None:
        raise ValueError("Invalid PGN.")

    mainline = list(parsed.mainline())
    if not mainline:
        raise ValueError("Invalid PGN: no moves found.")

    headers = parsed.headers
    white_username = known_pgn_header(headers.get("White")) or "White player"
    black_username = known_pgn_header(headers.get("Black")) or "Black player"
    result = headers.get("Result", "*")
    winner = {"1-0": "white", "0-1": "black"}.get(result)

    return Game(
        id=f"uploaded-{hashlib.sha256(pgn.encode('utf-8')).hexdigest()[:16]}",
        speed="unknown",
        rated=False,
        winner=winner,
        status="uploaded",
        white=Player(username=white_username),
        black=Player(username=black_username),
        moves=" ".join(node.san() for node in mainline),
        pgn=pgn,
    )


def known_pgn_header(value: str | None) -> str | None:
    if value is None or value.strip() in {"", "?"}:
        return None
    return value.strip()


async def analyze_player_games(
    username: str,
    games: list[Game],
    limit: int,
    depth: int,
    save: bool,
    db: Session | None,
    player_color_override: str | None = None,
) -> dict:
    """Build one coach report from games whose player ownership is known."""
    if player_color_override is not None and len(games) != 1:
        raise ValueError("A player color override requires exactly one game.")

    player_analyses = []
    analyzed_games: list[AnalyzedPlayerGame] = []
    skipped_games = []

    for game in games:
        if not game.pgn:
            skipped_games.append({"game_id": game.id, "reason": "Game has no PGN."})
            continue

        player_color = player_color_override or resolve_player_color(game, username)
        if player_color is None:
            skipped_games.append(
                {
                    "game_id": game.id,
                    "reason": "The requested user is not identified as a player.",
                }
            )
            continue

        try:
            full_analysis = await analyze_game(game.pgn, depth)
            full_analysis["game_id"] = game.id
            player_analysis = project_analysis_for_player(
                full_analysis,
                player_color,
            )
            player_analyses.append(player_analysis)
            analyzed_games.append(
                AnalyzedPlayerGame(
                    game=game,
                    full_analysis=full_analysis,
                    player_analysis=player_analysis,
                    player_color=player_color,
                )
            )
        except Exception as exc:
            skipped_games.append({"game_id": game.id, "reason": str(exc)})

    if not player_analyses:
        raise ValueError("No games could be analyzed.")

    weakness_profile = aggregate_game_analyses(player_analyses)
    theory_results = collect_theory_results(
        weakness_profile["theory_queries"],
        phase=weakness_profile["main_weakness"],
    )
    theory_recommendations = build_theory_recommendations(theory_results)
    critical_moments = collect_critical_moments(player_analyses)
    generated_training = await generate_training_plan(
        username=username,
        weakness_profile=weakness_profile,
        theory_recommendations=theory_recommendations,
        critical_moments=critical_moments,
    )
    training_plan = normalize_training_plan(generated_training, weakness_profile)
    coach_advice = (
        generated_training.get("coach_advice")
        if isinstance(generated_training, dict)
        else None
    ) or build_fallback_coach_advice(weakness_profile, critical_moments)
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
        "games_analyzed": len(player_analyses),
        "diagnosis": {
            "main_weakness": weakness_profile["main_weakness"],
            "secondary_weakness": weakness_profile["secondary_weakness"],
            "summary": build_diagnosis_summary(weakness_profile),
            "phase_stats": weakness_profile["phase_stats"],
            "detected_patterns": weakness_profile["detected_patterns"],
            "recommended_focus": weakness_profile["recommended_focus"],
        },
        "coach_advice": coach_advice,
        "critical_moments": critical_moments,
        "theory_recommendations": theory_recommendations,
        "training_plan": training_plan,
        "game_analyses": build_game_analyses(analyzed_games),
        "skipped_games": skipped_games,
        "saved": saved,
    }


def build_game_analyses(
    analyzed_games: list[AnalyzedPlayerGame],
) -> list[dict]:
    reports = []

    for analyzed_game in analyzed_games:
        game = analyzed_game.game
        analysis = analyzed_game.full_analysis
        player_color = analyzed_game.player_color
        opponent = (
            game.black.username if player_color == "white" else game.white.username
        )

        if game.winner is None:
            result = "draw"
        else:
            result = "win" if game.winner == player_color else "loss"

        reports.append(
            {
                "game_id": game.id,
                "player_color": player_color,
                "opponent": opponent,
                "result": result,
                "pgn": game.pgn,
                "total_moves": analysis.get("total_moves", 0),
                "summary": analysis.get("summary", {}),
                "critical_moments": analysis.get("critical_moments", []),
                "phase_weaknesses": analysis.get("phase_weaknesses", []),
                "moves": analysis.get("moves", []),
            }
        )

    return reports


def persist_coach_result(
    db: Session,
    username: str,
    analyzed_games: list[AnalyzedPlayerGame],
    weakness_profile: dict,
    theory_recommendations: list[dict],
    training_plan: dict,
) -> None:
    try:
        user = get_or_create_user(db, username)

        for analyzed_game in analyzed_games:
            game_analysis = save_game_analysis(
                db,
                user,
                analyzed_game.game,
                analyzed_game.player_analysis,
                username,
            )
            save_critical_moves(
                db,
                game_analysis,
                analyzed_game.player_analysis.get("critical_moments", []),
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


def resolve_player_color(game: Game, username: str) -> str | None:
    normalized_username = username.casefold()
    is_white = game.white.username.casefold() == normalized_username
    is_black = game.black.username.casefold() == normalized_username

    if is_white == is_black:
        return None
    return "white" if is_white else "black"


def collect_theory_results(
    queries: list[str],
    n_results: int = 2,
    *,
    phase: str | None = None,
) -> list[dict]:
    collected = []
    seen_sources = set()

    for query in queries:
        for result in search_theory(
            query,
            n_results=n_results,
            phase=phase,
        ):
            metadata = result.get("metadata", {})
            source_key = (
                metadata.get("study_id"),
                metadata.get("chapter"),
                metadata.get("source"),
            )
            if source_key in seen_sources:
                continue

            collected.append(
                {
                    "query": query,
                    "text": result.get("text", ""),
                    "metadata": metadata,
                    "distance": result.get("distance"),
                }
            )
            seen_sources.add(source_key)

    return collected[:5]


def build_theory_recommendations(theory_results: list[dict]) -> list[dict]:
    recommendations = []

    for result in theory_results:
        metadata = result.get("metadata", {})
        query = result.get("query", "training focus")
        recommendations.append(
            {
                "source": metadata.get("source"),
                "category": metadata.get("category"),
                "study_id": metadata.get("study_id"),
                "chapter": metadata.get("chapter"),
                "reason": f"Relevant for: {query}.",
                "distance": result.get("distance"),
            }
        )

    return recommendations


def collect_critical_moments(analyses: list[dict], limit: int = 10) -> list[dict]:
    moments = []

    for analysis in analyses:
        game_id = analysis.get("game_id", "")
        for moment in analysis.get("critical_moments", []):
            moments.append(
                {
                    "game_id": game_id,
                    "move_number": moment.get("move_number", 0),
                    "move": moment.get("move_san") or moment.get("move_uci", ""),
                    "phase": moment.get("phase", "unknown"),
                    "cpl": moment.get("cpl", 0),
                    "classification": moment.get("classification", "unknown"),
                }
            )

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
    critical_moments: list[dict],
) -> dict:
    api_key = settings.openai_api_key
    if not api_key:
        return build_fallback_training_plan(weakness_profile)

    client = AsyncOpenAI(api_key=api_key)
    prompt = build_training_plan_prompt(
        username,
        weakness_profile,
        theory_recommendations,
        critical_moments,
    )

    try:
        response = await client.chat.completions.create(
            model=settings.openai_model,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are Cerno, a concise chess coach. "
                        "Return only valid JSON with keys coach_advice, priority and week_plan. "
                        "coach_advice must be one natural paragraph with a warm, specific tone. "
                        "week_plan must be a list of 5 short strings. "
                        "Do not mention study IDs, database IDs, source IDs, raw RAG references, "
                        "or the recommended theory section in the training plan."
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
    critical_moments: list[dict],
) -> str:
    return json.dumps(
        {
            "username": username,
            "weakness_profile": weakness_profile,
            "critical_moments": critical_moments[:8],
            "theory_themes": summarize_theory_themes(theory_recommendations),
            "task": (
                "Create a practical one-week chess training plan and a short coach_advice paragraph. "
                "The coach_advice should explain the player's style from the evidence: main phase weakness, "
                "blunders, mistakes, tactical habits, and any relative strengths. "
                "Use friendly motivational language, but keep it specific and avoid repeating the same grandmaster jokes. "
                "Do not tell the user to open a study by ID; recommended theory is shown elsewhere."
            ),
        },
        ensure_ascii=False,
    )


def summarize_theory_themes(theory_recommendations: list[dict]) -> list[str]:
    themes = []
    for item in theory_recommendations:
        chapter = item.get("chapter")
        category = item.get("category")
        reason = item.get("reason")
        label = chapter or category or reason
        if label and label not in themes:
            themes.append(label)
    return themes[:5]


def normalize_training_plan(generated: dict, weakness_profile: dict) -> dict:
    if _is_valid_training_plan(generated):
        return {
            "priority": generated["priority"],
            "week_plan": remove_source_references(generated["week_plan"]),
        }
    return build_fallback_training_plan(weakness_profile)


def remove_source_references(steps: list[str]) -> list[str]:
    cleaned = []
    for step in steps:
        step = str(step)
        blocked_fragments = ["study ", "source ", "lichess.org/study"]
        if any(fragment in step.lower() for fragment in blocked_fragments):
            step = (
                "Choose one recurring mistake from the critical moments and write "
                "the correct plan in your own words."
            )
        cleaned.append(step)
    return cleaned


def build_fallback_training_plan(weakness_profile: dict) -> dict:
    main = weakness_profile.get("main_weakness", "opening")
    focus = weakness_profile.get("recommended_focus", [])
    priority = focus[0] if focus else f"{main} improvement"

    phase_plan = {
        "opening": [
            "Day 1: review basic opening principles and compare them with your critical moments.",
            "Day 2: choose one recurring opening mistake and write the correct plan in your own words.",
            "Day 3: play 3 rapid games focusing only on development, center control, and king safety.",
            "Day 4: review the opening phase of those games and mark repeated mistakes.",
            "Day 5: repeat the best line from memory and write down the plans in your own words.",
        ],
        "middlegame": [
            "Day 1: solve 20 tactical puzzles with no time pressure.",
            "Day 2: review your biggest critical moments and identify the missed candidate moves.",
            "Day 3: practice king safety and piece coordination positions.",
            "Day 4: play 3 rapid games focusing on calculation before forcing moves.",
            "Day 5: review every serious mistake and group them by pattern.",
        ],
        "endgame": [
            "Day 1: review basic king activity and pawn ending rules.",
            "Day 2: practice simple conversion positions against an engine.",
            "Day 3: practice one rook or pawn endgame theme until the plan feels automatic.",
            "Day 4: play training positions starting from simplified material.",
            "Day 5: review endgame critical moments and write the correct plan.",
        ],
    }

    return {
        "priority": priority,
        "week_plan": phase_plan.get(main, phase_plan["opening"]),
    }


def build_fallback_coach_advice(
    weakness_profile: dict,
    critical_moments: list[dict],
) -> str:
    main = weakness_profile.get("main_weakness", "middlegame")
    secondary = weakness_profile.get("secondary_weakness")
    patterns = weakness_profile.get("detected_patterns", [])
    phase_stats = weakness_profile.get("phase_stats", {})
    best_phase = detect_best_phase(phase_stats)
    blunders = sum(
        1 for moment in critical_moments if moment.get("classification") == "blunder"
    )

    weakness_text = f"your biggest losses are coming in the {main}"
    if secondary:
        weakness_text += f", with some extra pressure in the {secondary}"

    pattern_text = (
        f" The recurring pattern looks like {', '.join(patterns[:2])}."
        if patterns
        else ""
    )
    blunder_text = (
        f" I found {blunders} blunder{'s' if blunders != 1 else ''}, so the main goal is to slow down before forcing moves."
        if blunders
        else " The good news is that there were no huge tactical collapses in the critical moments."
    )
    strength_text = (
        f" Your {best_phase} looks comparatively more stable, so there is something solid to build on."
        if best_phase and best_phase != main
        else " There is a clear base to build from if you make the review process more disciplined."
    )

    return (
        f"I have reviewed the games and {weakness_text}."
        f"{pattern_text}{blunder_text}{strength_text} "
        "For the next week, keep the training simple: clean up the first recurring mistake, "
        "solve tactics slowly, and treat every critical moment as a position to understand rather than a move to memorize."
    )


def detect_best_phase(phase_stats: dict) -> str | None:
    candidates = [
        (phase, stats.get("avg_cpl", 0))
        for phase, stats in phase_stats.items()
        if stats.get("moves", 0)
    ]
    if not candidates:
        return None

    candidates.sort(key=lambda item: item[1])
    return candidates[0][0]


def _is_valid_training_plan(plan: dict) -> bool:
    return (
        isinstance(plan, dict)
        and isinstance(plan.get("priority"), str)
        and isinstance(plan.get("week_plan"), list)
        and all(isinstance(item, str) for item in plan["week_plan"])
    )
