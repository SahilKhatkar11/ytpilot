from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field, HttpUrl


class MediaKind(str, Enum):
    video = "video"
    audio = "audio"


class JobStatus(str, Enum):
    queued = "queued"
    processing = "processing"
    completed = "completed"
    failed = "failed"


class SubtitleOption(BaseModel):
    language: str
    name: str
    ext: str


class FormatOption(BaseModel):
    format_id: str
    ext: str
    resolution: str | None = None
    bitrate_kbps: int | None = None
    vcodec: str | None = None
    acodec: str | None = None
    filesize_mb: float | None = None
    container: str | None = None
    kind: MediaKind


class EditableMetadata(BaseModel):
    title: str
    artist: str | None = None
    album: str | None = None
    cover_url: str | None = None


class TrimOptions(BaseModel):
    start: str
    end: str


class MediaItem(BaseModel):
    source_url: str
    extractor: str | None = None
    id: str
    title: str
    duration_seconds: int | None = None
    thumbnail_url: HttpUrl | None = None
    metadata: EditableMetadata
    formats: list[FormatOption]
    subtitles: list[SubtitleOption] = Field(default_factory=list)
    is_playlist: bool = False
    entries: list["MediaItem"] = Field(default_factory=list)


class AnalyzeRequest(BaseModel):
    url: str
    cookies_token: str | None = None


class SearchRequest(BaseModel):
    query: str
    limit: int = 5


class JobOptions(BaseModel):
    mode: MediaKind
    format_id: str
    target_ext: str
    audio_bitrate_kbps: int | None = None
    embed_subtitles: bool = False
    subtitle_languages: list[str] = Field(default_factory=list)
    best_quality: bool = False
    custom_args: dict[str, str] = Field(default_factory=dict)
    metadata: EditableMetadata
    trim: TrimOptions | None = None
    cookies_token: str | None = None


class QueueItemRequest(BaseModel):
    source_url: str
    media_id: str
    title: str
    thumbnail_url: HttpUrl | None = None
    options: JobOptions


class JobProgress(BaseModel):
    percent: float = 0
    speed: str | None = None
    eta_seconds: int | None = None
    stage: str = "queued"
    message: str | None = None


class JobRecord(BaseModel):
    id: str
    status: JobStatus
    created_at: datetime
    updated_at: datetime
    item: QueueItemRequest
    progress: JobProgress
    output_name: str | None = None
    download_token: str | None = None
    expires_at: datetime | None = None
    error: str | None = None


class JobEvent(BaseModel):
    event: str
    data: dict[str, Any]
