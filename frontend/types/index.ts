export type MediaKind = "video" | "audio";

export interface SubtitleOption {
  language: string;
  name: string;
  ext: string;
  automatic: boolean;
}

export interface FormatOption {
  format_id: string;
  ext: string;
  resolution?: string | null;
  bitrate_kbps?: number | null;
  vcodec?: string | null;
  acodec?: string | null;
  filesize_mb?: number | null;
  container?: string | null;
  kind: MediaKind;
}

export interface EditableMetadata {
  title: string;
  artist?: string | null;
  album?: string | null;
  cover_url?: string | null;
}

export interface MediaItem {
  source_url: string;
  extractor?: string | null;
  id: string;
  title: string;
  duration_seconds?: number | null;
  thumbnail_url?: string | null;
  metadata: EditableMetadata;
  formats: FormatOption[];
  subtitles: SubtitleOption[];
  is_playlist: boolean;
  entries: MediaItem[];
}

export interface JobOptions {
  mode: MediaKind;
  format_id: string;
  target_ext: string;
  audio_bitrate_kbps?: number | null;
  embed_subtitles: boolean;
  subtitle_languages: string[];
  best_quality: boolean;
  custom_args: Record<string, string>;
  metadata: EditableMetadata;
  trim?: {
    start: string;
    end: string;
  } | null;
  cookies_token?: string | null;
  force_android_client: boolean;
}

export interface QueuePayload {
  source_url: string;
  media_id: string;
  title: string;
  thumbnail_url?: string | null;
  options: JobOptions;
}

export interface JobProgress {
  percent: number;
  speed?: string | null;
  eta_seconds?: number | null;
  stage: string;
  message?: string | null;
}

export interface JobRecord {
  id: string;
  status: "queued" | "processing" | "completed" | "failed";
  item: QueuePayload;
  progress: JobProgress;
  output_name?: string | null;
  download_token?: string | null;
  error?: string | null;
}
