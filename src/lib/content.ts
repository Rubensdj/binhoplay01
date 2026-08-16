import { catalog, type ContentItem } from "../catalog";

export const CATEGORY_ORDER = [
  "Filmes",
  "Séries",
  "Desenhos",
  "Novelas",
  "Doramas",
  "Animes",
  "Adultos",
];

export function isAdultConfirmed(): boolean {
  try {
    return sessionStorage.getItem("binho:+18-ok") === "1";
  } catch {
    return false;
  }
}

function dedupe(items: ContentItem[]): ContentItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.title.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Fileiras estilo Netflix: uma por categoria, sem títulos repetidos. */
export function buildRows(now: number): Array<{ category: string; items: ContentItem[] }> {
  const adultOk = isAdultConfirmed();
  return CATEGORY_ORDER.map((category) => {
    const items = dedupe(
      catalog.content
        .filter((item) => item.category === category && (!item.adult || adultOk))
        .sort((a, b) => Math.abs(Date.parse(a.start) - now) - Math.abs(Date.parse(b.start) - now))
    ).slice(0, 20);
    return { category, items };
  }).filter((row) => row.items.length > 0);
}

/** Títulos no ar agora (ou, se o guia estiver velho, os próximos). */
export function airingNow(now: number, limit = 20): ContentItem[] {
  const adultOk = isAdultConfirmed();
  const live = catalog.content
    .filter((item) => !item.adult || adultOk)
    .filter((item) => {
      const start = Date.parse(item.start);
      const stop = Date.parse(item.stop);
      return start <= now && now < stop;
    })
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  if (live.length > 0) return dedupe(live).slice(0, limit);

  return dedupe(
    catalog.content
      .filter((item) => !item.adult || adultOk)
      .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
  ).slice(0, limit);
}

export function byIds(ids: string[]): ContentItem[] {
  const byId = new Map(catalog.content.map((item) => [item.id, item]));
  return ids.map((id) => byId.get(id)).filter((x): x is ContentItem => Boolean(x));
}

/** Item em destaque para o banner principal. */
export function featuredItem(now: number): ContentItem | null {
  const adultOk = isAdultConfirmed();
  const pool = catalog.content.filter((item) => !item.adult || adultOk);
  const airing = pool
    .filter((item) => Date.parse(item.start) <= now && now < Date.parse(item.stop))
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  if (airing.length > 0) return airing[0];
  const next = pool
    .filter((item) => Date.parse(item.start) > now)
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  return next[0] ?? pool[0] ?? null;
}

/** URL de stream do canal do item (real via channel-streams.json ou demo). */
export function streamFor(item: ContentItem): string {
  const channel = catalog.channels.find((c) => c.id === item.channelId);
  if (channel?.streamUrl) return channel.streamUrl;
  return catalog.demoVideos.find((v) => v.id === "demo-hls")?.url ?? "";
}

/**
 * URL de prévia (hover, modal e banner estilo Netflix):
 * stream real do canal quando configurado em channel-streams.json;
 * senão, um vídeo de demonstração (MP4) escolhido deterministicamente pelo título,
 * para a prévia sempre reproduzir em todas as plataformas.
 */
export function previewFor(item: ContentItem): string | null {
  const channel = catalog.channels.find((c) => c.id === item.channelId);
  if (channel?.streamUrl) return channel.streamUrl;
  // O demo HLS (m3u8) precisa de hls.js — as prévias usam só os MP4.
  const demos = catalog.demoVideos.filter((v) => v.id !== "demo-hls");
  if (demos.length === 0) return null;
  let sum = 0;
  for (let i = 0; i < item.id.length; i++) sum += item.id.charCodeAt(i);
  return demos[sum % demos.length].url;
}

export function formatStartTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}
