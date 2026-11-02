from pathlib import Path
import re
import sqlite3
import uuid
from collections import Counter

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
UPLOADS = DATA / "uploads"
DB = DATA / "studymate.db"
STATIC = Path(__file__).resolve().parent / "static"
UPLOADS.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="StudyMate - AI Personal Study Assistant")


def db():
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    return conn


with db() as conn:
    conn.execute("""
        CREATE TABLE IF NOT EXISTS documents (
            id TEXT PRIMARY KEY,
            filename TEXT NOT NULL,
            stored_name TEXT NOT NULL,
            extracted_text TEXT NOT NULL,
            uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)


def get_doc(doc_id):
    with db() as conn:
        row = conn.execute("SELECT * FROM documents WHERE id=?", (doc_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Document not found.")
    return dict(row)


def split_sentences(text):
    text = re.sub(r"\s+", " ", text).strip()
    return [s.strip() for s in re.split(r"(?<=[.!?])\s+", text) if len(s.strip()) > 25]


def summarize(text, limit=6):
    parts = split_sentences(text)
    if not parts:
        return "There is not enough readable text to create a summary."
    stop = set("the and for that with this from have are was were has had into about their there which when what your you can will also than then them they".split())
    words = re.findall(r"\b[a-zA-Z]{3,}\b", text.lower())
    freq = Counter(w for w in words if w not in stop)
    ranked = []
    for index, sentence in enumerate(parts):
        tokens = [w for w in re.findall(r"\b[a-zA-Z]{3,}\b", sentence.lower()) if w not in stop]
        score = sum(freq[w] for w in tokens) / max(1, len(tokens))
        ranked.append((score, index, sentence))
    best = sorted(ranked, reverse=True)[:limit]
    return " ".join(item[2] for item in sorted(best, key=lambda x: x[1]))


def create_mcqs(text, count=5):
    parts = split_sentences(text)
    result = []
    for sentence in parts:
        match = re.search(r"\b[A-Za-z][A-Za-z-]{4,}\b", sentence)
        if not match:
            continue
        answer = match.group(0).strip(".,:;()")
        if answer.lower() in {"which", "these", "those", "there", "their", "about", "because"}:
            continue
        question = sentence[:match.start()] + "________" + sentence[match.end():]
        distractors = []
        for other in parts:
            for word in re.findall(r"\b[A-Za-z]{5,}\b", other):
                if word.lower() != answer.lower() and word.lower() not in {x.lower() for x in distractors}:
                    distractors.append(word)
                if len(distractors) == 3:
                    break
            if len(distractors) == 3:
                break
        options = [answer] + distractors
        if len(options) < 2:
            continue
        shift = len(result) % len(options)
        options = options[shift:] + options[:shift]
        result.append({"question": question, "options": options, "answer": answer, "explanation": sentence})
        if len(result) >= count:
            break
    return result


@app.get("/api/health")
def health():
    return {"status": "ok", "app": "StudyMate"}


@app.post("/api/upload")
async def upload_pdf(file: UploadFile = File(...)):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Please choose a PDF file.")
    data = await file.read()
    if len(data) > 15 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="PDF must be 15 MB or smaller.")
    doc_id = str(uuid.uuid4())
    stored_name = f"{doc_id}.pdf"
    path = UPLOADS / stored_name
    path.write_bytes(data)
    try:
        reader = PdfReader(str(path))
        extracted = "\n".join(page.extract_text() or "" for page in reader.pages).strip()
    except Exception:
        path.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail="This PDF could not be read.")
    if not extracted:
        path.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail="No selectable text found. Scanned/image-only PDFs are not supported in this starter version.")
    with db() as conn:
        conn.execute(
            "INSERT INTO documents (id, filename, stored_name, extracted_text) VALUES (?, ?, ?, ?)",
            (doc_id, file.filename, stored_name, extracted)
        )
    return {"id": doc_id, "filename": file.filename, "characters": len(extracted)}


@app.get("/api/documents")
def list_documents():
    with db() as conn:
        rows = conn.execute(
            "SELECT id, filename, length(extracted_text) AS characters, uploaded_at FROM documents ORDER BY uploaded_at DESC"
        ).fetchall()
    return [dict(row) for row in rows]


@app.get("/api/documents/{doc_id}")
def document_details(doc_id: str):
    doc = get_doc(doc_id)
    return {"id": doc["id"], "filename": doc["filename"], "characters": len(doc["extracted_text"]), "preview": doc["extracted_text"][:1200]}


@app.delete("/api/documents/{doc_id}")
def delete_document(doc_id: str):
    doc = get_doc(doc_id)
    (UPLOADS / doc["stored_name"]).unlink(missing_ok=True)
    with db() as conn:
        conn.execute("DELETE FROM documents WHERE id=?", (doc_id,))
    return {"message": "Document deleted."}


@app.get("/api/documents/{doc_id}/summary")
def get_summary(doc_id: str):
    return {"summary": summarize(get_doc(doc_id)["extracted_text"])}


@app.post("/api/documents/{doc_id}/chat")
def chat(doc_id: str, payload: dict):
    text = get_doc(doc_id)["extracted_text"]
    question = str(payload.get("question", "")).strip()
    if not question:
        raise HTTPException(status_code=400, detail="Please enter a question.")
    ignored = {"what", "when", "where", "which", "about", "does", "this", "that", "from", "with", "explain", "tell", "the"}
    terms = [w for w in re.findall(r"\b[a-zA-Z]{3,}\b", question.lower()) if w not in ignored]
    ranked = []
    for index, sentence in enumerate(split_sentences(text)):
        score = sum(sentence.lower().count(term) for term in terms)
        if score:
            ranked.append((score, index, sentence))
    ranked.sort(key=lambda x: (-x[0], x[1]))
    if ranked:
        answer = "Relevant passages from your PDF:\n\n" + "\n".join("• " + item[2] for item in ranked[:4])
    else:
        answer = "I couldn't find a close match. Try asking with important keywords used in the PDF."
    return {"answer": answer}


@app.get("/api/documents/{doc_id}/mcqs")
def get_mcqs(doc_id: str, count: int = 5):
    return {"questions": create_mcqs(get_doc(doc_id)["extracted_text"], max(1, min(count, 10)))}


@app.get("/")
def home():
    return FileResponse(STATIC / "index.html")


app.mount("/static", StaticFiles(directory=STATIC), name="static")
