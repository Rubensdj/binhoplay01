/**
 * Leitura de repositórios Kodi como o próprio Kodi faz:
 *  - Faz fetch do addons.xml (+ deriva o datadir dos zips)
 *  - Parseia os metadados de cada addon
 *  - Monta as URLs de ícone e download a partir do datadir
 *  - Persiste os repositórios adicionados no localStorage
 */

export interface RepoAddon {
  id: string;
  name: string;
  version: string;
  provider: string;
  summary: string;
  description: string;
  news: string;
  disclaimer: string;
  icon: string;
  downloadUrl: string;
}

export interface Repo {
  url: string;
  name: string;
  datadir: string;
  fetchedAt: string;
  error?: string;
  addons: RepoAddon[];
}

const REPOS_KEY = "binho:repos";

function stripTags(raw: string): string {
  return raw
    .replace(/\[[^\]]*\]/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeEntities(raw: string): string {
  return raw
    .replace(/&(amp|lt|gt|quot|apos);/g, (_, e: string) => ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" })[e] ?? "")
    .trim();
}

/** Parseia o conteúdo de um addons.xml no formato do protocolo de repositórios Kodi. */
export function parseRepoXml(xml: string, url: string): Repo {
  const blocks = xml.split(/<addon\s/).slice(1);
  const addons: RepoAddon[] = [];
  let datadir = "";

  for (const block of blocks) {
    const id = /id="([^"]+)"/.exec(block)?.[1] ?? "";
    if (!id) continue;

    const rawName = /name="([^"]*)"/.exec(block)?.[1] ?? "";
    const version = /version="([^"]+)"/.exec(block)?.[1] ?? "";
    const provider = stripTags(/provider-name="([^"]*)"/.exec(block)?.[1] ?? "");
    const summary = stripTags(decodeEntities(/<summary>([\s\S]*?)<\/summary>/.exec(block)?.[1] ?? ""));
    const description = stripTags(decodeEntities(/<description>([\s\S]*?)<\/description>/.exec(block)?.[1] ?? ""));
    const news = stripTags(decodeEntities(/<news>([\s\S]*?)<\/news>/.exec(block)?.[1] ?? ""));
    const disclaimer = stripTags(decodeEntities(/<disclaimer>([\s\S]*?)<\/disclaimer>/.exec(block)?.[1] ?? ""));

    if (!datadir) {
      const dd = /<datadir zip="true">([^<]+)<\/datadir>/.exec(block)?.[1];
      if (dd) datadir = dd.trim().replace(/\/+$/, "") + "/";
    }

    const base = datadir || "";
    addons.push({
      id,
      name: stripTags(decodeEntities(rawName)) || id,
      version,
      provider,
      summary,
      description,
      news,
      disclaimer,
      icon: base ? `${base}${id}/icon.png` : "",
      downloadUrl: `${base}${id}/${id}-${version}.zip`,
    });
  }

  const repoAddon = addons.find((a) => a.id.startsWith("repository."));
  let name = repoAddon?.name || url;
  try {
    name = repoAddon?.name || new URL(url).hostname;
  } catch {
    // url inválida — mantém o valor original
  }

  return { url, name, datadir, fetchedAt: new Date().toISOString(), addons };
}

/** Busca o addons.xml de um repositório (sujeito a CORS do servidor de origem). */
export async function fetchRepo(url: string): Promise<Repo> {
  const clean = url.trim();
  const response = await fetch(clean, { mode: "cors" });
  if (!response.ok) throw new Error(`Falha ao buscar o repositório (HTTP ${response.status}).`);
  const xml = await response.text();
  return parseRepoXml(xml, clean);
}

import type { Addon, AddonType } from "../catalog";

function classifyAddonType(id: string): AddonType {
  if (id.startsWith("repository.")) return "repository";
  if (id.startsWith("script.")) return "script";
  if (id.startsWith("plugin.video.")) return "video";
  return "other";
}

export interface OfficialPull {
  addons: Addon[];
  fetchedAt: string;
  sourceUrl: string;
}

/**
 * Puxa ao vivo TUDO do repositório oficial: addons.xml + addons_matrix.xml,
 * mesclados por id (os dois arquivos de metadados que o Kodi usa).
 */
export async function fetchOfficialRepo(repoBaseUrl: string): Promise<OfficialPull> {
  const base = repoBaseUrl.replace(/\/+$/, "");
  const [main, matrix] = await Promise.all([
    fetchRepo(`${base}/addons/repo/addons.xml`).catch(() => null),
    fetchRepo(`${base}/addons/repo/addons_matrix.xml`).catch(() => null),
  ]);
  if (!main && !matrix) {
    throw new Error("Não foi possível acessar o repositório oficial (rede/CORS).");
  }

  const byId = new Map<string, RepoAddon>();
  for (const repo of [main, matrix]) {
    if (!repo) continue;
    for (const addon of repo.addons) byId.set(addon.id, addon);
  }

  const addons: Addon[] = [...byId.values()]
    .map((a) => ({
      id: a.id,
      name: a.name || a.id,
      version: a.version,
      provider: a.provider,
      type: classifyAddonType(a.id),
      summary: a.summary,
      description: a.description,
      news: a.news,
      disclaimer: a.disclaimer,
      icon: a.icon || null,
      downloadUrl: a.downloadUrl,
      size: null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt"));

  return { addons, fetchedAt: new Date().toISOString(), sourceUrl: `${base}/addons/repo/addons.xml` };
}

export function getRepos(): Repo[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(REPOS_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveRepos(repos: Repo[]): void {
  try {
    localStorage.setItem(REPOS_KEY, JSON.stringify(repos));
  } catch {
    // storage indisponível — segue sem persistir
  }
}
