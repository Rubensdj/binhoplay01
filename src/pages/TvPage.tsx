import { useEffect, useMemo, useState } from "react";
import { catalog, formatTime, type Channel, type EpgData, type Program } from "../catalog";
import LiveModal from "../components/LiveModal";
import { getFavorites, toggleFavorite } from "../lib/favorites";
import { useAdminData } from "../lib/adminStore";
import { currentUser } from "../lib/auth";
import { livePlay, liveTv, playbackUrl, type LiveItem, type LiveTvGroup } from "../lib/live";
import type { Route } from "../lib/router";

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      className={`h-4 w-4 ${filled ? "text-rose-400" : "text-slate-500"}`}
      fill={filled ? "currentColor" : "none"}
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 21s-7.5-4.7-10-9.3C.6 8.6 2.5 5 6 5c2.2 0 3.6 1.2 4.4 2.5h3.2C14.4 6.2 15.8 5 18 5c3.5 0 5.4 3.6 4 6.7C19.5 16.3 12 21 12 21z"
      />
    </svg>
  );
}

function isAiring(program: Program, now: number): boolean {
  const start = Date.parse(program.start);
  const stop = Date.parse(program.stop);
  return Number.isFinite(start) && Number.isFinite(stop) && start <= now && now < stop;
}

function ChannelDetail({
  channel,
  programs,
  isFavorite,
  onToggleFavorite,
  onPlay,
  onClose,
}: {
  channel: LiveItem;
  programs: Program[];
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onPlay: () => void;
  onClose: () => void;
}) {
  const now = Date.now();
  const airing = programs.find((p) => isAiring(p, now));
  const upcoming = programs.filter((p) => Date.parse(p.start) > now).slice(0, 8);
  const list = airing ? [...upcoming] : upcoming;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-white/10 bg-ink-900 p-6 shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-4">
          {channel.thumb ? (
            <img
              src={channel.thumb}
              alt=""
              className="h-16 w-16 shrink-0 rounded-2xl bg-ink-800 object-contain p-1 ring-1 ring-white/10"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          ) : (
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-accent-600 text-xl font-black text-white">
              {channel.name.charAt(0)}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-bold text-white">{channel.name}</h3>
            <p className="mt-0.5 text-xs text-slate-500">Canal ao vivo · atualizado pelo addon</p>
          </div>
          <button
            type="button"
            onClick={onToggleFavorite}
            aria-label={isFavorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}
            className="rounded-full border border-white/10 p-2 transition hover:bg-white/5"
          >
            <HeartIcon filled={isFavorite} />
          </button>
        </div>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={onPlay}
            className="flex-1 rounded-xl bg-gradient-to-r from-brand-500 to-accent-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-brand-600/25 transition hover:brightness-110"
          >
            ▶ Assistir agora
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/10 px-5 py-3 text-sm font-medium text-slate-300 transition hover:bg-white/5"
          >
            Fechar
          </button>
        </div>

        {airing && (
          <div className="mt-5 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">No ar agora</p>
            <p className="mt-1 text-sm font-semibold text-emerald-300">{airing.title}</p>
            {airing.desc && <p className="mt-1 text-xs leading-relaxed text-slate-400">{airing.desc}</p>}
            <p className="mt-2 text-[11px] text-slate-500">
              {formatTime(airing.start)} – {formatTime(airing.stop)}
            </p>
          </div>
        )}
        {list.length > 0 && (
          <ul className="mt-4 divide-y divide-white/5">
            {list.map((p, i) => (
              <li key={`${p.start}-${i}`} className="py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm font-medium text-slate-200">{p.title}</p>
                  <span className="shrink-0 text-[11px] text-slate-500">{formatTime(p.start)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** Busca o EPG pelo nome do canal (chave sem acentos/espaços). */
function epgFor(channelName: string, epg: EpgData | null): Program[] {
  if (!epg) return [];
  const key = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  const wanted = key(channelName);
  const exact = epg.channels[key(channelName)];
  if (exact) return exact;
  for (const [k, v] of Object.entries(epg.channels)) {
    if (k && wanted.includes(key(k)) && v.length > 0) return v;
  }
  return [];
}

export default function TvPage({ navigate }: { navigate: (route: Route) => void }) {
  const { clients } = useAdminData();
  const [query, setQuery] = useState("");
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [favorites, setFavorites] = useState<string[]>(() => getFavorites());
  const [selected, setSelected] = useState<LiveItem | null>(null);
  const [liveFolder, setLiveFolder] = useState<LiveItem | null>(null);
  const [epg, setEpg] = useState<EpgData | null>(null);
  const [groups, setGroups] = useState<LiveTvGroup[] | null>(null);
  const [source, setSource] = useState<"live" | "static" | "loading">("loading");
  const [error, setError] = useState<string | null>(null);

  // Acessos do cliente logado: sem TV ao vivo, a página mostra um aviso.
  const tvAllowed = useMemo(() => {
    const email = currentUser();
    if (!email) return true;
    const record = clients.find((c) => c.email.trim().toLowerCase() === email.trim().toLowerCase());
    return record?.access?.tv ?? true;
  }, [clients]);

  useEffect(() => {
    let alive = true;
    liveTv()
      .then((data) => {
        if (!alive) return;
        if (data.total > 0) {
          setGroups(data.groups);
          setSource("live");
        } else {
          setSource("static");
          setError("O addon não retornou canais — usando catálogo embutido.");
        }
      })
      .catch(() => {
        if (alive) {
          setSource("static");
          setError("Runtime do addon indisponível — usando catálogo embutido.");
        }
      });
    fetch("/epg.json")
      .then((r) => r.json())
      .then((data) => {
        if (alive) setEpg(data as EpgData);
      })
      .catch(() => {
        // EPG indisponível — canais continuam navegáveis sem guia.
      });
    return () => {
      alive = false;
    };
  }, []);

  const channels = useMemo<LiveItem[]>(() => {
    if (source === "live" && groups) {
      return groups.flatMap((g) => g.channels);
    }
    if (source === "static") {
      return catalog.channels
        .filter((c: Channel) => c.streamUrl)
        .map((c: Channel) => ({
          name: c.name,
          thumb: c.logo ?? "",
          fanart: "",
          folder: false,
          url: c.streamUrl ?? "",
        }));
    }
    return [];
  }, [source, groups]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return channels.filter((ch) => {
      if (onlyFavorites && !favorites.includes(ch.name)) return false;
      if (!q) return true;
      return ch.name.toLowerCase().includes(q);
    });
  }, [channels, query, onlyFavorites, favorites]);

  const toggleFav = (name: string) => setFavorites(toggleFavorite(name));

  const playChannel = (channel: LiveItem) => {
    setSelected(null);
    if (channel.url.startsWith("http")) {
      navigate({ page: "player", url: channel.url, title: channel.name });
      return;
    }
    setBusyName(channel.name);
    livePlay(channel.url)
      .then((res) => {
        if (res.type === "stream") {
          navigate({
            page: "player",
            url: playbackUrl(res.stream, res.headers),
            title: channel.name,
          });
        } else if (res.type === "listing") {
          setLiveFolder(channel);
        } else {
          setError(res.message);
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Erro ao abrir o canal."))
      .finally(() => setBusyName(null));
  };

  const [busyName, setBusyName] = useState<string | null>(null);

  return (
    <section className="pt-20">
      <div className="mx-auto max-w-6xl px-5 py-10">
        <div className="max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-brand-400">TV ao Vivo</p>
          <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">Canais de TV</h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-400">
            {source === "live" && groups
              ? `${groups.reduce((n, g) => n + g.channels.length, 0)} canais ao vivo, direto do addon (atualiza sozinho).`
              : source === "static"
                ? `${catalog.channels.length} canais do catálogo embutido.`
                : "Carregando canais ao vivo…"}
          </p>
        </div>

        {source === "live" && (
          <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/5 px-3 py-1 text-[11px] font-semibold text-emerald-300">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
            AO VIVO — mesmo catálogo do addon no Kodi
          </div>
        )}

        {!tvAllowed && (
          <div className="mt-8 rounded-2xl border border-dashed border-white/10 py-14 text-center">
            <p className="text-lg font-bold text-slate-300">Seu plano não inclui TV ao vivo</p>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-500">
              Fale com quem vendeu seu acesso para liberar os canais.
            </p>
          </div>
        )}

        {tvAllowed && (
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-sm">
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar canal…"
                className="w-full rounded-xl border border-white/10 bg-ink-800/80 py-2.5 pl-10 pr-4 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-brand-500/60 focus:ring-2 focus:ring-brand-500/20"
              />
              <svg
                className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 10.5a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z" />
              </svg>
            </div>
            <button
              type="button"
              onClick={() => setOnlyFavorites((v) => !v)}
              className={
                onlyFavorites
                  ? "rounded-full bg-rose-500/20 px-4 py-2 text-sm font-semibold text-rose-300 ring-1 ring-rose-500/30"
                  : "rounded-full border border-white/10 px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-white/5"
              }
            >
              ♥ Favoritos {favorites.length > 0 && `(${favorites.length})`}
            </button>
          </div>
        )}

        {error && (
          <p className="mt-6 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-xs font-medium text-amber-200">
            {error}
          </p>
        )}

        {tvAllowed && source === "loading" && (
          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="h-28 animate-pulse rounded-2xl bg-ink-800/80" />
            ))}
          </div>
        )}

        {tvAllowed && source !== "loading" && filtered.length === 0 && (
          <div className="mt-10 rounded-2xl border border-dashed border-white/10 py-16 text-center text-sm text-slate-500">
            Nenhum canal encontrado{query.trim() ? ` para “${query.trim()}”` : ""}.
          </div>
        )}

        {tvAllowed && source === "live" && groups && (
          <div className="mt-8 space-y-10">
            {groups.map((group) => {
              const list = group.channels.filter((ch) => {
                if (onlyFavorites && !favorites.includes(ch.name)) return false;
                const q = query.trim().toLowerCase();
                return !q || ch.name.toLowerCase().includes(q);
              });
              if (list.length === 0) return null;
              return (
                <div key={group.name}>
                  <h3 className="text-sm font-extrabold uppercase tracking-[0.2em] text-slate-400">
                    {group.name.replace(/^[^\wÀ-ÿ]+/, "")}
                  </h3>
                  <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                    {list.map((channel) => {
                      const fav = favorites.includes(channel.name);
                      return (
                        <button
                          key={channel.name}
                          type="button"
                          disabled={busyName === channel.name}
                          onClick={() =>
                            channel.folder ? setLiveFolder(channel) : setSelected(channel)
                          }
                          className="group relative flex flex-col items-center gap-3 rounded-2xl border border-white/5 bg-ink-800/70 p-5 text-center shadow-lg shadow-black/20 transition hover:-translate-y-1 hover:border-brand-500/30 hover:shadow-xl disabled:opacity-60"
                        >
                          <span
                            role="button"
                            tabIndex={0}
                            aria-label={fav ? "Remover dos favoritos" : "Adicionar aos favoritos"}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleFav(channel.name);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                e.stopPropagation();
                                toggleFav(channel.name);
                              }
                            }}
                            className="absolute right-2.5 top-2.5 rounded-full p-1.5 transition hover:bg-white/10"
                          >
                            <HeartIcon filled={fav} />
                          </span>
                          {channel.thumb ? (
                            <img
                              src={channel.thumb}
                              alt=""
                              loading="lazy"
                              className="h-14 w-14 rounded-xl bg-ink-800 object-contain p-1 ring-1 ring-white/10 transition group-hover:ring-brand-500/40"
                              onError={(e) => {
                                e.currentTarget.style.display = "none";
                              }}
                            />
                          ) : (
                            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-accent-600 text-lg font-black text-white">
                              {channel.name.replace(/^\W+/, "").charAt(0).toUpperCase()}
                            </div>
                          )}
                          <span className="line-clamp-2 text-sm font-semibold text-slate-200 group-hover:text-white">
                            {busyName === channel.name ? "Abrindo…" : channel.name}
                          </span>
                          {channel.folder && (
                            <span className="text-[10px] font-bold uppercase tracking-wider text-brand-400">
                              Ver opções
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {tvAllowed && source === "static" && (
          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {filtered.map((channel) => {
              const fav = favorites.includes(channel.name);
              return (
                <button
                  key={channel.name}
                  type="button"
                  onClick={() => setSelected(channel)}
                  className="group relative flex flex-col items-center gap-3 rounded-2xl border border-white/5 bg-ink-800/70 p-5 text-center shadow-lg shadow-black/20 transition hover:-translate-y-1 hover:border-brand-500/30 hover:shadow-xl"
                >
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label={fav ? "Remover dos favoritos" : "Adicionar aos favoritos"}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFav(channel.name);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        e.stopPropagation();
                        toggleFav(channel.name);
                      }
                    }}
                    className="absolute right-2.5 top-2.5 rounded-full p-1.5 transition hover:bg-white/10"
                  >
                    <HeartIcon filled={fav} />
                  </span>
                  {channel.thumb ? (
                    <img
                      src={channel.thumb}
                      alt=""
                      loading="lazy"
                      className="h-14 w-14 rounded-xl bg-ink-800 object-contain p-1 ring-1 ring-white/10 transition group-hover:ring-brand-500/40"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                  ) : (
                    <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-accent-600 text-lg font-black text-white">
                      {channel.name.charAt(0)}
                    </div>
                  )}
                  <span className="line-clamp-2 text-sm font-semibold text-slate-200 group-hover:text-white">
                    {channel.name}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {selected && (
        <ChannelDetail
          channel={selected}
          programs={epgFor(selected.name, epg)}
          isFavorite={favorites.includes(selected.name)}
          onToggleFavorite={() => toggleFav(selected.name)}
          onPlay={() => playChannel(selected)}
          onClose={() => setSelected(null)}
        />
      )}
      {liveFolder && <LiveModal item={liveFolder} onClose={() => setLiveFolder(null)} navigate={navigate} />}
    </section>
  );
}
