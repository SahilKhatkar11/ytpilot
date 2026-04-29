import { Download, Scissors, Trash2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

import { cn } from "@/lib/utils";

export interface ProcessingJobUI {
  id: string;
  title: string;
  status: "queued" | "processing" | "completed" | "failed";
  progress: number;
  speed?: string;
  message?: string;
  thumbnailUrl: string;
  format: string;
  quality: string;
  type: "video" | "audio";
  downloadUrl?: string;
  trim?: {
    start: string;
    end: string;
  } | null;
}

interface ProcessingQueueProps {
  jobs: ProcessingJobUI[];
  onClearAll?: () => void;
}

export default function ProcessingQueue({ jobs, onClearAll }: ProcessingQueueProps) {
  if (!jobs.length) return null;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 pb-20">
      <div className="flex flex-col items-start justify-between gap-4 border-b border-slate-200 p-5 dark:border-white/5 sm:flex-row sm:items-center">
        <div className="flex flex-wrap items-center gap-4">
          <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400 dark:text-white/40">Job Manager</span>
          <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-mono text-slate-500 dark:bg-white/5 dark:text-white/60">
            {jobs.filter((job) => job.status === "completed").length} / {jobs.length} Completed
          </span>
        </div>
        {onClearAll ? (
          <button
            onClick={onClearAll}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-rose-500/10 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-rose-500 transition-all hover:bg-rose-500 hover:text-white sm:w-auto"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear All
          </button>
        ) : null}
      </div>

      <div className="no-scrollbar flex max-h-[600px] flex-col gap-4 overflow-y-auto p-1">
        <AnimatePresence mode="popLayout">
          {jobs.map((job) => (
            <motion.div
              key={job.id}
              layout
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className={cn(
                "flex flex-col gap-3 rounded-xl border p-4 transition-all",
                job.status === "processing"
                  ? "border-blue-500/20 bg-blue-500/5"
                  : job.status === "completed"
                    ? "border-emerald-500/20 bg-emerald-500/5"
                    : "border-slate-200 bg-white dark:border-white/10 dark:bg-white/5"
              )}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <StatusDot status={job.status} />
                  <span
                    className={cn(
                      "text-[10px] font-bold uppercase tracking-tighter",
                      job.status === "processing"
                        ? "text-blue-500 dark:text-blue-400"
                        : job.status === "completed"
                          ? "text-emerald-500 dark:text-emerald-400"
                          : "text-slate-400 dark:text-white/40"
                    )}
                  >
                    {job.status === "processing" ? "Processing..." : job.status}
                  </span>
                </div>
                <span className="text-[10px] font-mono text-slate-400 dark:text-white/40">{job.speed || ""}</span>
              </div>

              <div className="flex min-w-0 items-center gap-3">
                <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-slate-200 dark:border-white/10">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={job.thumbnailUrl} className="h-full w-full object-cover" alt="" />
                </div>
                <h4 className="min-w-0 flex-1 truncate text-xs font-medium text-slate-700 dark:text-white/80">{job.title}</h4>
                {job.trim ? (
                  <div className="flex items-center gap-1 rounded border border-blue-500/20 bg-blue-500/10 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-tighter text-blue-600 dark:text-blue-400">
                    <Scissors className="h-2 w-2" />
                    Trimmed
                  </div>
                ) : null}
                <span className="shrink-0 text-[10px] font-mono text-slate-400 dark:text-white/30">{job.format}</span>
              </div>

              {job.status !== "queued" ? (
                <div className="space-y-2">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-white/5">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${job.progress}%` }}
                      className={cn("h-full rounded-full transition-all duration-500", job.status === "completed" ? "bg-emerald-500" : "bg-blue-500")}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] font-mono text-slate-400 dark:text-white/40">
                    <span>{job.message || (job.status === "processing" ? "Processing metadata..." : "")}</span>
                    <span>{Math.round(job.progress)}%</span>
                  </div>
                </div>
              ) : null}

              {job.status === "completed" && job.downloadUrl ? (
                <motion.a
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  href={job.downloadUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 py-2.5 text-[11px] font-bold text-white transition-colors hover:bg-emerald-500"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download File
                </motion.a>
              ) : null}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

function StatusDot({ status }: { status: ProcessingJobUI["status"] }) {
  if (status === "queued") return <div className="h-2 w-2 rounded-full bg-white/20" />;
  if (status === "processing") return <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />;
  if (status === "completed") return <div className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />;
  return <div className="h-2 w-2 rounded-full bg-rose-500" />;
}
