from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import UserProfile, WeaknessProfile
from app.services.weakness import score_phase


def upsert_weakness_profile(
    db: Session,
    user: UserProfile,
    weakness_profile: dict,
) -> WeaknessProfile:
    existing = db.scalar(
        select(WeaknessProfile)
        .where(WeaknessProfile.user_id == user.id)
        .order_by(WeaknessProfile.updated_at.desc())
    )

    phase_stats = weakness_profile.get("phase_stats", {})
    totals = calculate_error_totals(phase_stats)
    scores = {
        phase: score_phase(stats)
        for phase, stats in phase_stats.items()
    }

    values = {
        "games_analyzed": weakness_profile.get("games_analyzed", 0),
        "main_weakness": weakness_profile.get("main_weakness", "unknown"),
        "opening_score": scores.get("opening", 0),
        "middlegame_score": scores.get("middlegame", 0),
        "endgame_score": scores.get("endgame", 0),
        "tactical_errors": totals["mistakes"] + totals["blunders"],
        "strategic_errors": totals["inaccuracies"],
        "blunders_total": totals["blunders"],
        "mistakes_total": totals["mistakes"],
        "inaccuracies_total": totals["inaccuracies"],
        "profile_data": weakness_profile,
    }

    if existing:
        for key, value in values.items():
            setattr(existing, key, value)
        db.flush()
        return existing

    profile = WeaknessProfile(user_id=user.id, **values)
    db.add(profile)
    db.flush()
    return profile


def get_user_weakness_profile(db: Session, username: str) -> WeaknessProfile | None:
    statement = (
        select(WeaknessProfile)
        .join(UserProfile)
        .where(UserProfile.lichess_username == username)
        .order_by(WeaknessProfile.updated_at.desc())
    )
    return db.scalar(statement)


def calculate_error_totals(phase_stats: dict) -> dict:
    return {
        "inaccuracies": sum(stats.get("inaccuracies", 0) for stats in phase_stats.values()),
        "mistakes": sum(stats.get("mistakes", 0) for stats in phase_stats.values()),
        "blunders": sum(stats.get("blunders", 0) for stats in phase_stats.values()),
    }
