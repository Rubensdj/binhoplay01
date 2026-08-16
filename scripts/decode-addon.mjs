#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Decodifica o addon do repositório e extrai TODAS as fontes de dados que o
// Kodi usa em runtime — sem nenhuma URL fixa no código do site.
//
// O addon (addons/plugin.video.BrazucaPlay.zip) vem ofuscado ("encoded by
// Kodi": base64 invertido + zlib, em camadas). Este script desofusca as
// camadas e extrai, do próprio addon:
//   - URL do channels.xml (TV ao vivo / contas XC-IPTV)
//   - URLs das bases VOD (Filmes/Séries/Animes/Doramas/Novelas/Desenhos)
//   - API de resolução (endpoints + token JWT)
//   - Hosts dos scrapers (Overflix, doramas, animes, novelas, askflix)
//   - Endpoints de update (como o addon se atualiza)
//   - Domínio atual do Overflix (o addon descobre dinamicamente)
//
// Resultado: quando o dono do repositório atualiza o addon, basta rodar
// `bun run generate` (já embutido no dev/build) — o site passa a usar as
// novas URLs automaticamente. Nada para manter à mão.
//
// Uso:  bun run generate   (roda antes de generate-catalog.mjs)
//       node scripts/decode-addon.mjs
// ---------------------------------------------------------------------------
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "addon-sources.json");

// ---------------------------------------------------------------------------
// Leitura de zip sem dependências (entradas deflate/stored)
// ---------------------------------------------------------------------------
function readZipEntry(zipPath, targetBasename) {
  try {
    const buf = readFileSync(zipPath);
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
    // zip ilegível
  }
  return null;
}

function findAddonZip() {
  const candidates = [
    join(ROOT, "addons", "plugin.video.BrazucaPlay.zip"),
    join(ROOT, "addons", "plugin.video.BrazucaPlay.Matrix.zip"),
    join(ROOT, "addons", "repo", "Plugins", "plugin.video.BrazucaPlay"),
    join(ROOT, "addons", "repo", "Plugins", "plugin.video.BrazucaPlay.Matrix"),
  ];
  for (const c of candidates) {
    if (existsSync(c)) {
      if (c.endsWith(".zip")) return c;
      try {
        const zip = readdirSync(c).find((f) => f.toLowerCase().endsWith(".zip"));
        if (zip) return join(c, zip);
      } catch {
        /* segue */
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Desofuscação ("encoded by Kodi"): exec((_)(b'<base64 invertido>'))
// ---------------------------------------------------------------------------
function decodeLayers(src) {
  for (let i = 0; i < 40; i++) {
    const m = /exec\(\(_\)\(b'([^']+)'\)/.exec(src);
    if (!m) return src;
    try {
      // O addon inverte a STRING base64 antes de decodificar (__[::-1]).
      const reversedStr = m[1].split("").reverse().join("");
      src = zlib.inflateSync(Buffer.from(reversedStr, "base64")).toString("utf8");
    } catch {
      return src;
    }
  }
  return src;
}

// ---------------------------------------------------------------------------
// Extração de strings hex-ofuscadas: '\x68\x74\x74\x70...'
// ---------------------------------------------------------------------------
function decodeHexStrings(src) {
  const out = [];
  const re = /'((?:\\x[0-9a-fA-F]{2})+)'/g;
  let m;
  while ((m = re.exec(src))) {
    try {
      const dec = m[1]
        .replace(/\\x([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
        .replace(/\\n/g, "\n")
        .replace(/\\t/g, "\t")
        .replace(/\\'/g, "'")
        .replace(/\\\\/g, "\\");
      if (dec.length >= 6) out.push(dec);
    } catch {
      /* ignora */
    }
  }
  return [...new Set(out)];
}

const normHost = (s) =>
  String(s)
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .trim()
    .toLowerCase();

// ---------------------------------------------------------------------------
// Extração estruturada
// ---------------------------------------------------------------------------
function extractConfig(src) {
  const strings = decodeHexStrings(src);
  const cfg = { decodedAt: new Date().toISOString(), addonVersion: "", sources: {} };

  const mVersion = /versao\s*=\s*'([^']+)'/.exec(src);
  cfg.addonVersion = mVersion ? mVersion[1] : "";

  // URL do repositório oficial (CUSTOM_ADDON_LINK do addon)
  const customLink = strings.find((s) => s.includes("github.io") && s.includes("update="));
  if (customLink) {
    const base = customLink.split("?")[0].replace(/\/$/, "");
    if (base.startsWith("http")) cfg.sources.repoUrl = base;
  }

  // channels.xml (TV ao vivo)
  const channelsXml = strings.find((s) => s.includes("channels.xml") && s.includes("gist"));
  if (channelsXml) cfg.sources.channelsXml = channelsXml;

  // Bases VOD
  const gistBase = (needle) => {
    const s = strings.find((x) => x.includes("gist") && x.includes(needle));
    return s || null;
  };
  // Filmes: o addon usa um template com %s (page.xml, lancamentos.xml, …) —
  // prefira a string com placeholder; senão, a base crua.
  const movieStrings = strings.filter(
    (s) => s.includes("gist") && s.includes("5b87797329c7b46422565ffbaab3be7e")
  );
  const moviesBase =
    movieStrings.find((s) => s.includes("%s")) ?? movieStrings.find((s) => /page\.xml/.test(s)) ?? null;
  const seriesBase = gistBase("raw/SeriesBase");
  const animesBase = gistBase("raw/AnimesBase");
  const doramasBase = gistBase("raw/DoramasBase");
  const desenhosBase = gistBase("raw/DesenhosBase");
  const novelasXml = gistBase("raw/novelas.xml");
  const vod = {};
  if (moviesBase) vod.filmes = moviesBase; // template com %s (page.xml, lancamentos.xml...)
  if (seriesBase) vod.series = seriesBase;
  if (animesBase) vod.animes = animesBase;
  if (doramasBase) vod.doramas = doramasBase;
  if (desenhosBase) vod.desenhos = desenhosBase;
  if (novelasXml) vod.novelas = novelasXml;
  if (Object.keys(vod).length) cfg.sources.vod = vod;

  // API de resolução (endpoints + token)
  const endpoints = strings
    .filter((s) => s.includes("geekantenado") && !s.includes("/gist") && !s.includes("update.json"))
    .map(normHost)
    .filter((s) => s.length > 3);
  if (endpoints.length) cfg.sources.resolverEndpoints = [...new Set(endpoints)];

  const mToken = /token\s*=\s*'([^']+)'/.exec(src);
  if (mToken) cfg.sources.resolverToken = mToken[1];

  // Hosts dos scrapers (o addon descobre o domínio atual do Overflix em runtime)
  const findHost = (needle) => {
    const s = strings.find((x) => x.toLowerCase().includes(needle.toLowerCase()));
    if (!s) return null;
    return normHost(s);
  };
  const overflixHost = findHost("overflix.");
  const doramaHost = findHost("doramasonline");
  const animeHost = findHost("animesonlinecc");
  const novelasHost = findHost("novefx.biz");
  const askflixHost = findHost("askflix.biz");
  if (overflixHost) cfg.sources.overflixHost = overflixHost;
  if (doramaHost) cfg.sources.doramaHost = doramaHost;
  if (animeHost) cfg.sources.animeHost = animeHost;
  if (novelasHost) cfg.sources.novefxHost = novelasHost;
  if (askflixHost) cfg.sources.askflixHost = askflixHost;

  // Endpoints de update (como o addon se atualiza sozinho)
  const updates = strings.filter((s) => s.includes("update.json") || s.includes("/gist?path="));
  if (updates.length) cfg.sources.updateEndpoints = updates;

  // Domínio base (forum) — usado como config extra do addon
  const mCH = /CHBase = base64\.b16decode\(basedem\)\.decode\('utf-8'\)/.exec(src);
  if (mCH) {
    const mCompat = /compatible = '([0-9A-Fa-f]+)'/.exec(src);
    if (mCompat) {
      try {
        const hex = mCompat[1].split("").reverse().join("");
        cfg.sources.addonBase = Buffer.from(hex, "hex").toString("utf8");
      } catch {
        /* ignora */
      }
    }
  }

  return cfg;
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
function main() {
  const zip = findAddonZip();
  if (!zip) {
    console.warn("addon do BrazucaPlay não encontrado — mantendo addon-sources.json anterior.");
    process.exit(0);
  }

  const raw = readZipEntry(zip, "default.py");
  if (!raw) {
    console.warn(`default.py não encontrado em ${zip} — mantendo config anterior.`);
    process.exit(0);
  }

  const final = decodeLayers(raw);
  if (final === raw || final.length < 1000) {
    console.warn("addon não decodificou (formato mudou?) — mantendo config anterior.");
    process.exit(0);
  }

  const cfg = extractConfig(final);
  writeFileSync(OUT, JSON.stringify(cfg, null, 2) + "\n");

  console.log(
    `addon-sources.json gerado: v${cfg.addonVersion || "?"} · ` +
      Object.keys(cfg.sources).join(", ") || "sem fontes"
  );
}

main();
