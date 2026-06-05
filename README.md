# 📺 YTPilot

🚀 **YTPilot** is a polished web interface for `yt-dlp` and FFmpeg. Paste a YouTube link, inspect available streams, choose output settings, and process media through a clean Next.js + FastAPI app.

## ✨ Features

- 🎬 Video downloads with quality selection up to available 2K/4K streams
- 🎧 Audio extraction with selectable bitrate targets
- ✂️ Video/audio trimming
- 🖼️ Editable metadata and custom cover art upload
- 🧾 Optional embedded subtitle support
- 📚 Playlist-aware analysis and queueing
- 📡 Real-time processing updates with Server-Sent Events
- 🔐 Optional, temporary `cookies.txt` upload flow for YouTube authentication challenges
- 🌗 Light/dark responsive UI inspired by Google AI Studio

## 🧱 Tech Stack

- **Frontend:** Next.js 15, React 19, Tailwind CSS, Motion
- **Backend:** FastAPI, Pydantic, Server-Sent Events
- **Processing:** `yt-dlp`, FFmpeg
- **Deployment:** Render-ready backend plus optional GitHub Pages static frontend

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

```bash
git clone https://github.com/YOUR_USERNAME/YTPilot.git
cd YTPilot
```

### Windows Quick Setup

```powershell
powershell -ExecutionPolicy Bypass -File .\setup.ps1
.\start.ps1
```

### Manual Backend Setup

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

### Manual Frontend Setup

```powershell
cd frontend
npm install
npm run dev
```

Frontend:

```text
http://localhost:3000
```

Backend:

```text
http://127.0.0.1:8000
```

## 🔐 Cookies Flow

YTPilot first tries public analysis without cookies. If YouTube blocks a request with a sign-in or bot-check challenge, users can voluntarily upload an exported Netscape `cookies.txt` file. Uploaded cookies are temporary, token-based, and can be cleared from the UI.

If a cookie upload is missing common YouTube/Google authentication cookies, the app warns the user so they can export a fresh file from the correct logged-in browser profile.

Do **not** commit personal cookies or `.env` files. The included `.gitignore` excludes local cookies, temporary uploads, generated media, virtual environments, and build output.

## YouTube PO Tokens

The backend Docker image includes `bgutil-ytdlp-pot-provider` and its matching
Node.js token generator. On startup, FastAPI launches the generator on
`127.0.0.1:4416`, and yt-dlp first attempts YouTube extraction with the `mweb`
client and an automatically generated Proof-of-Origin token.

After deployment, inspect:

```text
/debug/yt-dlp
```

The response reports the plugin version, provider process state, and readiness.
If the provider is unavailable during local development, YTPilot falls back to
the normal yt-dlp client path.

PO tokens can improve YouTube `403` and bot-check failures, but they cannot
guarantee access when the hosting provider IP is already rate-limited with
`429 Too Many Requests`.

## ☁️ Render Deployment

This repo includes a Render blueprint:

```text
render.yaml
```

After Render creates both services, set:

- `CORS_ORIGIN` → your frontend URL
- `NEXT_PUBLIC_API_BASE` → your backend URL + `/api/v1`

For your current Render-style setup, that usually means:

```text
CORS_ORIGIN=https://ytpilot-frontend.onrender.com
NEXT_PUBLIC_API_BASE=https://ytpilot-backend.onrender.com/api/v1
```

More notes are available in:

```text
docs/render-deployment.md
```

## 🌐 GitHub Pages Frontend + Render Backend

The frontend can also be hosted as a static GitHub Pages site while the backend stays on Render.

1. In GitHub, open **Settings → Pages**.
2. Set **Source** to **GitHub Actions**.
3. Add a repository variable:

```text
NEXT_PUBLIC_API_BASE=https://ytpilot-backend.onrender.com/api/v1
```

4. In Render backend env vars, set `CORS_ORIGIN` to your GitHub Pages origin:

```text
https://YOUR_USERNAME.github.io
```

Use only the origin here, not the `/YTPilot` repo path.

The included workflow builds the frontend with `GITHUB_PAGES=true`, exports it to `frontend/out`, and deploys it to GitHub Pages. Render builds are unchanged because GitHub Pages mode only activates through that workflow flag.

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
- Render/cloud IPs may trigger YouTube bot checks more often than your local machine.
- Jobs are currently stored in memory for simplicity. For production-scale use, move queue state to Redis/Postgres and store files in object storage.

## 👤 Author

Crafted for excellence by **Sahil Khatkar**.
