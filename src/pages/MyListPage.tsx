import { useMemo, useState } from "react";
import { ContentCard } from "../components/ContentRow";
import ContentModal from "../components/ContentModal";
import { byIds, streamFor } from "../lib/content";
import { getMyList, toggleMyList } from "../lib/list";
import type { ContentItem } from "../catalog";
import type { Route } from "../lib/router";

export default function MyListPage({ navigate }: { navigate: (route: Route) => void }) {
  const [myList, setMyList] = useState<string[]>(() => getMyList());
  const [selected, setSelected] = useState<ContentItem | null>(null);
  const items = useMemo(() => byIds(myList), [myList]);

  const play = (item: ContentItem) => {
    navigate({
      page: "player",
      url: streamFor(item),
      title: `${item.title} · ${item.channelName}`,
    });
  };

  return (
    <section className="pt-24 pb-16">
      <div className="mx-auto max-w-6xl px-5">
        <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">Minha lista</h2>
        <p className="mt-2 text-sm text-slate-400">Títulos que você salvou para assistir depois.</p>

        {items.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-dashed border-white/10 py-16 text-center text-sm text-slate-500">
            Sua lista está vazia. Toque em “+ Minha lista” em qualquer título para salvá-lo aqui.
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
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
    </section>
  );
}
