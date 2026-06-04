from sqlalchemy.orm import Session

from app.db.models import AgentSession, UserProfile


def save_agent_session(
    db: Session,
    input_message: str,
    output_message: str,
    tools_used: list[dict],
    user: UserProfile | None = None,
) -> AgentSession:
    session = AgentSession(
        user_id=user.id if user else None,
        input_message=input_message,
        output_message=output_message,
        tools_used=tools_used,
    )
    db.add(session)
    db.flush()
    return session
