from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse

from .config import settings
from .cookie_store import CookieStore
from .job_manager import JobManager
from .models import AnalyzeRequest, QueueItemRequest, SearchRequest
from .pot_provider import PotProvider
from .yt_dlp_service import YtDlpService

if hasattr(asyncio, "WindowsProactorEventLoopPolicy"):
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

cookie_store = CookieStore()
job_manager = JobManager(cookie_store=cookie_store)
ytdlp = YtDlpService(cookie_store=cookie_store)
pot_provider = PotProvider()


@asynccontextmanager
async def lifespan(_: FastAPI):
    await pot_provider.start()
    yield
    await job_manager.cleanup()
    await pot_provider.stop()


app = FastAPI(title=settings.app_name, lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=settings.cors_origin_regex or None,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/debug/yt-dlp")
async def ytdlp_debug():
    return {
        **ytdlp.diagnostics(),
        "pot_provider": {
            **pot_provider.diagnostics(),
            "ready": await pot_provider.is_ready(),
        },
    }


@app.post(f"{settings.api_prefix}/analyze")
async def analyze(payload: AnalyzeRequest):
    try:
        item = await ytdlp.analyze(
            payload.url,
            cookies_token=payload.cookies_token,
            force_android_client=payload.force_android_client,
        )
        return item
    except RuntimeError as exc:
        detail = str(exc) or repr(exc) or "Analysis failed without an error message. Check the backend yt-dlp configuration."
        print(f"Analyze failed for url={payload.url!r}: {detail}", flush=True)
        raise HTTPException(status_code=502, detail=detail) from exc


@app.post(f"{settings.api_prefix}/cookies")
async def upload_cookies(file: UploadFile = File(...)):
    return await cookie_store.save_upload(file)


@app.delete(f"{settings.api_prefix}/cookies/{{token}}")
async def delete_cookies(token: str):
    cookie_store.delete(token)
    return {"status": "cleared"}


@app.post(f"{settings.api_prefix}/search")
async def search(payload: SearchRequest):
    try:
        return {"results": await ytdlp.search(payload.query, payload.limit)}
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.get(f"{settings.api_prefix}/jobs")
async def list_jobs():
    return {"items": job_manager.list_jobs()}


@app.post(f"{settings.api_prefix}/jobs")
async def create_job(payload: QueueItemRequest):
    return await job_manager.create_job(payload)


@app.get(f"{settings.api_prefix}/jobs/{{job_id}}")
async def get_job(job_id: str):
    return job_manager.get_job(job_id)


@app.get(f"{settings.api_prefix}/jobs/{{job_id}}/events")
async def job_events(job_id: str):
    return StreamingResponse(job_manager.stream(job_id), media_type="text/event-stream")


@app.get(f"{settings.api_prefix}/download/{{token}}")
async def download(token: str):
    path = job_manager.get_download_path(token)
    return FileResponse(path=path, filename=path.name, media_type="application/octet-stream")
