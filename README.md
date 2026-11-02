# StudyMate – AI Personal Study Assistant

A beginner-friendly local web app for organising PDF notes, extracting text, creating a simple summary, finding relevant passages, and generating practice MCQs.

## Features
- Upload text-based PDF files (maximum 15 MB each).
- Save documents in a local SQLite library.
- Generate an extractive summary.
- Ask questions and retrieve matching passages from a PDF.
- Generate simple multiple-choice practice questions and score your answers.
- Delete documents from the library.

## Important limitation
This is a **local starter project**, not a fully generative-AI application yet. Summary, question matching, and MCQ creation use lightweight text-processing rules; no external AI model or API key is used. Scanned/image-only PDFs are not supported because OCR is not included. Treat generated questions as practice prompts and verify answers against your notes.

## Requirements
- Windows 10/11
- Python 3.10 or newer
- VS Code

## Run on Windows (PowerShell)
Open this folder in VS Code, then open Terminal > New Terminal and run:

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
python -m uvicorn app.main:app --reload
```

If PowerShell blocks activation, run this once in that terminal and activate again:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\.venv\Scripts\Activate.ps1
```

Then open http://127.0.0.1:8000 in your browser. API documentation is at http://127.0.0.1:8000/docs.

You can also double-click `run_windows.bat` to create the virtual environment, install dependencies, and start the app.

## Stop the server
Press `Ctrl + C` in the terminal.

## Project structure
```text
AI_Personal_Study_Assistant/
├── app/
│   ├── main.py
│   └── static/
│       ├── index.html
│       ├── style.css
│       └── app.js
├── requirements.txt
├── .env.example
├── .gitignore
├── run_windows.bat
└── README.md
```

Uploaded PDFs and the SQLite database are stored in `data/` after the first run. This folder is ignored by Git.
