import React, { useEffect, useMemo, useState } from "react";
import { Check, Edit3, Image as ImageIcon, Play, Scissors, Clock } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import { cn } from "@/lib/utils";
import type { MediaItem, MediaKind } from "@/types";

interface AnalysisPanelProps {
  metadata: MediaItem;
  onStartProcessing: (config: {
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
  }) => void;
}

function secondsToClock(total?: number | null) {
  if (!total) return "00:00:00";
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function resolutionRank(value: string) {
  const order = ["4320p", "2160p", "1440p", "1080p", "720p", "480p", "360p", "240p", "144p"];
  const index = order.indexOf(value);
  return index === -1 ? 999 : index;
}

export default function AnalysisPanel({ metadata, onStartProcessing }: AnalysisPanelProps) {
  const [type, setType] = useState<MediaKind>("video");
  const [quality, setQuality] = useState("1080p");
  const [format, setFormat] = useState("MP4");
  const [isBestQuality, setIsBestQuality] = useState(true);
  const [includeSubtitles, setIncludeSubtitles] = useState(metadata.subtitles.length > 0);
  const [isTrimEnabled, setIsTrimEnabled] = useState(false);
  const [startTime, setStartTime] = useState("00:00:00");
  const [endTime, setEndTime] = useState(secondsToClock(metadata.duration_seconds));
  const [editableMeta, setEditableMeta] = useState({
    title: metadata.metadata.title,
    artist: metadata.metadata.artist ?? "",
    album: metadata.metadata.album ?? "",
    thumbnailUrl: metadata.metadata.cover_url ?? metadata.thumbnail_url ?? ""
  });
  const [selectedPlaylistItems, setSelectedPlaylistItems] = useState<string[]>(metadata.entries?.map((item) => item.id) ?? []);

  const playlistItems = useMemo(
    () =>
      metadata.entries?.map((entry) => ({
        id: entry.id,
        title: entry.title,
        duration: secondsToClock(entry.duration_seconds)
      })) ?? [],
    [metadata.entries]
  );

  const videoQualities = ["144p", "240p", "360p", "480p", "720p", "1080p", "1440p", "2160p"];
  const availableVideoQualities = useMemo(() => {
    const values = metadata.formats
      .filter((item) => item.kind === "video" && item.resolution)
      .map((item) => item.resolution as string);
    return new Set(values);
  }, [metadata.formats]);

  const audioBitrates = ["128 kbps", "192 kbps", "256 kbps", "320 kbps"];

  const visibleQualities = type === "video" ? videoQualities : audioBitrates;
  const videoFormats = ["MP4", "WEBM", "MKV"];
  const audioFormats = ["MP3", "M4A", "WAV"];

  const getQualityLabel = (q: string) => {
    if (q === "1440p") return "1440p (2K)";
    if (q === "2160p") return "2160p (4K)";
    return q;
  };

  const getFormatLabel = (value: string, mediaType: MediaKind) => {
    if (mediaType === "audio") {
      if (value === "MP3") return "MP3 (ID3 Cover Art)";
      if (value === "M4A") return "M4A (AAC)";
      if (value === "WAV") return "WAV (PCM)";
    }
    if (value === "MP4") return "MP4 (H.264/AAC)";
    if (value === "WEBM") return "WEBM (VP9/Opus)";
    if (value === "MKV") return "MKV (H.265/HEVC)";
    return value;
  };

  const isQualityAvailable = (value: string) => {
    if (type === "audio") return true;
    return availableVideoQualities.has(value);
  };

  useEffect(() => {
    if (type !== "video" || isQualityAvailable(quality)) return;
    const fallback = [...videoQualities].reverse().find((entry) => availableVideoQualities.has(entry)) ?? "1080p";
    setQuality(fallback);
  }, [availableVideoQualities, quality, type]);

  const handleCustomArtUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setEditableMeta((current) => ({ ...current, thumbnailUrl: reader.result as string }));
    };
    reader.readAsDataURL(file);
  };

  const togglePlaylistItem = (id: string) => {
    setSelectedPlaylistItems((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  };

  return (
    <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="w-full glass-panel rounded-2xl p-6 flex flex-col gap-6 will-change-transform">
      <div className="flex flex-col md:flex-row gap-6">
        <div className="w-full md:w-64 h-36 rounded-xl overflow-hidden relative shrink-0 border border-slate-200 dark:border-white/10 group">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={editableMeta.thumbnailUrl} alt={metadata.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <Play className="w-8 h-8 text-white fill-current" />
          </div>
          <div className="absolute bottom-1.5 right-1.5 bg-black/80 px-2 py-0.5 rounded text-[10px] font-mono text-white">{secondsToClock(metadata.duration_seconds)}</div>
          {metadata.is_playlist && <div className="absolute top-2 left-2 bg-blue-600 text-white text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wider">Playlist</div>}
        </div>

        <div className="flex flex-col justify-center gap-1.5 flex-1 min-w-0">
          <span className="inline-block bg-blue-500/10 text-blue-500 dark:text-blue-400 text-[10px] font-bold px-2 py-0.5 rounded uppercase w-fit tracking-wider border border-blue-500/20">Analyzed</span>
          <h2 className="text-xl font-bold leading-tight text-slate-900 dark:text-white truncate">{metadata.title}</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">{metadata.metadata.artist || metadata.extractor || "Source"} - Source URL</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4">
        <div className="space-y-5">
          <label className="block text-[11px] font-bold text-slate-400 dark:text-white/60 uppercase tracking-[0.2em]">Format & Quality</label>
          <div className="flex p-1 bg-slate-100 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-white/5 w-fit">
            <button onClick={() => { setType("video"); setFormat("MP4"); setQuality("1080p"); }} className={cn("px-6 py-2 text-xs font-semibold rounded-lg transition-all", type === "video" ? "bg-white dark:bg-blue-600/30 text-brand-primary dark:text-blue-300 shadow-sm ring-1 ring-black/5 dark:ring-white/10" : "text-slate-500 dark:text-slate-400 hover:text-brand-primary dark:hover:text-white")}>Video</button>
            <button onClick={() => { setType("audio"); setFormat("MP3"); setQuality("320 kbps"); }} className={cn("px-6 py-2 text-xs font-semibold rounded-lg transition-all", type === "audio" ? "bg-white dark:bg-blue-600/30 text-brand-primary dark:text-blue-300 shadow-sm ring-1 ring-black/5 dark:ring-white/10" : "text-slate-500 dark:text-slate-400 hover:text-brand-primary dark:hover:text-white")}>Audio</button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {visibleQualities.map((entry) => {
              const available = isQualityAvailable(entry);
              return (
                <button
                  key={entry}
                  onClick={() => {
                    if (!available) return;
                    setQuality(entry);
                    setIsBestQuality(false);
                  }}
                  disabled={!available}
                  title={available ? getQualityLabel(entry) : `${getQualityLabel(entry)} is not available for this video`}
                  className={cn(
                    "py-2.5 sm:py-2 text-[10px] font-bold border transition-all rounded-lg",
                    !available
                      ? "cursor-not-allowed border-slate-200/60 bg-slate-100/50 text-slate-300 opacity-60 dark:border-white/5 dark:bg-white/[0.03] dark:text-white/20"
                      : quality === entry
                        ? "border-blue-500/50 bg-blue-500/10 text-blue-600 dark:text-blue-400"
                        : "border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-900/50 text-slate-400 dark:text-slate-500 hover:text-brand-primary dark:hover:text-white"
                  )}
                >
                  {getQualityLabel(entry)}
                </button>
              );
            })}
          </div>

          <div className="relative">
            <select value={format} onChange={(event) => setFormat(event.target.value)} className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-xl py-2.5 px-3 text-xs text-slate-700 dark:text-white/80 focus:outline-none focus:border-blue-500/40 appearance-none transition-all">
              {(type === "video" ? videoFormats : audioFormats).map((entry) => (
                <option key={entry} value={entry} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">{getFormatLabel(entry, type)}</option>
              ))}
            </select>
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 dark:text-white/30">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
            </div>
          </div>
        </div>

        <div className="space-y-5">
          <label className="block text-[11px] font-bold text-slate-400 dark:text-white/60 uppercase tracking-[0.2em]">Metadata Editor</label>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest pl-1">Title</label>
              <input type="text" value={editableMeta.title} onChange={(event) => setEditableMeta({ ...editableMeta, title: event.target.value })} placeholder="Title" className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-lg py-2.5 px-3 text-xs text-slate-700 dark:text-slate-100 focus:outline-none focus:border-blue-500/40 transition-all placeholder:text-slate-400 dark:placeholder:text-white/10" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest pl-1">Author</label>
                <input type="text" value={editableMeta.artist} onChange={(event) => setEditableMeta({ ...editableMeta, artist: event.target.value })} placeholder="Author" className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-lg py-2.5 px-3 text-xs text-slate-700 dark:text-slate-100 focus:outline-none focus:border-blue-500/40 transition-all placeholder:text-slate-400 dark:placeholder:text-white/10" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest pl-1">Album</label>
                <input type="text" value={editableMeta.album} onChange={(event) => setEditableMeta({ ...editableMeta, album: event.target.value })} placeholder="Album" className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-lg py-2.5 px-3 text-xs text-slate-700 dark:text-slate-100 focus:outline-none focus:border-blue-500/40 transition-all placeholder:text-slate-400 dark:placeholder:text-white/10" />
              </div>
            </div>
            <div className="relative pt-1 flex gap-2">
              <div className="relative flex-1">
                <div className="absolute left-3 top-[calc(50%+4px)] -translate-y-1/2 text-slate-400 dark:text-white/20"><ImageIcon className="w-3.5 h-3.5" /></div>
                <input type="text" value={editableMeta.thumbnailUrl} onChange={(event) => setEditableMeta({ ...editableMeta, thumbnailUrl: event.target.value })} placeholder="Cover Art URL" className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-lg py-2.5 pl-9 pr-3 text-[10px] text-slate-500 dark:text-slate-400 focus:outline-none focus:border-blue-500/40 transition-all truncate placeholder:text-slate-400 dark:placeholder:text-white/10" />
              </div>
              <label className="shrink-0 flex items-center justify-center w-10 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg cursor-pointer hover:bg-slate-200 dark:hover:bg-white/10 transition-all">
                <Edit3 className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                <input type="file" className="hidden" accept="image/*" onChange={handleCustomArtUpload} />
              </label>
            </div>
          </div>
        </div>
      </div>

      {metadata.is_playlist && playlistItems.length ? (
        <div className="space-y-3 border-t border-slate-200 dark:border-white/5 pt-6">
          <label className="block text-[11px] font-bold text-slate-400 dark:text-white/60 uppercase tracking-[0.2em]">Playlist Content</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto no-scrollbar pr-1">
            {playlistItems.map((item) => (
              <div key={item.id} onClick={() => togglePlaylistItem(item.id)} className={cn("flex items-center gap-3 p-2.5 rounded-xl cursor-pointer transition-all border", selectedPlaylistItems.includes(item.id) ? "bg-blue-500/10 border-blue-500/30" : "bg-slate-50 dark:bg-white/5 border-slate-100 dark:border-white/5 hover:border-blue-500/20")}>
                <div className={cn("w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors", selectedPlaylistItems.includes(item.id) ? "bg-blue-600 border-blue-600 shadow-sm" : "border-slate-300 dark:border-white/20")}>{selectedPlaylistItems.includes(item.id) && <Check className="w-3 h-3 text-white" />}</div>
                <span className="text-[11px] font-medium text-slate-700 dark:text-white/80 truncate flex-1">{item.title}</span>
                <span className="text-[9px] font-mono text-slate-400 dark:text-white/30">{item.duration}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="space-y-4 border-t border-slate-200 dark:border-white/5 pt-6">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <label className="block text-[11px] font-bold text-slate-400 dark:text-white/60 uppercase tracking-[0.2em]">Trimming</label>
            <p className="text-[10px] text-slate-500 dark:text-slate-400">Extract a specific segment of the media</p>
          </div>
          <button onClick={() => setIsTrimEnabled(!isTrimEnabled)} className={cn("flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all border", isTrimEnabled ? "bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400" : "bg-slate-50 dark:bg-white/5 border-slate-100 dark:border-white/5 text-slate-500 dark:text-slate-400 hover:border-blue-500/20")}>
            <Scissors className="w-3.5 h-3.5" />
            {isTrimEnabled ? "Trim Enabled" : "Enable Trimming"}
          </button>
        </div>

        <AnimatePresence>
          {isTrimEnabled && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div className="grid grid-cols-2 gap-4 pb-2">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest pl-1 flex items-center gap-1.5"><Clock className="w-3 h-3" />Start Time</label>
                  <input type="text" value={startTime} onChange={(event) => setStartTime(event.target.value)} placeholder="HH:MM:SS" className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-lg py-2.5 px-3 text-xs text-slate-700 dark:text-slate-100 focus:outline-none focus:border-blue-500/40 transition-all font-mono" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest pl-1 flex items-center gap-1.5"><Clock className="w-3 h-3" />End Time</label>
                  <input type="text" value={endTime} onChange={(event) => setEndTime(event.target.value)} placeholder="HH:MM:SS" className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-lg py-2.5 px-3 text-xs text-slate-700 dark:text-slate-100 focus:outline-none focus:border-blue-500/40 transition-all font-mono" />
                </div>
              </div>
              <p className="text-[9px] text-slate-400 pl-1">Format: <span className="font-mono">HH:MM:SS</span> or <span className="font-mono">MM:SS</span>. Current duration: {secondsToClock(metadata.duration_seconds)}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="mt-auto flex flex-col sm:flex-row items-center justify-between pt-6 border-t border-slate-200 dark:border-white/5 gap-4">
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 bg-slate-50 dark:bg-slate-950 px-4 py-2 rounded-xl border border-slate-200 dark:border-white/10 cursor-pointer hover:bg-slate-100 dark:hover:bg-white/10 transition-colors group">
            <input
              type="checkbox"
              checked={includeSubtitles}
              disabled={!metadata.subtitles.length}
              onChange={(event) => setIncludeSubtitles(event.target.checked)}
              className="w-3.5 h-3.5 rounded border-slate-300 dark:border-white/20 bg-transparent text-blue-600 focus:ring-blue-500 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
            />
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-blue-50">
              {metadata.subtitles.length ? `Include Subtitles (${metadata.subtitles.length})` : "No Subtitles Found"}
            </span>
          </label>
          <label className="flex items-center gap-2 bg-slate-50 dark:bg-slate-950 px-4 py-2 rounded-xl border border-slate-200 dark:border-white/10 cursor-pointer hover:bg-slate-100 dark:hover:bg-white/10 transition-colors group">
            <input type="checkbox" checked={isBestQuality} onChange={(event) => setIsBestQuality(event.target.checked)} className="w-3.5 h-3.5 rounded border-slate-300 dark:border-white/20 bg-transparent text-blue-600 focus:ring-blue-500 transition-colors cursor-pointer" />
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-blue-50">Best Quality</span>
          </label>
        </div>

        <button onClick={() => onStartProcessing({ type, format, quality, isBestQuality, includeSubtitles, metadata: editableMeta, selectedItems: metadata.is_playlist ? selectedPlaylistItems : [], trim: isTrimEnabled ? { start: startTime, end: endTime } : null })} className="w-full sm:w-auto px-10 py-3.5 bg-blue-600 rounded-xl text-sm font-bold text-white hover:bg-blue-500 transition-all active:scale-95 accent-glow flex items-center justify-center gap-3">
          {metadata.is_playlist && selectedPlaylistItems.length > 0 && <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded uppercase">{selectedPlaylistItems.length} Tracks</span>}
          Start Processing
        </button>
      </div>
    </motion.div>
  );
}
