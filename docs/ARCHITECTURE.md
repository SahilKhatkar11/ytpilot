# YTPilot Architecture

## Overview
YTPilot uses a split architecture:

- `frontend/`: Next.js App Router client optimized for low-end devices, responsive layout, and SSE-driven queue updates.
- `backend/`: FastAPI service that analyzes media with `yt-dlp`, processes outputs with `ffmpeg`, and exposes secure download tokens instead of server paths.

## Frontend Structure

- `app/page.tsx`: Single-screen dashboard for intake, analysis, selection, and queue management.
- `components/glass-shell.tsx`: Reusable Liquid Glass surface.
- `lib/api.ts`: Fetch and SSE bindings for the API.
- `types/index.ts`: Shared client contracts aligned with backend models.

## Backend Design

- `app/main.py`: API bootstrap and route registration.
- `app/yt_dlp_service.py`: Media analysis, search, source format mapping, and yt-dlp command creation.
- `app/ffmpeg_service.py`: Post-processing for MKV repack, audio extraction, and metadata writing.
- `app/job_manager.py`: In-memory queue, bounded concurrency, SSE fan-out, secure tokenized download handling, and cleanup.

## Format Selection Logic

- Analysis always happens before download.
- The UI splits available formats into `video` and `audio`.
- Best-quality mode auto-selects the top-ranked format:
  - Video: highest supported resolution first.
  - Audio: highest bitrate first.
- Manual mode unlocks exact source format selection.
- Target container remains separate from source stream selection so a user can fetch one stream type and convert it server-side.

## FFmpeg Pipeline

1. `yt-dlp` downloads the chosen stream or adaptive selector into temporary storage.
2. `ffmpeg` repacks or transcodes to the requested final format.
3. Metadata fields are written during the FFmpeg stage.
4. Output is stored in an output directory and exposed through a tokenized endpoint.
5. Temp files are deleted after processing; completed outputs expire and are cleaned up.

## Real-Time System

- Jobs are created with `queued` state.
- The backend streams events through `text/event-stream`.
- The frontend keeps an `EventSource` open per active job and updates progress without polling.
- Completed items show only download links, never server file paths.

## Production Upgrades

- Replace in-memory queue with Redis + RQ/Celery/Arq for multi-instance scaling.
- Persist jobs, metadata edits, and expiry state in Postgres.
- Add object storage for distributed downloads.
- Add auth, per-user quotas, signed URLs, and rate limiting.
- Add thumbnail/cover fetch and embed pipeline for YouTube Music artwork.

