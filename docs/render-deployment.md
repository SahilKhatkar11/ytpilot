# Render Deployment Notes

YTPilot uses a Next.js frontend and a FastAPI backend. The backend needs `yt-dlp` and `ffmpeg` available in the host environment.

## Backend Proxy

Set `YTDLP_PROXY_URL` in the backend service when using an
administrator-controlled HTTP or SOCKS proxy. Render marks this variable as a
secret prompt in `render.yaml`.

The value is applied to analysis and downloads. Credentials are redacted from
the diagnostic endpoint. The app does not implement public proxy-list rotation.

## Cookies

Users may temporarily upload a Netscape `cookies.txt` file when YouTube
requires authentication. Files are stored under the configured
`STORAGE_ROOT/cookies_uploads`, expire with `CLEANUP_AFTER_MINUTES`, and can be
cleared from the UI. Android spoof mode bypasses cookies.

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

Users can enable the Android client toggle before analysis. Android mode uses a
separate `android_vr` YouTube client path instead of the web PO-token provider.
It may help with client-specific `403` responses while still exposing adaptive
video qualities.

## Render Setup

1. Push the project to GitHub after confirming `.gitignore` is active.
2. Create the backend web service from `backend`.
3. Create the frontend web service from `frontend`.
4. Set backend `CORS_ORIGIN` to the frontend origin without a path. Multiple custom origins can be comma-separated.
5. Set frontend `NEXT_PUBLIC_API_BASE` to the backend Render URL plus `/api/v1`.

The backend accepts HTTPS origins under `*.onrender.com` and `*.github.io` by
default. A custom domain must be included in `CORS_ORIGIN`.

For public demos, keep `MAX_PARALLEL_JOBS=1` on free/low-CPU hosts. 4K transcoding can be slow and may exceed free-tier limits.
