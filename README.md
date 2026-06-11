# youtube-chatbot-extension

A Chrome extension that lets you chat with any YouTube video using AI.

Instead of scrolling through a long video to find information, you can ask questions directly, get summaries, clarify concepts, and explore the content through a conversational interface.

The extension works by extracting video context and sending it to a Python backend powered by a Retrieval-Augmented Generation (RAG) pipeline, allowing responses to stay relevant to the video you're watching.

## Features

- Ask questions about the current video
- Generate quick summaries
- Get explanations of complex topics
- Context-aware responses
- Clean Chrome extension interface
- Powered by a Python RAG backend

## Example Questions

- What is this video about?
- Summarize the key points.
- Explain this concept in simpler terms.
- What are the main takeaways?
- What did the speaker say about ___?

## Tech Stack

- Python
- FastAPI
- Chrome Extension (Manifest V3)
- RAG Pipeline
- OpenAI API

## Setup

```bash
git clone https://github.com/your-username/youtube-chatbot-extension.git
cd youtube-chatbot-extension
pip install -r requirements.txt
```

Start the backend:

```bash
uvicorn main:app --reload
```

Then load the `extension` folder through:

```text
chrome://extensions
```

and enable Developer Mode.

## Why I Built This

I often found myself watching long tutorials, lectures, and technical videos where I wanted quick answers without scrubbing through the timeline. This project explores how RAG and LLMs can make video content more interactive by turning YouTube videos into something you can simply chat with.

---

Built by Piyush Kumar.
