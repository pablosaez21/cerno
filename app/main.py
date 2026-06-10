from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.routers import games, agent, theory, coach, users

app = FastAPI(
    title="Cerno",
    description="Chess coaching agent",
    version="0.1.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(games.router)
app.include_router(agent.router)
app.include_router(theory.router)
app.include_router(coach.router)
app.include_router(users.router)

@app.get("/health")
async def health():
    return {"status": "ok", "service": "cerno"}
