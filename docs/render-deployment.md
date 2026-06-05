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

## Automatic PO Tokens

The backend Docker image builds and runs `bgutil-ytdlp-pot-provider` 1.3.1 as a
localhost-only sidecar. The matching Python plugin is installed from
`backend/requirements.txt`.

The Render blueprint enables it with:

```text
POT_PROVIDER_ENABLED=true
POT_PROVIDER_URL=http://127.0.0.1:4416
```

After deployment, open `/debug/yt-dlp` on the backend and confirm:

- `pot_plugin_version` is `1.3.1`
- `pot_provider.enabled` is `true`
- `pot_provider.managed_process_running` is `true`
- `pot_provider.ready` is `true`

The provider improves request attestation but does not replace request
throttling and cannot clear a `429` block already attached to Render's IP.

## Render Setup

1. Push the project to GitHub after confirming `.gitignore` is active.
2. Create the backend web service from `backend`.
3. Create the frontend web service from `frontend`.
4. Set backend `CORS_ORIGIN` to the frontend Render URL.
5. Set frontend `NEXT_PUBLIC_API_BASE` to the backend Render URL plus `/api/v1`.

For public demos, keep `MAX_PARALLEL_JOBS=1` on free/low-CPU hosts. 4K transcoding can be slow and may exceed free-tier limits.
