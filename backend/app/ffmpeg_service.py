from __future__ import annotations

import asyncio
import base64
import subprocess
import urllib.request
from pathlib import Path

from .config import settings
from .models import EditableMetadata, MediaKind, TrimOptions


class FfmpegService:
    def __init__(self, ffmpeg_binary: str = settings.ffmpeg_binary):
        self.ffmpeg_binary = ffmpeg_binary

    async def convert_media(
        self,
        input_path: Path,
        output_path: Path,
        mode: MediaKind,
        metadata: EditableMetadata,
        audio_bitrate_kbps: int | None,
        trim: TrimOptions | None = None,
        subtitle_paths: list[Path] | None = None,
    ) -> None:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        subtitle_paths = subtitle_paths or []
        cover_path = None
        if mode == MediaKind.audio and output_path.suffix.lower() == ".mp3":
            cover_path = await self._download_cover(metadata.cover_url, output_path.stem)
        command = [
            self.ffmpeg_binary,
            "-y",
        ]
        if trim:
            command.extend(["-ss", trim.start])
        command.extend(["-i", str(input_path)])
        if cover_path:
            command.extend(["-i", str(cover_path)])
        subtitle_input_indexes: list[int] = []
        if mode == MediaKind.video:
            next_input_index = 1 + (1 if cover_path else 0)
            for subtitle_path in subtitle_paths:
                command.extend(["-i", str(subtitle_path)])
                subtitle_input_indexes.append(next_input_index)
                next_input_index += 1
        if trim:
            duration = self._trim_duration(trim)
            if duration:
                command.extend(["-t", duration])

        if mode == MediaKind.audio and output_path.suffix.lower() == ".mp3":
            command.extend(["-map", "0:a:0"])
            if cover_path:
                command.extend(
                    [
                        "-map",
                        "1:v:0",
                        "-codec:v",
                        "mjpeg",
                        "-id3v2_version",
                        "3",
                        "-metadata:s:v",
                        "title=Album cover",
                        "-metadata:s:v",
                        "comment=Cover (front)",
                        "-disposition:v:0",
                        "attached_pic",
                    ]
                )
            command.extend(["-codec:a", "libmp3lame", "-b:a", f"{audio_bitrate_kbps or 320}k"])
        elif mode == MediaKind.audio and output_path.suffix.lower() == ".m4a":
            command.extend(["-map", "0:a:0", "-vn", "-codec:a", "aac", "-b:a", f"{audio_bitrate_kbps or 256}k"])
        elif mode == MediaKind.audio and output_path.suffix.lower() == ".webm":
            command.extend(["-map", "0:a:0", "-vn", "-codec:a", "libopus", "-b:a", f"{audio_bitrate_kbps or 192}k"])
        elif mode == MediaKind.audio and output_path.suffix.lower() == ".wav":
            command.extend(["-map", "0:a:0", "-vn", "-codec:a", "pcm_s16le"])
        elif mode == MediaKind.video and output_path.suffix.lower() == ".mp4":
            command.extend(self._video_maps(subtitle_input_indexes))
            command.extend(["-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-c:a", "aac", "-b:a", "192k", "-c:s", "mov_text", "-movflags", "+faststart"])
        elif mode == MediaKind.video and output_path.suffix.lower() == ".webm":
            command.extend(self._video_maps(subtitle_input_indexes))
            command.extend(["-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "30", "-c:a", "libopus", "-b:a", "160k", "-c:s", "webvtt"])
        elif mode == MediaKind.video and output_path.suffix.lower() == ".mkv":
            command.extend(self._video_maps(subtitle_input_indexes))
            command.extend(["-c:v", "libx265", "-preset", "fast", "-crf", "24", "-c:a", "aac", "-b:a", "192k", "-c:s", "srt"])
        else:
            command.extend(self._video_maps(subtitle_input_indexes))
            command.extend(["-c", "copy"])

        command.extend(self._metadata_args(metadata))
        command.append(str(output_path))

        completed = await asyncio.to_thread(
            subprocess.run,
            command,
            capture_output=True,
            text=True,
            check=False,
        )
        if cover_path and cover_path.exists():
            cover_path.unlink(missing_ok=True)
        if completed.returncode != 0:
            raise RuntimeError(completed.stderr or "ffmpeg failed")

    def _trim_duration(self, trim: TrimOptions) -> str | None:
        start = self._parse_timestamp(trim.start)
        end = self._parse_timestamp(trim.end)
        if start is None or end is None or end <= start:
            return None
        duration = int(round(end - start))
        hours = duration // 3600
        minutes = (duration % 3600) // 60
        seconds = duration % 60
        return f"{hours:02d}:{minutes:02d}:{seconds:02d}"

    def _parse_timestamp(self, value: str) -> float | None:
        parts = value.strip().split(":")
        if not parts or len(parts) > 3:
            return None
        try:
            numbers = [float(part) for part in parts]
        except ValueError:
            return None
        if len(numbers) == 1:
            return numbers[0]
        if len(numbers) == 2:
            return numbers[0] * 60 + numbers[1]
        return numbers[0] * 3600 + numbers[1] * 60 + numbers[2]

    def _metadata_args(self, metadata: EditableMetadata) -> list[str]:
        args: list[str] = []
        for key, value in {
            "title": metadata.title,
            "artist": metadata.artist,
            "album": metadata.album,
        }.items():
            if value:
                args.extend(["-metadata", f"{key}={value}"])
        return args

    def _video_maps(self, subtitle_input_indexes: list[int]) -> list[str]:
        args = ["-map", "0:v:0?", "-map", "0:a:0?"]
        for index in subtitle_input_indexes:
            args.extend(["-map", f"{index}:0?"])
        return args

    async def _download_cover(self, url: str | None, stem: str) -> Path | None:
        if not url:
            return None
        target = settings.temp_root / f"{stem}-cover.jpg"

        def _fetch() -> None:
            if url.startswith("data:image/"):
                _, _, payload = url.partition(",")
                target.write_bytes(base64.b64decode(payload))
                return
            with urllib.request.urlopen(url, timeout=15) as response:
                target.write_bytes(response.read())

        try:
            await asyncio.to_thread(_fetch)
            return target
        except Exception:
            return None
