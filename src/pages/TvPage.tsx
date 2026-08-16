import { useEffect, useMemo, useState } from "react";
import {
  catalog,
  formatTime,
  type Channel,
  type EpgData,
  type Program,
} from "../catalog";
import { getFavorites, toggleFavorite } from "../lib/favorites";
import type { Route } from "../lib/router";

const DEMO_STREAM_URL =
  catalog.demoVideos.find((v) => v.id === "demo-hls")?.url ?? "";

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
  channel: Channel;
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-white/10 bg-ink-900 p-6 shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-4">
          {channel.logo ? (
            <img
              src={channel.logo}
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
            <p className="mt-0.5 text-xs text-slate-500">Canal · guia de programação</p>
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

        {!channel.streamUrl && (
          <p className="mt-3 rounded-lg bg-amber-500/5 px-3 py-2 text-xs leading-relaxed text-amber-200/70">
            O repositório não expõe a URL de stream deste canal nos metadados. Reproduzindo um
            sinal de demonstração — adicione a URL real em{" "}
            <code className="rounded bg-white/10 px-1 py-0.5 text-[10px]">channel-streams.json</code>.
          </p>
        )}

        <div className="mt-5">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
            {airing ? "No ar agora" : "Programação"}
          </h4>
          {airing && (
            <div className="mt-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
              <p className="text-sm font-semibold text-emerald-300">{airing.title}</p>
              {airing.desc && <p className="mt-1 text-xs leading-relaxed text-slate-400">{airing.desc}</p>}
              <p className="mt-2 text-[11px] text-slate-500">
                {formatTime(airing.start)} – {formatTime(airing.stop)}
              </p>
            </div>
          )}
          {list.length > 0 ? (
            <ul className="mt-3 divide-y divide-white/5">
              {list.map((p, i) => (
                <li key={`${p.start}-${i}`} className="py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-sm font-medium text-slate-200">{p.title}</p>
                    <span className="shrink-0 text-[11px] text-slate-500">{formatTime(p.start)}</span>
                  </div>
                  {p.desc && <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-500">{p.desc}</p>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-slate-500">Sem programação disponível para este canal.</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function TvPage({ navigate }: { navigate: (route: Route) => void }) {
  const [query, setQuery] = useState("");
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [favorites, setFavorites] = useState<string[]>(() => getFavorites());
  const [selected, setSelected] = useState<Channel | null>(null);
  const [epg, setEpg] = useState<EpgData | null>(null);

  useEffect(() => {
    let alive = true;
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return catalog.channels.filter((channel) => {
      if (onlyFavorites && !favorites.includes(channel.id)) return false;
      if (!q) return true;
      return (
        channel.name.toLowerCase().includes(q) ||
        channel.id.toLowerCase().includes(q)
      );
    });
  }, [query, onlyFavorites, favorites]);

  const sorted = useMemo(() => {
    const favSet = new Set(favorites);
    return [...filtered].sort((a, b) => Number(favSet.has(b.id)) - Number(favSet.has(a.id)));
  }, [filtered, favorites]);

  const toggleFav = (id: string) => setFavorites(toggleFavorite(id));

  const playChannel = (channel: Channel) => {
    navigate({
      page: "player",
      url: channel.streamUrl ?? DEMO_STREAM_URL,
      title: channel.streamUrl ? channel.name : `${channel.name} (sinal demo)`,
    });
  };

  return (
    <section className="py-10">
      <div className="mx-auto max-w-6xl px-5">
        <div className="max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-brand-400">Ao vivo</p>
          <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            Canais de TV
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-400">
            {catalog.channels.length} canais com guia de programação lido do repositório
            (<code className="rounded bg-white/5 px-1.5 py-0.5 text-xs text-slate-300">logos/epg/epgbr.xml</code>).
          </p>
        </div>

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

        {sorted.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-dashed border-white/10 py-16 text-center text-sm text-slate-500">
            Nenhum canal encontrado{query.trim() ? ` para “${query.trim()}”` : ""}.
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {sorted.map((channel) => {
              const fav = favorites.includes(channel.id);
              return (
                <button
                  key={channel.id}
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
                      toggleFav(channel.id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        e.stopPropagation();
                        toggleFav(channel.id);
                      }
                    }}
                    className="absolute right-2.5 top-2.5 rounded-full p-1.5 transition hover:bg-white/10"
                  >
                    <HeartIcon filled={fav} />
                  </span>
                  {channel.logo ? (
                    <img
                      src={channel.logo}
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
          programs={epg?.channels[selected.id] ?? []}
          isFavorite={favorites.includes(selected.id)}
          onToggleFavorite={() => toggleFav(selected.id)}
          onPlay={() => playChannel(selected)}
          onClose={() => setSelected(null)}
        />
      )}
    </section>
  );
}
