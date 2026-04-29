# YTPilot

YTPilot is a web-based GUI for `yt-dlp` with a mobile-friendly Liquid Glass interface, server-side FFmpeg processing, real-time queue updates, playlist-aware analysis, subtitle selection, editable metadata, and tokenized downloads.

## Stack

- Frontend: Next.js 15 + React 19
- Backend: FastAPI + SSE
- Processing: `yt-dlp` + `ffmpeg`

## Run locally

### One-time automatic setup on Windows

```powershell
cd C:\Users\Asus\Documents\Codex\2026-04-22-role-you-are-an-expert-full-2
powershell -ExecutionPolicy Bypass -File .\setup.ps1
```

This script:

- installs `Python`, `Node.js`, `yt-dlp`, and `ffmpeg` with `winget`
- creates `backend\.venv`
- installs backend Python packages
- installs frontend npm packages

### Start both servers on Windows

```powershell
cd C:\Users\Asus\Documents\Codex\2026-04-22-role-you-are-an-expert-full-2
.\start.ps1
```

Or double-click `start.bat`.

### Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Set `NEXT_PUBLIC_API_BASE=http://localhost:8000/api/v1` if needed.

## Implementation Flow

1. Paste or search a URL.
2. Analyze metadata, formats, subtitles, and playlist entries before downloading.
3. Choose video/audio mode, exact format, bitrate, subtitles, and metadata edits.
4. Queue the server-side job.
5. Track live progress through SSE.
6. Download from an expiring tokenized link when processing completes.

## Notes

- This starter keeps jobs in memory for speed and simplicity.
- For production, move the queue to Redis/Postgres and store output in object storage.
- Cover-art embedding for YouTube Music is prepared at the metadata layer and can be extended inside `ffmpeg_service.py`.
- Automatic setup currently expects `winget` on Windows 10/11.
