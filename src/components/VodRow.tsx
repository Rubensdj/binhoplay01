import type { VodItem } from "../lib/vod";

export function VodCard({
  item,
  onSelect,
  className = "",
}: {
  item: VodItem;
  onSelect: (item: VodItem) => void;
  className?: string;
}) {
  const img = item.p || item.f;
  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      className={`group relative block shrink-0 overflow-hidden rounded-lg bg-ink-900 ring-1 ring-white/5 transition duration-200 hover:z-10 hover:scale-[1.06] hover:ring-2 hover:ring-white/70 hover:shadow-2xl hover:shadow-black/60 ${className}`}
    >
      <div className="aspect-[2/3] w-full overflow-hidden">
        {img ? (
          <img
            src={img}
            alt={item.t}
            loading="lazy"
            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-ink-800 to-ink-950 p-3 text-center">
            <span className="text-xs font-bold leading-tight text-slate-400">{item.t}</span>
          </div>
        )}
      </div>
      {!img && (
        <div className="p-3 text-center">
          <span className="text-xs font-bold text-slate-300">{item.t}</span>
        </div>
      )}
      <div className="pointer-events-none absolute inset-0 flex items-end bg-gradient-to-t from-black/85 via-transparent to-transparent p-3 opacity-0 transition duration-200 group-hover:opacity-100">
        <div className="w-full">
          <p className="line-clamp-2 text-left text-xs font-bold leading-snug text-white">{item.t}</p>
          {item.r && <p className="mt-0.5 text-left text-[10px] font-semibold text-amber-300">★ {item.r}</p>}
        </div>
      </div>
    </button>
  );
}

export default function VodRow({
  label,
  items,
  count,
  onSelect,
  onViewAll,
}: {
  label: string;
  items: VodItem[];
  count: number;
  onSelect: (item: VodItem) => void;
  onViewAll?: () => void;
}) {
  if (items.length === 0) return null;
  return (
    <section className="mt-8">
      <div className="mx-auto flex max-w-6xl items-end justify-between px-5 sm:px-10">
        <h2 className="text-lg font-extrabold tracking-tight text-white sm:text-xl">{label}</h2>
        {count > items.length && onViewAll && (
          <button
            type="button"
            onClick={onViewAll}
            className="text-xs font-bold text-slate-400 transition hover:text-white"
          >
            Ver tudo ({count.toLocaleString("pt-BR")}) ›
          </button>
        )}
      </div>
      <div className="mt-3 flex gap-3 overflow-x-auto px-5 pb-4 sm:px-10 [scrollbar-width:thin]">
        {items.map((item) => (
          <VodCard key={`${item.c}-${item.l}-${item.t}`} item={item} onSelect={onSelect} className="w-28 sm:w-36" />
        ))}
      </div>
    </section>
  );
}
