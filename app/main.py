from fastapi import FastAPI
from app.routers import games

app = FastAPI(
    title="Cerno",
    description="Chess coaching agent",
    version="0.1.0"
)

app.include_router(games.router)

@app.get("/health")
async def health():
    return {"status": "ok", "service": "cerno"}