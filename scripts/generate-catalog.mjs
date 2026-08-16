#!/usr/bin/env node
/**
 * Gera o catálogo automático a partir da estrutura do repositório:
 *  - Lê addons/repo/addons.xml e addons/repo/addons_matrix.xml (metadados Kodi)
 *  - Escaneia addons/ (zips soltos) e addons/repo/Plugins/ (zips + ícones/fanarts)
 *  - Escaneia logos/ (logos de canais) e logos/epg/epgbr.xml (guia de programação)
 *  - Escreve src/catalog.json (catálogo leve, importado pelo app)
 *  - Escreve public/epg.json (programação completa, carregada sob demanda)
 *  - Copia addons/ e logos/ para public/ (assets servidos pelo Vite)
 *
 * Rode com: bun run generate
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "src");
const ADDONS = path.join(ROOT, "addons");
const REPO_DIR = path.join(ADDONS, "repo");
const PLUGINS = path.join(REPO_DIR, "Plugins");
const LOGOS_DIR = path.join(ROOT, "logos");
const EPG_FILE = path.join(LOGOS_DIR, "epg", "epgbr.xml");
const PUBLIC = path.join(ROOT, "public");

const REPO_URL = "https://skyrisk.github.io/brazucaplay";
const SUPPORTED_KODI = "16.1, 17, 18, 19, 20 e 21+";

const ACRONYMS = new Set(["cnn", "espn", "hbo", "amc", "axn", "gnt", "h2", "hgtv", "tv", "hd", "br", "sp", "rj", "e", "mtv", "tnt", "fx", "max"]);

// Streams abertos/CC usados como demonstração de reprodução multiplataforma.
const DEMO_VIDEOS = [
  {
    id: "demo-bbb",
    title: "Big Buck Bunny",
    category: "Demo",
    url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
    demo: true,
  },
  {
    id: "demo-sintel",
    title: "Sintel",
    category: "Demo",
    url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4",
    demo: true,
  },
  {
    id: "demo-tos",
    title: "Tears of Steel",
    category: "Demo",
    url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4",
    demo: true,
  },
  {
    id: "demo-hls",
    title: "Sinal HLS (transmissão demo)",
    category: "Demo",
    url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
    demo: true,
  },
];

/** Remove tags Kodi ([B], [COLOR x], [CR]...), HTML e entidades; normaliza espaços. */
function strip(raw) {
  return String(raw ?? "")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(amp|lt|gt|quot|apos|#39);/g, (m, e) =>
      ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'" })[e]
    )
    .replace(/\s+/g, " ")
    .trim();
}

function decodeEntities(raw) {
  return String(raw ?? "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&(amp|lt|gt|quot|apos);/g, (m, e) => ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" })[e])
    .trim();
}

/** Extrai os metadados de um addons.xml (parse simples por bloco <addon ...>). */
function parseAddonsXml(file) {
  if (!fs.existsSync(file)) return [];
  const xml = fs.readFileSync(file, "utf8");
  const blocks = xml.split(/<addon\s/).slice(1);
  return blocks
    .map((b) => {
      const grab = (tag) => {
        const m = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`).exec(b);
        return m ? m[1] : "";
      };
      const id = /id="([^"]+)"/.exec(b)?.[1] ?? "";
      if (!id) return null;
      return {
        id,
        name: strip(/name="([^"]*)"/.exec(b)?.[1] ?? ""),
        version: /version="([^"]+)"/.exec(b)?.[1] ?? "",
        provider: strip(/provider-name="([^"]*)"/.exec(b)?.[1] ?? ""),
        summary: strip(grab("summary")),
        description: strip(grab("description")),
        news: strip(grab("news")),
        disclaimer: strip(grab("disclaimer")),
        provides: strip(grab("provides")),
      };
    })
    .filter(Boolean);
}

function classifyType(id, provides) {
  if (id.startsWith("repository.")) return "repository";
  if (id.startsWith("script.")) return "script";
  if (id.startsWith("plugin.video.") || provides.toLowerCase().includes("video")) return "video";
  return "other";
}

/** Primeiro .zip de uma pasta (usado como fallback de download). */
function firstZipIn(dir) {
  if (!fs.existsSync(dir)) return null;
  const zip = fs.readdirSync(dir).find((f) => f.toLowerCase().endsWith(".zip"));
  return zip ? path.join(dir, zip) : null;
}

function toUrl(absPath) {
  return "/" + path.relative(ROOT, absPath).split(path.sep).join("/");
}

function fileSize(file) {
  try {
    return fs.statSync(file).size;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// 1) Metadados: junta addons.xml + addons_matrix.xml por id
// ---------------------------------------------------------------------------
const mainAddons = parseAddonsXml(path.join(REPO_DIR, "addons.xml"));
const matrixAddons = parseAddonsXml(path.join(REPO_DIR, "addons_matrix.xml"));
const byId = new Map();
for (const a of [...mainAddons, ...matrixAddons]) byId.set(a.id, a);

// 2) Zips soltos em addons/
const looseZips = fs
  .readdirSync(ADDONS)
  .filter((f) => f.toLowerCase().endsWith(".zip"))
  .sort();
const looseStem = (f) => f.replace(/\.zip$/i, "").replace(/-\d+(\.\d+)*$/i, "").toLowerCase();

function matchLooseZip(id) {
  const key = id.toLowerCase();
  const exact = looseZips.find((f) => f.toLowerCase() === `${key}.zip`);
  if (exact) return exact;
  return looseZips.find((f) => looseStem(f) === key);
}

// 3) Monta os addons
const matched = new Set();
const addons = [...byId.values()]
  .sort((a, b) => a.name.localeCompare(b.name, "pt"))
  .map((a) => {
    const dir = path.join(PLUGINS, a.id);
    const loose = matchLooseZip(a.id);
    const folderZip = firstZipIn(dir);
    const downloadPath = loose ? path.join(ADDONS, loose) : folderZip;
    if (loose) matched.add(loose);

    const icon =
      fs.existsSync(path.join(dir, "icon.png"))
        ? toUrl(path.join(dir, "icon.png"))
        : fs.existsSync(path.join(dir, "icon.jpg"))
          ? toUrl(path.join(dir, "icon.jpg"))
          : null;

    return {
      id: a.id,
      name: a.name || a.id,
      version: a.version,
      provider: a.provider,
      type: classifyType(a.id, a.provides),
      summary: a.summary,
      description: a.description,
      news: a.news,
      disclaimer: a.disclaimer,
      icon,
      downloadUrl: downloadPath ? toUrl(downloadPath) : null,
      size: downloadPath ? fileSize(downloadPath) : null,
    };
  })
  .filter((a) => a.downloadUrl);

// 4) Arquivos soltos sem metadados (ex.: +18Play, cloudrequest, "Plugins - Extrair")
/** Lê um arquivo de dentro de um zip (entradas deflate/stored) sem dependências externas. */
function readZipEntry(zipPath, targetBasename) {
  try {
    const buf = fs.readFileSync(zipPath);
    let offset = 0;
    while (offset + 30 <= buf.length) {
      if (buf.readUInt32LE(offset) !== 0x04034b50) break; // PK\x03\x04
      const method = buf.readUInt16LE(offset + 8);
      const compSize = buf.readUInt32LE(offset + 18);
      const nameLen = buf.readUInt16LE(offset + 26);
      const extraLen = buf.readUInt16LE(offset + 28);
      const name = buf.toString("utf8", offset + 30, offset + 30 + nameLen);
      const dataStart = offset + 30 + nameLen + extraLen;
      const base = name.split("/").pop();
      if (base === targetBasename) {
        const data = buf.subarray(dataStart, dataStart + compSize);
        if (method === 0) return data.toString("utf8");
        if (method === 8) return zlib.inflateRawSync(data).toString("utf8");
      }
      offset = dataStart + compSize;
    }
  } catch {
    // zip ilegível — segue com metadados derivados do nome do arquivo
  }
  return null;
}

function parseAddonXmlString(xml) {
  const id = /<addon\s+id="([^"]+)"/.exec(xml)?.[1] ?? "";
  const name = strip(/<addon\s+id="[^"]*"\s+name="([^"]*)"/.exec(xml)?.[1] ?? "");
  const version = /<addon\s[^>]*version="([^"]+)"/.exec(xml)?.[1] ?? "";
  const summary = strip(/<summary>([\s\S]*?)<\/summary>/.exec(xml)?.[1] ?? "");
  return id ? { id, name, version, summary } : null;
}

function prettyZipName(stem) {
  return stem
    .replace(/-\d+(\.\d+)+$/i, "")
    .replace(/[_-]+/g, " ")
    .split(/\s+/)
    .map((w) => (ACRONYMS.has(w.toLowerCase()) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

const extraFiles = looseZips
  .filter((f) => !matched.has(f))
  .map((f) => {
    const abs = path.join(ADDONS, f);
    const stem = f.replace(/\.zip$/i, "");
    const meta = parseAddonXmlString(readZipEntry(abs, "addon.xml") ?? "");
    const id = meta?.id ?? stem;
    const name = meta?.name || prettyZipName(stem);
    const version = meta?.version ?? /-(\d+(\.\d+)+)$/.exec(stem)?.[1] ?? "";
    const summary =
      meta?.summary ||
      (stem.toLowerCase().includes("cloudrequest")
        ? `Módulo de requisições HTTP (${stem.endsWith("py3") ? "Python 3" : "Python 2"})`
        : stem.toLowerCase().includes("extrair")
          ? "Pacote com dependências de módulos Kodi (extrair para instalar)"
          : "Arquivo do repositório");
    const adult = /(\+18|mais18|18play)/i.test(id) || /(\+18|18 play)/i.test(name);
    return {
      id,
      name,
      version,
      summary,
      type: classifyType(id, "video"),
      adult,
      url: toUrl(abs),
      size: fileSize(abs),
    };
  })
  .sort((a, b) => a.name.localeCompare(b.name, "pt"));

// Lista completa de arquivos do repositório (para a seção "tudo no repositório")
const files = [
  ...looseZips.map((f) => ({
    name: f,
    url: toUrl(path.join(ADDONS, f)),
    size: fileSize(path.join(ADDONS, f)),
  })),
  ...["logo.png", "mrpiracy.otf"]
    .filter((f) => fs.existsSync(path.join(ADDONS, f)))
    .map((f) => ({
      name: f,
      url: toUrl(path.join(ADDONS, f)),
      size: fileSize(path.join(ADDONS, f)),
    })),
].sort((a, b) => a.name.localeCompare(b.name, "pt"));

// ---------------------------------------------------------------------------
// 5) Logos de canais (somente arquivos de imagem no topo de logos/)
// ---------------------------------------------------------------------------
const logos = fs
  .readdirSync(LOGOS_DIR)
  .filter((f) => /\.(png|jpe?g|webp|svg)$/i.test(f) && fs.statSync(path.join(LOGOS_DIR, f)).isFile())
  .sort((a, b) => a.localeCompare(b, "pt"))
  .map((f) => ({ name: f.replace(/\.[^.]+$/, ""), url: toUrl(path.join(LOGOS_DIR, f)) }));

// ---------------------------------------------------------------------------
// 6) Canais + programação a partir do EPG (logos/epg/epgbr.xml)
// ---------------------------------------------------------------------------
function parseEpg(file) {
  if (!fs.existsSync(file)) return new Map();
  const xml = fs.readFileSync(file, "utf8");
  const channels = new Map();
  const blocks = xml.split("<programme ").slice(1);
  const toIso = (date, time, tz) => {
    if (!date || !time) return "";
    const y = +date.slice(0, 4);
    const mo = +date.slice(4, 6) - 1;
    const d = +date.slice(6, 8);
    const h = +time.slice(0, 2);
    const mi = +time.slice(2, 4);
    const s = +time.slice(4, 6) || 0;
    const offsetH = tz ? +tz.slice(1, 3) : 0;
    const offsetM = tz ? +tz.slice(3, 5) : 0;
    const offset = (tz && tz[0] === "-" ? -1 : 1) * (offsetH * 60 + offsetM) * 60000;
    return new Date(Date.UTC(y, mo, d, h, mi, s) - offset).toISOString();
  };

  for (const b of blocks) {
    const channel = /channel="([^"]+)"/.exec(b)?.[1];
    if (!channel) continue;
    const start = toIso(/start="(\d{8})(\d{6})/.exec(b)?.[1], /start="\d{8}(\d{6})/.exec(b)?.[1], /start="\d{14}\s*([+-]\d{4})/.exec(b)?.[1]);
    const stop = toIso(/stop="(\d{8})(\d{6})/.exec(b)?.[1], /stop="\d{8}(\d{6})/.exec(b)?.[1], /stop="\d{14}\s*([+-]\d{4})/.exec(b)?.[1]);
    const title = decodeEntities(/<title>([\s\S]*?)<\/title>/.exec(b)?.[1] ?? "");
    if (!start || !title) continue;
    const desc = decodeEntities(/<desc>([\s\S]*?)<\/desc>/.exec(b)?.[1] ?? "").slice(0, 240);
    if (!channels.has(channel)) channels.set(channel, []);
    channels.get(channel).push({ start, stop, title, desc });
  }
  for (const list of channels.values()) {
    list.sort((a, b2) => (a.start < b2.start ? -1 : 1));
  }
  return channels;
}

const epg = parseEpg(EPG_FILE);

function prettyName(raw) {
  const clean = String(raw).replace(/^\+/, "").replace(/\.[a-z0-9]{2,4}$/i, "").replace(/[_-]+/g, " ");
  return clean
    .split(/(?=[A-Z])|\s+/)
    .filter(Boolean)
    .map((w) => (ACRONYMS.has(w.toLowerCase()) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ")
    .trim();
}

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const logoByNorm = new Map(logos.map((l) => [norm(l.name), l]));

// Override opcional de streams reais por canal: channel-streams.json -> { "Axn.br": "https://.../stream.m3u8" }
const overridesFile = path.join(ROOT, "channel-streams.json");
let streamOverrides = {};
if (fs.existsSync(overridesFile)) {
  try {
    streamOverrides = JSON.parse(fs.readFileSync(overridesFile, "utf8"));
  } catch {
    console.warn("channel-streams.json inválido — ignorado.");
  }
}

const channels = [...epg.keys()]
  .sort((a, b) => a.localeCompare(b))
  .map((id) => {
    const key = norm(id.replace(/^\+/, "").replace(/\.[a-z0-9]{2,4}$/i, ""));
    const matchedLogo =
      logoByNorm.get(key) ??
      logos.find((l) => norm(l.name).includes(key) || key.includes(norm(l.name))) ??
      null;
    const name = matchedLogo ? prettyName(matchedLogo.name) : prettyName(id);
    const streamUrl = typeof streamOverrides[id] === "string" ? streamOverrides[id] : null;
    return { id, name, logo: matchedLogo ? matchedLogo.url : null, streamUrl };
  });

// ---------------------------------------------------------------------------
// 7) public/epg.json — programação completa, carregada sob demanda
// ---------------------------------------------------------------------------
const epgData = {};
for (const [id, programs] of epg) epgData[id] = programs;
fs.mkdirSync(PUBLIC, { recursive: true });
fs.writeFileSync(path.join(PUBLIC, "epg.json"), JSON.stringify({ channels: epgData }) + "\n");

// ---------------------------------------------------------------------------
// 8) Copia assets para public/ (servidos pelo Vite em dev e build)
// ---------------------------------------------------------------------------
fs.rmSync(path.join(PUBLIC, "addons"), { recursive: true, force: true });
fs.rmSync(path.join(PUBLIC, "logos"), { recursive: true, force: true });
fs.cpSync(ADDONS, path.join(PUBLIC, "addons"), { recursive: true });
fs.cpSync(LOGOS_DIR, path.join(PUBLIC, "logos"), { recursive: true });

// ---------------------------------------------------------------------------
// 9) Escreve o catálogo leve
// ---------------------------------------------------------------------------
const catalog = {
  generatedAt: new Date().toISOString(),
  repoUrl: REPO_URL,
  supportedKodi: SUPPORTED_KODI,
  addons,
  extraFiles,
  files,
  logos,
  channels,
  demoVideos: DEMO_VIDEOS,
};
fs.mkdirSync(SRC, { recursive: true });
fs.writeFileSync(path.join(SRC, "catalog.json"), JSON.stringify(catalog, null, 2) + "\n");

console.log(
  `catalog.json gerado: ${addons.length} addons, ${extraFiles.length} arquivos extras, ${logos.length} logos, ` +
    `${channels.length} canais (EPG), ${Object.keys(epgData).reduce((n, k) => n + epgData[k].length, 0)} programas.`
);
