from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.repositories.analyses import get_user_analyses
from app.db.repositories.recommendations import get_user_recommendations
from app.db.repositories.weaknesses import get_user_weakness_profile
from app.db.session import get_db

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/{username}/weakness-profile")
async def read_weakness_profile(username: str, db: Session = Depends(get_db)):
    profile = get_user_weakness_profile(db, username)
    if not profile:
        raise HTTPException(
            status_code=404,
            detail=f"No weakness profile found for '{username}'."
        )

    recommendations = get_user_recommendations(db, username, limit=5)
    profile_data = profile.profile_data or {}

    return {
        "username": username,
        "games_analyzed": profile.games_analyzed,
        "main_weakness": profile.main_weakness,
        "phase_stats": profile_data.get("phase_stats", {}),
        "detected_patterns": profile_data.get("detected_patterns", []),
        "recommended_focus": profile_data.get("recommended_focus", []),
        "recommended_training": [
            {
                "title": recommendation.title,
                "priority": recommendation.priority,
            }
            for recommendation in recommendations
        ],
    }


@router.get("/{username}/analyses")
async def read_user_analyses(username: str, db: Session = Depends(get_db)):
    analyses = get_user_analyses(db, username)

    return {
        "username": username,
        "total": len(analyses),
        "analyses": [
            {
                "id": analysis.id,
                "lichess_game_id": analysis.lichess_game_id,
                "opponent": analysis.opponent,
                "color_played": analysis.color_played,
                "result": analysis.result,
                "opening_name": analysis.opening_name,
                "total_moves": analysis.total_moves,
                "analysis_summary": analysis.analysis_summary,
                "created_at": analysis.created_at,
            }
            for analysis in analyses
        ],
    }
