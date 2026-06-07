from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

STATUS_CODES = {
    "age_restricted": 403,
    "private_video": 403,
    "members_only": 403,
    "premium_required": 403,
    "geo_restricted": 451,
    "copyright_blocked": 451,
    "video_removed": 404,
    "video_unavailable": 404,
    "live_not_started": 409,
    "live_ended": 410,
    "drm_protected": 422,
    "youtube_rate_limited": 429,
    "youtube_ip_blocked": 403,
    "cookies_rejected": 401,
    "authentication_required": 401,
    "forbidden": 403,
    "unsupported_url": 400,
    "invalid_url": 400,
    "playlist_unavailable": 404,
    "format_unavailable": 422,
    "subtitles_unavailable": 422,
    "proxy_failure": 502,
    "dns_failure": 502,
    "connection_failure": 502,
    "tls_failure": 502,
    "timeout": 504,
    "ffmpeg_failure": 500,
    "disk_full": 507,
    "permission_denied": 500,
}


@dataclass(frozen=True)
class ErrorReport:
    code: str
    title: str
    message: str
    status_code: int = 502

    def as_detail(self) -> dict[str, str]:
        return {
            "code": self.code,
            "title": self.title,
            "message": self.message,
        }

    def display_message(self) -> str:
        return f"{self.title}: {self.message}"


def classify_error(error: BaseException | str) -> ErrorReport:
    raw = str(error).strip()
    normalized = _normalize(raw)

    rules: list[tuple[str, str, str, tuple[str, ...]]] = [
        (
            "age_restricted",
            "Age-Restricted Video",
            "YouTube requires an eligible signed-in account for this video. Upload fresh cookies from an account that can watch it.",
            ("age-restricted", "age restricted", "confirm your age", "inappropriate for some users"),
        ),
        (
            "private_video",
            "Private Video",
            "This video is private. Cookies must belong to an account that has permission to view it.",
            ("private video", "this video is private"),
        ),
        (
            "members_only",
            "Members-Only Video",
            "This content requires a channel membership on the signed-in account.",
            ("members-only", "members only", "join this channel"),
        ),
        (
            "premium_required",
            "YouTube Premium Required",
            "This content requires YouTube Premium on the signed-in account.",
            ("youtube premium", "premium content"),
        ),
        (
            "geo_restricted",
            "Region Restriction",
            "YouTube does not make this video available from the backend server's region.",
            (
                "not available in your country",
                "not made this video available in your country",
                "not available in your region",
                "geo-restricted",
                "geo restricted",
            ),
        ),
        (
            "copyright_blocked",
            "Copyright Restriction",
            "YouTube has blocked or removed this video because of a copyright claim.",
            ("copyright claim", "copyright grounds", "copyright infringement"),
        ),
        (
            "video_removed",
            "Video Removed",
            "The video has been removed by its uploader or by YouTube.",
            ("video has been removed", "removed by the uploader", "removed for violating"),
        ),
        (
            "video_unavailable",
            "Video Unavailable",
            "YouTube reports that this video is unavailable.",
            (
                "video unavailable",
                "this video is unavailable",
                "video is no longer available",
                "video does not exist",
            ),
        ),
        (
            "live_not_started",
            "Live Stream Not Started",
            "This live stream has not started yet.",
            ("premieres in", "live event will begin", "this live event will begin", "not currently live"),
        ),
        (
            "live_ended",
            "Live Stream Ended",
            "The live stream has ended and YouTube has not made a replay available.",
            ("livestream has ended", "live stream has ended"),
        ),
        (
            "drm_protected",
            "DRM-Protected Content",
            "This media is DRM protected and cannot be processed by yt-dlp.",
            ("drm protected", "drm-protected", "this video is drm"),
        ),
        (
            "youtube_rate_limited",
            "YouTube Rate Limit",
            "YouTube returned HTTP 429 Too Many Requests for the backend IP. Wait or use a different server IP/proxy.",
            ("http error 429", "status code 429", "too many requests"),
        ),
        (
            "youtube_ip_blocked",
            "YouTube IP Blockage",
            "YouTube challenged or blocked requests from the backend IP address.",
            (
                "sign in to confirm you're not a bot",
                "sign in to confirm you’re not a bot",
                "confirm you’re not a bot",
                "confirm you're not a bot",
                "confirm you are not a bot",
                "youtube is blocking this request",
                "bot block",
            ),
        ),
        (
            "cookies_rejected",
            "Cookies Rejected",
            "YouTube did not accept the uploaded authentication cookies. Export a fresh Netscape cookies.txt from the correct signed-in browser profile.",
            (
                "youtube rejected the uploaded cookies",
                "cookies are no longer valid",
                "cookies have expired",
                "invalid cookies",
                "account cookies",
            ),
        ),
        (
            "authentication_required",
            "YouTube Sign-In Required",
            "This video requires authentication. Upload cookies from a YouTube account that can view it.",
            ("login required", "sign in to watch", "requires authentication", "cookies for the authentication", "only available on youtube"),
        ),
        (
            "forbidden",
            "YouTube Request Forbidden",
            "YouTube returned HTTP 403 Forbidden. The server was denied access to this media request.",
            ("http error 403", "status code 403", "403 forbidden"),
        ),
        (
            "unsupported_url",
            "Unsupported URL",
            "yt-dlp does not support this URL.",
            ("unsupported url", "no suitable extractor", "url is not supported"),
        ),
        (
            "invalid_url",
            "Invalid URL",
            "The supplied media URL is invalid or incomplete.",
            ("invalid url", "url could be a direct video link", "unable to extract video id"),
        ),
        (
            "playlist_unavailable",
            "Playlist Unavailable",
            "The playlist is private, deleted, or otherwise unavailable to the current account.",
            ("playlist does not exist", "playlist is private", "unable to recognize playlist"),
        ),
        (
            "format_unavailable",
            "Requested Quality Unavailable",
            "The selected format or quality is not available for this video. Analyze it again and choose an available option.",
            ("requested format is not available", "requested format not available", "no video formats found"),
        ),
        (
            "subtitles_unavailable",
            "Subtitles Unavailable",
            "The requested subtitle track is unavailable or could not be downloaded.",
            ("unable to download video subtitles", "no subtitles for the requested languages", "subtitle download"),
        ),
        (
            "proxy_failure",
            "Proxy Connection Failed",
            "The configured proxy could not connect to YouTube. Check the proxy URL, credentials, availability, and protocol.",
            (
                "proxy error",
                "unable to connect to proxy",
                "proxy connection",
                "tunnel connection failed",
                "cannot connect to proxy",
            ),
        ),
        (
            "dns_failure",
            "DNS Resolution Failed",
            "The backend could not resolve YouTube's hostname. Check the host's DNS and outbound network access.",
            ("name or service not known", "temporary failure in name resolution", "nodename nor servname", "getaddrinfo failed"),
        ),
        (
            "connection_failure",
            "YouTube Connection Failed",
            "The backend could not establish a network connection to YouTube.",
            ("connection refused", "connection reset", "network is unreachable", "remote end closed connection"),
        ),
        (
            "tls_failure",
            "TLS Certificate Error",
            "The backend could not verify the remote HTTPS certificate.",
            ("certificate verify failed", "ssl:", "tls"),
        ),
        (
            "timeout",
            "Request Timed Out",
            "The backend did not receive a response before the operation timeout.",
            ("timed out", "timeout", "read operation timed out"),
        ),
        (
            "ffmpeg_failure",
            "Media Processing Failed",
            "FFmpeg could not process the downloaded media. Check the backend log for the exact codec or container error.",
            ("ffmpeg", "error while filtering", "invalid data found when processing input"),
        ),
        (
            "disk_full",
            "Server Storage Full",
            "The backend ran out of storage while processing this media.",
            ("no space left on device", "disk quota exceeded"),
        ),
        (
            "permission_denied",
            "Server Permission Error",
            "The backend does not have permission to read or write a required file.",
            ("permission denied", "access is denied"),
        ),
    ]

    for code, title, message, markers in rules:
        if any(marker in normalized for marker in markers):
            return ErrorReport(code, title, message, STATUS_CODES.get(code, 502))

    concise = _extract_concise_error(raw)
    return ErrorReport(
        "unknown_error",
        "Processing Failed",
        concise or "The backend returned an unknown error. Check the backend log for the complete diagnostic output.",
    )


def error_detail(error: BaseException | str) -> dict[str, Any]:
    return classify_error(error).as_detail()


def _normalize(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip().lower()


def _extract_concise_error(raw: str) -> str:
    lines = [
        line.strip()
        for line in raw.splitlines()
        if line.strip() and not line.lstrip().startswith("Command:")
    ]
    candidate = next((line for line in reversed(lines) if "error:" in line.lower()), lines[-1] if lines else "")
    candidate = re.sub(r"^(?:error:\s*)+", "", candidate, flags=re.IGNORECASE).strip()
    return candidate[:500]
