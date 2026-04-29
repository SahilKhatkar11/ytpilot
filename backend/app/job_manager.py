from __future__ import annotations

import asyncio
import json
import re
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException

from .config import settings
from .cookie_store import CookieStore
from .ffmpeg_service import FfmpegService
from .models import JobEvent, JobProgress, JobRecord, JobStatus, MediaKind, QueueItemRequest
from .yt_dlp_service import YtDlpService


class JobManager:
    def __init__(self, cookie_store: CookieStore | None = None) -> None:
        self.jobs: dict[str, JobRecord] = {}
        self.event_queues: dict[str, list[asyncio.Queue[str]]] = defaultdict(list)
        self.semaphore = asyncio.Semaphore(settings.max_parallel_jobs)
        self.cookie_store = cookie_store
        self.ytdlp = YtDlpService(cookie_store=cookie_store)
        self.ffmpeg = FfmpegService()

        settings.temp_root.mkdir(parents=True, exist_ok=True)
        settings.output_root.mkdir(parents=True, exist_ok=True)

    async def create_job(self, payload: QueueItemRequest) -> JobRecord:
        job_id = uuid4().hex
        now = datetime.now(timezone.utc)
        record = JobRecord(
            id=job_id,
            status=JobStatus.queued,
            created_at=now,
            updated_at=now,
            item=payload,
            progress=JobProgress(),
        )
        self.jobs[job_id] = record
        asyncio.create_task(self._run_job(job_id))
        return record

    def list_jobs(self) -> list[JobRecord]:
        return sorted(self.jobs.values(), key=lambda item: item.created_at, reverse=True)

    def get_job(self, job_id: str) -> JobRecord:
        if job_id not in self.jobs:
            raise HTTPException(status_code=404, detail="Job not found")
        return self.jobs[job_id]

    async def stream(self, job_id: str):
        queue: asyncio.Queue[str] = asyncio.Queue()
        self.event_queues[job_id].append(queue)
        try:
            snapshot = self.jobs.get(job_id)
            if not snapshot:
                yield self._format_sse("failed", {"message": "Job not found. The backend may have restarted."})
                return
            yield self._format_sse("snapshot", snapshot.model_dump(mode="json"))
            while True:
                payload = await queue.get()
                yield payload
        finally:
            queues = self.event_queues.get(job_id)
            if queues and queue in queues:
                queues.remove(queue)

    async def cleanup(self) -> None:
        if self.cookie_store:
            self.cookie_store.cleanup()
        now = datetime.now(timezone.utc)
        stale_ids = [
            job.id
            for job in self.jobs.values()
            if job.expires_at and job.expires_at < now
        ]
        for job_id in stale_ids:
            record = self.jobs.pop(job_id, None)
            if record and record.output_name:
                target = settings.output_root / record.output_name
                if target.exists():
                    target.unlink(missing_ok=True)

    async def _run_job(self, job_id: str) -> None:
        async with self.semaphore:
            record = self.get_job(job_id)
            await self._set_status(record, JobStatus.processing, "Fetching media")
            safe_stem = self._safe_name(record.item.title or record.id)
            temp_template = settings.temp_root / f"{job_id}.%(ext)s"
            downloaded_path = None
            subtitle_paths: list[Path] = []

            try:
                format_selector = record.item.options.format_id
                subtitle_languages = []
                if record.item.options.mode == MediaKind.video and record.item.options.embed_subtitles:
                    subtitle_languages = record.item.options.subtitle_languages or ["en.*", "en"]

                command = self.ytdlp.build_download_command(
                    source_url=record.item.source_url,
                    format_selector=format_selector,
                    output_template=temp_template,
                    subtitle_languages=subtitle_languages,
                    extra_args=record.item.options.custom_args,
                    cookies_token=record.item.options.cookies_token,
                )
                downloaded_path = await self._run_ytdlp(job_id, command)
                subtitle_paths = self._subtitle_paths(job_id) if record.item.options.embed_subtitles else []

                await self._emit(
                    job_id,
                    JobEvent(
                        event="progress",
                        data={
                            "percent": max(record.progress.percent, 95),
                            "speed": None,
                            "stage": "postprocess",
                            "message": "Running FFmpeg",
                        },
                    ),
                )
                record.progress.stage = "postprocess"
                target_name = f"{safe_stem}.{record.item.options.target_ext.lower()}"
                target_path = settings.output_root / target_name
                await self.ffmpeg.convert_media(
                    input_path=downloaded_path,
                    output_path=target_path,
                    mode=record.item.options.mode,
                    metadata=record.item.options.metadata,
                    audio_bitrate_kbps=record.item.options.audio_bitrate_kbps,
                    trim=record.item.options.trim,
                    subtitle_paths=subtitle_paths,
                )

                token = uuid4().hex
                record.status = JobStatus.completed
                record.progress = JobProgress(percent=100, stage="completed", message="Ready to download")
                record.output_name = target_name
                record.download_token = token
                record.expires_at = datetime.now(timezone.utc) + timedelta(minutes=settings.cleanup_after_minutes)
                record.updated_at = datetime.now(timezone.utc)
                await self._emit(job_id, JobEvent(event="completed", data=record.model_dump(mode="json")))
            except Exception as exc:
                record.status = JobStatus.failed
                record.error = str(exc)
                record.progress.stage = "failed"
                record.updated_at = datetime.now(timezone.utc)
                await self._emit(job_id, JobEvent(event="failed", data={"message": str(exc)}))
            finally:
                if downloaded_path and downloaded_path.exists():
                    downloaded_path.unlink(missing_ok=True)
                for subtitle_path in subtitle_paths:
                    if subtitle_path.exists():
                        subtitle_path.unlink(missing_ok=True)

    async def _run_ytdlp(self, job_id: str, command: list[str]) -> Path:
        destination: Path | None = None
        lines: list[str] = []
        proc = await asyncio.create_subprocess_exec(
            *command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
        assert proc.stdout is not None

        while True:
            raw = await proc.stdout.readline()
            if not raw:
                break
            destination = await self._handle_ytdlp_line(job_id, raw.decode(errors="replace"), lines, destination)

        return_code = await proc.wait()
        if return_code != 0:
            error_line = next((line for line in reversed(lines) if "ERROR:" in line or "error" in line.lower()), "")
            raise RuntimeError(error_line or "yt-dlp download failed")
        if lines and lines[-1].startswith("__ERROR__:"):
            raise RuntimeError(lines[-1].replace("__ERROR__:", "", 1).strip() or "yt-dlp download failed")
        if not lines:
            raise RuntimeError("yt-dlp download failed")

        destination = self._resolve_downloaded_path(job_id, destination)
        if not destination:
            raise RuntimeError("Downloaded file was not produced")
        return destination

    def _resolve_downloaded_path(self, job_id: str, destination: Path | None) -> Path | None:
        if destination and destination.exists():
            return destination

        candidates = [candidate for candidate in settings.temp_root.glob(f"{job_id}.*") if candidate.is_file()]
        if not candidates:
            return None

        merged = [candidate for candidate in candidates if not re.search(r"\.f\d+\.", candidate.name)]
        pool = merged or candidates
        return max(pool, key=lambda candidate: candidate.stat().st_mtime)

    def _subtitle_paths(self, job_id: str) -> list[Path]:
        subtitle_suffixes = {".vtt", ".srt", ".ass", ".ssa"}
        return sorted(
            candidate
            for candidate in settings.temp_root.glob(f"{job_id}.*")
            if candidate.is_file() and candidate.suffix.lower() in subtitle_suffixes
        )

    async def _handle_ytdlp_line(
        self,
        job_id: str,
        line: str,
        lines: list[str],
        destination: Path | None,
    ) -> Path | None:
        line = re.sub(r"\x1b\[[0-9;]*[A-Za-z]", "", line).strip()
        if not line:
            return destination
        lines.append(line)
        parsed = self._parse_progress(line)
        if parsed:
            await self._emit(job_id, JobEvent(event="progress", data=parsed))
        if "[download] Destination:" in line:
            destination = Path(line.split("Destination:", 1)[1].strip())
        if "[Merger] Merging formats into" in line:
            merged = line.split("into", 1)[1].strip().strip('"')
            destination = Path(merged)
        return destination

    def get_download_path(self, token: str) -> Path:
        now = datetime.now(timezone.utc)
        for job in self.jobs.values():
            if job.download_token == token and job.output_name and job.expires_at and job.expires_at > now:
                return settings.output_root / job.output_name
        raise HTTPException(status_code=404, detail="Download expired or unavailable")

    async def _set_status(self, record: JobRecord, status: JobStatus, message: str) -> None:
        record.status = status
        record.progress.stage = status.value
        record.progress.message = message
        record.updated_at = datetime.now(timezone.utc)
        await self._emit(record.id, JobEvent(event="status", data=record.model_dump(mode="json")))

    async def _emit(self, job_id: str, event: JobEvent) -> None:
        record = self.jobs.get(job_id)
        if record and event.event == "progress":
            progress = event.data
            record.progress.percent = progress.get("percent", record.progress.percent)
            record.progress.speed = progress.get("speed", record.progress.speed)
            record.progress.eta_seconds = progress.get("eta_seconds", record.progress.eta_seconds)
            record.progress.message = progress.get("message", record.progress.message)
            record.progress.stage = progress.get("stage", record.progress.stage)
            record.updated_at = datetime.now(timezone.utc)

        payload = self._format_sse(event.event, event.data)
        for queue in list(self.event_queues[job_id]):
            await queue.put(payload)

    def _format_sse(self, event: str, data: dict) -> str:
        return f"event: {event}\ndata: {json.dumps(data)}\n\n"

    def _parse_progress(self, line: str) -> dict | None:
        if not line.startswith("[download]"):
            return None
        match = re.search(r"\[download\]\s+(\d+(?:\.\d+)?)%", line)
        if not match:
            return None
        speed_match = re.search(r"\bat\s+([^\s]+)", line)
        eta_match = re.search(r"\bETA\s+([^\s]+)", line)
        eta_seconds = self._parse_eta(eta_match.group(1) if eta_match else "")
        percent = float(match.group(1))
        return {
            "percent": percent,
            "speed": speed_match.group(1) if speed_match else None,
            "eta_seconds": eta_seconds,
            "stage": "downloading",
            "message": f"Downloading {percent:.1f}%",
        }

    def _parse_eta(self, value: str) -> int | None:
        parts = [int(part) for part in value.split(":") if part.isdigit()]
        if len(parts) == 2:
            return parts[0] * 60 + parts[1]
        if len(parts) == 3:
            return parts[0] * 3600 + parts[1] * 60 + parts[2]
        return None

    def _safe_name(self, value: str) -> str:
        return re.sub(r"[^a-zA-Z0-9._-]+", "-", value).strip("-") or "download"
