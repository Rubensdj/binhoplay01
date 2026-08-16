/**
 * Catálogo VOD real (Filmes/Séries/Animes/Doramas/Novelas/Desenhos).
 *
 * Os dados vêm das mesmas bases XML que o addon Kodi usa (gerados por
 * `scripts/fetch-vod.mjs` em `public/vod/<categoria>.json`, carregados sob
 * demanda). Cada item guarda o link de resolução do Kodi (`resolver3_mv=`,
 * `serie3=`, `animes2=`, `novelas=`, …) que é resolvido através do bot
 * (`api/resolver.py`), que por sua vez usa a mesma infraestrutura do addon
 * (API de resolução + proxy de fetch) com CORS liberado.
 *
 * O bot responde sempre no contrato unificado:
 *   { kind: "stream",  stream: "https://..." }
 *   { kind: "seasons", seasons: [{ name, episodes: [{ name, link, direct, resolver }] }] }
 *   { kind: "error",   message: "..." }
 */

export interface VodItem {
  /** título limpo */
  t: string;
  /** categoria: Filmes | Séries | Animes | Doramas | Novelas | Desenhos */
  c: string;
  /** poster (TMDB) */
  p: string;
  /** fanart (TMDB) */
  f: string;
  /** sinopse */
  d: string;
  /** gêneros */
  g: string;
  /** avaliação */
  r: string;
  /** ano/lançamento */
  y: string;
  /** link de resolução (formato do addon) */
  l: string;
}

export const VOD_CATEGORIES = ["Filmes", "Séries", "Animes", "Doramas", "Novelas", "Desenhos"];

export interface VodIndexCategory {
  file: string;
  count: number;
  mb: number;
}
export interface VodIndex {
  generatedAt: string;
  categories: Record<string, VodIndexCategory>;
}

const normFile = (cat: string) =>
  cat
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const cache = new Map<string, Promise<VodItem[]>>();

export function fetchVodCategory(cat: string): Promise<VodItem[]> {
  if (!cache.has(cat)) {
    cache.set(
      cat,
      fetch(`/vod/${normFile(cat)}.json`)
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => (j?.items && Array.isArray(j.items) ? (j.items as VodItem[]) : []))
        .catch(() => [])
    );
  }
  return cache.get(cat)!;
}

let indexCache: Promise<VodIndex | null> | null = null;
export function fetchVodIndex(): Promise<VodIndex | null> {
  if (!indexCache) {
    indexCache = fetch("/vod/index.json")
      .then((r) => (r.ok ? (r.json() as Promise<VodIndex>) : null))
      .catch(() => null);
  }
  return indexCache;
}

export function normalizeVodName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Opções de resolução de um link do Kodi.
 * `#series_list=A|B|C` → [A, B, C] · `resolver3_mv=slug` → [resolver3_mv=slug]
 */
export function linkOptions(link: string): string[] {
  const afterHash = link.startsWith("#") ? link.slice(link.indexOf("=") + 1) : link;
  return afterHash
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Bot de resolução (api/resolver.py) — contrato unificado.
// ---------------------------------------------------------------------------
const BOT_BASE = (import.meta.env.VITE_BOT_URL as string | undefined)?.replace(/\/+$/, "") ?? "/api";

export function botBase(): string {
  return BOT_BASE;
}

export interface Episode {
  name: string;
  /** URL direta de vídeo (quando `direct`), senão identificador para resolver. */
  link: string;
  direct: boolean;
  resolver: number;
}
export interface Season {
  name: string;
  episodes: Episode[];
}

export type ResolveResult =
  | { kind: "stream"; stream: string }
  | { kind: "seasons"; seasons: Season[] }
  | { kind: "error"; message: string };

interface BotResponse {
  success?: boolean;
  data?: unknown;
  error?: string;
}

function parseUnified(data: unknown): ResolveResult {
  if (data && typeof data === "object") {
    const r = data as Record<string, unknown>;
    if (r.kind === "stream" && typeof r.stream === "string" && /^https?:\/\//i.test(r.stream)) {
      return { kind: "stream", stream: r.stream };
    }
    if (r.kind === "seasons" && Array.isArray(r.seasons)) {
      const seasons: Season[] = (r.seasons as Record<string, unknown>[])
        .map((s) => {
          const name = String(s.name ?? "Temporada");
          const episodes = Array.isArray(s.episodes)
            ? (s.episodes as Record<string, unknown>[])
                .filter((e) => typeof e.link === "string")
                .map((e) => ({
                  name: String(e.name ?? "Episódio"),
                  link: String(e.link),
                  direct: Boolean(e.direct),
                  resolver: typeof e.resolver === "number" ? e.resolver : 0,
                }))
            : [];
          return episodes.length > 0 ? { name, episodes } : null;
        })
        .filter((s): s is Season => s !== null);
      if (seasons.length > 0) return { kind: "seasons", seasons };
    }
    if (r.kind === "error" && typeof r.message === "string") {
      return { kind: "error", message: r.message };
    }
  }
  // tolerância: resposta crua (string de URL)
  if (typeof data === "string" && /^https?:\/\//i.test(data.trim())) {
    return { kind: "stream", stream: data.trim() };
  }
  return { kind: "error", message: "Falha na resolução (resposta inesperada do bot)." };
}

async function botResolve(resolver: number, request: string): Promise<ResolveResult> {
  const res = await fetch(
    `${BOT_BASE}/resolver?resolver=${resolver}&request=${encodeURIComponent(request)}`
  );
  if (!res.ok) throw new Error(`Bot indisponível (HTTP ${res.status})`);
  const json = (await res.json()) as BotResponse;
  if (!json.success) throw new Error(json.error ?? "Falha na resolução");
  return parseUnified(json.data);
}

/** Converte uma opção do addon na chamada ao bot. */
async function tryOption(opt: string): Promise<ResolveResult | null> {
  // formatos da API de resolução: resolverN_mv= / resolverN_tvshows=
  const mv = opt.match(/^resolver(\d+)_mv=(.+)$/);
  if (mv) return botResolve(Number(mv[1]), `mvshows=${mv[2]}`);

  const tv = opt.match(/^resolver(\d+)_tvshows=(.+)$/);
  if (tv) return botResolve(Number(tv[1]), `tvshows=${tv[2]}`);

  // qualquer outro formato (animes2=, animes3=, serie3=, movie2=,
  // doramas_resolver1=, novelas=, novelas2=) é resolvido pelo bot
  if (opt.includes("=")) return botResolve(0, opt);

  return null;
}

/** Resolve um item VOD tentando as opções do link, na ordem do addon. */
export async function resolveVod(item: VodItem): Promise<ResolveResult> {
  const options = linkOptions(item.l);
  let lastError = "";
  for (const opt of options) {
    try {
      const res = await tryOption(opt);
      if (!res) continue;
      if (res.kind === "error") {
        lastError = res.message;
        continue;
      }
      return res;
    } catch (err) {
      lastError = err instanceof Error ? err.message : "Falha na resolução";
    }
  }
  return {
    kind: "error",
    message: lastError || "Nenhuma opção de reprodução disponível para este título.",
  };
}

/** Resolve o link de um episódio (diretos ou via bot). */
export async function resolveEpisode(ep: Episode): Promise<string> {
  if (ep.direct) return ep.link;
  const result =
    ep.resolver > 0
      ? await botResolve(ep.resolver, `episodes=${ep.link}`)
      : await botResolve(0, `ep=${encodeURIComponent(ep.link)}`);
  if (result.kind !== "stream") {
    throw new Error(result.kind === "error" ? result.message : "Episódio indisponível no momento.");
  }
  return result.stream;
}
