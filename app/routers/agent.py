from fastapi import APIRouter
from pydantic import BaseModel
from app.services.agent import run_agent
from app.services.rag import index_study

router = APIRouter(prefix="/agent", tags=["agent"])

class AgentRequest(BaseModel):
    message: str

class StudyRequest(BaseModel):
    study_id: str    

@router.post("/chat")
async def chat(request: AgentRequest):
    response = await run_agent(request.message)
    return {"response": response}


@router.post("/index-study")
async def index_chess_study(request: StudyRequest):
    total = await index_study(request.study_id)
    return {"indexed_chunks": total, "study_id": request.study_id}