#!/usr/bin/env python3
"""
Binho Play — Bot de resolução VOD (v3).

Resolve TODOS os formatos de link do addon Kodi usando a mesma infraestrutura
dele, com uma cadeia de fallback em camadas:

  1. API de resolução (api.geekantenado.online / geekantenado.fly.dev) — formatos
     `resolverN_mv=`, `resolverN_tvshows=`, `resolverN_episodes=`, `animes2=`;
  2. API com o MESMO slug do formato de scraper (e slug "limpo" sem sufixo
     Overflix) — muitos títulos que o catálogo aponta para Overflix/animes/
     doramas/novelas existem na API sob o mesmo slug;
  3. Scrapers reais, portados do addon decodificado:
     - Overflix (movie2= / serie3=) com DESCOBERTA DINÂMICA de domínio
       (igual ao addon: lê o aviso da página atual e migra sozinho se mudar);
     - Doramas via doramasonline (host vindo do addon);
     - Animes via animesonlinecc.to (direto + proxy de fetch da API);
     - Novelas via novefx.biz / askflix.biz.

Tudo isso é lido de addon-sources.json (gerado por scripts/decode-addon.mjs a
partir do ZIP do addon do próprio repositório) — quando o dono atualiza o
addon, basta rodar `bun run generate` e o site passa a usar os novos hosts,
sem editar nada manualmente.

O navegador não pode chamar esses serviços diretamente (sem CORS / Cloudflare),
então o app chama este bot (mesma origem, `/api/resolver`) e ele responde com
CORS liberado + cache curto.

Endpoints:
  GET /resolver?resolver=N&request=<op>  -> resposta unificada (ver abaixo)
  GET /                                    -> health check

Resposta unificada (tudo):
  {"kind": "stream",  "stream": "https://..."}
  {"kind": "seasons", "seasons": [{"name": "...", "episodes": [
      {"name": "...", "link": "...", "direct": true|false, "resolver": N}]}]}
  {"kind": "error",   "message": "..."}

Como rodar localmente (opcional):
  PORT=8787 python3 api/resolver.py
  e configure VITE_BOT_URL=http://localhost:8787

No hosting do Freebuff, arquivos em `api/*.py` são instalados e executados
automaticamente (requirements.txt ao lado), servindo o app na mesma origem.
"""
import ast
import base64
import json
import os
import random
import re
import string
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlencode, urlparse, parse_qs, unquote, quote
from urllib.request import Request, urlopen

# ---------------------------------------------------------------------------
# Configuração auto-derivada do addon do repositório
# ---------------------------------------------------------------------------
# O site não guarda URLs fixas: o script scripts/decode-addon.mjs decodifica o
# addon (addons/plugin.video.BrazucaPlay.zip) e escreve addon-sources.json com
# TODAS as fontes de dados (API de resolução, token, hosts dos scrapers). Quando
# o dono do repositório atualiza o addon, basta rodar `bun run generate` — o
# bot passa a usar os novos hosts automaticamente. Env vars ainda têm prioridade.

_ADDON_CONFIG = {}

def _load_addon_config():
    """Lê addon-sources.json (gerado pelo decode-addon.mjs)."""
    global _ADDON_CONFIG
    for path in (
        os.path.join(os.path.dirname(__file__), "..", "addon-sources.json"),
        os.path.join(os.path.dirname(__file__), "addon-sources.json"),
        "addon-sources.json",
    ):
        try:
            with open(path, encoding="utf-8") as f:
                data = json.load(f)
            src = data.get("sources", {})
            if src:
                _ADDON_CONFIG = src
                return
        except Exception:
            continue

_load_addon_config()


def _cfg(*keys, default=None):
    val = _ADDON_CONFIG
    for k in keys:
        if not isinstance(val, dict) or k not in val:
            return default
        val = val[k]
    return val if val not in (None, "", []) else default


ENDPOINTS = (
    os.environ.get(
        "RESOLVER_ENDPOINTS",
        ",".join(
            f"https://{e}" for e in _cfg("resolverEndpoints", default=["api.geekantenado.online", "geekantenado.fly.dev"])
        ),
    )
    .split(",")
)
TOKEN = os.environ.get(
    "RESOLVER_TOKEN",
    _cfg(
        "resolverToken",
        default="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJyZXNvbHZlciIsInJvbGUiOiJ1c2VyIiwiaWF0IjoxNzc5MDk4OTczfQ.WzQBuOqMai96Afleh9g-i7NXo6h-YsjPUbOgxlUqVsU",
    ),
)
TIMEOUT = 12
UA = (
    "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)
OVERFLIX_HOST = os.environ.get("OVERFLIX_HOST", _cfg("overflixHost", default="www.overflix.today"))
DORAMA_HOST = os.environ.get("DORAMA_HOST", _cfg("doramaHost", default="doramasonline.net"))
ANIME_HOST = os.environ.get("ANIME_HOST", _cfg("animeHost", default="animesonlinecc.to"))
NOVEFX_HOST = os.environ.get("NOVEFX_HOST", _cfg("novefxHost", default="novefx.biz"))
ASKFLIX_HOST = os.environ.get("ASKFLIX_HOST", _cfg("askflixHost", default="www.askflix.biz"))

# Players do Overflix com bases FIXAS (igual ao addon): o playerData devolve só
# os IDs por servidor; a base do player é sempre esta.
OVERFLIX_PLAYERS = {
    "mixdrop": "https://mixdrop.ps/e/",
    "streamtape": "https://streamtape.com/e/",
    "doodstream": "https://myvidplay.com/e/",
}

CACHE_TTL = {
    "tvshows": 900,
    "mvshows": 900,
    "episodes": 300,
    "proxy": 600,
    "direct": 600,
    "default": 300,
}

_cache = {}


def cache_get(key):
    hit = _cache.get(key)
    if hit and hit[0] > time.time():
        return hit[1]
    return None


def cache_set(key, value, ttl):
    _cache[key] = (time.time() + ttl, value)
    if len(_cache) > 1024:
        now = time.time()
        for k in [k for k, v in _cache.items() if v[0] < now]:
            _cache.pop(k, None)


def overflix_domain():
    """Descobre o domínio ATUAL do Overflix — exatamente como o addon faz.

    O addon consulta o domínio configurado; se a página avisa que o domínio
    mudou (bloco `alert alert-info` com link novo, ou `domainAlertPayload` com
    `baseUrl` novo em base64), passa a usar o novo automaticamente. O resultado
    fica em cache por 1h para não pesar nas requisições.
    """
    now = time.time()
    if _overflix_cache["host"] and now - _overflix_cache["at"] < 3600:
        return _overflix_cache["host"]
    discovered = _discover_overflix_domain()
    if discovered:
        _overflix_cache["host"] = discovered
        _overflix_cache["at"] = now
    return _overflix_cache["host"] or OVERFLIX_HOST


_overflix_cache = {"at": 0.0, "host": None}


def _discover_overflix_domain():
    try:
        html = fetch_direct(f"https://{OVERFLIX_HOST}/", timeout=10)
    except Exception:
        return None
    html = html.replace("\n", "").replace("\r", "").replace("'", '"')
    # 1) bloco de aviso com link para o novo domínio
    bloco = re.search(
        r'<div[^>]*class="alert alert-info"[^>]*>(.*?)</div>', html, re.DOTALL | re.IGNORECASE
    )
    if bloco:
        link = re.search(r'<a[^>]*href="([^"]+)"', bloco.group(1), re.IGNORECASE)
        if link:
            dominio = urlparse(link.group(1)).netloc
            if dominio and dominio.lower() != OVERFLIX_HOST.lower():
                return dominio
    # 2) domainAlertPayload (JSON em base64 com baseUrl em base64)
    payload = re.search(r'window\.domainAlertPayload\s*=\s*"([^"]+)"', html)
    if payload:
        try:
            decoded = json.loads(base64.b64decode(payload.group(1)).decode("utf-8"))
            base_url = decoded.get("baseUrl")
            if base_url:
                dominio = urlparse(base64.b64decode(base_url).decode("utf-8")).netloc
                if dominio and dominio.lower() != OVERFLIX_HOST.lower():
                    return dominio
        except Exception:
            pass
    return None


# ---------------------------------------------------------------------------
# Doramas — o domínio .org hoje redireciona para .net (meta refresh); o bot
# segue o aviso da página como um navegador, então continua funcionando mesmo
# quando o site migra de domínio (mesmo espírito do overflix_domain).
# ---------------------------------------------------------------------------
_dorama_cache = {"at": 0.0, "host": None}


def dorama_domain():
    now = time.time()
    if _dorama_cache["host"] and now - _dorama_cache["at"] < 3600:
        return _dorama_cache["host"]
    discovered = _discover_dorama_domain()
    if discovered:
        _dorama_cache["host"] = discovered
        _dorama_cache["at"] = now
    return _dorama_cache["host"] or DORAMA_HOST


def _discover_dorama_domain():
    try:
        html = fetch_direct(f"https://{DORAMA_HOST}/", timeout=10)
    except Exception:
        return None
    m = re.search(
        r'<meta[^>]*http-equiv=["\']refresh["\'][^>]*content=["\']\d+;\s*url=([^"\']+)',
        html,
        re.IGNORECASE,
    )
    if not m:
        m = re.search(r"Redirecting you to (https?://[^\s\"'<]+)", html, re.IGNORECASE)
    if not m:
        return None
    dominio = urlparse(m.group(1)).netloc
    if dominio and dominio.lower() != DORAMA_HOST.lower():
        return dominio
    return None


def is_base64(s):
    if not s or len(s) < 12:
        return False
    if not re.fullmatch(r"[A-Za-z0-9+/=]+", s):
        return False
    try:
        base64.b64decode(s, validate=True)
        return True
    except Exception:
        return False


def decode_result(result):
    """O addon recebe o resultado em base64 (JSON/ast/dict/string). Decodifica."""
    if not isinstance(result, str) or result in ("", "API Under Maintenance", "episode not found!"):
        return result
    if not is_base64(result):
        return result
    try:
        raw = base64.b64decode(result).decode("utf-8", "replace")
    except Exception:
        return result
    if not raw.strip():
        return result
    try:
        return json.loads(raw)
    except Exception:
        pass
    try:
        return ast.literal_eval(raw)
    except Exception:
        pass
    return raw


# ---------------------------------------------------------------------------
# Camada de transporte
# ---------------------------------------------------------------------------
def fetch_direct(url, referer="", headers=None, timeout=TIMEOUT):
    """Fetch direto com headers de navegador. Fallback: proxy da API do addon."""
    h = {
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8",
    }
    if referer:
        h["Referer"] = referer
    if headers:
        h.update(headers)
    key = f"direct:{url}:{referer}"
    cached = cache_get(key)
    if cached is not None:
        return cached
    try:
        req = Request(url, headers=h)
        with urlopen(req, timeout=timeout) as resp:
            body = resp.read().decode("utf-8", "replace")
        if not body or len(body) < 100:
            raise RuntimeError("resposta curta demais")
        if "Attention Required" in body or "cf-wrapper" in body or "Just a moment" in body:
            raise RuntimeError("cloudflare")
        cache_set(key, body, CACHE_TTL["direct"])
        return body
    except Exception:
        return proxy_get(url, referer)


def api_call(params):
    """Chama a API de resolução do addon (payload = base64 do dict de params)."""
    payload = quote(base64.b64encode(json.dumps(params).encode("utf-8")).decode("utf-8"))
    last_err = None
    for attempt in range(2):
        for endpoint in ENDPOINTS:
            try:
                url = f"{endpoint}/?resolver={payload}"
                req = Request(url, headers={"Authorization": f"Bearer {TOKEN}", "User-Agent": "XC-IPTV"})
                with urlopen(req, timeout=TIMEOUT) as resp:
                    return json.loads(resp.read().decode("utf-8", "replace"))
            except Exception as err:  # noqa: BLE001
                last_err = err
    raise RuntimeError(f"API de resolução indisponível: {last_err}")


def call_resolver(resolver, request, retries=3):
    """Equivalente ao resolver_api do addon: {resolver: N, request: \"cmd=slug\"}."""
    params = json.dumps({"resolver": resolver, "request": request})
    payload = base64.b64encode(params.encode("utf-8")).decode("utf-8")
    payload_q = urlencode({"resolver": payload})
    key = f"api:{resolver}:{request}"
    ttl = CACHE_TTL.get(request.split("=")[0], CACHE_TTL["default"])
    cached = cache_get(key)
    if cached is not None:
        return cached

    last_err = None
    for attempt in range(retries):
        for endpoint in ENDPOINTS:
            try:
                url = f"{endpoint}/?{payload_q}"
                req = Request(url, headers={"Authorization": f"Bearer {TOKEN}", "User-Agent": "XC-IPTV"})
                with urlopen(req, timeout=TIMEOUT) as resp:
                    body = resp.read().decode("utf-8", "replace")
                data = json.loads(body)
                result = decode_result(data.get("result"))
                if result == "" or result is None:
                    raise RuntimeError("resultado vazio")
                cache_set(key, result, ttl)
                return result
            except Exception as err:  # noqa: BLE001
                last_err = err
        time.sleep(0.3 * (attempt + 1))
    raise RuntimeError(f"API de resolução indisponível: {last_err}")


def proxy_get(url, referer="", headers=""):
    """Fetch de uma URL arbitrária através do proxy da API (custom_proxy do addon)."""
    key = f"proxy:{url}:{referer}:{headers}"
    cached = cache_get(key)
    if cached is not None:
        return cached
    params = {
        "action": "get",
        "host": url,
        "referer": referer,
        "origin": "",
        "post": "",
        "cache": {"format": "minutes", "limit": 10},
        "headers": headers,
    }
    result = api_call(params).get("result")
    if not isinstance(result, str) or not result:
        raise RuntimeError(f"Falha ao acessar {urlparse(url).netloc} (servidor indisponível ou bloqueado)")
    try:
        raw = base64.b64decode(result).decode("utf-8", "replace")
    except Exception:
        raw = result
    if not raw or len(raw) < 100:
        raise RuntimeError(f"Falha ao acessar {urlparse(url).netloc} (servidor indisponível ou bloqueado)")
    if "Attention Required" in raw or "cf-wrapper" in raw or "Just a moment" in raw:
        raise RuntimeError(f"{urlparse(url).netloc} está protegido por verificação (Cloudflare)")
    cache_set(key, raw, CACHE_TTL["proxy"])
    return raw


# ---------------------------------------------------------------------------
# Normalização para o contrato unificado
# ---------------------------------------------------------------------------
def stream_result(url):
    return {"kind": "stream", "stream": url}


def seasons_result(seasons):
    return {"kind": "seasons", "seasons": seasons}


def error_result(message):
    return {"kind": "error", "message": message}


def pick_stream(data):
    if isinstance(data, str):
        s = data.strip()
        if re.match(r"^https?://", s, re.IGNORECASE):
            return s
        return None
    if isinstance(data, list):
        for entry in data:
            if isinstance(entry, str) and re.match(r"^https?://", entry.strip(), re.IGNORECASE):
                return entry.strip()
    return None


def normalize_seasons(data, resolver, slug=""):
    """Converte a resposta crua da API (resolver 2/3/4) no formato unificado.

    Resolver 2: [{season_number, episodes: [{episode_name, link}]}] — links diretos.
    Resolver 3: {"1": {"episodes": {1: {...}}}} — episódios resolvidos via episodes=.
    """
    seasons = []

    if isinstance(data, list):
        for s in data:
            if not isinstance(s, dict):
                continue
            eps = s.get("episodes")
            if not isinstance(eps, list):
                continue
            episodes = []
            for e in eps:
                if not isinstance(e, dict) or not isinstance(e.get("link"), str):
                    continue
                link = e["link"].strip()
                if not re.match(r"^https?://", link, re.IGNORECASE):
                    continue
                episodes.append(
                    {
                        "name": str(e.get("episode_name") or e.get("title") or "Episódio"),
                        "link": link,
                        "direct": True,
                        "resolver": resolver,
                    }
                )
            if episodes:
                seasons.append(
                    {
                        "name": str(s.get("season_number") or f"Temporada {len(seasons) + 1}"),
                        "episodes": episodes,
                    }
                )
        return seasons or None

    if isinstance(data, dict):
        for key, value in data.items():
            if not isinstance(value, dict):
                continue
            eps_raw = value.get("episodes")
            episodes = []
            if isinstance(eps_raw, dict):
                for num, ep in eps_raw.items():
                    ep = ep if isinstance(ep, dict) else {}
                    episodes.append(
                        {
                            "name": str(ep.get("title") or f"Episódio {num}"),
                            "link": f"{slug}#{key}#{num}#Dublado",
                            "direct": False,
                            "resolver": 3,
                        }
                    )
            elif isinstance(eps_raw, list):
                for e in eps_raw:
                    if not isinstance(e, dict) or not isinstance(e.get("link"), str):
                        continue
                    link = e["link"].strip()
                    if not re.match(r"^https?://", link, re.IGNORECASE):
                        continue
                    episodes.append(
                        {
                            "name": str(e.get("episode_name") or e.get("title") or "Episódio"),
                            "link": link,
                            "direct": True,
                            "resolver": resolver,
                        }
                    )
            if episodes:
                seasons.append({"name": str(key), "episodes": episodes})
        return seasons or None

    return None


def seasons_from_episodes(name, episodes):
    """Constrói seasons no formato unificado a partir de lista (name, link, direct)."""
    return [
        {
            "name": name,
            "episodes": [
                {"name": n, "link": l, "direct": d, "resolver": 0}
                for (n, l, d) in episodes
            ],
        }
    ]


# ---------------------------------------------------------------------------
# Formatos baseados na API de resolução
# ---------------------------------------------------------------------------
def resolve_api(resolver, request):
    data = call_resolver(resolver, request)
    if isinstance(data, str) and not re.match(r"^https?://", data, re.IGNORECASE):
        return error_result(str(data) if data else "Nenhuma opção de reprodução disponível para este título.")
    stream = pick_stream(data)
    if stream:
        return stream_result(stream)
    cmd, _, slug = request.partition("=")
    seasons = normalize_seasons(data, resolver, slug)
    if seasons:
        return seasons_result(seasons)
    return error_result("Título indisponível no momento (resolver não retornou reprodução).")


def resolve_animes2(slug):
    return resolve_api(3, f"tvshows={slug}")


# ---------------------------------------------------------------------------
# Fallback: tentar a API com o slug do formato de scraper
# ---------------------------------------------------------------------------
def clean_slug(slug):
    """Remove sufixos do Overflix: `-dublado-37372` / `-legendado-37372` / `-37372`."""
    return (
        slug.replace("-dublado", "")
        .replace("-legendado", "")
        .replace("-dual", "")
        .replace("-dublado-dual", "")
        .replace(r"-\d{3,}$", "")
        .strip()
    )


def api_fallback(slug, op="tvshows", resolver=3):
    """Tenta a API de resolução com o slug cru e depois o slug limpo."""
    for candidate in [slug, clean_slug(slug)]:
        if not candidate:
            continue
        try:
            result = resolve_api(resolver, f"{op}={candidate}")
        except Exception:
            continue
        if result["kind"] != "error":
            return result
    return None


# ---------------------------------------------------------------------------
# Overflix (movie2= / serie3=) — domínio atual + players diretos
# ---------------------------------------------------------------------------
def _unpack_packed(html):
    """Unpacker do JS empacotado (p,a,c,k,e,d) usado pelo Mixdrop."""
    m = re.search(
        r"}\(\\(?:'|\")(.*?)\\'\s*,\s*(\d+)\s*,\s*(\d+)\s*,\\(?:'|\")(.*?)\\'(?:\.split|\))",
        html,
        re.DOTALL,
    )
    if not m:
        m = re.search(r"}\('(.*?)'\s*,\s*(\d+)\s*,\s*(\d+)\s*,'(.*?)'\.split", html, re.DOTALL)
    if not m:
        return None
    P, Kraw = m.group(1), m.group(4)
    K = Kraw.split("|")

    def repl(w):
        if w.isdigit() and int(w) < len(K):
            return K[int(w)] if K[int(w)] else w
        return w

    return re.sub(r"\b\w+\b", lambda mm: repl(mm.group(0)), P)


def mixdrop_wurl(embed_url):
    """Página do Mixdrop -> URL direta do vídeo (wurl) via unpack do JS."""
    try:
        html = fetch_direct(embed_url, referer=f"https://{overflix_domain()}/")
    except Exception:
        return None
    for mm in re.finditer(r"eval\(function\(p,a,c,k,e,d\)", html):
        out = _unpack_packed(html[mm.start(): mm.start() + 30000])
        if not out:
            continue
        su = re.search(r'(?:vsr|wurl|surl)[^=]*=\s*"([^"]+)', out)
        if su:
            u = su.group(1)
            if u.startswith("//"):
                u = "https:" + u
            if re.match(r"^https?://", u):
                return u
    # fallback: procurar URLs mxcontent diretas na página
    m = re.search(r"https?:\\?\\?//[^\"'\\\\ ]*mxcontent[^\"'\\\\ ]*\.(?:mp4|m3u8)[^\"'\\\\ ]*", html)
    if m:
        return m.group(0).replace("\\/", "/").replace("\\u0026", "&")
    return None


def streamtape_direct(embed_url):
    """Página do Streamtape -> URL get_video (redireciona para o MP4 direto)."""
    try:
        html = fetch_direct(embed_url, referer=f"https://{overflix_domain()}/")
    except Exception:
        return None
    if "Video not found!" in html:
        return None
    src = re.findall(r"""ById\('.+?=\s*([\"']//[^;<]+)""", html)
    if not src:
        return None
    parts = src[-1].replace("'", '"').split("+")
    url = ""
    for part in parts:
        m = re.findall(r'"([^"]*)', part)
        p1 = m[0] if m else ""
        subs = re.findall(r"substring\((\d+)", part)
        url += p1[sum(int(s) for s in subs):]
    url += "&stream=1"
    if url.startswith("//"):
        url = "https:" + url
    return url if re.match(r"^https?://", url) else None


def resolve_embed(embed_url):
    """Embed (mixdrop/streamtape) -> URL direta de vídeo."""
    host = urlparse(embed_url).netloc.lower()
    if "mixdrop" in host:
        return mixdrop_wurl(embed_url)
    if "streamtape" in host:
        return streamtape_direct(embed_url)
    return embed_to_direct(embed_url)


def overflix_playerdata(video_id, page_url):
    api = (
        f"https://{overflix_domain()}/index.php?app=videobox&module=video&controller=view"
        f"&do=playerData&id={video_id}"
    )
    raw = fetch_direct(api, referer=page_url, headers={"X-Requested-With": "XMLHttpRequest"})
    return json.loads(raw)


def _parse_servers(servers_str):
    servers_str = servers_str.replace("&amp;", "&")
    result = {}
    for p in servers_str.split("&"):
        if "=" in p:
            k, v = p.split("=", 1)
            result[k.strip().lower()] = v.strip()
    return result


def overflix_play(video_id, page_url):
    """playerData do Overflix -> player direto (bases fixas do addon).

    Igual ao addon: os IDs vêm de servers_dub (preferido) ou servers_leg, e a
    base de cada player é fixa (mixdrop.ps, streamtape.com, myvidplay.com).
    Tenta cada player até achar um vídeo direto.
    """
    try:
        data = overflix_playerdata(video_id, page_url)
    except Exception:
        return None
    if not isinstance(data, dict):
        return None
    if data.get("redirect"):
        try:
            raw = fetch_direct(data["redirect"], referer=page_url, headers={"X-Requested-With": "XMLHttpRequest"})
            data = json.loads(raw)
        except Exception:
            return None
    servers = _parse_servers(str(data.get("servers_dub", "") or ""))
    if not servers:
        servers = _parse_servers(str(data.get("servers_leg", "") or ""))
    if not servers:
        return None
    for name, base in OVERFLIX_PLAYERS.items():
        if name in servers and servers[name]:
            embed = base + servers[name]
            direct = resolve_embed(embed)
            if direct:
                return direct
    return None


def resolve_overflix_movie(slug):
    # 1) tentar a API com o mesmo slug (cobre ~100% dos filmes)
    api = api_fallback(slug, op="mvshows")
    if api:
        return api
    # 2) Overflix
    video_id = slug.rstrip("/").split("-")[-1]
    if not video_id.isdigit():
        return error_result("Filme indisponível no momento (identificador inválido).")
    page = f"https://{overflix_domain()}/filmes/online/{slug}/"
    direct = overflix_play(video_id, page)
    if direct:
        return stream_result(direct)
    return error_result("Servidor do Overflix indisponível no momento (filme). Tente novamente mais tarde.")


def resolve_overflix_series(slug):
    # 1) API com slug cru e limpo
    api = api_fallback(slug, op="tvshows")
    if api:
        return api
    # 2) Overflix — página da série + episodesList por temporada
    host = overflix_domain()
    url = f"https://{host}/series/online/{slug}/"
    try:
        html = fetch_direct(url)
    except Exception:
        return error_result("Servidor do Overflix indisponível no momento (série). Tente novamente mais tarde.")

    bloco = re.search(r'<section class="vbEpisodes".*?</section>', html, re.DOTALL)
    if not bloco:
        return error_result("Série não encontrada no Overflix.")
    video_id = re.search(r'data-video-id="(\d+)"', bloco.group(0))
    seasons = re.findall(r'data-season="(\d+)"', bloco.group(0))
    audio = re.search(r'data-current-audio="([^"]+)"', bloco.group(0))
    if not video_id or not seasons:
        return error_result("Série sem episódios listados no Overflix.")
    video_id = video_id.group(1)
    audio = audio.group(1) if audio else "Dublado"

    out = []
    for season in seasons:
        api_url = (
            f"https://{host}/index.php?app=videobox&module=video&controller=view"
            f"&do=episodesList&id={video_id}&season={season}&audio={quote(audio)}"
        )
        try:
            raw = fetch_direct(api_url, referer=url, headers={"X-Requested-With": "XMLHttpRequest"})
            data = json.loads(raw)
        except Exception:
            continue
        if isinstance(data, dict) and data.get("redirect"):
            try:
                raw = fetch_direct(data["redirect"], referer=url, headers={"X-Requested-With": "XMLHttpRequest"})
                data = json.loads(raw)
            except Exception:
                continue
        episodes = []
        for ep in data.get("episodes", []) if isinstance(data, dict) else []:
            if not isinstance(ep, dict):
                continue
            number = ep.get("number")
            title = str(ep.get("title") or f"EPISÓDIO {number}").upper()
            ep_url = ep.get("url")
            if not ep_url:
                continue
            if number:
                title = f"EPISÓDIO {number} - {title}" if f"EPISÓDIO {number}" not in title else title
            episodes.append({"name": title, "link": ep_url, "direct": False, "resolver": 0})
        if episodes:
            out.append({"name": f"{season}ª TEMPORADA", "episodes": episodes})
    if out:
        return seasons_result(out)
    return error_result("Série sem episódios disponíveis no Overflix.")


# ---------------------------------------------------------------------------
# Doramas (doramas_resolver1=) — doramasonline.net (estrutura nova)
# ---------------------------------------------------------------------------
def resolve_doramas(slug):
    # 1) API com o mesmo slug
    api = api_fallback(slug, op="tvshows")
    if api:
        return api
    # 2) doramasonline (domínio descoberto — .org hoje aponta para .net)
    host = dorama_domain()
    url = f"https://{host}/br/series/{slug}/"
    try:
        html = fetch_direct(url)
    except Exception:
        return error_result("Servidor de doramas indisponível no momento (doramasonline).")

    eps = re.findall(r'href="(/br/episodio/[^"]+)"', html)
    if not eps:
        return error_result("Dorama não encontrado no doramasonline.")
    seen = set()
    seasons = {}
    for e in eps:
        if e in seen:
            continue
        seen.add(e)
        m = re.search(r"-temporada-(\d+)-episodio-(\d+)/?$", e)
        if not m:
            continue
        season_num = int(m.group(1))
        ep_num = int(m.group(2))
        seasons.setdefault(season_num, []).append(
            (f"EPISÓDIO {ep_num}", f"https://{host}{e}", False)
        )
    out = []
    for season_num in sorted(seasons):
        eps_sorted = sorted(seasons[season_num], key=lambda x: int(re.search(r"(\d+)$", x[0]).group(1)))
        out.append(
            {
                "name": f"{season_num}ª TEMPORADA",
                "episodes": [
                    {"name": n, "link": l, "direct": d, "resolver": 0}
                    for (n, l, d) in eps_sorted
                ],
            }
        )
    if out:
        return seasons_result(out)
    return error_result("Dorama sem episódios disponíveis no doramasonline.")


def resolve_dorama_ep(ep_url):
    try:
        html = fetch_direct(ep_url)
    except Exception:
        return None
    m = re.search(r"https://[^/]+/jwplayer-2/\?source=([^&\"']+)", html)
    if m:
        src = unquote(m.group(1))
        if re.match(r"^https?://", src):
            return src
    m = re.search(r"(https?:\\?\\?//[^\"'\\\\ ]+\.(?:mp4|m3u8)[^\"'\\\\ ]*)", html)
    if m:
        return m.group(1).replace("\\/", "/").replace("\\u0026", "&")
    return None


# ---------------------------------------------------------------------------
# Animes (animes3=) — animesonlinecc.to
# ---------------------------------------------------------------------------
def resolve_animes3(slug):
    # 1) API com o mesmo slug (alguns animes existem lá)
    api = api_fallback(slug, op="tvshows")
    if api:
        return api
    # 2) animesonlinecc (direto + proxy)
    url = f"https://{ANIME_HOST}/anime/{slug}"
    try:
        html = fetch_direct(url)
    except Exception:
        return error_result("Servidor de animes indisponível no momento (animesonlinecc).")
    links = re.findall(
        r'<div id="option-.+?src="(.+?)".+?</div>', html, re.MULTILINE | re.DOTALL | re.IGNORECASE
    )
    if not links:
        return error_result("Anime não encontrado ou episódios indisponíveis no momento.")
    for link in links:
        link = link.strip()
        if not link:
            continue
        if "blogger" in link:
            direct = embed_to_direct(link)
            if direct:
                return stream_result(direct)
        if re.match(r"^https?://", link, re.IGNORECASE):
            return stream_result(link)
    return error_result("Servidor do anime indisponível no momento.")


# ---------------------------------------------------------------------------
# Novelas (novelas= / novelas2=)
# ---------------------------------------------------------------------------
def resolve_novelas(raw):
    # formato: novelas=<server>#<slug>
    parts = raw.split("#", 1)
    if len(parts) != 2:
        return error_result("Link de novela inválido.")
    server, slug = parts
    slug = slug.strip()
    # 1) API com o mesmo slug
    api = api_fallback(slug, op="tvshows")
    if api:
        return api
    # 2) novefx.biz
    if server == "psn":
        bases = [
            f"https://novefx.biz/{server}/novelas/{slug}.php",
            f"https://novefx.biz/{server}/series/{slug}.php",
        ]
    else:
        bases = [f"https://novefx.biz/novoformato/nov/{server}/{slug}.php"]
    html = ""
    for base in bases:
        try:
            html = fetch_direct(base, referer="https://saudeeffitness.top/")
            if html:
                break
        except Exception:
            continue
    if not html:
        return error_result("Servidor de novelas indisponível no momento (novefx).")
    # o addon remove o placeholder do template antes de ler o originalUrl
    html = html.replace("${chapterStr}", "")

    # formato antigo 1: const temporadas = [...] + originalUrl
    m = re.search(r"const\s+temporadas\s*=\s*(\[.*?\]);", html, re.S)
    m_url = re.search(r"let\s+originalUrl\s*=\s*`([^`]+)`;", html)
    if m and m_url:
        json_data = re.sub(r",\s*\]", "]", m.group(1))
        json_data = re.sub(r"([{,]\s*)(\w+)\s*:", r'\1"\2":', json_data)
        try:
            temporadas = json.loads(json_data)
            out = []
            for season in temporadas:
                if not isinstance(season, dict):
                    continue
                nome = str(season.get("nome", "")).replace("TEMPORADA", "").strip()
                inicio = season.get("inicio")
                fim = season.get("fim")
                if not inicio or not fim:
                    continue
                episodes = []
                try:
                    for num in range(int(inicio), int(fim) + 1):
                        episodes.append((f"CAPÍTULO {num}", f"{m_url.group(1)}{num:03d}", False))
                except Exception:
                    continue
                if episodes:
                    out.append({"name": f"{nome}ª TEMPORADA", "episodes": episodes})
            if out:
                return seasons_result(out)
        except Exception:
            pass

    # formato atual: while (chaptersAdded < N) { ... let originalUrl = `...${chapterStr}`; ... }
    # (mesmo elif do addon: 'let originalUrl' + 'while (chaptersAdded')
    m_total = re.search(r"chaptersAdded\s*<\s*(\d+)", html)
    m_url2 = re.search(r"let\s+originalUrl\s*=\s*`([^`]+)`;", html)
    if m_total and m_url2:
        episodes = [
            (f"CAPÍTULO {n}", f"{m_url2.group(1)}{n:03d}", False)
            for n in range(1, int(m_total.group(1)) + 1)
        ]
        return seasons_result(seasons_from_episodes("Única temporada", episodes))

    # formato antigo 2: let totalChapters = N + originalUrl
    m_total2 = re.search(r"let\s+totalChapters\s*=\s*(\d+);", html)
    if m_total2 and m_url2:
        episodes = [
            (f"CAPÍTULO {n}", f"{m_url2.group(1)}{n:03d}", False)
            for n in range(1, int(m_total2.group(1)) + 1)
        ]
        return seasons_result(seasons_from_episodes("Única temporada", episodes))

    # formato antigo 3: <option value=...>
    options = re.findall(r'<option value="(.*?)">\s*(.*?)</option>', html)
    episodes = []
    for link, title in options:
        title = title.replace("Episódio 0", "CAPÍTULO ").replace("Episódio", "CAPÍTULO")
        if "CAPÍTULO" in title:
            episodes.append((title, link, False))
    if episodes:
        return seasons_result(seasons_from_episodes("Única temporada", episodes))

    return error_result("Novela indisponível no momento (novefx sem capítulos).")


def resolve_novelas2(slug):
    api = api_fallback(slug, op="tvshows")
    if api:
        return api
    url = f"https://www.askflix.biz/series/{slug}/"
    try:
        html = fetch_direct(url)
    except Exception:
        return error_result("Servidor de novelas indisponível no momento (askflix).")
    if 'id="seasons"' not in html:
        return error_result("Novela não encontrada ou conteúdo bloqueado no askflix.")
    seasons = []
    for block in re.findall(
        r'<div class="se-c"><div class="se-q">.*?<span class="title">(.*?)</span>(.*?)</div></div>',
        html,
        re.MULTILINE | re.DOTALL | re.IGNORECASE,
    ):
        title = block[0].strip()
        eps = re.findall(r'<a href="(.*?)">(.*?)</a>', block[1], re.MULTILINE | re.DOTALL | re.IGNORECASE)
        episodes = []
        for href, label in eps:
            label = re.sub(r"<[^>]+>", "", label).strip()
            if not label:
                continue
            direct = bool(re.search(r"\.(mp4|m3u8)(\?|$)", href, re.IGNORECASE))
            episodes.append({"name": label.upper(), "link": href, "direct": direct, "resolver": 0})
        if episodes:
            seasons.append({"name": title, "episodes": episodes})
    if seasons:
        return seasons_result(seasons)
    return error_result("Novela sem episódios disponíveis no askflix.")


# ---------------------------------------------------------------------------
# Novelas — resolução de episódio (novelas_play do addon)
# ---------------------------------------------------------------------------
def _jsunpack(html):
    """Unpacker do packer JS p,a,c,k,e,d (equivalente ao jsunpack do addon).

    O player do novefx empacota o código com o packer clássico (variante com
    e=function(c){...toString(36)...}) e os arquivos de vídeo só aparecem
    depois de desempacotar.
    """
    m = re.search(
        r"eval\(function\(p,a,c,k,e,d\)\{.*?\}\('(.*?)',(\d+),(\d+),'(.*?)'\.split\('\|'\),0,\{\}\)\)",
        html,
        re.S,
    )
    if not m:
        return None
    p, a, c, kraw = m.group(1), int(m.group(2)), int(m.group(3)), m.group(4)
    k = kraw.split("|")
    k += [""] * (c - len(k))
    b36 = "0123456789abcdefghijklmnopqrstuvwxyz"

    def enc(n):
        out = ""
        while True:
            r = n % a
            out = (chr(r + 29) if r > 35 else b36[r]) + out
            n //= a
            if n == 0:
                break
        return out

    d = {}
    for i in range(c):
        d[enc(i)] = k[i] if k[i] else enc(i)
    return re.sub(r"\w+", lambda mm: d.get(mm.group(0), mm.group(0)), p)


def resolve_novefx_episode(ep_url):
    """Página do capítulo (painel1.novefx.biz/v/...) -> arquivo de vídeo.

    Porta o novelas_resolver do addon: procura `player.source = {` direto e,
    senão, desempacota o eval e lê `sources:[...]`.
    """
    try:
        html = fetch_direct(ep_url, referer="https://novefx.biz/")
    except Exception:
        return None
    if "player.source = {" in html:
        m = re.search(r"sources:\s*\[\{\s*src:\s*'([^']+)'", html)
        if m:
            return m.group(1)
    m = re.search(r"(eval\(.+?)</script>", html, re.S)
    if m:
        decoded = _jsunpack(m.group(1)) or ""
        m2 = re.search(r"sources:(\[.+?}\])", decoded, re.S)
        if m2:
            try:
                arr = json.loads(m2.group(1))
                for entry in reversed(arr):
                    if isinstance(entry, dict) and entry.get("file"):
                        return entry["file"]
            except Exception:
                pass
    return None


# ---------------------------------------------------------------------------
# ep= (resolver um link de episódio de scraper)
# ---------------------------------------------------------------------------
def embed_to_direct(embed_url):
    """Tenta extrair o arquivo de mídia direto da página do player."""
    try:
        html = fetch_direct(embed_url)
    except Exception:
        return None
    patterns = [
        r'https?://[^\s"\'<>]+?\.(?:m3u8|mp4)[^\s"\'<>]*',
        r'"(?:file|src|source|url|link|playlist)"\s*:\s*"(https?://[^"]+)"',
        r'sources?\s*[:=]\s*\[?\s*["\'](https?://[^"\']+)',
    ]
    for pat in patterns:
        m = re.search(pat, html, re.IGNORECASE)
        if m:
            url = m.group(1) if m.lastindex else m.group(0)
            if re.match(r"^https?://", url, re.IGNORECASE):
                return url
    return None


def resolve_ep(link):
    link = unquote(link)
    # capítulo de novela (painel1.novefx.biz / redirectnflix.com)
    if "novefx" in link or "painel1" in link or "redirectnflix" in link:
        direct = resolve_novefx_episode(link)
        if direct:
            return stream_result(direct)
    # página de episódio do dorama
    if "doramasonline" in link or "/br/episodio/" in link:
        direct = resolve_dorama_ep(link)
        if direct:
            return stream_result(direct)
    # página de episódio do Overflix (data-video-id -> playerData)
    if OVERFLIX_HOST in link or overflix_domain() in link or "overflix" in link:
        try:
            html = fetch_direct(link)
            m = re.search(r'data-video-id="(\d+)"', html)
            if m:
                direct = overflix_play(m.group(1), link)
                if direct:
                    return stream_result(direct)
        except Exception:
            pass
    # embeds do Overflix (mixdrop/streamtape)
    if "mixdrop" in link or "streamtape" in link or "myvidplay" in link or "doodstream" in link:
        direct = resolve_embed(link)
        if direct:
            return stream_result(direct)
    if link.startswith("movie2=") or link.startswith("serie3="):
        return dispatch(link)
    if re.search(r"\.(mp4|m3u8)(\?|$)", link, re.IGNORECASE):
        return stream_result(link)
    direct = embed_to_direct(link)
    if direct:
        return stream_result(direct)
    if re.match(r"^https?://", link, re.IGNORECASE):
        return stream_result(link)
    return error_result("Episódio indisponível no momento.")


# ---------------------------------------------------------------------------
# Despacho principal (resolver=0 -> opção crua do addon)
# ---------------------------------------------------------------------------
def dispatch(opt):
    opt = opt.strip()
    if opt.startswith("animes2="):
        return resolve_animes2(opt.split("=", 1)[1])
    if opt.startswith("movie2="):
        return resolve_overflix_movie(opt.split("=", 1)[1])
    if opt.startswith("serie3="):
        return resolve_overflix_series(opt.split("=", 1)[1])
    if opt.startswith("animes3="):
        return resolve_animes3(opt.split("=", 1)[1])
    if opt.startswith("doramas_resolver1="):
        return resolve_doramas(opt.split("=", 1)[1])
    if opt.startswith("novelas="):
        return resolve_novelas(opt.split("=", 1)[1])
    if opt.startswith("novelas2="):
        return resolve_novelas2(opt.split("=", 1)[1])
    if opt.startswith("ep="):
        return resolve_ep(opt.split("=", 1)[1])
    # link direto (mp4/m3u8)
    if re.match(r"^https?://", opt, re.IGNORECASE):
        return stream_result(opt)
    return error_result("Formato de link não reconhecido.")


def resolve(resolver, request):
    try:
        if resolver > 0:
            return resolve_api(resolver, request)
        return dispatch(request)
    except Exception as err:  # noqa: BLE001
        return error_result(str(err) or "Falha na resolução.")


# ---------------------------------------------------------------------------
# Servidor HTTP
# ---------------------------------------------------------------------------
class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):  # silencia logs por request
        pass

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")

    def _json(self, obj, status=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        path = urlparse(self.path).path.rstrip("/")
        if path.endswith("/resolver"):
            qs = parse_qs(urlparse(self.path).query)
            try:
                resolver = int(qs.get("resolver", ["0"])[0])
                request = qs.get("request", [""])[0]
                if not request:
                    self._json({"success": False, "error": "request obrigatório"}, 400)
                    return
                data = resolve(resolver, request)
                self._json({"success": True, "data": data})
            except Exception as err:  # noqa: BLE001
                self._json({"success": False, "error": str(err)}, 502)
            return
        if path in ("", "/"):
            self._json({"ok": True, "service": "binhoplay-resolver-bot"})
            return
        self._json({"success": False, "error": "not found"}, 404)


def main():
    port = int(os.environ.get("PORT", "8787"))
    server = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    print(f"Bot de resolução ouvindo em http://0.0.0.0:{port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
