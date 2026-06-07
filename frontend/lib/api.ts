import type { JobRecord, MediaItem, QueuePayload } from "@/types";

const configuredApiBase = process.env.NEXT_PUBLIC_API_BASE?.trim();
const API_BASE = (configuredApiBase || "http://localhost:8000/api/v1").replace(/\/$/, "");
const REQUEST_TIMEOUT_MS = 45000;
const ANALYZE_TIMEOUT_MS = 150000;
const WRONG_API_HOST_MESSAGE =
  "The frontend is not pointing to the FastAPI backend. Set NEXT_PUBLIC_API_BASE to your Render backend URL ending in /api/v1, for example https://ytpilot-backend.onrender.com/api/v1.";

interface ApiErrorDetail {
  code?: string;
  title?: string;
  message?: string;
}

function formatApiDetail(detail: unknown, status: number): string {
  if (typeof detail === "string" && detail.trim()) return detail;
  if (detail && typeof detail === "object" && !Array.isArray(detail)) {
    const structured = detail as ApiErrorDetail;
    const message = [structured.title, structured.message].filter(Boolean).join(": ");
    if (message) return message;
  }
  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => {
        if (!item || typeof item !== "object") return "";
        const validation = item as { msg?: string; loc?: Array<string | number> };
        const location = validation.loc?.slice(1).join(".");
        return [location, validation.msg].filter(Boolean).join(": ");
      })
      .filter(Boolean);
    if (messages.length) return `Request Validation Failed: ${messages.join("; ")}`;
  }
  return `Request Failed: The backend returned HTTP ${status}.`;
}

function isLikelyOfflineError(error: unknown) {
  return error instanceof TypeError || (error instanceof Error && /failed to fetch|networkerror|load failed/i.test(error.message));
}

function networkAccessMessage() {
  const frontendOrigin = typeof window === "undefined" ? "this frontend" : window.location.origin;
  return `Backend Unreachable: The browser could not connect to ${API_BASE} from ${frontendOrigin}. The browser does not expose whether this was DNS, CORS, TLS, mixed-content, or a refused connection; check its Network/Console details.`;
}

async function fetchWithTimeout(input: string, init: RequestInit = {}, timeoutMs: number | null = REQUEST_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeout = timeoutMs === null ? null : setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: timeoutMs === null ? init.signal : controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(`Request Timed Out: The backend did not respond within ${Math.round((timeoutMs ?? REQUEST_TIMEOUT_MS) / 1000)} seconds.`);
    }
    if (isLikelyOfflineError(error)) {
      throw new Error(networkAccessMessage());
    }
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const text = await response.text();
    let detail: unknown;
    try {
      const payload = JSON.parse(text) as { detail?: string | ApiErrorDetail };
      detail = payload.detail;
    } catch {
      detail = undefined;
    }
    const message = detail === undefined ? text || formatApiDetail(detail, response.status) : formatApiDetail(detail, response.status);
    if (response.status === 405 && /<html/i.test(message)) {
      throw new Error(WRONG_API_HOST_MESSAGE);
    }
    if ([502, 503, 504].includes(response.status) && /<html/i.test(message)) {
      throw new Error(`Hosting Gateway Error: The hosting platform returned HTTP ${response.status} before the API produced a response.`);
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

export async function analyzeUrl(url: string, cookiesToken?: string | null, forceAndroidClient = false): Promise<MediaItem> {
  const response = await fetchWithTimeout(`${API_BASE}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      cookies_token: forceAndroidClient ? null : cookiesToken ?? null,
      force_android_client: forceAndroidClient
    })
  }, ANALYZE_TIMEOUT_MS);
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
  }, ANALYZE_TIMEOUT_MS);
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
