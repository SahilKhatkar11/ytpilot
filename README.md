# YTPilot

🚀 **YTPilot** is a polished web interface for `yt-dlp` and FFmpeg. Paste a YouTube link, inspect available streams, choose your output settings, and process downloads through a clean Next.js + FastAPI app.

## ✨ Features

- 🎬 Video downloads with quality selection up to available 2K/4K streams
- 🎧 Audio extraction with selectable bitrate targets
- ✂️ Video/audio trimming
- 🖼️ Editable metadata and custom cover art upload
- 🧾 Optional embedded subtitle support
- 📚 Playlist-aware analysis and queueing
- 📡 Real-time processing updates with Server-Sent Events
- 🔐 Optional, temporary `cookies.txt` upload flow for videos that require YouTube authentication
- 🌗 Light/dark responsive UI inspired by Google AI Studio

## 🧱 Tech Stack

- **Frontend:** Next.js 15, React 19, Tailwind CSS, Motion
- **Backend:** FastAPI, Pydantic, Server-Sent Events
- **Processing:** `yt-dlp`, FFmpeg
- **Deployment:** Render-ready backend Dockerfile and `render.yaml`

## 📁 Project Structure

```text
YTPilot/
├── backend/          # FastAPI API, yt-dlp orchestration, FFmpeg processing
├── frontend/         # Next.js app and UI components
├── docs/             # Architecture and deployment notes
├── render.yaml       # Render deployment blueprint
├── setup.ps1         # Windows helper setup script
└── start.ps1         # Windows helper startup script
```

## ⚡ Run Locally

Clone the repository and enter the project folder:

```bash
git clone https://github.com/YOUR_USERNAME/YTPilot.git
cd YTPilot
```

### Windows Quick Setup

If you are on Windows 10/11 with `winget`, you can use the helper script:

```powershell
powershell -ExecutionPolicy Bypass -File .\setup.ps1
```

Then start both servers:

```powershell
.\start.ps1
```

Or double-click `start.bat`.

### Manual Backend Setup

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

The backend runs at:

```text
http://127.0.0.1:8000
```

### Manual Frontend Setup

Open another terminal:

```powershell
cd frontend
npm install
npm run dev
```

The frontend runs at:

```text
http://localhost:3000
```

If needed, set:

```env
NEXT_PUBLIC_API_BASE=http://localhost:8000/api/v1
```

## 🔐 Cookies Flow

YTPilot first tries to analyze public videos without cookies.

If YouTube blocks a request with a sign-in, bot-check, or rate-limit challenge, the UI lets the user voluntarily upload an exported Netscape `cookies.txt` file. Uploaded cookies are temporary, token-based, and can be cleared from the UI.

Do **not** commit personal cookies or `.env` files. The included `.gitignore` excludes local cookies, temporary uploads, generated media, virtual environments, and build output.

## ☁️ Render Deployment

This repo includes a Render blueprint:

```text
render.yaml
```

Before deploying, update these values in Render:

- `CORS_ORIGIN` → your frontend URL
- `NEXT_PUBLIC_API_BASE` → your backend URL + `/api/v1`

More notes are available in:

```text
docs/render-deployment.md
```

## 🧪 Typical Workflow

1. Paste a YouTube URL.
2. Analyze available formats, subtitles, and metadata.
3. Choose video/audio mode, quality, format, trim range, and metadata.
4. Start processing.
5. Watch real-time queue progress.
6. Download the processed file when ready.

## ⚠️ Notes

- FFmpeg-heavy 2K/4K processing depends on server CPU and memory.
- Free hosting tiers may be slow or may time out on large transcodes.
- Jobs are currently stored in memory for simplicity. For production-scale use, move queue state to Redis/Postgres and store files in object storage.

## 👤 Author

Crafted for excellence by **Sahil Khatkar**.
