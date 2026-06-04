from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import TrainingRecommendation, UserProfile, WeaknessProfile


def save_training_recommendation(
    db: Session,
    user: UserProfile,
    weakness_profile: WeaknessProfile | None,
    training_plan: dict,
    rag_sources: list[dict],
) -> TrainingRecommendation:
    recommendation = TrainingRecommendation(
        user_id=user.id,
        game_analysis_id=None,
        weakness_profile_id=weakness_profile.id if weakness_profile else None,
        title=training_plan.get("priority", "Training plan"),
        description="\n".join(training_plan.get("week_plan", [])),
        priority=training_plan.get("priority", "medium"),
        source_type="rag",
        rag_sources=rag_sources,
    )
    db.add(recommendation)
    db.flush()
    return recommendation


def get_user_recommendations(
    db: Session,
    username: str,
    limit: int = 5,
) -> list[TrainingRecommendation]:
    statement = (
        select(TrainingRecommendation)
        .join(UserProfile)
        .where(UserProfile.lichess_username == username)
        .order_by(TrainingRecommendation.created_at.desc())
        .limit(limit)
    )
    return list(db.scalars(statement))
