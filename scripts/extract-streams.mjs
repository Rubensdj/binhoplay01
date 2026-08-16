// ---------------------------------------------------------------------------
// Extração automática dos streams reais — igual o addon Kodi faz.
// ---------------------------------------------------------------------------
// O addon do repositório (plugin.video.BrazucaPlay) não guarda as URLs de
// vídeo no código: ele busca um "channels.xml" em runtime e resolve cada
// canal como canal XC-IPTV. Este script replica exatamente essa lógica:
//
//   1. Baixa o channels.xml (mesma URL que o addon usa);
//   2. Lê os grupos <channel_N> com <hostname_N> (base64) e <users_N> (base64);
//   3. Verifica qual conta do grupo está ativa (player_api.php, como o addon);
//   4. Monta a URL  host/live/usuario/senha/<id>.m3u8  e VALIDA ao vivo (segue
//      redirects, confere se o conteúdo é vídeo/HLS);
//   5. Casa os títulos do channels.xml com os canais do catálogo (EPG) e
//      gera channel-streams.json na raiz.
//
// Uso:  bun run streams   (ou  node scripts/extract-streams.mjs)
// Depois rode  bun run generate  para o catálogo incorporar os streams.
// ---------------------------------------------------------------------------
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "channel-streams.json");
const CATALOG_FILE = join(ROOT, "src", "catalog.json");
const ADDON_SOURCES = join(ROOT, "addon-sources.json");

// Mesma fonte que o addon usa em runtime — extraída automaticamente do
// próprio addon (scripts/decode-addon.mjs). Se o dono do repositório trocar
// o gist, rode `bun run generate` e o site passa a usar a nova URL.
function addonChannelsUrl() {
  try {
    const cfg = JSON.parse(readFileSync(ADDON_SOURCES, "utf8"));
    if (typeof cfg?.sources?.channelsXml === "string") return cfg.sources.channelsXml;
  } catch {
    /* sem config decodificada */
  }
  return "https://gist.githubusercontent.com/skyrisk/16070347f20c87c72540f9f805b57a66/raw/channels.xml";
}

const CHANNELS_URL = process.env.CHANNELS_XML_URL ?? addonChannelsUrl();

const UA = "XC-IPTV";
const REQ_TIMEOUT_MS = 8000;
const VALIDATE_BYTES = 4096;

// Marcadores de erro que o addon usa para descartar conta inválida.
const AUTH_ERRORS = [
  '"auth":0',
  "user expire",
  "<title>404 Not Found</title>",
  "<h1>500 Internal Server Error</h1>",
  "Line is invalid",
  "<title>Forbidden</title>",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function log(msg) {
  console.log(msg);
}

async function fetchWithTimeout(url, { timeout = REQ_TIMEOUT_MS, ua = UA, follow = true } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, {
      redirect: follow ? "follow" : "manual",
      signal: controller.signal,
      headers: { "User-Agent": ua },
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

/** Lê só o começo do corpo (para validar sem baixar o stream inteiro). */
async function readHead(res, bytes = VALIDATE_BYTES) {
  try {
    const reader = res.body?.getReader();
    if (!reader) return "";
    let buf = Buffer.alloc(0);
    while (buf.length < bytes) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) break;
      buf = Buffer.concat([buf, Buffer.from(value)]);
      if (buf.length >= bytes) break;
    }
    try {
      await reader.cancel();
    } catch {
      /* ignore */
    }
    return buf.toString("latin1");
  } catch {
    return "";
  }
}

const decodeB64 = (s) => Buffer.from(String(s).trim(), "base64").toString("utf-8");

function cleanTitle(raw) {
  return String(raw)
    .replace(/\[[^\]]*\]/g, "") // tags de cor/negrito do Kodi
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

const norm = (s) =>
  String(s)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

// Qualidade do título (para escolher a melhor versão do canal: FHD > HD > SD).
const QUALITY_RANK = { fhd: 3, fullhd: 3, uhd: 3, "4k": 3, hd: 2, sdh: 2, sd: 1, sdd: 1 };

function qualityOf(title) {
  const t = title.toLowerCase();
  let best = 0;
  for (const [word, rank] of Object.entries(QUALITY_RANK)) {
    if (t.includes(word) && rank > best) best = rank;
  }
  return best;
}

// ---------------------------------------------------------------------------
// 1) channels.xml — grupos (host + contas) e itens (canais)
// ---------------------------------------------------------------------------
async function fetchChannelsXml() {
  log(`• Baixando channels.xml do repositório…`);
  const res = await fetchWithTimeout(CHANNELS_URL, { ua: "Mozilla/5.0" });
  if (!res.ok) {
    throw new Error(`Falha ao baixar channels.xml (HTTP ${res.status}). Sem internet?`);
  }
  const xml = await res.text();
  if (!xml.includes("<channels>")) {
    throw new Error("channels.xml inválido: bloco <channels> não encontrado.");
  }
  return xml;
}

function parseChannelsXml(xml) {
  const groups = new Map();
  const groupRe = /<channel_(\w+)>([\s\S]*?)<\/channel_\w+>/g;
  let m;
  while ((m = groupRe.exec(xml))) {
    const gid = m[1];
    const body = m[2];
    const hostMatch = body.match(new RegExp(`<hostname_${gid}>([\\s\\S]*?)</hostname_${gid}>`));
    const usersMatch = body.match(new RegExp(`<users_${gid}>([\\s\\S]*?)</users_${gid}>`));
    if (!hostMatch || !usersMatch) continue;
    const host = decodeB64(hostMatch[1]);
    const accounts = decodeB64(usersMatch[1])
      .split("|")
      .map((a) => a.trim())
      .filter((a) => a.includes("/"));
    if (host && accounts.length) groups.set(gid, { gid, host, accounts });
  }

  const items = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  while ((m = itemRe.exec(xml))) {
    const body = m[1];
    const title = cleanTitle(body.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "");
    const link = (body.match(/<link>([\s\S]*?)<\/link>/)?.[1] ?? "").trim();
    const thumb = body.match(/<thumbnail>([\s\S]*?)<\/thumbnail>/)?.[1] ?? "";
    if (!title || !link || link === "here") continue; // separadores de seção
    items.push({ title, link, thumb });
  }

  return { groups, items };
}

// ---------------------------------------------------------------------------
// 2) Contas ativas por grupo (replica o M3U8_Verify do addon)
// ---------------------------------------------------------------------------
async function pickWorkingAccount(group) {
  const { host, accounts } = group;
  const base = host.match(/^([a-z]+:\/\/[^/]+)/i)?.[1] ?? host;
  for (const account of accounts) {
    const [user, pass] = account.split("/");
    const checkUrl = `${base}/player_api.php?username=${encodeURIComponent(user)}&password=${encodeURIComponent(pass)}&type=m3u&output=m3u8`;
    try {
      const res = await fetchWithTimeout(checkUrl);
      const body = await readHead(res, 2048);
      const bad = AUTH_ERRORS.some((e) => body.includes(e));
      const okAuth = body.includes('"auth":1') || body.includes("EXTM3U") || (!bad && res.ok);
      if (res.ok && okAuth && !bad) {
        log(`  ✓ conta ativa em ${group.gid}: ${user}`);
        return account;
      }
    } catch {
      /* tenta a próxima conta */
    }
  }
  log(`  ⚠ nenhuma conta validou no grupo ${group.gid} — usando a primeira (best-effort).`);
  return accounts[0];
}

// ---------------------------------------------------------------------------
// 3) Validação ao vivo de uma URL de stream (segue redirects e olha o conteúdo)
// ---------------------------------------------------------------------------
const validCache = new Map();

async function validateStream(url) {
  if (validCache.has(url)) return validCache.get(url);
  const verdict = (ok) => {
    validCache.set(url, ok);
    return ok;
  };
  if (!/^https?:\/\//i.test(url)) return verdict(false);
  try {
    const res = await fetchWithTimeout(url);
    if (res.status >= 400) return verdict(false);
    const ctype = (res.headers.get("content-type") || "").toLowerCase();
    // HLS/MP4 direto — pronto.
    if (ctype.startsWith("video/") || ctype.includes("mpegurl") || ctype.includes("octet-stream")) {
      return verdict(true);
    }
    const head = await readHead(res);
    if (head.startsWith("#EXTM3U")) return verdict(true);
    // Redirecionou para um HTML (erro) — reprova.
    return verdict(false);
  } catch {
    return verdict(false);
  }
}

// ---------------------------------------------------------------------------
// 4) Resolve um link do channels.xml em URL de stream
// ---------------------------------------------------------------------------
function chresolverUrl(host, account, channelId) {
  // O addon faz `host % (accounts, channel)` — o template é
  // "live/%s/%s.m3u8" = live/<usuário/senha>/<canal>.m3u8 (conta inteira
  // no 1º placeholder, id do canal no 2º).
  const parts = account.split("/");
  if (host.includes("%s")) {
    const placeholders = (host.match(/%s/g) || []).length;
    if (placeholders === 2) return host.replace("%s", account).replace("%s", channelId);
    return host.replace("%s", channelId);
  }
  // fallback: monta no padrão XC-IPTV
  return `${host}/live/${parts[0]}/${parts[1]}/${channelId}.m3u8`;
}

async function resolveItem(link, groups, accountByGroup) {
  // chresolver1=<id>#<grupo>
  const m = link.match(/^chresolver1=([^#]+)#(\w+)$/);
  if (m) {
    const [, channelId, gid] = m;
    const order = groups.has(gid) ? [gid, ...[...groups.keys()].filter((g) => g !== gid)] : [...groups.keys()];
    for (const g of order) {
      const group = groups.get(g);
      if (!group) continue;
      const account = accountByGroup.get(g);
      if (!account) continue;
      const url = chresolverUrl(group.host, account, channelId);
      if (await validateStream(url)) return url;
    }
    // Sem grupo/host funcionando: fallback do próprio addon (apkwuv) —
    // só entra se realmente servir vídeo (hoje é página anti-bot, então não).
    const fallback = `http://s.apkwuv.xyz/live/demopadexchange/demopad/${channelId}.m3u8`;
    if (await validateStream(fallback)) return fallback;
    return null;
  }
  // Link direto (http/https) — raro no channels.xml atual.
  if (/^https?:\/\//i.test(link)) {
    const url = link.split("|")[0];
    if (await validateStream(url)) return url;
  }
  return null;
}

// ---------------------------------------------------------------------------
// 5) Casa títulos do channels.xml com os canais do catálogo (EPG)
// ---------------------------------------------------------------------------
function matchChannel(cleanTitle, catalogChannels) {
  const nt = norm(cleanTitle.replace(/\b(fhd|fullhd|uhd|4k|hd|sdh|sd|sdd)\b/gi, ""));
  if (!nt) return null;

  // Pontuação por campo: id exato > nome exato > id contém > nome contém > contém id/nome.
  // Guards de tamanho (>= 3) evitam casamentos falsos tipo "VENUS" -> "E".
  let best = null;
  let bestScore = 0;
  for (const ch of catalogChannels) {
    const { normId, normName } = ch;
    let score = 0;
    if (nt === normId) score = 5;
    else if (nt === normName) score = 4;
    else if (nt.length >= 3 && normId.length >= 3 && normId.includes(nt)) score = 3;
    else if (nt.length >= 3 && normName.length >= 3 && normName.includes(nt)) score = 2;
    else if (nt.length >= 3 && normId.length >= 3 && nt.includes(normId)) score = 1;
    else if (nt.length >= 3 && normName.length >= 3 && nt.includes(normName)) score = 1;
    if (score > bestScore) {
      best = { channel: ch, score };
      bestScore = score;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
async function main() {
  if (!existsSync(CATALOG_FILE)) {
    log(`Erro: ${CATALOG_FILE} não existe. Rode 'bun run generate' antes.`);
    process.exit(1);
  }

  const catalog = JSON.parse(readFileSync(CATALOG_FILE, "utf8"));
  const catalogChannels = catalog.channels.map((c) => {
    const idNoExt = String(c.id).replace(/^\++/, "").replace(/\.[a-z0-9]{2,4}$/i, "");
    return { id: c.id, name: c.name, normId: norm(idNoExt), normName: norm(c.name) };
  });

  const xml = await fetchChannelsXml();
  const { groups, items } = parseChannelsXml(xml);
  log(`• ${items.length} canais no channels.xml · ${groups.size} grupos XC-IPTV (${[...groups.keys()].join(", ")})`);

  // Contas ativas por grupo (uma vez por execução).
  const accountByGroup = new Map();
  for (const g of groups.keys()) {
    log(`• Verificando contas do grupo ${g}…`);
    accountByGroup.set(g, await pickWorkingAccount(groups.get(g)));
  }

  // Itens → canal do catálogo, do melhor para o pior (qualidade + score).
  const byChannel = new Map();
  for (const item of items) {
    const match = matchChannel(item.title, catalogChannels);
    if (!match) continue;
    const quality = qualityOf(item.title);
    const entry = { item, channel: match.channel, quality, rank: match.score };
    if (!byChannel.has(match.channel.id)) byChannel.set(match.channel.id, []);
    byChannel.get(match.channel.id).push(entry);
  }
  for (const list of byChannel.values()) {
    list.sort((a, b) => b.quality - a.quality || b.rank - a.rank);
  }

  log(`• ${byChannel.size} canais do catálogo encontrados no channels.xml — validando streams…`);

  // Valida com pool pequeno (sem estourar o servidor).
  const poolSize = 6;
  const queue = [...byChannel.entries()];
  const results = new Map();
  let cursor = 0;

  async function worker() {
    while (cursor < queue.length) {
      const idx = cursor++;
      const [channelId, candidates] = queue[idx];
      let url = null;
      for (const cand of candidates) {
        url = await resolveItem(cand.item.link, groups, accountByGroup);
        if (url) break;
      }
      results.set(channelId, url);
      const status = url ? "✓" : "✗";
      log(`  ${status} ${channelId}${url ? "" : " (sem stream — mantém demo)"}`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(poolSize, queue.length) }, worker));

  // Gera channel-streams.json (URLs limpas; os hosts já respondem com CORS *).
  const out = {};
  let okCount = 0;
  for (const [channelId, url] of results) {
    if (url) {
      out[channelId] = url;
      okCount++;
    }
  }
  writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");
  log(`\n✅ channel-streams.json gerado: ${okCount}/${results.size} canais com stream real.`);
  log(`   Agora rode 'bun run generate' para o catálogo usar os streams.`);
}

main().catch((err) => {
  console.error(`\nFalha na extração: ${err.message}`);
  console.error(err.stack);
  process.exit(1);
});
