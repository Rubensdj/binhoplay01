import { useEffect, useMemo, useState } from "react";
import CategoryNav from "../components/CategoryNav";
import ContentModal from "../components/ContentModal";
import { ContentCard } from "../components/ContentRow";
import VodModal from "../components/VodModal";
import { VodCard } from "../components/VodRow";
import { catalog, type ContentItem } from "../catalog";
import { isAdultConfirmed, streamFor } from "../lib/content";
import { getMyList, toggleMyList } from "../lib/list";
import { fetchVodCategory, VOD_CATEGORIES, type VodItem } from "../lib/vod";
import type { Route } from "../lib/router";

const PAGE_SIZE = 60;

export default function CategoryPage({ name, navigate }: { name: string; navigate: (route: Route) => void }) {
  const isVod = VOD_CATEGORIES.includes(name);
  const [selected, setSelected] = useState<ContentItem | null>(null);
  const [vodSelected, setVodSelected] = useState<VodItem | null>(null);
  const [myList, setMyList] = useState<string[]>(() => getMyList());
  const [vodItems, setVodItems] = useState<VodItem[] | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const now = Date.now();

  useEffect(() => {
    if (!isVod) return;
    setVodItems(null);
    setVisibleCount(PAGE_SIZE);
    let alive = true;
    fetchVodCategory(name).then((items) => {
      if (alive) setVodItems(items);
    });
    return () => {
      alive = false;
    };
  }, [name, isVod]);

  const items = useMemo(() => {
    if (isVod) return [];
    return catalog.content
      .filter((item) => item.category === name && (!item.adult || isAdultConfirmed()))
      .sort((a, b) => Math.abs(Date.parse(a.start) - now) - Math.abs(Date.parse(b.start) - now))
      .slice(0, 80);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, isVod]);

  const play = (item: ContentItem) => {
    navigate({
      page: "player",
      url: streamFor(item),
      title: `${item.title} · ${item.channelName}`,
    });
  };

  const shown = vodItems?.slice(0, visibleCount) ?? [];

  return (
    <section className="pt-16 pb-12">
      <CategoryNav />

      <div className="mx-auto max-w-6xl px-5 pt-8 sm:px-6">
        <p className="text-xs font-bold uppercase tracking-[0.25em] text-brand-400">{name}</p>
        <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">{name}</h2>
        <p className="mt-3 text-sm leading-relaxed text-slate-400">
          {isVod
            ? vodItems === null
              ? "Carregando catálogo…"
              : vodItems.length > 0
                ? `${vodItems.length.toLocaleString("pt-BR")} títulos disponíveis.`
                : "Nenhum título disponível no momento."
            : items.length > 0
              ? `${items.length} títulos ${items.length === 1 ? "disponível" : "disponíveis"} nesta categoria.`
              : "Nenhum título disponível no momento."}
        </p>

        {isVod ? (
          vodItems === null ? (
            <div className="mt-10 grid grid-cols-3 gap-4 sm:grid-cols-4 lg:grid-cols-6">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="aspect-[2/3] animate-pulse rounded-lg bg-ink-800/80" />
              ))}
            </div>
          ) : shown.length === 0 ? (
            <div className="mt-10 rounded-2xl border border-dashed border-white/10 py-20 text-center">
              <p className="text-lg font-bold text-slate-300">Sem títulos em {name} por enquanto</p>
              <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-500">
                O catálogo do repositório ainda não publicou conteúdo desta categoria. Assim que
                for adicionado, aparece aqui automaticamente.
              </p>
            </div>
          ) : (
            <>
              <div className="mt-8 grid grid-cols-3 gap-3 sm:grid-cols-4 sm:gap-4 lg:grid-cols-5 xl:grid-cols-6">
                {shown.map((item) => (
                  <VodCard key={`${item.c}-${item.l}-${item.t}`} item={item} onSelect={setVodSelected} />
                ))}
              </div>
              {visibleCount < vodItems.length && (
                <div className="mt-8 text-center">
                  <button
                    type="button"
                    onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
                    className="rounded-xl border border-white/15 bg-white/5 px-8 py-2.5 text-sm font-bold text-white transition hover:bg-white/10"
                  >
                    Carregar mais ({vodItems.length - visibleCount} restantes)
                  </button>
                </div>
              )}
            </>
          )
        ) : items.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-dashed border-white/10 py-20 text-center">
            <p className="text-lg font-bold text-slate-300">Sem títulos em {name} por enquanto</p>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-500">
              Os canais desta categoria ainda não estão no guia do repositório. Assim que forem
              adicionados, os títulos aparecem aqui automaticamente.
            </p>
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {items.map((item) => (
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
        )}
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
      {vodSelected && <VodModal item={vodSelected} onClose={() => setVodSelected(null)} navigate={navigate} />}
    </section>
  );
}
