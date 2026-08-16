import { useEffect, useMemo, useState } from "react";
import ContentModal from "../components/ContentModal";
import ContentRow from "../components/ContentRow";
import Footer from "../components/Footer";
import VodModal from "../components/VodModal";
import VodRow from "../components/VodRow";
import { useAdminData } from "../lib/adminStore";
import { currentUser } from "../lib/auth";
import {
  airingNow,
  buildRows,
  byIds,
  featuredItem,
  formatStartTime,
  previewFor,
  streamFor,
} from "../lib/content";
import { getMyList, toggleMyList } from "../lib/list";
import { fetchVodCategory, VOD_CATEGORIES, type VodItem } from "../lib/vod";
import type { ContentItem } from "../catalog";
import type { Route } from "../lib/router";

function VodSection({
  navigate,
  onSelect,
}: {
  navigate: (route: Route) => void;
  onSelect: (item: VodItem) => void;
}) {
  const { config, clients } = useAdminData();
  const [loaded, setLoaded] = useState<Record<string, VodItem[]>>({});

  const clientAccess = useMemo(() => {
    const email = currentUser();
    if (!email) return null;
    const record = clients.find(
      (c) => c.email.trim().toLowerCase() === email.trim().toLowerCase()
    );
    return record?.access ?? null;
  }, [clients]);

  const visible = VOD_CATEGORIES.filter(
    (cat) =>
      (config.categoriesVisible[cat] ?? true) && (clientAccess?.categories[cat] ?? true)
  );

  useEffect(() => {
    for (const cat of visible) {
      fetchVodCategory(cat).then((items) => {
        setLoaded((prev) => (prev[cat] === items ? prev : { ...prev, [cat]: items }));
      });
    }
  }, [visible.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {visible.map((cat) => {
        const items = loaded[cat] ?? [];
        if (items.length === 0) return null;
        return (
          <VodRow
            key={cat}
            label={cat}
            items={items.slice(0, 24)}
            count={items.length}
            onSelect={onSelect}
            onViewAll={() => navigate({ page: "category", name: cat })}
          />
        );
      })}
    </>
  );
}

function NetflixHero({
  item,
  inList,
  onPlay,
  onMore,
  onToggleList,
}: {
  item: ContentItem;
  inList: boolean;
  onPlay: () => void;
  onMore: () => void;
  onToggleList: () => void;
}) {
  // Prévia em vídeo no billboard: stream real quando houver; senão, vídeo demo determinístico.
  const previewUrl = useMemo(() => previewFor(item), [item]);

  return (
    <div className="relative h-[78vh] min-h-[480px] w-full overflow-hidden">
      <div className="absolute inset-0">
        {previewUrl && (
          <video
            src={previewUrl}
            muted
            autoPlay
            loop
            playsInline
            preload="metadata"
            className="absolute inset-0 h-full w-full object-cover opacity-40"
          />
        )}
        {item.logo && (
          <img
            src={item.logo}
            alt=""
            className="absolute inset-0 h-full w-full scale-110 object-cover opacity-20 blur-lg"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-ink-950 via-ink-950/70 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-transparent to-black/50" />
      </div>

      <div className="absolute inset-x-0 bottom-0 mx-auto max-w-6xl px-5 pb-16 sm:px-10">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-slate-400">{item.category}</p>
        <h1 className="mt-2 max-w-3xl text-4xl font-black tracking-tight text-white drop-shadow-2xl sm:text-6xl lg:text-7xl">
          {item.title}
        </h1>

        <div className="mt-4 flex flex-wrap items-center gap-3 text-xs font-semibold text-slate-300">
          <span>{item.channelName}</span>
          <span>{formatStartTime(item.start)}</span>
          <span className="border border-white/30 px-1.5 py-0.5 text-[10px] font-black text-white">HD</span>
          {item.adult ? (
            <span className="border border-rose-500/60 px-1.5 py-0.5 text-[10px] font-black text-rose-400">18</span>
          ) : (
            <span className="border border-white/30 px-1.5 py-0.5 text-[10px] font-black text-slate-300">L</span>
          )}
        </div>

        {item.description && (
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-slate-200 drop-shadow-md line-clamp-3">
            {item.description}
          </p>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onPlay}
            className="rounded bg-white px-8 py-2.5 text-sm font-bold text-black transition hover:bg-white/80"
          >
            ▶ Assistir
          </button>
          <button
            type="button"
            onClick={onMore}
            className="rounded bg-white/20 px-8 py-2.5 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/30"
          >
            ⓘ Mais informações
          </button>
          <button
            type="button"
            onClick={onToggleList}
            aria-label={inList ? "Remover da minha lista" : "Adicionar à minha lista"}
            className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-white/40 text-lg text-white transition hover:border-white"
          >
            {inList ? "✓" : "+"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function HomePage({ navigate }: { navigate: (route: Route) => void }) {
  const { config, clients } = useAdminData();
  const [now, setNow] = useState(() => Date.now());
  const [selected, setSelected] = useState<ContentItem | null>(null);
  const [vodSelected, setVodSelected] = useState<VodItem | null>(null);
  const [myList, setMyList] = useState<string[]>(() => getMyList());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const featured = useMemo(() => featuredItem(now), [now]);

  // Acessos do cliente logado (quando o admin restringiu a conta dele por e-mail).
  const clientAccess = useMemo(() => {
    const email = currentUser();
    if (!email) return null;
    const record = clients.find(
      (c) => c.email.trim().toLowerCase() === email.trim().toLowerCase()
    );
    return record?.access ?? null;
  }, [clients]);

  // Fileiras do guia (EPG): só as categorias que o catálogo VOD não cobre (ex.: Adultos).
  // As 6 categorias VOD (Filmes, Séries, Novelas, Animes, Doramas, Desenhos) já aparecem
  // na seção VOD abaixo com o catálogo completo — evitamos duplicar a mesma fileira duas vezes.
  const vodLabels = new Set(VOD_CATEGORIES);
  const rows = useMemo(
    () =>
      buildRows(now).filter(
        (row) =>
          !vodLabels.has(row.category) &&
          (config.categoriesVisible[row.category] ?? true) &&
          (clientAccess?.categories[row.category] ?? true)
      ),
    [now, config.categoriesVisible, clientAccess, vodLabels]
  );
  const live = useMemo(() => airingNow(now), [now]);
  const listItems = useMemo(() => byIds(myList), [myList]);

  const play = (item: ContentItem) => {
    navigate({
      page: "player",
      url: streamFor(item),
      title: `${item.title} · ${item.channelName}`,
    });
  };

  return (
    <section>
      {config.announcementEnabled && config.announcement.trim() && (
        <div className="relative z-40 border-b border-amber-500/20 bg-ink-950/90 pt-16">
          <p className="mx-auto max-w-6xl px-5 py-2.5 text-center text-xs font-semibold text-amber-200">
            {config.announcement}
          </p>
        </div>
      )}
      {featured && (
        <NetflixHero
          item={featured}
          inList={myList.includes(featured.id)}
          onPlay={() => play(featured)}
          onMore={() => setSelected(featured)}
          onToggleList={() => setMyList(toggleMyList(featured.id))}
        />
      )}

      {listItems.length > 0 && (
        <ContentRow label="Minha lista" items={listItems} onSelect={setSelected} onPlay={play} />
      )}
      <ContentRow label="No ar agora" items={live} onSelect={setSelected} onPlay={play} />
      {rows.map((row) => (
        <ContentRow key={row.category} label={row.category} items={row.items} onSelect={setSelected} onPlay={play} />
      ))}

      <VodSection navigate={navigate} onSelect={setVodSelected} />

      <div className="pt-10" />

      <Footer />

      {selected && (
        <ContentModal
          item={selected}
          inList={myList.includes(selected.id)}
          onToggleList={() => setMyList(toggleMyList(selected.id))}
          onPlay={() => play(selected)}
          onClose={() => setSelected(null)}
        />
      )}
      {vodSelected && <VodModal item={vodSelected} onClose={() => setVodSelected(null)} navigate={navigate} />}
    </section>
  );
}
