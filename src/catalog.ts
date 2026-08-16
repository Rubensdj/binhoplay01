import data from "./catalog.json";

export type AddonType = "video" | "repository" | "script" | "other";

export interface Addon {
  id: string;
  name: string;
  version: string;
  provider: string;
  type: AddonType;
  summary: string;
  description: string;
  news: string;
  disclaimer: string;
  /** Ids de addons exigidos (<requires> do addon.xml) — o Kodi instala junto. */
  dependencies: string[];
  icon: string | null;
  downloadUrl: string;
  size: number | null;
}

export interface ExtraFile {
  id: string;
  name: string;
  version: string;
  summary: string;
  type: AddonType;
  adult: boolean;
  url: string;
  size: number | null;
}

export interface RepoFile {
  name: string;
  url: string;
  size: number | null;
}

export interface LogoItem {
  name: string;
  url: string;
}

export interface Program {
  start: string;
  stop: string;
  title: string;
  desc: string;
}

export interface Channel {
  id: string;
  name: string;
  logo: string | null;
  /** URL real do stream (m3u8/mp4) — definida em channel-streams.json, opcional. */
  streamUrl: string | null;
}

export interface DemoVideo {
  id: string;
  title: string;
  category: string;
  url: string;
  demo: boolean;
}

export interface ContentItem {
  id: string;
  title: string;
  description: string;
  category: string;
  adult: boolean;
  channelId: string;
  channelName: string;
  logo: string | null;
  start: string;
  stop: string;
}

export interface EpgData {
  channels: Record<string, Program[]>;
}

export interface CatalogData {
  generatedAt: string;
  repoUrl: string;
  supportedKodi: string;
  addons: Addon[];
  extraFiles: ExtraFile[];
  files: RepoFile[];
  logos: LogoItem[];
  channels: Channel[];
  content: ContentItem[];
  demoVideos: DemoVideo[];
}

/** Catálogo gerado por scripts/generate-catalog.mjs (regenerar com `bun run generate`). */
export const catalog = data as unknown as CatalogData;

export const typeLabel: Record<AddonType, string> = {
  video: "Vídeo",
  repository: "Repositório",
  script: "Script",
  other: "Utilitário",
};

export function formatBytes(bytes: number | null): string {
  if (bytes === null || bytes === undefined) return "";
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

export function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
