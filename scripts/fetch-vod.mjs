// ---------------------------------------------------------------------------
// Catálogo VOD real — mesmas fontes que o addon Kodi usa em runtime.
// ---------------------------------------------------------------------------
// O addon monta os menus de Filmes/Séries/Animes/Doramas/Novelas/Desenhos a
// partir de XMLs públicos (gists do dono do repositório). Este script baixa
// as 6 bases, limpa as tags do Kodi e gera `public/vod.json` (carregado sob
// demanda pelo site, como o epg.json).
//
// Uso:  bun run vod   (ou  node scripts/fetch-vod.mjs)
// ---------------------------------------------------------------------------
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "public", "vod");
const ADDON_SOURCES = join(ROOT, "addon-sources.json");

const GIST = "https://gist.githubusercontent.com/skyrisk";
const DEFAULT_BASES = [
  { cat: "Filmes", url: `${GIST}/5b87797329c7b46422565ffbaab3be7e/raw/page.xml`, kind: "item" },
  { cat: "Séries", url: `${GIST}/16070347f20c87c72540f9f805b57a66/raw/SeriesBase`, kind: "channel" },
  { cat: "Novelas", url: `${GIST}/07f1f4cd1b203cbf2efec959c4e8645a/raw/novelas.xml`, kind: "channel" },
  { cat: "Animes", url: `${GIST}/16070347f20c87c72540f9f805b57a66/raw/AnimesBase`, kind: "channel" },
  { cat: "Doramas", url: `${GIST}/16070347f20c87c72540f9f805b57a66/raw/DoramasBase`, kind: "channel" },
  { cat: "Desenhos", url: `${GIST}/16070347f20c87c72540f9f805b57a66/raw/DesenhosBase`, kind: "channel" },
];

// Bases VOD extraídas automaticamente do addon (scripts/decode-addon.mjs).
// O template de Filmes usa %s (page.xml, lancamentos.xml…) — substituímos por
// page.xml, como o addon faz no menu principal.
function addonBases() {
  try {
    const cfg = JSON.parse(readFileSync(ADDON_SOURCES, "utf8"));
    const vod = cfg?.sources?.vod ?? {};
    if (!Object.keys(vod).length) return null;
    const bases = [];
    if (typeof vod.filmes === "string") {
      bases.push({ cat: "Filmes", url: vod.filmes.replace("%s", "page.xml"), kind: "item" });
    }
    if (typeof vod.series === "string") {
      bases.push({ cat: "Séries", url: vod.series, kind: "channel" });
    }
    if (typeof vod.novelas === "string") {
      bases.push({ cat: "Novelas", url: vod.novelas, kind: "channel" });
    }
    if (typeof vod.animes === "string") {
      bases.push({ cat: "Animes", url: vod.animes, kind: "channel" });
    }
    if (typeof vod.doramas === "string") {
      bases.push({ cat: "Doramas", url: vod.doramas, kind: "channel" });
    }
    if (typeof vod.desenhos === "string") {
      bases.push({ cat: "Desenhos", url: vod.desenhos, kind: "channel" });
    }
    return bases.length > 0 ? bases : null;
  } catch {
    return null;
  }
}

const BASES = addonBases() ?? DEFAULT_BASES;

const TAG = /\[(?:B|I|U)\]/g;
const CLOSE = /\[\/(?:B|I|U)\]/g;
const COLOR = /\[COLOR[^\]]*\]|\[\/COLOR\]/g;
const CR = /\[CR\]/g;

function cleanKodi(s) {
  return String(s ?? "")
    .replace(TAG, "")
    .replace(CLOSE, "")
    .replace(COLOR, "")
    .replace(CR, "\n")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Extrai campos estruturados do bloco <info> do Kodi. */
function parseInfo(info) {
  const out = { rating: "", genres: "", year: "", synopsis: "" };
  const clean = cleanKodi(info);
  const grab = (label) => {
    const re = new RegExp(`${label}:?\\s*([^\\n]+)`, "i");
    const m = clean.match(re);
    return m ? m[1].trim() : "";
  };
  const sinopse = clean.match(/Sinopse:?\s*([\s\S]*)$/i);
  out.rating = grab("Avaliação");
  out.genres = grab("Gênero");
  out.year = grab("Lançamento");
  out.synopsis = sinopse ? sinopse[1].trim() : "";
  return out;
}

const field = (body, name) => {
  const m = body.match(new RegExp(`<${name}>([\\s\\S]*?)<\\/${name}>`));
  return m ? m[1] : "";
};

async function fetchBase(base) {
  const res = await fetch(base.url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`${base.cat}: HTTP ${res.status}`);
  const xml = await res.text();
  const items = [];
  const push = (body) => {
    const title = cleanKodi(field(body, "title") || field(body, "name"));
    const link = (field(body, "link") || field(body, "externallink") || "").trim();
    if (!title || !link || link === "here") return; // separadores/paginação
    const info = parseInfo(field(body, "info"));
    items.push({
      t: title,
      c: base.cat,
      p: field(body, "thumbnail") || "",
      f: field(body, "fanart") || "",
      d: info.synopsis,
      g: info.genres,
      r: info.rating,
      y: info.year,
      l: link,
    });
  };
  const re =
    base.kind === "channel"
      ? /<channel>([\s\S]*?)<\/channel>/g
      : /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = re.exec(xml))) push(m[1]);
  return items;
}

async function main() {
  const all = [];
  const failed = [];
  for (const base of BASES) {
    process.stdout.write(`• ${base.cat}… `);
    try {
      const items = await fetchBase(base);
      all.push(...items);
      process.stdout.write(`${items.length} itens\n`);
    } catch (err) {
      failed.push(base.cat);
      process.stdout.write(`FALHOU (${err.message}) — mantendo arquivo anterior\n`);
    }
  }
  if (failed.length > 0) {
    console.warn(`\n⚠ ${failed.join(", ")} indisponível — o build segue com o catálogo anterior.`);
  }
  mkdirSync(OUT_DIR, { recursive: true });
  const index = { generatedAt: new Date().toISOString(), categories: {} };
  // Escreve apenas categorias que baixaram OK (as que falharam mantêm o arquivo anterior).
  for (const base of BASES) {
    const items = all.filter((i) => i.c === base.cat);
    if (items.length === 0 && failed.includes(base.cat)) continue;
    const file = base.cat.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const json = JSON.stringify({ generatedAt: new Date().toISOString(), items });
    writeFileSync(join(OUT_DIR, `${file}.json`), json);
    index.categories[base.cat] = {
      file: `${file}.json`,
      count: items.length,
      mb: +(json.length / 1024 / 1024).toFixed(1),
    };
  }
  writeFileSync(join(OUT_DIR, "index.json"), JSON.stringify(index));
  process.stdout.write(`\n✅ public/vod/ gerado: ${all.length} títulos no total.\n`);
  process.stdout.write(
    Object.entries(index.categories)
      .map(([c, v]) => `   ${c}: ${v.count} (${v.mb} MB)`)
      .join("\n") + "\n"
  );
}

main().catch((err) => {
  console.error(`\nFalha: ${err.message}`);
  process.exit(1);
});
