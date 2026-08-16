import { useEffect, useMemo, useRef, useState } from "react";
import ContentModal from "./ContentModal";
import { ContentCard } from "./ContentRow";
import { LiveCard } from "./LiveModal";
import LiveModal from "./LiveModal";
import VodModal from "./VodModal";
import { VodCard } from "./VodRow";
import { catalog, type ContentItem } from "../catalog";
import { isAdultConfirmed, streamFor } from "../lib/content";
import { liveSearch, type LiveItem } from "../lib/live";
import { getMyList, toggleMyList } from "../lib/list";
import { fetchVodCategory, normalizeVodName, VOD_CATEGORIES, type VodItem } from "../lib/vod";
import type { Route } from "../lib/router";

export default function SearchOverlay({
  onClose,
  navigate,
}: {
  onClose: () => void;
  navigate: (route: Route) => void;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<ContentItem | null>(null);
  const [vodSelected, setVodSelected] = useState<VodItem | null>(null);
  const [vodAll, setVodAll] = useState<VodItem[]>([]);
  const [vodLoading, setVodLoading] = useState(false);
  const [liveItems, setLiveItems] = useState<LiveItem[] | null>(null);
  const [liveSelected, setLiveSelected] = useState<LiveItem | null>(null);
  const [myList, setMyList] = useState<string[]>(() => getMyList());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return catalog.content
      .filter((item) => !item.adult || isAdultConfirmed())
      .filter((item) =>
        [item.title, item.channelName, item.category, item.description]
          .join(" ")
          .toLowerCase()
          .includes(q)
      )
      .slice(0, 24);
  }, [query]);

  // Busca AO VIVO no addon (mesma busca do Kodi) — sem extração manual.
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setLiveItems(null);
      return;
    }
    let alive = true;
    liveSearch(q)
      .then((res) => {
        if (alive) setLiveItems(res.type === "listing" ? res.items : null);
      })
      .catch(() => {
        if (alive) setLiveItems(null);
      });
    return () => {
      alive = false;
    };
  }, [query]);

  // Busca no catálogo VOD (carrega cada categoria uma única vez, com cache).
  useEffect(() => {
    if (!query.trim() || vodAll.length > 0 || vodLoading) return;
    setVodLoading(true);
    Promise.all(VOD_CATEGORIES.map(fetchVodCategory))
      .then((lists) => setVodAll(lists.flat()))
      .finally(() => setVodLoading(false));
  }, [query, vodAll.length, vodLoading]);

  const vodResults = useMemo(() => {
    const q = normalizeVodName(query);
    if (!q) return [];
    return vodAll
      .filter((item) => normalizeVodName(item.t).includes(q))
      .slice(0, 24);
  }, [query, vodAll]);

  const play = (item: ContentItem) => {
    onClose();
    navigate({
      page: "player",
      url: streamFor(item),
      title: `${item.title} · ${item.channelName}`,
    });
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-ink-950/95 backdrop-blur-sm">
      <div className="mx-auto max-w-6xl px-5 pt-16 sm:px-6 md:pt-24">
        <div className="flex items-center gap-4 border-b-2 border-white/10 pb-4">
          <svg
            className="h-6 w-6 shrink-0 text-white"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 10.5a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar filmes, séries, desenhos, canais…"
            className="w-full bg-transparent text-lg text-white outline-none placeholder:text-slate-500"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar busca"
            className="shrink-0 text-slate-400 transition hover:text-white"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="pt-8">
          {!query.trim() ? (
            <p className="py-10 text-center text-sm text-slate-500">
              Digite um título, canal ou gênero para encontrar conteúdo.
            </p>
          ) : results.length === 0 && vodResults.length === 0 && liveItems !== null && liveItems.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-500">
              Nada encontrado para “{query.trim()}”.
            </p>
          ) : results.length === 0 && vodResults.length === 0 && liveItems === null ? (
            <p className="py-10 text-center text-sm text-slate-500">Buscando ao vivo…</p>
          ) : (
            <>
              {liveItems !== null && liveItems.length > 0 && (
                <>
                  <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">
                    Ao vivo do addon (mesma busca do Kodi)
                  </p>
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                    {liveItems.map((item, i) => (
                      <LiveCard key={`${item.name}-${i}-${item.url}`} item={item} onSelect={setLiveSelected} />
                    ))}
                  </div>
                </>
              )}
              {results.length > 0 && (
                <>
                  <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">
                    Canais e programação
                  </p>
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                    {results.map((item) => (
                      <ContentCard
                        key={item.id}
                        item={item}
                        onSelect={setSelected}
                        onPlay={play}
                        className="w-full"
                        hoverScale="scale-[1.12]"
                      />
                    ))}
                  </div>
                </>
              )}
              {vodResults.length > 0 && (
                <>
                  <p className="mb-3 mt-8 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">
                    Catálogo de filmes e séries
                  </p>
                  <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 sm:gap-4 lg:grid-cols-6">
                    {vodResults.map((item) => (
                      <VodCard key={`${item.c}-${item.l}-${item.t}`} item={item} onSelect={setVodSelected} />
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {selected && (
        <ContentModal
          item={selected}
          inList={myList.includes(selected.id)}
          onToggleList={() => setMyList(toggleMyList(selected.id))}
          onPlay={() => play(selected)}
          onClose={() => setSelected(null)}
        />
      )}
      {vodSelected && (
        <VodModal item={vodSelected} onClose={() => setVodSelected(null)} navigate={navigate} />
      )}
      {liveSelected && (
        <LiveModal item={liveSelected} onClose={() => setLiveSelected(null)} navigate={navigate} />
      )}
    </div>
  );
}
