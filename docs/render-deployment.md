# Render Deployment Notes

YTPilot uses a Next.js frontend and a FastAPI backend. The backend needs `yt-dlp` and `ffmpeg` available in the host environment.

## Cookies

Cookies are optional and user-controlled. The app first tries normal public metadata/download access. If YouTube blocks a URL with a sign-in or bot-confirmation error, the user may upload an exported Netscape `cookies.txt` file in the UI.

Uploaded cookies are stored only in `backend/storage/cookies_uploads` or the configured `STORAGE_ROOT` equivalent, expire with the normal cleanup window, and are ignored by Git.

Do not commit:

- `backend/.env`
- `backend/storage/cookies.txt`
- `backend/storage/cookies_uploads/`
- generated files under `backend/storage/tmp/` or `backend/storage/output/`

## Render Setup

1. Push the project to GitHub after confirming `.gitignore` is active.
2. Create the backend web service from `backend`.
3. Create the frontend web service from `frontend`.
4. Set backend `CORS_ORIGIN` to the frontend Render URL.
5. Set frontend `NEXT_PUBLIC_API_BASE` to the backend Render URL plus `/api/v1`.

For public demos, keep `MAX_PARALLEL_JOBS=1` on free/low-CPU hosts. 4K transcoding can be slow and may exceed free-tier limits.
