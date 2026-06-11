"""
Session Manager for caching FAISS vector stores per video.

Prevents re-indexing the same video on every question.
Uses TTL-based expiry to prevent memory bloat.
"""

import time
import threading
import logging
from typing import Optional
from langchain_community.vectorstores import FAISS

logger = logging.getLogger(__name__)

# Default TTL: 30 minutes
DEFAULT_TTL_SECONDS = 30 * 60


class VideoSession:
    """Holds the FAISS index and metadata for a single video."""

    def __init__(self, video_id: str, vector_store: FAISS, transcript: str):
        self.video_id = video_id
        self.vector_store = vector_store
        self.transcript = transcript
        self.created_at = time.time()
        self.last_accessed = time.time()

    def touch(self):
        """Update the last accessed timestamp."""
        self.last_accessed = time.time()

    def is_expired(self, ttl: int) -> bool:
        """Check if this session has expired based on TTL."""
        return (time.time() - self.last_accessed) > ttl


class SessionManager:
    """
    Thread-safe in-memory session store keyed by video_id.

    Caches FAISS vector stores so re-indexing isn't needed on every question.
    Automatically cleans up expired sessions.
    """

    def __init__(self, ttl_seconds: int = DEFAULT_TTL_SECONDS, max_sessions: int = 50):
        self._sessions: dict[str, VideoSession] = {}
        self._lock = threading.Lock()
        self._ttl = ttl_seconds
        self._max_sessions = max_sessions

    def get(self, video_id: str) -> Optional[VideoSession]:
        """
        Retrieve a cached session for a video.

        Returns None if the session doesn't exist or has expired.
        """
        with self._lock:
            session = self._sessions.get(video_id)
            if session is None:
                return None

            if session.is_expired(self._ttl):
                logger.info(f"Session expired for video: {video_id}")
                del self._sessions[video_id]
                return None

            session.touch()
            return session

    def set(self, video_id: str, vector_store: FAISS, transcript: str) -> VideoSession:
        """
        Store a new session for a video.

        If the max session limit is reached, the oldest session is evicted.
        """
        with self._lock:
            # Evict expired sessions first
            self._cleanup_expired()

            # Evict oldest if at capacity
            if len(self._sessions) >= self._max_sessions and video_id not in self._sessions:
                oldest_id = min(
                    self._sessions,
                    key=lambda k: self._sessions[k].last_accessed,
                )
                logger.info(f"Evicting oldest session: {oldest_id}")
                del self._sessions[oldest_id]

            session = VideoSession(video_id, vector_store, transcript)
            self._sessions[video_id] = session
            logger.info(
                f"Session cached for video: {video_id} "
                f"(total sessions: {len(self._sessions)})"
            )
            return session

    def has(self, video_id: str) -> bool:
        """Check if a non-expired session exists for a video."""
        return self.get(video_id) is not None

    def remove(self, video_id: str) -> bool:
        """Remove a session for a video."""
        with self._lock:
            if video_id in self._sessions:
                del self._sessions[video_id]
                return True
            return False

    def _cleanup_expired(self):
        """Remove all expired sessions. Must be called with lock held."""
        expired = [
            vid for vid, session in self._sessions.items()
            if session.is_expired(self._ttl)
        ]
        for vid in expired:
            del self._sessions[vid]
        if expired:
            logger.info(f"Cleaned up {len(expired)} expired sessions")

    @property
    def active_count(self) -> int:
        """Return the number of active sessions."""
        with self._lock:
            self._cleanup_expired()
            return len(self._sessions)
