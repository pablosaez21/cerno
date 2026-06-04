from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import UserProfile


def get_user_by_username(db: Session, username: str) -> UserProfile | None:
    statement = select(UserProfile).where(UserProfile.lichess_username == username)
    return db.scalar(statement)


def get_or_create_user(db: Session, username: str) -> UserProfile:
    user = get_user_by_username(db, username)
    if user:
        return user

    user = UserProfile(lichess_username=username)
    db.add(user)
    db.flush()
    return user
