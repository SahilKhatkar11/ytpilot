from __future__ import annotations

import asyncio
import os
import socket
import shutil
import subprocess
from pathlib import Path
from urllib.parse import urlparse

from .config import settings


class PotProvider:
    def __init__(self) -> None:
        self.process: asyncio.subprocess.Process | None = None
        self.error: str | None = None
        self.configured_enabled = settings.pot_provider_enabled

    async def start(self) -> None:
        if not settings.pot_provider_enabled or await self.is_ready():
            return

        server_path = self._server_path()
        node_binary = shutil.which("node")
        if not server_path or not server_path.exists():
            self.error = "PO-token provider server was not found"
            settings.pot_provider_enabled = False
            return
        if not node_binary:
            self.error = "Node.js is required to start the PO-token provider"
            settings.pot_provider_enabled = False
            return

        port = self._provider_port()
        self.process = await asyncio.create_subprocess_exec(
            node_binary,
            str(server_path),
            "--port",
            str(port),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0) if os.name == "nt" else 0,
        )

        deadline = asyncio.get_running_loop().time() + settings.pot_provider_startup_seconds
        while asyncio.get_running_loop().time() < deadline:
            if self.process.returncode is not None:
                output = await self._read_output()
                self.error = output or f"PO-token provider exited with code {self.process.returncode}"
                settings.pot_provider_enabled = False
                return
            if await self.is_ready():
                self.error = None
                return
            await asyncio.sleep(0.5)

        self.error = "PO-token provider did not become ready before the startup timeout"
        await self.stop()
        settings.pot_provider_enabled = False

    async def stop(self) -> None:
        if not self.process or self.process.returncode is not None:
            return
        self.process.terminate()
        try:
            await asyncio.wait_for(self.process.wait(), timeout=5)
        except TimeoutError:
            self.process.kill()
            await self.process.wait()

    async def is_ready(self) -> bool:
        if not settings.pot_provider_enabled:
            return False

        def _check() -> bool:
            parsed = urlparse(settings.pot_provider_url)
            try:
                with socket.create_connection((parsed.hostname or "127.0.0.1", parsed.port or 4416), timeout=2):
                    return True
            except OSError:
                return False

        return await asyncio.to_thread(_check)

    def diagnostics(self) -> dict[str, str | bool | None]:
        return {
            "configured_enabled": self.configured_enabled,
            "enabled": settings.pot_provider_enabled,
            "url": settings.pot_provider_url,
            "server": str(self._server_path()) if self._server_path() else None,
            "managed_process_running": bool(self.process and self.process.returncode is None),
            "error": self.error,
        }

    def _server_path(self) -> Path | None:
        if settings.pot_provider_server:
            return settings.pot_provider_server
        default = Path("/opt/bgutil-provider/server/build/main.js")
        return default if default.exists() else None

    def _provider_port(self) -> int:
        parsed = urlparse(settings.pot_provider_url)
        return parsed.port or 4416

    async def _read_output(self) -> str:
        if not self.process or not self.process.stdout:
            return ""
        output = await self.process.stdout.read()
        return output.decode("utf-8", errors="replace").strip()
