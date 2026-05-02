from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import shutil
import signal
import subprocess
import sys
import time
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

from .config import settings
from .cookie_store import CookieStore
from .models import EditableMetadata, FormatOption, MediaItem, MediaKind, SubtitleOption

logger = logging.getLogger(__name__)
ANALYZE_REVISION = "ignore-config-metadata-2026-05-02-09"


class YtDlpService:
    def __init__(self, binary: str = settings.ytdlp_binary, cookie_store: CookieStore | None = None):
        self.binary = binary
        self.cookie_store = cookie_store
        self.analysis_timeout_seconds = 180
        self.playlist_limit = 50
        self._analysis_cache: dict[str, MediaItem] = {}

    async def analyze(self, url: str, cookies_token: str | None = None) -> MediaItem:
        normalized_url = url.strip()
        cache_key = f"{normalized_url}::{cookies_token or ''}"
        cached = self._analysis_cache.get(cache_key)
        if cached:
            logger.info("analyze cache hit url=%s revision=%s", normalized_url, ANALYZE_REVISION)
            return cached
        try:
            payload = await self._run_json(self._analyze_command(normalized_url, cookies_token), timeout_seconds=120)
            item = self._map_media_item(payload, source_url=normalized_url)
        except RuntimeError as exc:
            if "timed out" not in str(exc):
                raise
            logger.warning("full analyze timed out, trying flat metadata fallback url=%s", normalized_url)
            try:
                payload = await self._run_json(self._flat_analyze_command(normalized_url, cookies_token), timeout_seconds=45)
                item = self._map_flat_media_item(payload, source_url=normalized_url)
            except RuntimeError as fallback_exc:
                raise RuntimeError(
                    "yt-dlp could not fetch metadata or streams. YouTube may require an exported cookies.txt file for this URL."
                ) from fallback_exc
        self._analysis_cache[cache_key] = item
        return item

    def diagnostics(self) -> dict[str, Any]:
        module_version = None
        module_error = None
        try:
            import yt_dlp

            module_version = yt_dlp.version.__version__
        except Exception as exc:
            module_error = str(exc)

        binary_version = None
        binary_error = None
        try:
            completed = subprocess.run(
                [self.binary, "--version"],
                capture_output=True,
                text=True,
                check=False,
                timeout=10,
            )
            if completed.returncode == 0:
                binary_version = completed.stdout.strip()
            else:
                binary_error = completed.stderr.strip() or completed.stdout.strip()
        except Exception as exc:
            binary_error = str(exc)

        return {
            "revision": ANALYZE_REVISION,
            "python_executable": sys.executable,
            "configured_binary": self.binary,
            "which_yt_dlp": shutil.which("yt-dlp"),
            "cookies_file": str(settings.ytdlp_cookies_file) if settings.ytdlp_cookies_file else None,
            "cookies_file_exists": bool(self._resolve_cookies_file() and self._resolve_cookies_file().exists()),
            "cookies_from_browser": settings.ytdlp_cookies_from_browser,
            "yt_dlp_module_version": module_version,
            "yt_dlp_module_error": module_error,
            "yt_dlp_binary_version": binary_version,
            "yt_dlp_binary_error": binary_error,
            "analysis_timeout_seconds": self.analysis_timeout_seconds,
        }

    async def search(self, query: str, limit: int) -> list[MediaItem]:
        payload = await self._run_json(
            [*self._metadata_command(), "--playlist-end", str(limit), f"ytsearch{limit}:{query}"],
            timeout_seconds=45,
        )
        entries = payload.get("entries") or []
        return [self._map_media_item(item, source_url=item.get("webpage_url", "")) for item in entries]

    def _base_command(self) -> list[str]:
        return [sys.executable, "-m", "yt_dlp"]

    def _metadata_command(self, cookies_token: str | None = None) -> list[str]:
        return [
            self.binary,
            "--ignore-config",
            "--dump-single-json",
            "--no-warnings",
            "--skip-download",
            *self._auth_args(cookies_token),
        ]

    def _analyze_command(self, url: str, cookies_token: str | None = None) -> list[str]:
        command = self._metadata_command(cookies_token)
        if self._is_playlist_url(url):
            command.extend(["--flat-playlist", "--playlist-end", str(self.playlist_limit)])
        else:
            command.append("--no-playlist")
        command.append(url)
        return command

    def _flat_analyze_command(self, url: str, cookies_token: str | None = None) -> list[str]:
        command = [
            self.binary,
            "--ignore-config",
            "--dump-single-json",
            "--no-warnings",
            *self._auth_args(cookies_token),
            "--skip-download",
            "--flat-playlist",
        ]
        if self._is_playlist_url(url):
            command.extend(["--playlist-end", str(self.playlist_limit)])
        else:
            command.append("--no-playlist")
        command.append(url)
        return command

    def _is_playlist_url(self, url: str) -> bool:
        parsed = urlparse(url)
        query = parse_qs(parsed.query)
        return "playlist" in parsed.path.lower() or ("list" in query and "v" not in query)

    async def _run_json(self, command: list[str], timeout_seconds: int | None = None) -> dict[str, Any]:
        fallback_command = self._fallback_binary_command(command)
        started = time.perf_counter()
        logger.info("yt-dlp json start revision=%s timeout=%s command=%s", ANALYZE_REVISION, timeout_seconds or self.analysis_timeout_seconds, command)
        try:
            completed = await self._run_process(command, timeout_seconds=timeout_seconds)
            if completed.returncode != 0 and fallback_command:
                module_error = completed.stderr or completed.stdout
                if "No module named yt_dlp" in module_error or "No module named yt-dlp" in module_error:
                    logger.warning("yt-dlp module command failed, falling back to binary: %s", module_error[:1000])
                    completed = await self._run_process(fallback_command, timeout_seconds=timeout_seconds)
        except TimeoutError as exc:
            timeout = timeout_seconds or self.analysis_timeout_seconds
            elapsed = time.perf_counter() - started
            logger.error("yt-dlp json timeout revision=%s elapsed=%.2fs timeout=%s command=%s", ANALYZE_REVISION, elapsed, timeout, command)
            raise RuntimeError(f"yt-dlp analysis timed out after {timeout} seconds") from exc
        except RuntimeError as exc:
            safe_command = self._redact_command(command)
            detail = str(exc) or repr(exc) or "yt-dlp process failed before returning output"
            raise RuntimeError(f"{detail}\nCommand: {' '.join(safe_command)}") from exc
        elapsed = time.perf_counter() - started
        logger.info(
            "yt-dlp json done revision=%s elapsed=%.2fs returncode=%s stderr=%s",
            ANALYZE_REVISION,
            elapsed,
            completed.returncode,
            (completed.stderr or "")[:1000],
        )
        if completed.returncode != 0:
            safe_command = self._redact_command(command)
            error_text = completed.stderr or completed.stdout or f"yt-dlp failed with exit code {completed.returncode}"
            if self._is_youtube_auth_error(error_text) and self._command_has_cookies(command):
                raise RuntimeError(
                    "YouTube rejected the uploaded cookies. Export a fresh Netscape cookies.txt from the same browser profile where YouTube is logged in, then upload that new file and retry."
                )
            raise RuntimeError(f"{error_text}\nCommand: {' '.join(safe_command)}")
        return json.loads(completed.stdout)

    def _is_youtube_auth_error(self, error_text: str) -> bool:
        normalized = error_text.lower()
        return "sign in to confirm" in normalized or "not a bot" in normalized or "cookies for the authentication" in normalized

    def _command_has_cookies(self, command: list[str]) -> bool:
        return "--cookies" in command or "--cookies-from-browser" in command

    def _redact_command(self, command: list[str]) -> list[str]:
        safe: list[str] = []
        skip_next = False
        for index, value in enumerate(command):
            if skip_next:
                safe.append("[cookies-file]")
                skip_next = False
                continue
            safe.append(value)
            if value in {"--cookies", "--cookies-from-browser"} and index < len(command) - 1:
                skip_next = True
        return safe

    async def _run_process(self, command: list[str], timeout_seconds: int | None = None) -> subprocess.CompletedProcess[str]:
        timeout = timeout_seconds or self.analysis_timeout_seconds
        try:
            return await asyncio.to_thread(
                subprocess.run,
                command,
                capture_output=True,
                text=True,
                check=False,
                timeout=timeout,
            )
        except subprocess.TimeoutExpired as exc:
            raise TimeoutError from exc

    async def _terminate_process(self, proc: asyncio.subprocess.Process) -> None:
        if proc.returncode is not None:
            return
        try:
            if os.name == "nt":
                proc.send_signal(signal.CTRL_BREAK_EVENT)
            else:
                proc.terminate()
            await asyncio.wait_for(proc.wait(), timeout=3)
        except Exception:
            if proc.returncode is None:
                proc.kill()
                await proc.wait()

    def _fallback_binary_command(self, command: list[str]) -> list[str] | None:
        module_prefix = self._base_command()
        if command[: len(module_prefix)] != module_prefix:
            return None
        return [self.binary, *command[len(module_prefix):]]

    def _map_flat_media_item(self, payload: dict[str, Any], source_url: str) -> MediaItem:
        entries = payload.get("entries") or []
        if entries:
            title = payload.get("title") or "Playlist"
            child_entries = [self._map_flat_media_item(entry, self._entry_source_url(entry, source_url)) for entry in entries[: self.playlist_limit]]
            return MediaItem(
                source_url=source_url,
                extractor=payload.get("extractor_key"),
                id=str(payload.get("id") or self._id_from_url(source_url)),
                title=title,
                duration_seconds=payload.get("duration"),
                thumbnail_url=self._best_thumbnail_url(payload),
                metadata=EditableMetadata(title=title, artist=payload.get("uploader"), album=None, cover_url=self._best_thumbnail_url(payload)),
                formats=[],
                subtitles=[],
                is_playlist=True,
                entries=child_entries,
            )

        title = payload.get("title") or self._title_from_url(source_url)
        thumbnail = self._best_thumbnail_url(payload)
        return MediaItem(
            source_url=payload.get("webpage_url") or source_url,
            extractor=payload.get("extractor_key"),
            id=str(payload.get("id") or self._id_from_url(source_url)),
            title=title,
            duration_seconds=payload.get("duration"),
            thumbnail_url=thumbnail,
            metadata=EditableMetadata(title=title, artist=payload.get("uploader"), album=None, cover_url=thumbnail),
            formats=[],
            subtitles=[],
            is_playlist=False,
            entries=[],
        )

    def _id_from_url(self, source_url: str) -> str:
        parsed = urlparse(source_url)
        query = parse_qs(parsed.query)
        if query.get("v"):
            return query["v"][0]
        return parsed.path.strip("/").split("/")[-1] or source_url

    def _title_from_url(self, source_url: str) -> str:
        video_id = self._id_from_url(source_url)
        return f"YouTube Media {video_id}" if video_id else "YouTube Media"

    def _best_thumbnail_url(self, payload: dict[str, Any]) -> str | None:
        thumbnail = payload.get("thumbnail")
        if thumbnail:
            return thumbnail
        thumbnails = payload.get("thumbnails") or []
        if thumbnails:
            return thumbnails[-1].get("url")
        return None

    def _entry_source_url(self, entry: dict[str, Any], fallback: str) -> str:
        for key in ("webpage_url", "url"):
            value = entry.get(key)
            if isinstance(value, str) and value.startswith(("http://", "https://")):
                return value
        video_id = entry.get("id") or entry.get("url")
        if video_id:
            return f"https://www.youtube.com/watch?v={video_id}"
        return fallback

    def _map_media_item(self, payload: dict[str, Any], source_url: str) -> MediaItem:
        entries = payload.get("entries") or []
        title = payload.get("track") or payload.get("title") or "Untitled"
        artist = payload.get("artist") or payload.get("uploader")
        album = payload.get("album")
        thumbnails = payload.get("thumbnails") or []
        square_thumb = self._pick_square_thumbnail(thumbnails)
        formats = self._map_formats(payload.get("formats") or [])
        subtitles: list[SubtitleOption] = []
        child_entries = []
        for entry in entries[:50]:
            child_entries.append(self._map_media_item(entry, source_url=entry.get("webpage_url", source_url)))

        return MediaItem(
            source_url=source_url,
            extractor=payload.get("extractor_key"),
            id=str(payload.get("id")),
            title=title,
            duration_seconds=payload.get("duration"),
            thumbnail_url=square_thumb,
            metadata=EditableMetadata(
                title=title,
                artist=artist,
                album=album,
                cover_url=square_thumb,
            ),
            formats=formats,
            subtitles=subtitles,
            is_playlist=bool(entries),
            entries=child_entries,
        )

    def _pick_square_thumbnail(self, thumbnails: list[dict[str, Any]]) -> str | None:
        candidates: list[tuple[int, str]] = []
        for thumb in thumbnails:
            width = thumb.get("width")
            height = thumb.get("height")
            url = thumb.get("url")
            if width and height and url and abs(width - height) <= 8:
                candidates.append((width, url))
        if candidates:
            candidates.sort(key=lambda item: item[0], reverse=True)
            return candidates[0][1]
        if thumbnails:
            return thumbnails[-1].get("url")
        return None

    def _map_subtitles(self, payload: dict[str, Any]) -> list[SubtitleOption]:
        results: list[SubtitleOption] = []
        seen: set[str] = set()
        for language, tracks in payload.items():
            if not tracks:
                continue
            if language in seen:
                continue
            seen.add(language)
            track = tracks[0]
            results.append(
                SubtitleOption(
                    language=language,
                    name=track.get("name") or language,
                    ext=track.get("ext") or "vtt",
                )
            )
        return results

    def _map_formats(self, formats: list[dict[str, Any]]) -> list[FormatOption]:
        mapped: list[FormatOption] = []
        for item in formats:
            ext = item.get("ext")
            if not ext:
                continue

            resolution = self._normalize_resolution(item)

            tbr = item.get("abr") or item.get("tbr")
            filesize = item.get("filesize") or item.get("filesize_approx")
            kind = MediaKind.audio if item.get("vcodec") == "none" else MediaKind.video
            mapped.append(
                FormatOption(
                    format_id=str(item.get("format_id")),
                    ext=ext,
                    resolution=resolution,
                    bitrate_kbps=int(tbr) if tbr else None,
                    vcodec=item.get("vcodec"),
                    acodec=item.get("acodec"),
                    filesize_mb=round(filesize / 1024 / 1024, 1) if filesize else None,
                    container=ext.upper(),
                    kind=kind,
                )
            )

        unique: list[FormatOption] = []
        seen: set[str] = set()
        for item in mapped:
            key = f"{item.kind}:{item.ext}:{item.resolution}:{item.bitrate_kbps}:{item.format_id}"
            if key in seen:
                continue
            seen.add(key)
            unique.append(item)
        return unique

    def _normalize_resolution(self, item: dict[str, Any]) -> str | None:
        height = item.get("height")
        if isinstance(height, int) and height > 0:
            return f"{height}p"

        for key in ("resolution", "format_note"):
            value = item.get(key)
            if not value:
                continue
            text = str(value)
            height_match = re.search(r"(?:x|^)(\d{3,4})p?$", text)
            if height_match:
                return f"{height_match.group(1)}p"
            note_match = re.search(r"(\d{3,4})p", text)
            if note_match:
                return f"{note_match.group(1)}p"
        return None

    def build_download_command(
        self,
        source_url: str,
        format_selector: str,
        output_template: Path,
        subtitle_languages: list[str],
        extra_args: dict[str, str],
        cookies_token: str | None = None,
    ) -> list[str]:
        command = [
            *self._base_command(),
            "--ignore-config",
            "--newline",
            "--no-colors",
            "--progress",
            *self._auth_args(cookies_token),
            "-f",
            format_selector,
            "-o",
            str(output_template),
        ]
        if "+" in format_selector:
            command.extend(["--merge-output-format", "mkv"])
        if subtitle_languages:
            command.extend(
                [
                    "--write-subs",
                    "--sub-langs",
                    ",".join(subtitle_languages),
                    "--sub-format",
                    "vtt/srt/best",
                ]
            )
        for key, value in extra_args.items():
            normalized = key.strip()
            if not re.fullmatch(r"[a-zA-Z0-9\\-_]+", normalized):
                continue
            if value:
                command.extend([f"--{normalized}", value])
            else:
                command.append(f"--{normalized}")
        command.append(source_url)
        return command

    def _auth_args(self, cookies_token: str | None = None) -> list[str]:
        uploaded_cookie_path = self.cookie_store.resolve(cookies_token) if self.cookie_store else None
        if uploaded_cookie_path:
            return ["--cookies", str(uploaded_cookie_path)]
        cookies_file = self._resolve_cookies_file() if cookies_token else None
        if cookies_file and cookies_file.exists():
            return ["--cookies", str(cookies_file)]
        if settings.ytdlp_cookies_from_browser:
            return ["--cookies-from-browser", settings.ytdlp_cookies_from_browser]
        return []

    def _resolve_cookies_file(self) -> Path | None:
        if not settings.ytdlp_cookies_file:
            return None
        if settings.ytdlp_cookies_file.is_absolute():
            return settings.ytdlp_cookies_file
        return (settings.storage_root / settings.ytdlp_cookies_file).resolve()
