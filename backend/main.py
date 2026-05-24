from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from database import get_supabase_client

app = FastAPI(title="Asyk Game API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ScorePayload(BaseModel):
    player_name: str
    score: int
    moves: int


@app.post("/api/score")
async def save_score(payload: ScorePayload):
    """Save player result to Supabase."""
    if not payload.player_name.strip():
        raise HTTPException(status_code=400, detail="player_name cannot be empty")

    supabase = get_supabase_client()
    data = {
        "player_name": payload.player_name.strip(),
        "score": payload.score,
        "moves": payload.moves,
    }

    response = supabase.table("leaderboard").insert(data).execute()

    if not response.data:
        raise HTTPException(status_code=500, detail="Failed to save score")

    return {"status": "ok", "data": response.data[0]}


@app.get("/api/leaderboard")
async def get_leaderboard():
    """Fetch top-10 players ordered by score descending."""
    supabase = get_supabase_client()

    response = (
        supabase.table("leaderboard")
        .select("player_name, score, moves, created_at")
        .order("score", desc=True)
        .limit(10)
        .execute()
    )

    return {"leaderboard": response.data}


@app.get("/health")
async def health_check():
    return {"status": "healthy"}
