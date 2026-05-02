"use client";

import { startTransition, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

import AnalysisPanel from "@/components/AnalysisPanel";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import LinkInput from "@/components/LinkInput";
import ProcessingQueue, { type ProcessingJobUI } from "@/components/ProcessingQueue";
import { analyzeUrl, buildDownloadUrl, clearCookiesToken, enqueueJob, getJob, searchCatalog, streamJob, uploadCookiesFile } from "@/lib/api";
import type { JobRecord, MediaItem, MediaKind, QueuePayload } from "@/types";

type AppStatus = "idle" | "analyzing" | "analyzed" | "processing";

const RESOLUTION_PRIORITY = ["4320p", "2160p", "1440p", "1080p", "720p", "480p", "360p", "240p", "144p"];

export default function HomePage() {
  const [isDark, setIsDark] = useState(true);
  const [status, setStatus] = useState<AppStatus>("idle");
  const [url, setUrl] = useState("");
  const [query, setQuery] = useState("");
  const [metadata, setMetadata] = useState<MediaItem | null>(null);
  const [searchResults, setSearchResults] = useState<MediaItem[]>([]);
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [cookiesToken, setCookiesToken] = useState<string | null>(null);
  const [cookiesMessage, setCookiesMessage] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  useEffect(() => {
    const activeIds = jobs.filter((job) => job.status === "queued" || job.status === "processing").map((job) => job.id);
    if (!activeIds.length) return;

    const interval = window.setInterval(() => {
      void Promise.allSettled(activeIds.map((id) => getJob(id))).then((results) => {
        const updates = results
          .filter((result): result is PromiseFulfilledResult<JobRecord> => result.status === "fulfilled")
          .map((result) => result.value);
        if (!updates.length) return;
        setJobs((current) =>
          current.map((job) => {
            const update = updates.find((item) => item.id === job.id);
            return update ?? job;
          })
        );
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [jobs]);

  const queueJobs = useMemo<ProcessingJobUI[]>(
    () =>
      jobs.map((job) => {
        const backendPercent = job.progress.percent ?? 0;
        const displayProgress = job.status === "completed" ? 100 : backendPercent;
        return {
          id: job.id,
          title: job.item.title,
          status: job.status,
          progress: displayProgress,
          speed: job.progress.speed ?? undefined,
          message: job.progress.message ?? job.error ?? undefined,
          thumbnailUrl: job.item.thumbnail_url ?? job.item.options.metadata.cover_url ?? "",
          format: job.item.options.target_ext.toUpperCase(),
          quality: describeQueuedQuality(job),
          type: job.item.options.mode,
          downloadUrl: job.download_token ? buildDownloadUrl(job.download_token) : undefined,
          trim: job.item.options.trim ?? null
        };
      }),
    [jobs]
  );

  async function handleAnalyze(nextUrl = url) {
    const trimmedUrl = nextUrl.trim();
    if (!trimmedUrl) {
      setError("Enter a valid URL before analysis.");
      return;
    }
    if (!isValidHttpUrl(trimmedUrl)) {
      setError("Enter a valid link starting with http:// or https://.");
      return;
    }
    setStatus("analyzing");
    setError(null);
    try {
      const payload = await analyzeUrl(trimmedUrl, cookiesToken);
      setMetadata(payload);
      setStatus("analyzed");
    } catch (err) {
      setStatus("idle");
      setError(err instanceof Error ? err.message : "Analysis failed.");
    }
  }

  async function handlePaste() {
    try {
      const text = await navigator.clipboard.readText();
      if (text.trim()) {
        setUrl(text.trim());
        setError(null);
      }
    } catch {
      setError("Clipboard access was blocked. Paste manually or allow clipboard access.");
    }
  }

  async function handleSearch() {
    if (!query.trim()) {
      setError("Enter a search phrase first.");
      return;
    }
    setError(null);
    try {
      setSearchResults(await searchCatalog(query.trim()));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed.");
    }
  }

  function handleReset() {
    setUrl("");
    setQuery("");
    setMetadata(null);
    setSearchResults([]);
    setStatus("idle");
    setError(null);
  }

  async function handleCookiesUpload(file: File | null) {
    if (!file) return;
    setError(null);
    setCookiesMessage("Uploading cookies.txt...");
    try {
      const result = await uploadCookiesFile(file);
      setCookiesToken(result.token);
      const warningText = result.warnings?.length ? ` ${result.warnings.join(" ")}` : "";
      setCookiesMessage(`Cookies loaded for ${result.expires_in_minutes} minutes. Try Analyze again.${warningText}`);
    } catch (err) {
      setCookiesMessage(null);
      setError(err instanceof Error ? err.message : "Could not upload cookies.txt.");
    }
  }

  async function handleClearCookies() {
    const token = cookiesToken;
    setCookiesToken(null);
    setCookiesMessage(null);
    if (!token) return;
    try {
      await clearCookiesToken(token);
    } catch {
      // The token may have already expired server-side; clearing local state is enough for opt-out.
    }
  }

  async function startProcessing(config: {
    type: MediaKind;
    format: string;
    quality: string;
    isBestQuality: boolean;
    includeSubtitles: boolean;
    metadata: {
      title: string;
      artist: string;
      album: string;
      thumbnailUrl: string;
    };
    selectedItems: string[];
    trim: { start: string; end: string } | null;
  }) {
    if (!metadata) return;

    const targets = metadata.is_playlist
      ? metadata.entries.filter((entry) => config.selectedItems.includes(entry.id))
      : [metadata];

    if (!targets.length) {
      setError("Select at least one playlist item before processing.");
      return;
    }

    setStatus("idle");
    setMetadata(null);
    setError(null);

    for (const target of targets) {
      const formatId = chooseFormatId(config.type, config.quality, config.isBestQuality);
      const payload: QueuePayload = {
        source_url: target.source_url,
        media_id: target.id,
        title: config.metadata.title || target.title,
        thumbnail_url: target.thumbnail_url || metadata.thumbnail_url,
        options: {
          mode: config.type,
          format_id: formatId,
          target_ext: config.format.toLowerCase(),
          audio_bitrate_kbps: config.type === "audio" ? parseBitrate(config.quality) : null,
          embed_subtitles: config.type === "video" && config.includeSubtitles,
          subtitle_languages: config.type === "video" && config.includeSubtitles ? uniqueSubtitleLanguages(target.subtitles.map((subtitle) => subtitle.language)) : [],
          best_quality: config.isBestQuality,
          custom_args: {},
          metadata: {
            title: config.metadata.title || target.title,
            artist: config.metadata.artist || null,
            album: config.metadata.album || null,
            cover_url: config.type === "audio" ? config.metadata.thumbnailUrl || null : null
          },
          trim: config.trim,
          cookies_token: cookiesToken
        }
      };

      try {
        const job = await enqueueJob(payload);
        setJobs((current) => [job, ...current]);
        wireStream(job.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not queue job.");
      }
    }
  }

  function wireStream(jobId: string) {
    const eventSource = streamJob(jobId, (event) => {
      if (!event.data) return;
      const data = JSON.parse(event.data);
      startTransition(() => {
        setJobs((current) =>
          current.map((job) => {
            if (job.id !== jobId) return job;
            if ("status" in data && "item" in data) {
              return data as JobRecord;
            }
            if (event.type === "completed") {
              eventSource.close();
              return data as JobRecord;
            }
            if (event.type === "failed") {
              eventSource.close();
              return { ...job, status: "failed", error: data.message, progress: { ...job.progress, stage: "failed", message: data.message } };
            }
            return {
              ...job,
              status: "processing",
              progress: {
                ...job.progress,
                ...data
              }
            };
          })
        );
      });
    });
  }

  const hasActiveJobs = queueJobs.some((job) => job.status === "processing" || job.status === "queued");

  return (
    <div className="min-h-screen flex flex-col transition-colors duration-300 selection:bg-blue-500/30">
      <div className="mesh-bg" />
      <Header isDark={isDark} onToggleTheme={() => setIsDark((current) => !current)} />

      <main className="max-w-7xl mx-auto px-4 sm:px-8 py-8 sm:pb-10 sm:pt-12 space-y-8 w-full">
        <LinkInput
          url={url}
          query={query}
          status={status}
          searchResults={searchResults.map((item) => ({
            id: item.id,
            title: item.title,
            subtitle: item.extractor ?? "Search result",
            sourceUrl: item.source_url
          }))}
          onUrlChange={setUrl}
          onQueryChange={setQuery}
          onAnalyze={() => void handleAnalyze()}
          onReset={handleReset}
          onPaste={() => void handlePaste()}
          onSearch={() => void handleSearch()}
          onSelectSearchResult={(sourceUrl) => {
            setUrl(sourceUrl);
            void handleAnalyze(sourceUrl);
          }}
        />

        {needsCookies(error) || cookiesMessage || cookiesToken ? (
          <div className="mx-auto w-full max-w-2xl rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4 text-sm text-amber-700 shadow-lg backdrop-blur-md dark:text-amber-100">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <div className="text-xs font-bold uppercase tracking-[0.18em]">{cookiesToken ? "Cookies Loaded" : cookiesMessage ? "Loading Cookies" : "Cookies Required"}</div>
                <p className="text-xs opacity-80">{cookiesMessage ?? "YouTube blocked this URL. Upload your exported Netscape cookies.txt to retry privately."}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <label className="cursor-pointer rounded-lg border border-amber-500/30 bg-amber-500/15 px-4 py-2 text-xs font-bold transition-all hover:bg-amber-500/25">
                  Upload cookies.txt
                  <input
                    type="file"
                    accept=".txt,text/plain"
                    className="hidden"
                    onChange={(event) => {
                      void handleCookiesUpload(event.target.files?.[0] ?? null);
                      event.currentTarget.value = "";
                    }}
                  />
                </label>
                {cookiesToken ? (
                  <button
                    type="button"
                    onClick={() => void handleClearCookies()}
                    className="rounded-lg border border-amber-500/20 px-4 py-2 text-xs font-bold transition-all hover:bg-amber-500/15"
                  >
                    Clear
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        {(status === "analyzing" || queueJobs.length > 0) && (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="glass-panel rounded-2xl p-8 flex flex-col items-center justify-center text-center space-y-4 max-w-2xl mx-auto w-full will-change-transform">
            {status === "analyzing" || hasActiveJobs ? (
              <div className="w-12 h-12 rounded-full border-2 border-blue-500/20 border-t-blue-500 animate-spin" />
            ) : (
              <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
            )}
            <div className="space-y-1">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 dark:text-blue-200/40">{status === "analyzing" ? "Fetching Metadata" : hasActiveJobs ? "System Active" : "Tasks Completed"}</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-[240px]">
                {status === "analyzing" ? "Reaching out to YouTube servers to extract media information..." : hasActiveJobs ? "Processing your media. You can add more links to the queue above." : "All your media has been processed successfully. Check the downloads below."}
              </p>
            </div>
          </motion.div>
        )}

        <AnimatePresence mode="wait">
          {status === "analyzed" && metadata ? (
            <motion.div key="analysis" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="w-full max-w-6xl mx-auto will-change-transform">
              <AnalysisPanel metadata={metadata} onStartProcessing={(config) => void startProcessing(config)} />
            </motion.div>
          ) : status === "idle" && queueJobs.length === 0 ? (
            <motion.div key="placeholder" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-panel border-dashed border-2 bg-slate-100/30 dark:bg-white/2 border-slate-200 dark:border-white/5 rounded-2xl p-12 flex flex-col items-center justify-center text-center space-y-4 max-w-4xl mx-auto w-full min-h-[200px] will-change-transform">
              <div className="w-16 h-16 rounded-2xl bg-slate-200 dark:bg-white/5 flex items-center justify-center text-slate-300 dark:text-white/10">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
                </svg>
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-slate-400 dark:text-white/20 uppercase tracking-[0.2em]">Media Info</h3>
                <p className="text-xs text-slate-500 dark:text-slate-500 max-w-[200px]">Paste a link to see high-quality media details and options here.</p>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <div className="pt-8 border-t border-slate-200 dark:border-white/5 max-w-6xl mx-auto w-full">
          <ProcessingQueue jobs={queueJobs} onClearAll={() => setJobs([])} />
        </div>

        {error ? <div className="fixed right-4 bottom-4 z-[10000] max-w-sm rounded-xl border border-rose-500/30 bg-rose-500/15 px-4 py-3 text-sm text-rose-600 shadow-xl backdrop-blur-md dark:text-rose-200">{error}</div> : null}
      </main>

      <Footer isDarkMode={isDark} />
    </div>
  );
}

function chooseFormatId(mode: MediaKind, quality: string, bestQuality: boolean) {
  if (bestQuality) {
    return mode === "video" ? "bv*+ba/b" : "ba/b";
  }
  if (mode === "video") {
    const height = parseQualityHeight(quality);
    return height ? `bv*[height<=${height}]+ba/b[height<=${height}]/bv*+ba/b` : "bv*+ba/b";
  }
  return "ba/b";
}

function parseQualityHeight(value: string) {
  const parsed = Number(value.replace(/\D/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseBitrate(value: string) {
  const parsed = Number(value.replace(/\D/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 320;
}

function uniqueSubtitleLanguages(languages: string[]) {
  return [...new Set(languages.map((language) => language.trim()).filter(Boolean))];
}

function describeQueuedQuality(job: JobRecord) {
  if (job.item.options.best_quality) return "Best";
  if (job.item.options.mode === "audio") return `${job.item.options.audio_bitrate_kbps ?? 320} kbps`;
  return job.item.options.format_id;
}

function isValidHttpUrl(value: string) {
  try {
    const parsed = new URL(value);
    return ["http:", "https:"].includes(parsed.protocol) && Boolean(parsed.hostname);
  } catch {
    return false;
  }
}

function needsCookies(message: string | null) {
  if (!message) return false;
  const normalized = message.toLowerCase();
  return (
    normalized.includes("sign in to confirm") ||
    normalized.includes("not a bot") ||
    normalized.includes("cookies for the authentication") ||
    normalized.includes("youtube rejected the uploaded cookies") ||
    normalized.includes("youtube is blocking this request") ||
    normalized.includes("age-restricted") ||
    normalized.includes("only available on youtube") ||
    normalized.includes("requires youtube authentication") ||
    normalized.includes("login")
  );
}

function resolutionRank(resolution?: string | null) {
  const index = RESOLUTION_PRIORITY.indexOf(resolution ?? "");
  return index === -1 ? 999 : index;
}
