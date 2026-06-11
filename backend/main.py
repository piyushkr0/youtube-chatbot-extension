"""
FastAPI application for the YouTube RAG Chatbot.

Serves as the backend for the Chrome extension.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import logging
import os

# Load environment variables from .env in project root
# Look for .env in the parent directory (project root) first, then current dir
env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")
if os.path.exists(env_path):
    load_dotenv(env_path)
else:
    load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(
    title="YouTube RAG Chatbot",
    description="RAG-powered chatbot for YouTube video transcripts",
    version="1.0.0",
)

# CORS — allow requests from Chrome extension and localhost
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "chrome-extension://*",
        "http://localhost",
        "http://localhost:3000",
        "http://127.0.0.1",
        "https://www.youtube.com",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Import and mount routes
from .api_routes import router as api_router

app.include_router(api_router)


@app.on_event("startup")
async def startup_event():
    """Pre-load the embedding model on server startup."""
    logger.info("Starting YouTube RAG Chatbot backend...")
    logger.info("Pre-loading embedding model (this may take a minute on first run)...")

    # Pre-load embeddings in a non-blocking way
    from .rag_pipeline import get_embeddings_model

    try:
        get_embeddings_model()
        logger.info("Embedding model ready!")
    except Exception as e:
        logger.error(f"Failed to pre-load embedding model: {e}")
        logger.warning("The model will be loaded on first request instead.")

    # Verify Groq API key is set
    if not os.getenv("GROQ_API_KEY"):
        logger.warning("GROQ_API_KEY is not set! Chat queries will fail.")
    else:
        logger.info("GROQ_API_KEY is configured.")

    logger.info("Backend is ready. Listening for requests...")


@app.get("/")
async def root():
    """Root endpoint with API info."""
    return {
        "app": "YouTube RAG Chatbot",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/api/health",
    }
