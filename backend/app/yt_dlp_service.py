from __future__ import annotations

import asyncio
import importlib.metadata
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
from urllib.parse import parse_qs, urlparse, urlsplit, urlunsplit

from .config import settings
from .cookie_store import CookieStore
from .models import EditableMetadata, FormatOption, MediaItem, MediaKind, SubtitleOption

logger = logging.getLogger(__name__)
ANALYZE_REVISION = "automatic-pot-provider-2026-06-05"
YOUTUBE_PUBLIC_CLIENT_ARGS = ["--extractor-args", "youtube:player_client=android,web"]


class YtDlpService:
    def __init__(self, binary: str = settings.ytdlp_binary, cookie_store: CookieStore | None = None):
        self.binary = binary
        self.cookie_store = cookie_store
        self.analysis_timeout_seconds = 180
        self.playlist_limit = 50
        self._analysis_cache: dict[str, MediaItem] = {}

    async def analyze(
        self,
        url: str,
        cookies_token: str | None = None,
        force_android_client: bool = False,
    ) -> MediaItem:
        normalized_url = url.strip()
        cache_key = f"{normalized_url}::{cookies_token or ''}::android={force_android_client}"
        cached = self._analysis_cache.get(cache_key)
        if cached:
            logger.info("analyze cache hit url=%s revision=%s", normalized_url, ANALYZE_REVISION)
            return cached

        errors: list[str] = []
        item: MediaItem | None = None
        for attempt in self._analyze_attempts(cookies_token, force_android_client):
            try:
                payload = await self._run_json(
                    self._analyze_command(normalized_url, attempt["cookies_token"], attempt["client_args"]),
                    timeout_seconds=45,
                )
                item = self._map_media_item(payload, source_url=normalized_url)
                break
            except RuntimeError as exc:
                error_text = str(exc)
                errors.append(error_text)
                if "timed out" in error_text:
                    logger.warning(
                        "full analyze timed out, trying flat metadata fallback url=%s attempt=%s",
                        normalized_url,
                        attempt["label"],
                    )
                    try:
                        payload = await self._run_json(
                            self._flat_analyze_command(normalized_url, attempt["cookies_token"], attempt["client_args"]),
                            timeout_seconds=20,
                        )
                        item = self._map_flat_media_item(payload, source_url=normalized_url)
                        break
                    except RuntimeError as fallback_exc:
                        errors.append(str(fallback_exc))
                if attempt["label"] == "mweb-pot-provider":
                    logger.warning("PO-token analysis attempt failed; trying standard clients url=%s", normalized_url)
                    continue
                if not self._should_try_next_analyze_attempt(error_text):
                    raise

        if item is None:
            raise RuntimeError(self._analyze_failure_message(errors))
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

        try:
            pot_plugin_version = importlib.metadata.version("bgutil-ytdlp-pot-provider")
        except importlib.metadata.PackageNotFoundError:
            pot_plugin_version = None

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
            "force_ipv4": settings.ytdlp_force_ipv4,
            "proxy": self._redacted_proxy_url(),
            "pot_plugin_version": pot_plugin_version,
            "pot_client_enabled": settings.pot_provider_enabled,
            "pot_provider_url": settings.pot_provider_url,
        }

    async def search(self, query: str, limit: int) -> list[MediaItem]:
        payload = await self._run_json(
            [*self._metadata_command(client_args=self._pot_client_args()), "--playlist-end", str(limit), f"ytsearch{limit}:{query}"],
            timeout_seconds=45,
        )
        entries = payload.get("entries") or []
        return [self._map_media_item(item, source_url=item.get("webpage_url", "")) for item in entries]

    def _base_command(self) -> list[str]:
        return [sys.executable, "-m", "yt_dlp"]

    def _analyze_attempts(
        self,
        cookies_token: str | None = None,
        force_android_client: bool = False,
    ) -> list[dict[str, Any]]:
        if force_android_client:
            return [
                {
                    "label": "android-client",
                    "cookies_token": None,
                    "client_args": self._android_client_args(),
                }
            ]

        attempts: list[dict[str, Any]] = []
        if settings.pot_provider_enabled:
            attempts.append(
                {
                    "label": "mweb-pot-provider",
                    "cookies_token": cookies_token,
                    "client_args": self._pot_client_args(),
                }
            )
        attempts.append({"label": "default", "cookies_token": cookies_token, "client_args": []})
        attempts.append({"label": "public-client-fallback", "cookies_token": None, "client_args": YOUTUBE_PUBLIC_CLIENT_ARGS})
        return attempts

    def _metadata_command(self, cookies_token: str | None = None, client_args: list[str] | None = None) -> list[str]:
        return [
            *self._base_command(),
            "--ignore-config",
            "--dump-single-json",
            "--no-warnings",
            "--skip-download",
            *self._network_args(),
            *(client_args or []),
            *self._auth_args(cookies_token),
        ]

    def _analyze_command(self, url: str, cookies_token: str | None = None, client_args: list[str] | None = None) -> list[str]:
        command = self._metadata_command(cookies_token, client_args)
        if self._is_playlist_url(url):
            command.extend(["--flat-playlist", "--playlist-end", str(self.playlist_limit)])
        else:
            command.append("--no-playlist")
        command.append(url)
        return command

    def _flat_analyze_command(self, url: str, cookies_token: str | None = None, client_args: list[str] | None = None) -> list[str]:
        command = [
            *self._base_command(),
            "--ignore-config",
            "--dump-single-json",
            "--no-warnings",
            *self._network_args(),
            *(client_args or []),
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
        logger.info(
            "yt-dlp json start revision=%s timeout=%s command=%s",
            ANALYZE_REVISION,
            timeout_seconds or self.analysis_timeout_seconds,
            self._redact_command(command),
        )
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
            raise RuntimeError(f"{error_text}\nCommand: {' '.join(safe_command)}")
        return json.loads(completed.stdout)

    def _is_youtube_auth_error(self, error_text: str) -> bool:
        normalized = error_text.lower()
        return (
            "sign in to confirm" in normalized
            or "not a bot" in normalized
            or "cookies for the authentication" in normalized
            or "age-restricted" in normalized
            or "only available on youtube" in normalized
            or "youtube is blocking this request" in normalized
        )

    def _should_try_next_analyze_attempt(self, error_text: str) -> bool:
        normalized = error_text.lower()
        return (
            self._is_youtube_auth_error(error_text)
            or "youtube rejected the uploaded cookies" in normalized
            or "requested format is not available" in normalized
            or "timed out" in normalized
        )

    def _analyze_failure_message(self, errors: list[str]) -> str:
        return "\n".join(errors) if errors else "yt-dlp could not fetch metadata or streams."

    def _redact_command(self, command: list[str]) -> list[str]:
        safe: list[str] = []
        skip_next = False
        for index, value in enumerate(command):
            if skip_next:
                safe.append("[sensitive-value]")
                skip_next = False
                continue
            safe.append(value)
            if value in {"--proxy", "--cookies", "--cookies-from-browser"} and index < len(command) - 1:
                skip_next = True
        return safe

    def _command_has_cookies(self, command: list[str]) -> bool:
        return "--cookies" in command or "--cookies-from-browser" in command

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
        subtitles = self._map_available_subtitles(payload)
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

    def _map_subtitles(self, payload: dict[str, Any], automatic: bool = False) -> list[SubtitleOption]:
        results: list[SubtitleOption] = []
        seen: set[str] = set()
        for language, tracks in payload.items():
            if not tracks:
                continue
            if language == "live_chat":
                continue
            if language in seen:
                continue
            seen.add(language)
            track = next(
                (item for item in tracks if (item.get("ext") or "").lower() in {"vtt", "srt", "ass", "ssa"}),
                tracks[0],
            )
            results.append(
                SubtitleOption(
                    language=language,
                    name=self._subtitle_name(track.get("name"), language, automatic),
                    ext=track.get("ext") or "vtt",
                    automatic=automatic,
                )
            )
        return results

    def _map_available_subtitles(self, payload: dict[str, Any]) -> list[SubtitleOption]:
        manual = self._map_subtitles(payload.get("subtitles") or {})
        automatic_payload = payload.get("automatic_captions") or {}
        if not automatic_payload:
            return manual

        preferred_auto_languages = [
            language
            for language in automatic_payload
            if language.endswith("-orig")
        ]
        if not preferred_auto_languages and not manual:
            source_language = payload.get("language")
            for language in (source_language, "en"):
                if language and language in automatic_payload:
                    preferred_auto_languages.append(language)
                    break

        automatic = self._map_subtitles(
            {
                language: automatic_payload[language]
                for language in preferred_auto_languages
            },
            automatic=True,
        )
        manual_languages = {item.language for item in manual}
        return [*manual, *(item for item in automatic if item.language not in manual_languages)]

    def _subtitle_name(self, value: Any, language: str, automatic: bool) -> str:
        if isinstance(value, dict):
            runs = value.get("runs") or []
            name = value.get("simpleText") or (runs[0].get("text") if runs else None)
        else:
            name = value
        label = str(name or language)
        return f"{label} (auto)" if automatic else label

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
        force_android_client: bool = False,
    ) -> list[str]:
        client_args = self._android_client_args() if force_android_client else self._pot_client_args()
        auth_args = [] if force_android_client else self._auth_args(cookies_token)
        command = [
            *self._base_command(),
            "--ignore-config",
            "--newline",
            "--no-colors",
            "--progress",
            *self._network_args(),
            *client_args,
            *auth_args,
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
                    "--write-auto-subs",
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

    def _network_args(self) -> list[str]:
        args = ["--force-ipv4"] if settings.ytdlp_force_ipv4 else []
        if settings.ytdlp_proxy_url:
            args.extend(["--proxy", settings.ytdlp_proxy_url])
        return args

    def _android_client_args(self) -> list[str]:
        return ["--extractor-args", "youtube:player_client=android_vr"]

    def _pot_client_args(self) -> list[str]:
        if not settings.pot_provider_enabled:
            return []
        args = ["--extractor-args", "youtube:player_client=mweb"]
        if settings.pot_provider_url.rstrip("/") != "http://127.0.0.1:4416":
            args.extend(
                [
                    "--extractor-args",
                    f"youtubepot-bgutilhttp:base_url={settings.pot_provider_url.rstrip('/')}",
                ]
            )
        return args

    def _redacted_proxy_url(self) -> str | None:
        if not settings.ytdlp_proxy_url:
            return None
        parsed = urlsplit(settings.ytdlp_proxy_url)
        host = parsed.hostname or ""
        if parsed.port:
            host = f"{host}:{parsed.port}"
        if parsed.username or parsed.password:
            host = f"[credentials]@{host}"
        return urlunsplit((parsed.scheme, host, parsed.path, parsed.query, parsed.fragment))

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
