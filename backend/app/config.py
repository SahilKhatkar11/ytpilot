import shutil
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_ROOT = Path(__file__).resolve().parents[1]
WINGET_ROOT = Path.home() / "AppData" / "Local" / "Microsoft" / "WinGet" / "Packages"


def _resolve_binary(name: str, local_candidate: Path) -> str:
    found = shutil.which(name)
    if found:
        return found
    if local_candidate.exists():
        return str(local_candidate)
    winget_matches = sorted(WINGET_ROOT.glob(f"{name}.*/*{name}.EXE"))
    if winget_matches:
        return str(winget_matches[-1])
    return name


class Settings(BaseSettings):
    app_name: str = "YTPilot API"
    api_prefix: str = "/api/v1"
    cors_origin: str = "http://localhost:3000"
    cors_origin_regex: str = r"^https://[a-z0-9-]+\.onrender\.com$|^https://[^/]+\.github\.io$"
    download_base_url: str = "http://localhost:8000"
    storage_root: Path = Path("storage")
    temp_root: Path = Path("storage/tmp")
    output_root: Path = Path("storage/output")
    cleanup_after_minutes: int = 60
    max_parallel_jobs: int = 2
    ytdlp_binary: str = _resolve_binary("yt-dlp", BACKEND_ROOT / ".venv" / "Scripts" / "yt-dlp.exe")
    ytdlp_cookies_file: Path | None = None
    ytdlp_cookies_from_browser: str | None = None
    ytdlp_force_ipv4: bool = True
    ytdlp_proxy_url: str | None = None
    ffmpeg_binary: str = _resolve_binary("ffmpeg", BACKEND_ROOT / "tools" / "ffmpeg" / "bin" / "ffmpeg.exe")
    ffprobe_binary: str = _resolve_binary("ffprobe", BACKEND_ROOT / "tools" / "ffmpeg" / "bin" / "ffprobe.exe")
    pot_provider_enabled: bool = True
    pot_provider_url: str = "http://127.0.0.1:4416"
    pot_provider_server: Path | None = None
    pot_provider_startup_seconds: int = 20

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip().rstrip("/") for origin in self.cors_origin.split(",") if origin.strip()]

    @field_validator("ytdlp_proxy_url")
    @classmethod
    def validate_proxy_url(cls, value: str | None) -> str | None:
        if not value:
            return None
        normalized = value.strip()
        if not normalized.startswith(("http://", "https://", "socks4://", "socks5://", "socks5h://")):
            raise ValueError("YTDLP_PROXY_URL must use http, https, socks4, socks5, or socks5h")
        return normalized


settings = Settings()
