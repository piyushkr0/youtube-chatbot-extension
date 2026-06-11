from youtube_transcript_api import YouTubeTranscriptApi, TranscriptsDisabled
from langchain_groq import ChatGroq
from dotenv import load_dotenv
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_community.vectorstores import FAISS
from langchain_core.prompts import PromptTemplate
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.runnables import RunnableParallel, RunnablePassthrough , RunnableLambda
from langchain_core.output_parsers import StrOutputParser
import os
load_dotenv ()

#               ||indexing||
#get yt_transcript
video_id = input("enter the yt video id")
try:
    ytt_api = YouTubeTranscriptApi()
    transcript_list = ytt_api.fetch(video_id)

    transcript = " ".join(chunk.text for chunk in transcript_list)

except TranscriptsDisabled:
    print("Faah!")

#text_splitting
splitter =RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
chunks=splitter.create_documents([transcript])

#generate embeddings and store in vector database
embeddings=HuggingFaceEmbeddings(model_name='BAAI/bge-small-en')
vector_store = FAISS.from_documents(chunks, embeddings)
vector_store.index_to_docstore_id

#retrieval(defines a retriever which returns similarity of query and context and finds 4 vectors which are closest to the given query)
retriever = vector_store.as_retriever(search_type="similarity", search_kwargs={"k": 4})

#augmentation
prompt = PromptTemplate(
    template="""
      You are a helpful assistant.
      Answer ONLY from the provided transcript context.
      If the context is insufficient, just say you don't know.

      {context}
      Question: {question}
    """,
    input_variables = ['context', 'question']
)

#genreation
llm = ChatGroq(
    model="llama-3.1-8b-instant",
    api_key=os.getenv("GROQ_API_KEY")
)

def format_docs(retrieved_docs):
    context_text = "\n\n".join(doc.page_content for doc in retrieved_docs)
    return context_text


parallel_chain =RunnableParallel(
    {
        'context':retriever| RunnableLambda(format_docs),
        'question':RunnablePassthrough()
    }
)

parser= StrOutputParser()

main_chain= parallel_chain|prompt|llm|parser
question="whats being discussed in this video?"
print(main_chain.invoke(question))

