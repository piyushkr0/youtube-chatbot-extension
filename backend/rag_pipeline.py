"""
RAG Pipeline for YouTube Video Transcripts.

Refactored from test.py into modular, reusable functions.
Handles transcript fetching, text chunking, vector indexing, and LLM querying.
"""

from youtube_transcript_api import YouTubeTranscriptApi, TranscriptsDisabled
from langchain_groq import ChatGroq
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_community.vectorstores import FAISS
from langchain_core.prompts import PromptTemplate
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.runnables import RunnableParallel, RunnablePassthrough, RunnableLambda
from langchain_core.output_parsers import StrOutputParser
import os
import logging

logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────
# Embedding model (loaded once, reused globally)
# ──────────────────────────────────────────────
_embeddings_model = None


def get_embeddings_model() -> HuggingFaceEmbeddings:
    """Lazily load and cache the embedding model."""
    global _embeddings_model
    if _embeddings_model is None:
        logger.info("Loading embedding model BAAI/bge-small-en ...")
        _embeddings_model = HuggingFaceEmbeddings(model_name="BAAI/bge-small-en")
        logger.info("Embedding model loaded.")
    return _embeddings_model


# ──────────────────────────────────────────────
# Transcript Fetching
# ──────────────────────────────────────────────
def fetch_transcript(video_id: str) -> str:
    """
    Fetch the transcript for a YouTube video.

    Args:
        video_id: The YouTube video ID (e.g., 'dQw4w9WgXcQ')

    Returns:
        The full transcript as a single string.

    Raises:
        ValueError: If transcripts are disabled or not available.
    """
    try:
        ytt_api = YouTubeTranscriptApi()
        transcript_list = ytt_api.fetch(video_id)
        transcript = " ".join(chunk.text for chunk in transcript_list)

        if not transcript.strip():
            raise ValueError(f"Transcript is empty for video: {video_id}")

        logger.info(f"Fetched transcript for {video_id} ({len(transcript)} chars)")
        return transcript

    except TranscriptsDisabled:
        raise ValueError(
            f"Transcripts are disabled for video: {video_id}. "
            "The video owner may have turned off captions."
        )
    except Exception as e:
        raise ValueError(f"Failed to fetch transcript for {video_id}: {str(e)}")


# ──────────────────────────────────────────────
# Indexing (text splitting → embeddings → FAISS)
# ──────────────────────────────────────────────
def build_index(transcript: str) -> FAISS:
    """
    Split transcript into chunks, generate embeddings, and build a FAISS index.

    Args:
        transcript: The full transcript text.

    Returns:
        A FAISS vector store ready for retrieval.
    """
    splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
    chunks = splitter.create_documents([transcript])
    logger.info(f"Split transcript into {len(chunks)} chunks")

    embeddings = get_embeddings_model()
    vector_store = FAISS.from_documents(chunks, embeddings)
    logger.info("FAISS index built successfully")

    return vector_store


# ──────────────────────────────────────────────
# RAG Chain
# ──────────────────────────────────────────────
SUMMARY_PROMPT = PromptTemplate(
    template="""You are an expert video content analyst.
Based on the provided transcript context, generate a clear, well-structured summary of the video.
Include the main topics, key points, and any important details mentioned.
Format the summary with bullet points for readability.

{context}

Provide a comprehensive summary of this video:""",
    input_variables=["context"],
)

QA_PROMPT = PromptTemplate(
    template="""You are a helpful assistant that answers questions about YouTube videos.
Answer ONLY from the provided transcript context.
If the context is insufficient, say "I don't have enough information from the transcript to answer that."
Be concise but thorough.

{context}
Question: {question}""",
    input_variables=["context", "question"],
)


def _format_docs(retrieved_docs) -> str:
    """Format retrieved documents into a single context string."""
    return "\n\n".join(doc.page_content for doc in retrieved_docs)


def _get_llm() -> ChatGroq:
    """Create and return the Groq LLM instance."""
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise ValueError("GROQ_API_KEY not set in environment variables")

    return ChatGroq(
        model="llama-3.1-8b-instant",
        api_key=api_key,
    )


def generate_summary(vector_store: FAISS) -> str:
    """
    Generate a summary of the video using the RAG pipeline.

    Args:
        vector_store: The FAISS vector store containing the transcript chunks.

    Returns:
        A formatted summary string.
    """
    retriever = vector_store.as_retriever(search_type="similarity", search_kwargs={"k": 6})
    llm = _get_llm()
    parser = StrOutputParser()

    chain = (
        {"context": retriever | RunnableLambda(_format_docs)}
        | SUMMARY_PROMPT
        | llm
        | parser
    )

    summary = chain.invoke("Summarize the entire video content")
    logger.info("Summary generated successfully")
    return summary


def query_rag(vector_store: FAISS, question: str) -> str:
    """
    Query the RAG chain with a user question.

    Args:
        vector_store: The FAISS vector store containing the transcript chunks.
        question: The user's question about the video.

    Returns:
        The LLM's answer based on retrieved transcript context.
    """
    retriever = vector_store.as_retriever(search_type="similarity", search_kwargs={"k": 4})
    llm = _get_llm()
    parser = StrOutputParser()

    parallel_chain = RunnableParallel(
        {
            "context": retriever | RunnableLambda(_format_docs),
            "question": RunnablePassthrough(),
        }
    )

    main_chain = parallel_chain | QA_PROMPT | llm | parser
    answer = main_chain.invoke(question)
    logger.info(f"RAG query answered: '{question[:50]}...'")
    return answer
