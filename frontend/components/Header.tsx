import { Moon, Sun, Youtube, PlaneTakeoff, Sparkles, Info } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useState } from "react";

import { cn } from "@/lib/utils";

interface HeaderProps {
  isDark: boolean;
  onToggleTheme: () => void;
}

const InfoModal = ({ isOpen, onClose, isDarkMode }: { isOpen: boolean; onClose: () => void; isDarkMode: boolean }) => {
  return (
    <AnimatePresence>
      {isOpen ? (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_20px_50px_rgba(0,0,0,0.3)] dark:border-slate-800 dark:bg-slate-900 dark:shadow-[0_20px_50px_rgba(0,0,0,0.5)] md:p-8"
          >
            <div className="flex flex-col gap-6">
              <div className="flex items-center gap-4">
                <YTPilotMark />
                <div className="flex h-12 min-w-0 flex-col justify-between py-0.5 text-left">
                  <h2 className={cn("text-[1.55rem] font-black leading-none tracking-tighter", isDarkMode ? "text-white" : "text-slate-900")}>
                    YT<span className="text-red-600">Pilot</span>
                  </h2>
                  <p className="text-[10px] font-bold uppercase leading-none tracking-[0.18em] text-slate-400 dark:text-slate-500">
                    HomeMade YT Downloader
                  </p>
                </div>
              </div>

              <div className="space-y-1.5">
                <h3
                  className={`select-none text-[10px] font-black uppercase tracking-[0.2em] transition-all duration-300 ${
                    isDarkMode ? "text-slate-500" : "text-slate-400"
                  }`}
                >
                  About
                </h3>
                <p
                  className={`text-xs font-medium leading-relaxed transition-all duration-300 md:text-sm ${
                    isDarkMode ? "text-slate-400" : "text-slate-500"
                  }`}
                >
                  YTPilot analyzes YouTube media, lets you choose export settings, and processes video or audio through a secure server-side yt-dlp and FFmpeg workflow.
                </p>
              </div>

              <div className="space-y-3">
                <h3
                  className={`select-none text-[10px] font-black uppercase tracking-[0.2em] transition-all duration-300 ${
                    isDarkMode ? "text-slate-500" : "text-slate-400"
                  }`}
                >
                  Core Capabilities
                </h3>
                <div className="space-y-2">
                  {[
                    "Adaptive video and audio quality selection",
                    "Android client and PO-token extraction modes",
                    "Metadata, cover art, trimming, and playlists",
                    "Detected subtitle embedding with live job progress"
                  ].map((capability) => (
                    <div key={capability} className="flex items-start gap-2.5">
                      <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                      <span
                        className={`text-[13px] font-semibold transition-all duration-300 ${
                          isDarkMode ? "text-slate-300" : "text-slate-600"
                        }`}
                      >
                        {capability}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className={`my-1 h-px transition-all duration-300 ${isDarkMode ? "bg-slate-800/60" : "bg-slate-200/60"}`} />

              <div className="flex items-center justify-between gap-4 pt-1">
                <p
                  className={`select-none text-[11px] font-semibold italic transition-all duration-300 md:text-xs ${
                    isDarkMode ? "text-slate-500" : "text-slate-400"
                  }`}
                >
                  Crafted for excellence by{" "}
                  <span
                    className={`bg-gradient-to-r bg-clip-text font-black text-transparent ${
                      isDarkMode ? "from-blue-400 to-indigo-400" : "from-blue-600 via-indigo-600 to-indigo-700"
                    }`}
                  >
                    Sahil Khatkar
                  </span>
                </p>
                <button
                  onClick={onClose}
                  className={`cursor-pointer rounded-xl border px-4 py-1.5 text-xs font-bold uppercase tracking-wider transition-all md:py-2 ${
                    isDarkMode
                      ? "border-white/[0.05] bg-[#1e2638] text-slate-200 hover:border-white/[0.1] hover:bg-[#242f46] hover:text-white"
                      : "border-slate-200/50 bg-slate-100 text-slate-700 hover:border-slate-300/50 hover:bg-slate-200 hover:text-slate-900"
                  }`}
                >
                  Close
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
};

const YTPilotMark = () => (
  <div className="relative shrink-0">
    <div className="flex items-center justify-center rounded-xl bg-gradient-to-br from-red-600 to-red-700 p-2.5 shadow-lg shadow-red-500/30">
      <div className="relative">
        <PlaneTakeoff className="h-7 w-7 text-white" />
        <div className="absolute -bottom-1 -right-1 flex h-[18px] w-[18px] items-center justify-center rounded-[5px] bg-white shadow-sm">
          <Youtube className="h-3.5 w-3.5 translate-x-[0.5px] text-red-600" />
        </div>
      </div>
    </div>
    <div className="absolute -right-1.5 -top-1.5">
      <Sparkles className="h-5 w-5 fill-yellow-400 text-yellow-400" />
    </div>
  </div>
);

const YTPilotLogo = ({ isDarkMode }: { isDarkMode: boolean }) => {
  const scrollToTop = () => window.scrollTo({ top: 0, behavior: "smooth" });

  return (
    <div className="group flex cursor-pointer items-center gap-3" onClick={scrollToTop}>
      <YTPilotMark />
      <span className={cn("text-[1.25rem] font-black tracking-tighter sm:text-[1.55rem]", isDarkMode ? "text-white" : "text-slate-900")}>
        YT<span className="text-red-600">Pilot</span>
      </span>
    </div>
  );
};

export default function Header({ isDark, onToggleTheme }: HeaderProps) {
  const [showInfo, setShowInfo] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-50 h-[4.75rem] w-full border-b border-slate-200 bg-white/70 backdrop-blur-md transition-colors dark:border-blue-800/30 dark:bg-slate-900/60">
        <div className="mx-auto flex h-full w-full max-w-5xl items-center justify-between px-5 sm:px-8">
          <YTPilotLogo isDarkMode={isDark} />
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowInfo(true)}
              className={cn(
                "glass-card flex h-11 w-11 items-center justify-center rounded-xl text-slate-600 transition-all duration-300 hover:scale-105 hover:bg-slate-200 active:scale-95 dark:text-white dark:ring-1 dark:ring-white/15 dark:hover:bg-white/10 dark:hover:ring-white/25"
              )}
              aria-label="App info"
            >
              <Info className="h-[18px] w-[18px]" />
            </button>
            <button
              onClick={onToggleTheme}
              className={cn(
                "glass-card flex h-11 w-11 items-center justify-center rounded-xl text-slate-600 transition-all duration-300 hover:scale-105 hover:bg-slate-200 active:scale-95 dark:text-white dark:ring-1 dark:ring-white/15 dark:hover:bg-white/10 dark:hover:ring-white/25"
              )}
              aria-label="Toggle theme"
            >
              {isDark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
            </button>
          </div>
        </div>
      </header>
      <InfoModal isOpen={showInfo} onClose={() => setShowInfo(false)} isDarkMode={isDark} />
    </>
  );
}
