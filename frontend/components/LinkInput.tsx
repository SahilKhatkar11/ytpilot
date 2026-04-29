import { motion } from "motion/react";
import { Search } from "lucide-react";

import { cn } from "@/lib/utils";

interface SearchResultItem {
  id: string;
  title: string;
  subtitle: string;
  sourceUrl: string;
}

interface LinkInputProps {
  url: string;
  query: string;
  status: "idle" | "analyzing" | "analyzed" | "processing";
  searchResults: SearchResultItem[];
  onUrlChange: (value: string) => void;
  onQueryChange: (value: string) => void;
  onAnalyze: () => void;
  onReset: () => void;
  onPaste: () => void;
  onSearch: () => void;
  onSelectSearchResult: (url: string) => void;
}

export default function LinkInput({
  url,
  query,
  status,
  searchResults,
  onUrlChange,
  onQueryChange,
  onAnalyze,
  onReset,
  onPaste,
  onSearch,
  onSelectSearchResult
}: LinkInputProps) {
  const isAnalyzing = status === "analyzing";
  const isAnalyzed = status === "analyzed";

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mx-auto w-full max-w-2xl space-y-5">
      <div className="glass-panel rounded-2xl p-5 shadow-xl transition-all duration-300">
        <div className="relative flex flex-col sm:block">
          <textarea
            value={url}
            onChange={(event) => onUrlChange(event.target.value)}
            placeholder="Paste YouTube source link or playlist URL..."
            rows={1}
            className={cn(
              "min-h-[50px] w-full resize-none overflow-y-auto break-all rounded-xl border border-slate-200 bg-slate-100 py-3.5 pl-4 pr-4 text-sm text-slate-800 transition-all placeholder:text-slate-400 focus:border-blue-500/50 focus:outline-none dark:border-white/10 dark:bg-slate-950 dark:text-blue-50 dark:placeholder:text-white/10 sm:pr-40"
            )}
            disabled={isAnalyzing}
          />
          <div className="mt-2 flex gap-2 px-1 sm:absolute sm:right-4 sm:top-2.5 sm:mt-0 sm:px-0">
            {url ? (
              <button
                onClick={onReset}
                className="flex-1 rounded-lg border border-slate-200 bg-slate-100 px-4 py-2 text-xs font-bold text-slate-500 transition-all hover:bg-slate-200 hover:text-slate-800 active:scale-95 dark:border-white/10 dark:bg-white/5 dark:text-white/60 dark:hover:bg-white/10 dark:hover:text-white sm:flex-none sm:py-1.5"
              >
                Clear
              </button>
            ) : !isAnalyzed ? (
                <button
                  onClick={onPaste}
                  className="flex-1 rounded-lg bg-slate-200/50 px-4 py-2 text-xs font-semibold text-slate-600 transition-colors hover:text-slate-800 dark:bg-white/5 dark:text-slate-400 dark:hover:text-blue-200 sm:flex-none sm:bg-transparent sm:py-1.5"
                >
                  Paste
                </button>
            ) : null}
            {!isAnalyzed ? (
              <button
                onClick={onAnalyze}
                disabled={!url || isAnalyzing}
                className="accent-glow flex-[2] rounded-lg bg-blue-600 px-6 py-2 text-xs font-bold text-white transition-all hover:bg-blue-500 active:scale-95 disabled:opacity-50 sm:flex-none sm:py-1.5"
              >
                {isAnalyzing ? "..." : "Analyze"}
              </button>
            ) : null}
          </div>
        </div>

        {!isAnalyzed && !isAnalyzing ? (
          <div className="mt-4 space-y-4">
            <div className="flex items-center gap-3 px-2 text-xs text-slate-300 dark:text-white/10">
              <div className="h-[1px] flex-1 bg-slate-200 dark:bg-white/5" />
              <span className="font-bold uppercase tracking-[0.2em]">OR SEARCH</span>
              <div className="h-[1px] flex-1 bg-slate-200 dark:bg-white/5" />
            </div>
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 dark:text-white/20">
                <Search className="h-3.5 w-3.5" />
              </div>
              <input
                type="text"
                value={query}
                onChange={(event) => onQueryChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    void onSearch();
                  }
                }}
                placeholder="Search for music or videos..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-20 text-xs text-slate-800 placeholder:text-slate-400 transition-all focus:border-slate-300 focus:outline-none dark:border-white/10 dark:bg-slate-950 dark:text-blue-50 dark:placeholder:text-white/20 dark:focus:border-white/10"
              />
              <button
                type="button"
                onClick={() => void onSearch()}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg bg-blue-600 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white transition-all hover:bg-blue-500"
              >
                Search
              </button>
            </div>
            {searchResults.length ? (
              <div className="space-y-2">
                {searchResults.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onSelectSearchResult(item.sourceUrl)}
                    className="glass-card flex w-full items-start justify-between rounded-xl p-3 text-left transition-all hover:border-blue-500/30"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-800 dark:text-white">{item.title}</div>
                      <div className="truncate text-xs text-slate-500 dark:text-slate-400">{item.subtitle}</div>
                    </div>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </motion.div>
  );
}
