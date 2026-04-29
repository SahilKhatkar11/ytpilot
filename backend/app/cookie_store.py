from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException, UploadFile

from .config import settings


class CookieStore:
    def __init__(self) -> None:
        self.root = settings.storage_root / "cookies_uploads"
        self.root.mkdir(parents=True, exist_ok=True)
        self.ttl = timedelta(minutes=settings.cleanup_after_minutes)
        self.max_size_bytes = 2 * 1024 * 1024

    async def save_upload(self, upload: UploadFile) -> dict[str, str]:
        content = await upload.read(self.max_size_bytes + 1)
        if len(content) > self.max_size_bytes:
            raise HTTPException(status_code=413, detail="Cookies file is too large. Use a Netscape cookies.txt export under 2 MB.")

        text = content.decode("utf-8", errors="replace")
        if not self._looks_like_netscape_cookies(text):
            raise HTTPException(status_code=400, detail="Upload a valid Netscape cookies.txt file exported from your browser.")

        self.cleanup()
        token = uuid4().hex
        target = self.root / f"{token}.txt"
        target.write_bytes(content)
        return {"token": token, "expires_in_minutes": str(int(self.ttl.total_seconds() // 60))}

    def resolve(self, token: str | None) -> Path | None:
        if not token:
            return None
        if not token.isalnum() or len(token) != 32:
            return None
        path = self.root / f"{token}.txt"
        if not path.exists() or self._is_expired(path):
            path.unlink(missing_ok=True)
            return None
        return path.resolve()

    def cleanup(self) -> None:
        for path in self.root.glob("*.txt"):
            if self._is_expired(path):
                path.unlink(missing_ok=True)

    def delete(self, token: str | None) -> None:
        path = self.resolve(token)
        if path:
            path.unlink(missing_ok=True)

    def _is_expired(self, path: Path) -> bool:
        modified = datetime.fromtimestamp(path.stat().st_mtime, timezone.utc)
        return datetime.now(timezone.utc) - modified > self.ttl

    def _looks_like_netscape_cookies(self, text: str) -> bool:
        if "# Netscape HTTP Cookie File" not in text[:512]:
            return False
        return ".youtube.com" in text or ".google.com" in text or "youtube.com" in text or "google.com" in text
