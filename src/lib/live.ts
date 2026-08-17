/**
 * Cliente do runtime do addon Kodi (api/resolver.py).
 *
 * O bot EXECUTA o addon real do repositório ao vivo (mesma fonte que o Kodi),
 * então TV, menus, busca e resolução vêm sempre da versão atual dos
 * desenvolvedores — sem extração manual.
 *
 * Endpoints usados:
 *   /tv      -> grupos de canais ao vivo
 *   /browse  -> navega um plugin-url (menu do addon)
 *   /play    -> resolve um item reproduzível (stream)
 *   /search  -> busca ao vivo nos menus de pesquisa do addon
 *   /proxy   -> proxy de streams protegidos (Range + headers)
 */

const BOT_BASE = (import.meta.env.VITE_BOT_URL as string | undefined)?.replace(/\/+$/, "") ?? "/api";
// Token opcional: se o bot (ex.: rodando em casa) exigir BOT_TOKEN, o
// frontend envia ?token= em todas as chamadas. Vazio = sem autenticação.
const BOT_TOKEN = (import.meta.env.VITE_BOT_TOKEN as string | undefined)?.trim() ?? "";

function withToken(qs: string): string {
  if (!BOT_TOKEN) return qs;
  return `${qs}${qs ? "&" : "?"}token=${encodeURIComponent(BOT_TOKEN)}`;
}

export function botBase(): string {
  return BOT_BASE;
}

export interface LiveItem {
  name: string;
  url: string;
  folder: boolean;
  thumb: string;
  fanart: string;
  category?: string;
}

export interface LiveTvGroup {
  name: string;
  thumb: string;
  channels: LiveItem[];
}

export interface LiveTvData {
  groups: LiveTvGroup[];
  total: number;
}

export type LiveResult =
  | { type: "listing"; items: LiveItem[] }
  | { type: "stream"; stream: string; headers?: Record<string, string> | null }
  | { type: "error"; message: string };

async function getJson<T>(path: string, params: Record<string, string>): Promise<T> {
  const qs = withToken(new URLSearchParams(params).toString());
  const res = await fetch(`${BOT_BASE}${path}${qs ? `?${qs}` : ""}`);
  if (!res.ok) throw new Error(`Bot indisponível (HTTP ${res.status}).`);
  const json = (await res.json()) as { success?: boolean; data?: unknown; error?: string };
  if (!json.success) throw new Error(json.error ?? "Falha na chamada ao bot.");
  return json.data as T;
}

export async function liveTv(): Promise<LiveTvData> {
  return getJson<LiveTvData>("/tv", {});
}

export async function liveBrowse(url: string): Promise<LiveResult> {
  return getJson<LiveResult>("/browse", { url });
}

export async function livePlay(url: string): Promise<LiveResult> {
  return getJson<LiveResult>("/play", { url });
}

export async function liveSearch(q: string): Promise<LiveResult> {
  return getJson<LiveResult>("/search", { q });
}

/** Converte stream + headers do bot em uma URL que o player consegue tocar. */
export function playbackUrl(stream: string, headers?: Record<string, string> | null): string {
  if (headers && Object.keys(headers).length > 0) {
    return withToken(
      `${BOT_BASE}/proxy?u=${encodeURIComponent(stream)}&h=${encodeURIComponent(JSON.stringify(headers))}`
    );
  }
  return stream;
}

export function isHlsUrl(url: string): boolean {
  return url.toLowerCase().includes(".m3u8");
}
