import argparse
import json
import os
import re
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent
DOCS_DIR = BASE_DIR / "docs"
DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8765
DEFAULT_OLLAMA_URL = "http://127.0.0.1:11434"
DEFAULT_MODEL = "llama3.1:8b"


def load_documents():
    documents = []
    for path in sorted(DOCS_DIR.glob("**/*.md")):
        text = path.read_text(encoding="utf-8")
        documents.extend(chunk_document(path, text))
    return documents


def chunk_document(path, text, max_chars=1800):
    chunks = []
    heading = path.stem
    current = []
    current_len = 0

    for line in text.splitlines():
        if line.startswith("#"):
            heading = line.lstrip("#").strip() or heading

        next_len = len(line) + 1
        if current and current_len + next_len > max_chars:
            chunks.append({
                "source": str(path.relative_to(BASE_DIR)),
                "heading": heading,
                "text": "\n".join(current).strip(),
            })
            current = []
            current_len = 0

        current.append(line)
        current_len += next_len

    if current:
        chunks.append({
            "source": str(path.relative_to(BASE_DIR)),
            "heading": heading,
            "text": "\n".join(current).strip(),
        })

    return [chunk for chunk in chunks if chunk["text"]]


def tokenize(text):
    return set(re.findall(r"[\w.:-]+", text.lower()))


def normalize_language(value):
    lowered = str(value or "").lower()
    if lowered == "vn":
        return "vi"
    return lowered if lowered in {"en", "vi"} else "en"


def retrieve_context(documents, question, language="en", limit=5):
    query_terms = tokenize(question)
    if not query_terms:
        return []

    scored = []
    for doc in documents:
        doc_terms = tokenize(f"{doc['heading']} {doc['text']}")
        overlap = len(query_terms & doc_terms)
        if overlap:
            language_boost = 0
            if language == "vi" and doc["source"].endswith(".vi.md"):
                language_boost = 2
            elif language == "en" and not doc["source"].endswith(".vi.md"):
                language_boost = 2
            scored.append((overlap + language_boost, doc))

    scored.sort(key=lambda item: item[0], reverse=True)
    return [doc for _, doc in scored[:limit]]


def ollama_chat(messages, model, ollama_url):
    payload = {
        "model": model,
        "messages": messages,
        "stream": False,
        "options": {
            "temperature": 0.2,
        },
    }
    request = urllib.request.Request(
        f"{ollama_url.rstrip('/')}/api/chat",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            data = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Ollama returned HTTP {exc.code}: {detail}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(
            "Cannot reach Ollama. Make sure Ollama is running on your machine "
            f"at {ollama_url} and that the model is available."
        ) from exc

    content = data.get("message", {}).get("content")
    if not content:
        raise RuntimeError("Ollama returned an empty response.")
    return content


def build_messages(question, history, context_chunks, language):
    context = "\n\n".join(
        f"Source: {chunk['source']} > {chunk['heading']}\n{chunk['text']}"
        for chunk in context_chunks
    )
    response_language = "Vietnamese" if language == "vi" else "English"
    system_prompt = (
        "You are the Notcobase support assistant. Help users use the product: "
        "tables, fields, records, users, roles, permissions, custom pages, and the UI editor. "
        "Answer with concise, practical steps. Mention required permissions when relevant. "
        f"Always answer in {response_language}. "
        "Use the retrieved documentation as your source of truth. If the docs do not cover the "
        "question, say what you can infer and ask for more details.\n\n"
        f"Retrieved documentation:\n{context or 'No matching documentation was found.'}"
    )
    messages = [{"role": "system", "content": system_prompt}]

    for item in history[-8:]:
        role = item.get("role")
        content = item.get("content")
        if role in {"user", "assistant"} and isinstance(content, str) and content.strip():
            messages.append({"role": role, "content": content.strip()})

    messages.append({"role": "user", "content": question})
    return messages


class ChatHandler(BaseHTTPRequestHandler):
    documents = []
    model = DEFAULT_MODEL
    ollama_url = DEFAULT_OLLAMA_URL

    def do_OPTIONS(self):
        self.send_response(204)
        self.add_cors_headers()
        self.end_headers()

    def do_GET(self):
        if self.path == "/health":
            self.send_json({"ok": True, "model": self.model, "documents": len(self.documents)})
            return
        self.send_error(404, "Not found")

    def do_POST(self):
        if self.path != "/chat":
            self.send_error(404, "Not found")
            return

        try:
            body = self.read_json()
            question = str(body.get("message", "")).strip()
            history = body.get("history", [])
            language = normalize_language(body.get("language"))
            if not question:
                self.send_json({"error": "Message is required."}, status=400)
                return

            context_chunks = retrieve_context(self.documents, question, language)
            messages = build_messages(question, history if isinstance(history, list) else [], context_chunks, language)
            answer = ollama_chat(messages, self.model, self.ollama_url)
            self.send_json({
                "answer": answer,
                "language": language,
                "sources": [
                    {"source": chunk["source"], "heading": chunk["heading"]}
                    for chunk in context_chunks
                ],
            })
        except Exception as exc:
            self.send_json({"error": str(exc)}, status=500)

    def read_json(self):
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length).decode("utf-8")
        return json.loads(raw or "{}")

    def send_json(self, payload, status=200):
        data = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.add_cors_headers()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def add_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def log_message(self, format, *args):
        print(f"{self.address_string()} - {format % args}")


def serve(host, port, model, ollama_url):
    ChatHandler.documents = load_documents()
    ChatHandler.model = model
    ChatHandler.ollama_url = ollama_url
    server = ThreadingHTTPServer((host, port), ChatHandler)
    print(f"AI chat server running at http://{host}:{port}")
    print(f"Using Ollama model: {model}")
    print(f"Loaded {len(ChatHandler.documents)} documentation chunks from {DOCS_DIR}")
    server.serve_forever()


def main():
    parser = argparse.ArgumentParser(description="Notcobase local Ollama support chat server")
    parser.add_argument("--host", default=os.getenv("AI_HOST", DEFAULT_HOST))
    parser.add_argument("--port", type=int, default=int(os.getenv("AI_PORT", DEFAULT_PORT)))
    parser.add_argument("--model", default=os.getenv("OLLAMA_MODEL", DEFAULT_MODEL))
    parser.add_argument("--ollama-url", default=os.getenv("OLLAMA_URL", DEFAULT_OLLAMA_URL))
    args = parser.parse_args()
    serve(args.host, args.port, args.model, args.ollama_url)


if __name__ == "__main__":
    main()
