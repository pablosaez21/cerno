from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.coach import CoachAnalyzeUserRequest, CoachAnalyzeUserResponse
from app.services.coach import analyze_user
from app.services.lichess import (
    LichessRateLimitError,
    LichessServiceError,
    LichessUserNotFoundError,
)

router = APIRouter(prefix="/coach", tags=["coach"])


@router.post("/analyze-user", response_model=CoachAnalyzeUserResponse)
async def analyze_lichess_user(
    request: CoachAnalyzeUserRequest,
    db: Session = Depends(get_db),
):
    try:
        result = await analyze_user(
            username=request.username,
            limit=request.limit,
            depth=request.depth,
            save=request.save,
            db=db,
        )
    except LichessUserNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except LichessRateLimitError as exc:
        raise HTTPException(
            status_code=503,
            detail=str(exc),
            headers={"Retry-After": str(exc.retry_after)},
        ) from exc
    except LichessServiceError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail="Could not complete the coach analysis."
        ) from exc

    return CoachAnalyzeUserResponse(**result)
