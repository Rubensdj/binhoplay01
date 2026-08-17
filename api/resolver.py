#!/usr/bin/env python3
"""
Binho Play — Runtime do addon Kodi (v4).

Em vez de re-implementar (ou extrair) a lógica do addon, este bot EXECUTA o
addon real (plugin.video.BrazucaPlay.Matrix) como se fosse o Kodi:

  1. Baixa o ZIP do addon AO VIVO do repositório (mesmo URL que o Kodi usa:
     addons_matrix.xml -> datadir -> zip). Fallbacks: repo do GitHub (raw) e a
     cópia local embutida no deploy (addons/repo/Plugins/...).
  2. Decodifica a ofuscação (mesma camada zlib+base64 que o próprio addon usa).
  3. Executa o default.py com um shim do Kodi (xbmc/xbmcgui/xbmcplugin/
     xbmcaddon/xbmcvfs + six + requests + simplejson), capturando
     addDirectoryItem / setResolvedUrl.

Resultado: quando os desenvolvedores atualizam o addon (canais, hosts,
resolvers, bases XML — atualizações diárias), o site passa a usar a versão
nova AUTOMATICAMENTE, sem extração manual. Exatamente como o Kodi faz.

Endpoints:
  GET /                          -> health check
  GET /resolver?resolver=N&request=...  -> contrato antigo (stream/seasons/error)
  GET /tv                        -> canais ao vivo (grupos + canais do addon)
  GET /browse?url=<plugin-url>   -> navega um menu do addon (listing ou stream)
  GET /play?url=<plugin-url>     -> resolve um item reproduzível
  GET /search?q=...              -> busca ao vivo nos menus de pesquisa do addon
  GET /proxy?u=<url>&h=<json>    -> proxy de streams protegidos (Range + headers)

Como rodar localmente (opcional):
  PORT=8787 python3 api/resolver.py
  e configure VITE_BOT_URL=http://localhost:8787
"""
import base64
import glob
import json
import os
import re
import sys
import tempfile
import threading
import time
import types
import zlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, quote, unquote, urljoin, urlparse

# ---------------------------------------------------------------------------
# Fontes do addon (ao vivo primeiro, fallback local)
# ---------------------------------------------------------------------------
UPSTREAM_BASE = os.environ.get("RESOLVER_UPSTREAM", "https://skyrisk.github.io/brazucaplay")
GITHUB_BASE = os.environ.get("RESOLVER_GITHUB", "https://raw.githubusercontent.com/Rubensdj/brazucaplay/master")
ADDON_ID = "plugin.video.BrazucaPlay.Matrix"
REPO_XML = "addons/repo/addons_matrix.xml"
REPO_XML_MAIN = "addons/repo/addons.xml"
PLUGINS_DIR = "addons/repo/Plugins"

CACHE_DIR = os.path.join(tempfile.gettempdir(), "binho-addon")
ADDON_TTL = int(os.environ.get("RESOLVER_ADDON_TTL", "1800"))  # 30 min
PROFILE_DIR = os.path.join(CACHE_DIR, "profile")
ADDON_HOME = os.path.join(CACHE_DIR, "addon")

_lock = threading.Lock()  # serializa a execução do addon (Kodi é single-thread)

# ---------------------------------------------------------------------------
# Estado do shim (resetado a cada execução)
# ---------------------------------------------------------------------------
CAP = {"items": [], "ended": False, "stream": None, "failed": None}
SEARCH_Q = ""

SETTINGS = {
    "ch_layout": "false",
    "favoritos": "false",
    "features_enable": "false",
    "features_pass": "",
    "epg": "false",
    "canais_extra": "false",
    "controledospais": "true",
    "player_opt": "0",
    "player_f4m": "false",
    "ffmpeg_opt": "false",
    "repeat_opt": "false",
    "redecanais_opt": "false",
    "disable_canais_extra": "false",
    "epg_days": "2",
    "epg_last": "",
    "use_thumb": "false",
    "donate_consider": "true",
    "keyboard": "false",
    "wvmob_user": "",
    "wvmob_time": "",
}

KODI_TAG_RE = re.compile(r"\[/?[A-Za-z0-9 _.-]+\]|\[COLOR [^\]]+\]|\[/COLOR\]|\[CR\]|\[B\]|\[/B\]")


def clean_name(name):
    """Remove tags Kodi ([B], [COLOR ...]) de títulos e nomes."""
    if isinstance(name, bytes):
        name = name.decode("utf-8", "replace")
    name = str(name)
    return KODI_TAG_RE.sub("", name).replace("\n", " ").strip()


# ---------------------------------------------------------------------------
# Shim do Kodi
# ---------------------------------------------------------------------------
class VideoInfoTag:
    def __getattr__(self, _k):
        return lambda *a, **kw: None


class ListItem:
    def __init__(self, name="", path="", **kw):
        self._name = name.decode("utf-8", "replace") if isinstance(name, bytes) else str(name)
        self._path = path.decode("utf-8", "replace") if isinstance(path, bytes) else str(path)
        self.art = {}
        self.props = {}
        self.subs = []
        self._tag = VideoInfoTag()

    def setArt(self, art):
        self.art.update(art or {})

    def setInfo(self, *a, **kw):
        pass

    def getVideoInfoTag(self):
        return self._tag

    def setProperty(self, k, v):
        self.props[str(k)] = str(v)

    def getProperty(self, k):
        return self.props.get(str(k), "")

    def setPath(self, p):
        self._path = str(p)

    def setSubtitles(self, s):
        self.subs = s

    def setContentLookup(self, *a):
        pass

    def setMimeType(self, *a):
        pass


class Xbmc:
    @staticmethod
    def getInfoLabel(*_a):
        return "21.0"

    @staticmethod
    def executebuiltin(*_a, **_kw):
        pass

    @staticmethod
    def sleep(*_a):
        pass

    @staticmethod
    def getCondVisibility(*_a, **_kw):
        return False

    @staticmethod
    def log(*_a, **_kw):
        pass

    @staticmethod
    def translatePath(p):
        return p

    @staticmethod
    def getIPAddress():
        return "127.0.0.1"

    @staticmethod
    def getLanguage(*_a):
        return "Portuguese (Brazil)"

    LOGERROR = "ERROR"
    PLAYLIST_VIDEO = 1

    class PlayList:
        def __init__(self, *a):
            pass

        def clear(self):
            pass

        def add(self, *a):
            pass

    class Player:
        def play(self, *a, **kw):
            pass

        def isPlaying(self):
            return False

    class Monitor:
        def __init__(self, *a):
            pass

        def waitForAbort(self, *a):
            return True

        def abortRequested(self):
            return True

    class Keyboard:
        def __init__(self, message="", heading=""):
            pass

        def doModal(self):
            pass

        def isConfirmed(self):
            return True

        def getText(self):
            return SEARCH_Q


class Xbmcgui:
    ListItem = ListItem

    class Dialog:
        @staticmethod
        def ok(*a):
            return True

        @staticmethod
        def select(*a):
            return 0

        @staticmethod
        def yesno(*a):
            return True

        @staticmethod
        def input(*a, **kw):
            return SEARCH_Q

        @staticmethod
        def numeric(*a):
            return "0"

        @staticmethod
        def contextmenu(*a):
            return 0

        @staticmethod
        def notification(*a, **kw):
            return None

    class DialogProgress:
        def __init__(self, *a):
            pass

        def create(self, *a):
            pass

        def update(self, *a):
            pass

        def close(self):
            pass

        def iscanceled(self):
            return False


class Xbmcaddon:
    class Addon:
        def __init__(self, id_=""):
            self._id = id_

        def getSetting(self, k):
            return SETTINGS.get(k, "")

        def setSetting(self, k, v):
            SETTINGS[k] = str(v)

        def setSettingBool(self, k, v):
            SETTINGS[k] = "true" if v else "false"

        def getAddonInfo(self, k):
            return {
                "path": ADDON_HOME + "/",
                "profile": PROFILE_DIR + "/",
                "version": "2.1.4",
                "name": "BrazucaPlay Matrix",
                "id": "plugin.video.BrazucaPlay.Matrix",
                "icon": "",
            }.get(k, "")

        def getLocalizedString(self, *a):
            return ""

        def openSettings(self, *a):
            pass


class Xbmcplugin:
    @staticmethod
    def addDirectoryItem(handle, url, listitem, isFolder=True):
        CAP["items"].append(
            {
                "url": str(url),
                "name": clean_name(listitem._name),
                "folder": bool(isFolder),
                "thumb": listitem.art.get("thumb", ""),
                "fanart": listitem.art.get("fanart", ""),
                "path": str(listitem._path),
                "props": dict(listitem.props),
            }
        )
        return True

    @staticmethod
    def endOfDirectory(handle, succeeded=True, *_a, **_kw):
        CAP["ended"] = bool(succeeded)

    @staticmethod
    def setResolvedUrl(handle, succeeded, listitem):
        CAP["stream"] = str(listitem._path)
        CAP["ended"] = True

    @staticmethod
    def setContent(*a):
        pass

    @staticmethod
    def addSortMethod(*a):
        pass

    SORT_METHOD_LABEL = 0


class Xbmcvfs:
    @staticmethod
    def translatePath(p):
        # mapeia QUALQUER special:// (profile, userdata, …) para o cache do bot,
        # evitando que o addon escreva pastas soltas no diretório de trabalho
        return re.sub(r"special://[^/]*/?", PROFILE_DIR + "/", str(p))


def _install_module(name, obj):
    mod = types.ModuleType(name)
    for k, v in vars(obj).items():
        if k.startswith("__"):
            continue
        setattr(mod, k, v)
    sys.modules[name] = mod
    return mod


def _install_shims():
    _install_module("xbmc", Xbmc)
    _install_module("xbmcgui", Xbmcgui)
    _install_module("xbmcplugin", Xbmcplugin)
    _install_module("xbmcaddon", Xbmcaddon)
    _install_module("xbmcvfs", Xbmcvfs)
    _install_module("simplejson", __import__("json"))

    six_mod = types.ModuleType("six")
    six_mod.PY2 = False
    six_mod.PY3 = True
    six_mod.text_type = str
    six_mod.binary_type = bytes
    six_mod.string_types = (str,)
    six_mod.integer_types = (int,)
    six_mod.b = lambda s: s.encode() if isinstance(s, str) else s
    six_mod.ensure_str = lambda s, *a, **kw: s.decode() if isinstance(s, bytes) else s
    six_mod.ensure_binary = lambda s, *a, **kw: s.encode() if isinstance(s, str) else s
    six_mod.moves = types.ModuleType("six.moves")
    sys.modules["six"] = six_mod
    sys.modules["six.moves"] = six_mod.moves

    kodi_six = types.ModuleType("kodi_six")
    sys.modules["kodi_six"] = kodi_six
    for n in ("xbmc", "xbmcgui", "xbmcplugin", "xbmcaddon", "xbmcvfs"):
        setattr(kodi_six, n, sys.modules[n])


# ---------------------------------------------------------------------------
# Proxy residencial opcional (para fontes que bloqueiam IPs de datacenter)
# ---------------------------------------------------------------------------
# Alguns hosts (ex.: animesonlinecc.to) bloqueiam IPs de datacenter com
# Cloudflare ("Attention Required"). Nenhuma ferramenta de bypass resolve —
# só um proxy RESIDENCIAL. Se ANIME_PROXY estiver definido (ex.:
# http://user:pass@host:port), o bot roteia apenas os hosts de PROXY_HOSTS
# por ele. Sem a variável, nada muda (comportamento atual).
PROXY_URL = os.environ.get("ANIME_PROXY", "").strip()
PROXY_HOSTS = [h.strip() for h in os.environ.get("PROXY_HOSTS", "animesonlinecc.to").split(",") if h.strip()]

# Token opcional: se BOT_TOKEN estiver definido, TODAS as chamadas HTTP
# precisam de ?token=<BOT_TOKEN>. Protege a banda de um bot rodado em casa
# (Cloudflare Tunnel público) contra uso por terceiros. Sem a variável, o
# bot continua aberto (comportamento atual).
BOT_TOKEN = os.environ.get("BOT_TOKEN", "").strip()


def _install_proxy():
    """Injeta o proxy residencial só nas requisições para os hosts bloqueados."""
    if not PROXY_URL:
        return False
    try:
        import requests

        orig_session = requests.sessions.Session.request

        def wrapped(self, method, url, *a, **kw):
            if any(h in str(url) for h in PROXY_HOSTS):
                kw["proxies"] = {"http": PROXY_URL, "https": PROXY_URL}
            return orig_session(self, method, url, *a, **kw)

        requests.sessions.Session.request = wrapped

        orig_api = requests.api.request

        def wrapped_api(method, url, **kw):
            if any(h in str(url) for h in PROXY_HOSTS):
                kw["proxies"] = {"http": PROXY_URL, "https": PROXY_URL}
            return orig_api(method, url, **kw)

        requests.api.request = wrapped_api
        print(f"Proxy residencial ativo para: {', '.join(PROXY_HOSTS)}", flush=True)
        return True
    except Exception as e:  # noqa: BLE001
        print(f"Proxy residencial NÃO ativado: {e}", flush=True)
        return False


# ---------------------------------------------------------------------------
# Loader do addon (ao vivo com fallback)
# ---------------------------------------------------------------------------
_ADDON_STATE = {"src": None, "version": None, "source": None, "fetched": 0.0, "dir": None}


def _http_get(url, timeout=25):
    import requests  # declarado em requirements.txt

    resp = requests.get(url, timeout=timeout, headers={"User-Agent": "Mozilla/5.0"})
    resp.raise_for_status()
    return resp


def _find_version(xml_text):
    m = re.search(r'<addon id="' + re.escape(ADDON_ID) + r'"[^>]*version="([^"]+)"', xml_text)
    return m.group(1) if m else None


def _candidate_zip_urls():
    urls = []
    for base in (UPSTREAM_BASE, GITHUB_BASE):
        for xml_name in (REPO_XML, REPO_XML_MAIN):
            try:
                xml_url = f"{base}/{xml_name}"
                text = _http_get(xml_url).text
                ver = _find_version(text)
                if ver:
                    urls.append(
                        (f"{base}/{PLUGINS_DIR}/{ADDON_ID}/{ADDON_ID}-{ver}.zip", f"{base} ({xml_name}) v{ver}")
                    )
            except Exception:  # noqa: BLE001
                continue
    return urls


def _local_zip():
    for pattern in (
        os.path.join(os.path.dirname(__file__), "..", PLUGINS_DIR, ADDON_ID, "*.zip"),
        os.path.join(os.path.dirname(__file__), PLUGINS_DIR, ADDON_ID, "*.zip"),
        os.path.join(".", PLUGINS_DIR, ADDON_ID, "*.zip"),
    ):
        hits = sorted(glob.glob(pattern))
        if hits:
            return hits[-1]
    return None


def _decode_source(raw):
    src = raw
    for _ in range(8):
        idx = src.find(b"exec((_)(b'")
        if idx == -1:
            break
        blob = src[idx + 11:]
        end = blob.find(b"')")
        if end == -1:
            break
        src = zlib.decompress(base64.b64decode(blob[:end][::-1]))
    return src


def _load_addon(force=False):
    """Garante o addon decodificado em memória (TTL). Retorna dict de estado."""
    now = time.time()
    if not force and _ADDON_STATE["src"] and (now - _ADDON_STATE["fetched"]) < ADDON_TTL:
        return _ADDON_STATE

    state = {"src": None, "version": None, "source": "local", "fetched": now, "dir": None}
    zip_bytes = None
    label = "local"

    for url, src_label in _candidate_zip_urls():
        try:
            zip_bytes = _http_get(url).content
            label = src_label
            break
        except Exception:  # noqa: BLE001
            continue

    if zip_bytes is None:
        local = _local_zip()
        if local:
            with open(local, "rb") as f:
                zip_bytes = f.read()
            label = f"local ({os.path.basename(local)})"

    if not zip_bytes:
        raise RuntimeError("Addon indisponível (rede e cópia local falharam).")

    import io
    import zipfile

    addon_dir = os.path.join(CACHE_DIR, "addon-src")
    os.makedirs(addon_dir, exist_ok=True)
    zf = zipfile.ZipFile(io.BytesIO(zip_bytes))
    default_name = [n for n in zf.namelist() if n.endswith("default.py")]
    if not default_name:
        raise RuntimeError("ZIP do addon sem default.py")
    default_name = default_name[0]
    src = _decode_source(zf.read(default_name))
    # versão vinda do addon.xml dentro do zip
    version = None
    try:
        addon_xml = [n for n in zf.namelist() if n.endswith("addon.xml")][0]
        xml_text = zf.read(addon_xml).decode("utf-8", "replace")
        ver = re.search(r'<addon[^>]*id="' + re.escape(ADDON_ID) + r'"[^>]*version="([^"]+)"', xml_text)
        if not ver:
            ver = re.search(r'version="([^"]+)"', xml_text)
        version = ver.group(1) if ver else None
    except Exception:  # noqa: BLE001
        version = None
    # extrai os módulos auxiliares (codec.py etc.) para import
    for member in zf.namelist():
        if member.endswith(".py"):
            target = os.path.join(addon_dir, os.path.basename(member))
            with open(target, "wb") as f:
                f.write(zf.read(member))
    zf.close()

    os.makedirs(PROFILE_DIR, exist_ok=True)
    os.makedirs(ADDON_HOME, exist_ok=True)

    state["src"] = src
    state["dir"] = addon_dir
    state["source"] = label
    state["version"] = version
    _ADDON_STATE.update(state)
    return _ADDON_STATE


# ---------------------------------------------------------------------------
# Execução do addon
# ---------------------------------------------------------------------------
def run(params, search_q="", timeout=90):
    """Executa o addon para um conjunto de params (mode/url/name/...)."""
    global SEARCH_Q
    addon = _load_addon()
    params = dict(params)
    # o addon chama quote_plus() nesses campos — evita TypeError com None
    for k in ("iconimage", "fanart", "description", "subtitle", "genre", "date"):
        params.setdefault(k, "")
    SEARCH_Q = search_q
    CAP["items"] = []
    CAP["ended"] = False
    CAP["stream"] = None
    CAP["failed"] = None

    # IMPORTANTE: valores com URL-encode — o addon lê sys.argv[2] com parse_qs
    # e depende de valores intactos (ex.: url=serie3_temp=1&video_id=... — o &
    # interno pertence ao VALOR; sem encode ele vira separador e quebra o fluxo)
    qs = "&".join(f"{k}={quote(str(v), safe='')}" for k, v in params.items())
    sys.argv = ["plugin://" + ADDON_ID + "/", "0", "?" + qs]
    if addon["dir"] and addon["dir"] not in sys.path:
        sys.path.insert(0, addon["dir"])

    def _exec():
        try:
            # o addon decide o fluxo de pesquisa pela global pesquisa_desativar
            # (que só é setada em getData) — semeamos para o modo 20 perguntar
            # a query via Keyboard (shim devolve SEARCH_Q)
            ns = {"__name__": "__main__", "pesquisa_desativar": "false", "search": ""}
            exec(compile(addon["src"], "default.py", "exec"), ns)
        except SystemExit:
            pass
        except Exception as e:  # noqa: BLE001
            CAP["failed"] = f"{type(e).__name__}: {e}"

    t = threading.Thread(target=_exec, daemon=True)
    t.start()
    t.join(timeout)
    return {
        "items": list(CAP["items"]),
        "ended": CAP["ended"],
        "stream": CAP["stream"],
        "failed": CAP["failed"],
    }


def _parse_plugin_url(plugin_url):
    """Converte plugin://...?a=b&c=d em params. Também aceita dict direto.

    IMPORTANTE: o `#` NÃO é fragmento em URL de plugin do Kodi — é dado
    (ex.: url=#filmes_menu). Cortar em `#` quebra qualquer menu com prefixo
    # (já que o handler HTTP decodifica %23 antes de chegar aqui)."""
    if isinstance(plugin_url, dict):
        return dict(plugin_url)
    m = re.search(r"\?(.+)", plugin_url or "")
    if not m:
        return {}
    return {k: (v[0] if isinstance(v, list) else v) for k, v in parse_qs(m.group(1)).items()}


def _item_plugin_url(item):
    return item.get("url", "")


def _parse_headers_suffix(url):
    """Separa o sufixo |Header=value&... do estilo Kodi (pode estar em qualquer camada)."""
    headers = {}
    if "|" in url:
        base, _, tail = url.partition("|")
        if re.match(r"^https?://", base):
            url = base
            tail = tail.replace("|", "&")
            for k, v in parse_qs(tail).items():
                headers[k.strip()] = v[0] if v else ""
    return url, headers


def _unwrap_stream(raw):
    """Trata o proxy interno do addon e o sufixo de headers do Kodi (em todas as camadas)."""
    if not raw:
        return None, {}
    url = raw.strip()
    headers = {}

    url, h = _parse_headers_suffix(url)
    headers.update(h)

    # proxy interno do addon (codec/F4m): http://host:5000/?url=%68%74...
    # a URL interna decodificada pode conter outro sufixo de headers — repete
    for _ in range(3):
        m = re.match(r"^https?://[^/]+:\d+/.*[?&]url=([^&]+)", url)
        if not m:
            break
        inner = unquote(m.group(1))
        if not inner.startswith("http"):
            break
        url = inner
        url, h = _parse_headers_suffix(url)
        headers.update(h)

    return url, headers


def _friendly_error(raw):
    """Traduz erros internos do addon em mensagens claras para o usuário."""
    if not raw:
        return "Falha inesperada ao carregar este conteúdo."
    msg = str(raw)
    low = msg.lower()
    if any(k in low for k in ("indexerror", "keyerror", "attributeerror", "typeerror", "valueerror")):
        return (
            "A fonte deste título não retornou dados no momento "
            "(pode estar fora do ar ou bloqueando acessos automáticos). "
            "Tente outro título ou volte mais tarde."
        )
    if "connectionerror" in low or "timeout" in low or "max retries" in low or "proxyerror" in low:
        return "Falha de conexão com a fonte do conteúdo. Tente novamente em instantes."
    if "403" in msg or "forbidden" in low:
        return "A fonte deste conteúdo bloqueou o acesso automático (HTTP 403)."
    if "404" in msg or "not found" in low:
        return "A fonte não encontrou este conteúdo (pode ter sido removido)."
    return msg


def _is_header_item(item):
    """Itens-cabeçalho do addon (url=here / vazio) não são conteúdo reproduzível."""
    url = str(item.get("url", "") or "")
    if not url:
        return True
    params = _parse_plugin_url(url)
    u = params.get("url", "")
    return u in ("here", "") or url == "here"


def _mode_for_link(link):
    """Modo de navegação para um link do addon (derivado da tabela do próprio addon)."""
    if not link:
        return 16
    known = [
        ("#menu_canais_adults", 21), ("#menu_canais", 21),
        ("#novelas_menu", 25), ("#desenhos_menu", 28), ("#doramas_menu", 31),
        ("#doramas_list=", 6), ("#animes_menu", 22), ("#series_list=", 6),
        ("#animes_list=", 6), ("#novelas_list=", 6), ("#movies_pages=", 27),
        ("#series_pages=", 27), ("#trilogias_list", 3), ("#hub_categorias", 2),
        ("#search_hub", 2), ("#hub_menu", 2), ("serie3=", 26),
        ("bunnycdn_tvshows=", 31), ("resolver1_tvshows=", 31), ("resolver2_tvshows=", 31),
        ("resolver3_tvshows=", 31), ("resolver4_tvshows=", 31), ("resolver5_tvshows=", 31),
        ("doramas_resolver1=", 31), ("onedrive=", 31), ("novelas=", 25),
        ("novelas2=", 25), ("wvmob=", 30),
        ("animes2=", 22), ("animes3=", 22), ("animes4=", 22), ("animes5=", 22),
        ("#animes3_temp=", 22), ("#animes2_temp=", 22),
        ("#novelas2_temp=", 25), ("novelas_temp=", 25),
        ("#doramas_temp=", 31), ("doramas_resolver1_temp=", 31),
        ("#desenhos_temp=", 28), ("desenhos2=", 28), ("desenhos3=", 28),
    ]
    for prefix, mode in known:
        if link.startswith(prefix):
            return mode
    if re.match(r"^resolver\d+_mv=", link) or link.startswith("movie2=") or link.startswith("bunnycdn_mv="):
        return 16
    return 16


def _is_series_link(link):
    return _mode_for_link(link) not in (16,)


# ---------------------------------------------------------------------------
# Lógica dos endpoints
# ---------------------------------------------------------------------------
_CACHE = {}
_CACHE_LOCK = threading.Lock()


def _cached(key, ttl, producer):
    with _CACHE_LOCK:
        hit = _CACHE.get(key)
        if hit and time.time() - hit[0] < ttl:
            return hit[1]
    value = producer()
    with _CACHE_LOCK:
        _CACHE[key] = (time.time(), value)
    return value


def resolve(resolver, request):
    """Contrato antigo: filme -> stream; série -> seasons; senão error."""
    request = unquote(request)
    if not request:
        return {"kind": "error", "message": "request vazio."}

    # formato antigo mvshows=slug -> resolverN_mv=slug
    m = re.match(r"^(resolver\d+)_mv=(.+)$", request)
    if m:
        request = f"resolver{m.group(1)[8:]}_mv={m.group(2)}"
    m = re.match(r"^mvshows=(.+)$", request)
    if m:
        request = f"resolver{resolver or 1}_mv={m.group(1)}"
    m = re.match(r"^tvshows=(.+)$", request)
    if m:
        request = f"resolver{resolver or 1}_tvshows={m.group(1)}"
    if request.startswith("ep="):
        # episódio direto: request é um plugin-url
        plugin_url = request[3:]
        params = _parse_plugin_url(plugin_url)
        params.setdefault("mode", "16")
        return _resolve_stream(params)

    # #series_list=A|B|C -> tenta cada opção
    if request.startswith("#"):
        options = request.split("=", 1)[1].split("|") if "=" in request else []
        last = None
        for opt in options:
            res = _try_link(opt)
            if res["kind"] == "error":
                last = res
                continue
            return res
        return last or {"kind": "error", "message": "Nenhuma opção disponível."}

    return _try_link(request)


def _try_link(link):
    if _is_series_link(link):
        return _cached(
            "seasons:" + link,
            1800,
            lambda: _resolve_seasons(link),
        )
    return _resolve_stream({"mode": "16", "url": link, "name": link})


def _resolve_stream(params):
    try:
        r = _run_retry(params, timeout=90)
    except Exception as e:  # noqa: BLE001
        return {"kind": "error", "message": _friendly_error(str(e))}
    if r["failed"]:
        return {"kind": "error", "message": _friendly_error(r["failed"])}
    url, headers = _unwrap_stream(r["stream"])
    if url and url.startswith("http"):
        return {
            "kind": "stream",
            "stream": url,
            "headers": headers or None,
        }
    if r["items"]:
        # o addon devolveu um menu em vez de stream (ex.: série)
        return _listing_to_resolve(r["items"])
    return {"kind": "error", "message": "Stream indisponível no momento."}


def _resolve_seasons(link):
    mode = _mode_for_link(link)
    first = run({"mode": str(mode), "url": link, "name": link}, timeout=90)
    if first["failed"]:
        return {"kind": "error", "message": _friendly_error(first["failed"])}
    return _listing_to_resolve(first["items"])


def _listing_to_resolve(items):
    """Transforma uma listagem do addon no contrato {kind: seasons}."""
    folders = [it for it in items if it["folder"]]
    playable = [it for it in items if not it["folder"] and "mode=16" in it["url"]]
    seasons = []

    if folders:
        for folder in folders[:8]:
            r = run(_parse_plugin_url(folder["url"]), timeout=60)
            if r["failed"] or not r["items"]:
                continue
            eps = []
            for it in r["items"]:
                if it["folder"] or "mode=16" not in it["url"]:
                    continue
                eps.append(_episode_item(it))
            if eps:
                seasons.append({"name": folder["name"], "episodes": eps})
    elif playable:
        seasons.append({"name": "Temporada 1", "episodes": [_episode_item(it) for it in playable]})

    if not seasons:
        return {"kind": "error", "message": "Nenhum episódio disponível no momento."}
    return {"kind": "seasons", "seasons": seasons}


def _episode_item(item):
    return {
        "name": item["name"],
        "link": item["url"],
        "direct": False,
        "resolver": 0,
    }


def live_tv():
    """Canais ao vivo: menu TV -> grupos -> canais (mode 16) / submenus."""
    def produce():
        r = run({"mode": "21", "url": "#menu_canais"}, timeout=90)
        if r["failed"]:
            return {"error": _friendly_error(r["failed"]), "groups": []}
        groups = []
        for group in r["items"]:
            if not group["folder"]:
                continue
            g = {"name": group["name"], "thumb": group["thumb"], "channels": []}
            gr = run(_parse_plugin_url(group["url"]), timeout=90)
            if gr["failed"]:
                groups.append(g)
                continue
            for ch in gr["items"]:
                ch_url = _parse_plugin_url(ch["url"])
                if ch_url.get("url") in ("here", "") or not ch["url"]:
                    continue  # cabeçalho de seção, não é canal
                if "mode=16" in ch["url"]:
                    g["channels"].append(
                        {
                            "name": ch["name"],
                            "thumb": ch["thumb"] or group["thumb"],
                            "url": ch["url"],
                            "folder": False,
                        }
                    )
                elif ch["folder"]:
                    g["channels"].append(
                        {"name": ch["name"], "thumb": ch["thumb"] or group["thumb"], "url": ch["url"], "folder": True}
                    )
            groups.append(g)
        return {"groups": groups, "total": sum(len(g["channels"]) for g in groups)}

    return _cached("tv", 600, produce)


def _run_retry(params, search_q="", timeout=90, tries=2):
    """Executa o addon com 1 nova tentativa em falhas transitórias (rede/dados)."""
    last = None
    for i in range(tries):
        r = run(params, search_q=search_q, timeout=timeout)
        if not r["failed"]:
            return r
        last = r
        if i + 1 < tries:
            time.sleep(0.5)
    return last


def _listing_payload(r):
    """Converte items do addon no contrato do bot, descartando cabeçalhos (url=here)."""
    items = []
    for it in r["items"]:
        if _is_header_item(it):
            continue
        items.append(
            {
                "name": it["name"],
                "url": it["url"],
                "folder": it["folder"],
                "thumb": it["thumb"],
                "fanart": it["fanart"],
            }
        )
    return items


def browse(plugin_url, search_q=""):
    """Navega um plugin-url do addon."""
    params = _parse_plugin_url(plugin_url)
    if not params:
        return {"type": "error", "message": "URL de navegação inválida."}
    r = _run_retry(params, search_q=search_q, timeout=90)
    if r["failed"]:
        return {"type": "error", "message": _friendly_error(r["failed"])}
    url, headers = _unwrap_stream(r["stream"])
    if url and url.startswith("http"):
        return {"type": "stream", "stream": url, "headers": headers or None}
    return {"type": "listing", "items": _listing_payload(r)}


def play(plugin_url):
    """Resolve um item reproduzível (mode 16)."""
    params = _parse_plugin_url(plugin_url)
    params.setdefault("mode", "16")
    res = _resolve_stream(params)
    return {"type": "stream" if res["kind"] == "stream" else "error", **res}


SEARCH_MENUS = [
    ("filmes", "27", "#filmes_menu"),
    ("series", "27", "#series_menu"),
    ("animes", "22", "#animes_menu"),
    ("doramas", "31", "#doramas_menu"),
    ("novelas", "25", "#novelas_menu"),
    ("desenhos", "28", "#desenhos_menu"),
]


def search(q, categories=None):
    """Busca ao vivo: navega o menu da categoria, acha o item PESQUISAR, executa."""
    q = q.strip()
    if not q:
        return {"type": "error", "message": "Busca vazia."}
    wanted = categories or [c for c, _, _ in SEARCH_MENUS]
    results = []

    for cat, mode, menu_url in SEARCH_MENUS:
        if cat not in wanted:
            continue
        try:
            menu = run({"mode": mode, "url": menu_url}, timeout=60)
            if menu["failed"]:
                continue
            search_item = None
            for it in menu["items"]:
                if "PESQUIS" in it["name"].upper():
                    search_item = it
                    break
            if not search_item:
                continue
            res = _run_retry(_parse_plugin_url(search_item["url"]), search_q=q, timeout=60)
            if res["failed"]:
                continue
            for it in res["items"]:
                if _is_header_item(it):
                    continue
                results.append(
                    {
                        "name": it["name"],
                        "url": it["url"],
                        "folder": it["folder"],
                        "thumb": it["thumb"],
                        "fanart": it["fanart"],
                        "category": cat,
                    }
                )
        except Exception:  # noqa: BLE001
            continue

    if not results:
        return {"type": "error", "message": "Nada encontrado ao vivo."}
    return {"type": "listing", "items": results}


# ---------------------------------------------------------------------------
# Proxy de streams protegidos (Range + headers + reescrita HLS)
# ---------------------------------------------------------------------------
def _rewrite_hls(body, base_url, headers):
    """Reescreve um manifest HLS para que segmentos/chaves/playlists passem
    pelo proxy (com os mesmos headers). Sem isso, o hls.js resolve URIs
    relativas contra a URL do proxy e os segmentos quebram (404/403)."""
    h_json = json.dumps(headers or {}, ensure_ascii=False)

    def proxy_for(target):
        u = "proxy?u=" + quote(target, safe="") + "&h=" + quote(h_json, safe="")
        if BOT_TOKEN:
            u += "&token=" + quote(BOT_TOKEN, safe="")
        return u

    def rewrite_uri(uri):
        if not uri or uri.startswith("proxy?") or uri.startswith("data:"):
            return uri
        return proxy_for(urljoin(base_url, uri))

    out = []
    for line in body.splitlines():
        s = line.strip()
        if s.startswith("#EXT-X-") and 'URI="' in s:
            line = re.sub(r'URI="([^"]+)"', lambda m: 'URI="' + rewrite_uri(m.group(1)) + '"', line)
        elif s and not s.startswith("#"):
            line = rewrite_uri(s)
        out.append(line)
    return "\n".join(out) + "\n"


def stream_proxy(url, headers_json, range_header):
    import requests

    headers = {}
    try:
        headers = json.loads(headers_json or "{}")
    except Exception:  # noqa: BLE001
        headers = {}
    headers.setdefault("User-Agent", "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36")

    def do_request(range_):
        h = dict(headers)
        if range_:
            h["Range"] = range_
        req = requests.get(url, headers=h, stream=True, timeout=30, allow_redirects=True)
        return req

    req = do_request(range_header)
    if req.status_code == 403 and "Referer" in headers:
        del headers["Referer"]
        req = do_request(range_header)
    return req


def _is_hls_response(req, url):
    """HLS quando o Content-Type diz mpegurl ou a URL termina em .m3u8.
    NÃO consome o stream aqui (evita perder bytes do corpo)."""
    ctype = (req.headers.get("Content-Type") or "").lower()
    if "mpegurl" in ctype:
        return True
    return url.lower().endswith((".m3u8", ".m3u"))


# ---------------------------------------------------------------------------
# Servidor HTTP
# ---------------------------------------------------------------------------
class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):  # silencia logs por request
        pass

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, Range")

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

    def _auth_ok(self, qs):
        return not BOT_TOKEN or qs.get("token", [""])[0] == BOT_TOKEN

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/")
        qs = parse_qs(parsed.query)
        if not self._auth_ok(qs):
            self._json({"success": False, "error": "token inválido"}, 401)
            return
        try:
            if path.endswith("/resolver"):
                resolver = int(qs.get("resolver", ["0"])[0])
                request = qs.get("request", [""])[0]
                if not request:
                    self._json({"success": False, "error": "request obrigatório"}, 400)
                    return
                with _lock:
                    data = resolve(resolver, request)
                self._json({"success": True, "data": data})
                return
            if path.endswith("/tv"):
                with _lock:
                    data = live_tv()
                if "error" in data:
                    self._json({"success": False, "error": data["error"]}, 502)
                    return
                self._json({"success": True, "data": data})
                return
            if path.endswith("/browse"):
                url = qs.get("url", [""])[0]
                q = qs.get("q", [""])[0]
                with _lock:
                    data = browse(url, search_q=q)
                self._json({"success": True, "data": data})
                return
            if path.endswith("/play"):
                url = qs.get("url", [""])[0]
                with _lock:
                    data = play(url)
                self._json({"success": True, "data": data})
                return
            if path.endswith("/search"):
                q = qs.get("q", [""])[0]
                cats = qs.get("categorias", [None])[0]
                wanted = cats.split(",") if cats else None
                with _lock:
                    data = search(q, wanted)
                self._json({"success": True, "data": data})
                return
            if path.endswith("/proxy"):
                self._handle_proxy(qs)
                return
            if path in ("", "/"):
                addon = _load_addon()
                self._json(
                    {
                        "ok": True,
                        "service": "binhoplay-kodi-runtime",
                        "addonVersion": addon["version"],
                        "source": addon["source"],
                        "updatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(addon["fetched"])),
                    }
                )
                return
            self._json({"success": False, "error": "not found"}, 404)
        except Exception as err:  # noqa: BLE001
            self._json({"success": False, "error": str(err)}, 502)

    def _handle_proxy(self, qs):
        url = qs.get("u", [""])[0]
        if not url.startswith("http"):
            self._json({"success": False, "error": "url inválida"}, 400)
            return
        headers_json = qs.get("h", [""])[0]
        range_header = self.headers.get("Range")
        try:
            req = stream_proxy(url, headers_json, range_header)
        except Exception as err:  # noqa: BLE001
            self._json({"success": False, "error": str(err)}, 502)
            return
        if req.status_code >= 400:
            self._json({"success": False, "error": f"upstream HTTP {req.status_code}"}, 502)
            req.close()
            return

        # HLS: baixa o manifest inteiro e reescreve os URIs para o proxy,
        # senão os segmentos relativos quebram no navegador.
        try:
            if _is_hls_response(req, url):
                chunks = []
                total = 0
                for chunk in req.iter_content(64 * 1024):
                    chunks.append(chunk)
                    total += len(chunk)
                    if total > 8 * 1024 * 1024:  # >8MB não é manifest
                        break
                body = b"".join(chunks)
                req.close()
                is_hls = body.lstrip().startswith(b"#EXTM3U") or "mpegurl" in (req.headers.get("Content-Type") or "").lower()
                if is_hls:
                    rewritten = _rewrite_hls(body.decode("utf-8", "replace"), url, json.loads(headers_json or "{}") or {})
                    data = rewritten.encode("utf-8")
                    self.send_response(200)
                    self.send_header("Content-Type", "application/vnd.apple.mpegurl; charset=utf-8")
                    self.send_header("Content-Length", str(len(data)))
                    self._cors()
                    self.end_headers()
                    self.wfile.write(data)
                    return
                # URL .m3u8 mas corpo não-HLS: devolve o corpo como veio
                self.send_response(200)
                self.send_header("Content-Type", req.headers.get("Content-Type") or "application/octet-stream")
                self.send_header("Content-Length", str(len(body)))
                self._cors()
                self.end_headers()
                self.wfile.write(body)
                return
        except Exception as err:  # noqa: BLE001
            # se a reescrita falhar, tenta o streaming normal abaixo
            try:
                req.close()
            except Exception:  # noqa: BLE001
                pass
            self._json({"success": False, "error": "proxy HLS: " + str(err)}, 502)
            return

        self.send_response(req.status_code)
        for header in ("Content-Type", "Content-Length", "Accept-Ranges", "Content-Range", "Content-Disposition", "Content-Encoding"):
            value = req.headers.get(header)
            if value:
                self.send_header(header, value)
        self._cors()
        self.end_headers()
        try:
            for chunk in req.iter_content(64 * 1024):
                self.wfile.write(chunk)
        except (BrokenPipeError, ConnectionResetError):
            pass
        finally:
            req.close()


def main():
    port = int(os.environ.get("PORT", "8787"))
    _install_shims()
    _install_proxy()
    server = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    print(f"Runtime do addon Kodi ouvindo em http://0.0.0.0:{port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        _install_shims()
        _install_proxy()
        addon = _load_addon()
        print("addon:", addon["version"], "| source:", addon["source"])
        r = run({"mode": "0"})
        print("home failed:", r["failed"], "| items:", len(r["items"]))
        for it in r["items"][:7]:
            print("  -", it["name"][:50])
        sys.exit(0)
    main()
