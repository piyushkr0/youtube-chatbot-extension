"""
API Routes for the YouTube RAG Chatbot.

Provides REST endpoints for indexing videos and querying the RAG pipeline.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
import logging
import time

from .rag_pipeline import fetch_transcript, build_index, generate_summary, query_rag
from .session_manager import SessionManager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api")

# Global session manager instance
session_mgr = SessionManager(ttl_seconds=30 * 60, max_sessions=50)


# ──────────────────────────────────────────────
# Request / Response models
# ──────────────────────────────────────────────
class IndexRequest(BaseModel):
    video_id: str = Field(..., description="YouTube video ID", min_length=1)


class IndexResponse(BaseModel):
    video_id: str
    summary: str
    transcript_length: int
    cached: bool
    processing_time_ms: float


class ChatRequest(BaseModel):
    video_id: str = Field(..., description="YouTube video ID", min_length=1)
    question: str = Field(..., description="User question about the video", min_length=1)


class ChatResponse(BaseModel):
    video_id: str
    question: str
    answer: str
    processing_time_ms: float


class HealthResponse(BaseModel):
    status: str
    active_sessions: int


# ──────────────────────────────────────────────
# Endpoints
# ──────────────────────────────────────────────
@router.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint."""
    return HealthResponse(
        status="healthy",
        active_sessions=session_mgr.active_count,
    )


@router.post("/index", response_model=IndexResponse)
async def index_video(request: IndexRequest):
    """
    Fetch transcript, build FAISS index, and return a summary.

    If the video is already indexed, returns the cached summary.
    """
    video_id = request.video_id.strip()
    start = time.time()

    # Check cache first
    existing = session_mgr.get(video_id)
    if existing:
        logger.info(f"Cache hit for video: {video_id}")
        try:
            summary = generate_summary(existing.vector_store)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Summary generation failed: {str(e)}")

        elapsed = (time.time() - start) * 1000
        return IndexResponse(
            video_id=video_id,
            summary=summary,
            transcript_length=len(existing.transcript),
            cached=True,
            processing_time_ms=round(elapsed, 2),
        )

    # Fetch and index
    try:
        transcript = fetch_transcript(video_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    try:
        vector_store = build_index(transcript)
    except Exception as e:
        logger.error(f"Indexing failed: {e}")
        raise HTTPException(status_code=500, detail=f"Indexing failed: {str(e)}")

    # Cache the session
    session_mgr.set(video_id, vector_store, transcript)

    # Generate summary
    try:
        summary = generate_summary(vector_store)
    except Exception as e:
        logger.error(f"Summary generation failed: {e}")
        raise HTTPException(status_code=500, detail=f"Summary generation failed: {str(e)}")

    elapsed = (time.time() - start) * 1000
    return IndexResponse(
        video_id=video_id,
        summary=summary,
        transcript_length=len(transcript),
        cached=False,
        processing_time_ms=round(elapsed, 2),
    )


@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """
    Ask a question about an indexed video.

    The video must be indexed first via /api/index.
    """
    video_id = request.video_id.strip()
    question = request.question.strip()
    start = time.time()

    # Look up session
    session = session_mgr.get(video_id)
    if session is None:
        raise HTTPException(
            status_code=404,
            detail=f"Video '{video_id}' has not been indexed yet. Call /api/index first.",
        )

    # Query the RAG chain
    try:
        answer = query_rag(session.vector_store, question)
    except Exception as e:
        logger.error(f"RAG query failed: {e}")
        raise HTTPException(status_code=500, detail=f"Query failed: {str(e)}")

    elapsed = (time.time() - start) * 1000
    return ChatResponse(
        video_id=video_id,
        question=question,
        answer=answer,
        processing_time_ms=round(elapsed, 2),
    )
