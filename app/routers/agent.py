from fastapi import APIRouter
from pydantic import BaseModel
from app.services.agent import run_agent

router = APIRouter(prefix="/agent", tags=["agent"])

class AgentRequest(BaseModel):
    message: str

@router.post("/chat")
async def chat(request: AgentRequest):
    response = await run_agent(request.message)
    return {"response": response}