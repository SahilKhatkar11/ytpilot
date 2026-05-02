import type { JobRecord, MediaItem, QueuePayload } from "@/types";

const configuredApiBase = process.env.NEXT_PUBLIC_API_BASE?.trim();
const API_BASE = (configuredApiBase || "http://localhost:8000/api/v1").replace(/\/$/, "");
const REQUEST_TIMEOUT_MS = 45000;
const RENDER_WAKE_MESSAGE =
  "The backend may be waking up on Render. Free Render services sleep after being idle, so please wait 30-60 seconds and try again.";
const WRONG_API_HOST_MESSAGE =
  "The frontend is not pointing to the FastAPI backend. Set NEXT_PUBLIC_API_BASE to your Render backend URL ending in /api/v1, for example https://ytpilot-backend.onrender.com/api/v1.";

function isLikelyOfflineError(error: unknown) {
  return error instanceof TypeError || (error instanceof Error && /failed to fetch|networkerror|load failed/i.test(error.message));
}

async function fetchWithTimeout(input: string, init: RequestInit = {}, timeoutMs: number | null = REQUEST_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeout = timeoutMs === null ? null : setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: timeoutMs === null ? init.signal : controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(RENDER_WAKE_MESSAGE);
    }
    if (isLikelyOfflineError(error)) {
      throw new Error(`${RENDER_WAKE_MESSAGE} If this keeps happening, check the backend URL and CORS settings.`);
    }
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const text = await response.text();
    let detail: string | undefined;
    try {
      const payload = JSON.parse(text) as { detail?: string };
      detail = payload.detail;
    } catch {
      detail = undefined;
    }
    const message = detail || text || "Request failed";
    if (response.status === 405 && /<html/i.test(message)) {
      throw new Error(WRONG_API_HOST_MESSAGE);
    }
    if ([502, 503, 504].includes(response.status) && /render|service unavailable|bad gateway|gateway timeout|timeout|upstream/i.test(message)) {
      throw new Error(`${RENDER_WAKE_MESSAGE} Details: ${message}`);
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

export async function analyzeUrl(url: string, cookiesToken?: string | null): Promise<MediaItem> {
  const response = await fetchWithTimeout(`${API_BASE}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, cookies_token: cookiesToken ?? null })
  }, null);
  return parseJson<MediaItem>(response);
}

export async function uploadCookiesFile(file: File): Promise<{ token: string; expires_in_minutes: string; warnings?: string[] }> {
  const form = new FormData();
  form.append("file", file);
  const response = await fetchWithTimeout(`${API_BASE}/cookies`, {
    method: "POST",
    body: form
  }, 30000);
  return parseJson<{ token: string; expires_in_minutes: string; warnings?: string[] }>(response);
}

export async function clearCookiesToken(token: string): Promise<void> {
  const response = await fetchWithTimeout(`${API_BASE}/cookies/${token}`, {
    method: "DELETE"
  }, 10000);
  await parseJson<{ status: string }>(response);
}

export async function searchCatalog(query: string): Promise<MediaItem[]> {
  const response = await fetchWithTimeout(`${API_BASE}/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, limit: 6 })
  }, null);
  const payload = await parseJson<{ results: MediaItem[] }>(response);
  return payload.results;
}

export async function enqueueJob(payload: QueuePayload): Promise<JobRecord> {
  const response = await fetchWithTimeout(`${API_BASE}/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  return parseJson<JobRecord>(response);
}

export async function getJob(jobId: string): Promise<JobRecord> {
  const response = await fetchWithTimeout(`${API_BASE}/jobs/${jobId}`, {}, 10000);
  return parseJson<JobRecord>(response);
}

export function streamJob(jobId: string, onMessage: (event: MessageEvent<string>) => void) {
  const stream = new EventSource(`${API_BASE}/jobs/${jobId}/events`);
  stream.onmessage = onMessage;
  stream.addEventListener("snapshot", onMessage as EventListener);
  stream.addEventListener("progress", onMessage as EventListener);
  stream.addEventListener("status", onMessage as EventListener);
  stream.addEventListener("completed", onMessage as EventListener);
  stream.addEventListener("failed", onMessage as EventListener);
  return stream;
}

export function buildDownloadUrl(token: string): string {
  return `${API_BASE}/download/${token}`;
}
