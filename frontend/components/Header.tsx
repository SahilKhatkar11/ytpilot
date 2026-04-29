import { Moon, Sun, Youtube, PlaneTakeoff, Sparkles, Info } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useState } from "react";

import { cn } from "@/lib/utils";

interface HeaderProps {
  isDark: boolean;
  onToggleTheme: () => void;
}

const InfoModal = ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => {
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
            className="relative w-full max-w-md rounded-[2.5rem] border border-slate-200 bg-white p-8 shadow-[0_20px_50px_rgba(0,0,0,0.3)] dark:border-slate-800 dark:bg-slate-900 dark:shadow-[0_20px_50px_rgba(0,0,0,0.5)]"
          >
            <div className="flex flex-col gap-6">
              <div className="flex items-center gap-4">
                <div className="rounded-2xl bg-red-500/10 p-3 text-red-500">
                  <Youtube size={24} />
                </div>
                <h2 className="text-2xl font-black tracking-tight dark:text-white">About YTPilot</h2>
              </div>
              <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                YTPilot helps you analyze media, choose clean export settings, and process downloads in a single polished workflow.
              </p>
              <div className="space-y-3">
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Core Capabilities</h3>
                <ul className="grid gap-2">
                  {[
                    "Video and audio processing",
                    "Playlist batch handling",
                    "Metadata editing",
                    "Subtitle selection",
                    "Live processing queue",
                    "Secure file delivery"
                  ].map((feature) => (
                    <li key={feature} className="flex items-center gap-3 text-xs font-medium text-slate-700 dark:text-slate-300">
                      <div className="h-1.5 w-1.5 rounded-full bg-red-500 shrink-0" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="border-t border-slate-100 pt-4 dark:border-slate-800">
                <p className="text-xs text-slate-500">
                  Crafted for excellence by <span className="font-bold text-slate-900 dark:text-white">Sahil Khatkar</span>
                </p>
              </div>
              <div className="flex justify-end">
                <button
                  onClick={onClose}
                  className="rounded-xl bg-slate-100 px-6 py-3 text-[10px] font-black uppercase tracking-widest text-slate-900 transition-all active:scale-95 dark:bg-slate-800 dark:text-white"
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

const YTPilotLogo = ({ isDarkMode }: { isDarkMode: boolean }) => {
  const scrollToTop = () => window.scrollTo({ top: 0, behavior: "smooth" });

  return (
    <div className="group flex cursor-pointer items-center gap-3" onClick={scrollToTop}>
      <div className="relative">
        <div className="flex items-center justify-center rounded-xl bg-gradient-to-br from-red-600 to-red-700 p-2.5 shadow-lg shadow-red-500/30">
          <div className="relative">
            <PlaneTakeoff className="h-7 w-7 text-white" />
            <div className="absolute -bottom-1 -right-1 flex h-[18px] w-[18px] items-center justify-center rounded-[5px] bg-white shadow-sm">
              <Youtube className="h-3.5 w-3.5 translate-x-[0.5px] text-red-600" />
            </div>
          </div>
        </div>
        <div className="absolute -top-1.5 -right-1.5">
          <Sparkles className="h-5 w-5 fill-yellow-400 text-yellow-400" />
        </div>
      </div>
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
      <InfoModal isOpen={showInfo} onClose={() => setShowInfo(false)} />
    </>
  );
}
