import { useMemo, useState } from "react";
import { type ContentItem } from "../catalog";
import { formatStartTime, previewFor } from "../lib/content";

export function ContentCard({
  item,
  onSelect,
  onPlay,
  className = "w-56 sm:w-72",
  hoverScale = "scale-[1.28]",
}: {
  item: ContentItem;
  onSelect: (item: ContentItem) => void;
  onPlay?: (item: ContentItem) => void;
  className?: string;
  /** Escala do pop-out no hover — fileiras usam um pop maior, grades um mais sutil. */
  hoverScale?: string;
}) {
  const [hovered, setHovered] = useState(false);

  // Prévia estilo Netflix: stream real do canal quando houver; senão, vídeo demo determinístico.
  const previewUrl = useMemo(() => previewFor(item), [item]);

  const handlePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onPlay) onPlay(item);
    else onSelect(item);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${item.title} · ${item.channelName}`}
      onClick={() => onSelect(item)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(item);
        }
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`group relative shrink-0 cursor-pointer snap-start text-left outline-none ${className}`}
    >
      <div
        className={`relative aspect-video overflow-hidden rounded-md transition-all duration-300 ${
          hovered
            ? `z-30 ${hoverScale} shadow-2xl shadow-black/90 ring-2 ring-white/40`
            : "ring-1 ring-white/10"
        }`}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-ink-700 via-ink-900 to-brand-600/30" />

        {/* No hover, o vídeo de prévia substitui o logo */}
        {hovered && previewUrl ? (
          <video
            src={previewUrl}
            muted
            autoPlay
            loop
            playsInline
            preload="metadata"
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : item.logo ? (
          <img
            src={item.logo}
            alt=""
            loading="lazy"
            className="absolute inset-0 h-full w-full object-contain p-3 transition duration-300 group-hover:scale-105"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-3xl font-black text-white/70">
            {item.title.charAt(0)}
          </div>
        )}

        {item.adult && (
          <span className="absolute right-2 top-2 z-10 rounded border border-rose-500/50 bg-rose-950/80 px-1.5 py-0.5 text-[10px] font-black text-rose-300">
            +18
          </span>
        )}

        {/* Overlay de prévia no hover (estilo Netflix) */}
        <div
          className={`absolute inset-0 flex flex-col justify-end gap-2 bg-gradient-to-t from-black/95 via-black/45 to-transparent p-3 transition duration-300 ${
            hovered ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
        >
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePlay}
              aria-label="Assistir agora"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-black shadow-xl transition hover:scale-110"
            >
              <svg className="ml-0.5 h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5l11 7-11 7V5z" />
              </svg>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSelect(item);
              }}
              aria-label="Mais informações"
              className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-white/60 bg-black/40 text-white backdrop-blur transition hover:scale-110 hover:border-white"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </button>
          </div>

          <p className="truncate text-sm font-black text-white drop-shadow">{item.title}</p>

          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[9px] font-bold text-slate-200">
            <span className="rounded border border-white/40 px-1 py-px text-[8px] font-black text-white">HD</span>
            {item.adult && (
              <span className="rounded border border-rose-500/60 px-1 py-px text-[8px] font-black text-rose-400">
                18
              </span>
            )}
            <span>{item.category}</span>
            <span className="text-slate-400">{item.channelName}</span>
            <span className="text-slate-400">{formatStartTime(item.start)}</span>
          </div>

          {item.description && (
            <p className="hidden line-clamp-2 text-[10px] leading-tight text-slate-300 sm:block">
              {item.description}
            </p>
          )}
        </div>

        {/* Barra inferior no estado normal */}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/60 to-transparent p-2 pt-6">
          <p className="truncate text-xs font-bold text-white">{item.title}</p>
          <p className="truncate text-[10px] text-slate-400">
            {item.channelName} · {formatStartTime(item.start)}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function ContentRow({
  label,
  items,
  onSelect,
  onPlay,
}: {
  label: string;
  items: ContentItem[];
  onSelect: (item: ContentItem) => void;
  onPlay?: (item: ContentItem) => void;
}) {
  if (items.length === 0) return null;
  return (
    <section className="mt-8">
      <h3 className="mb-2 px-8 text-base font-bold text-white sm:px-14">{label}</h3>
      {/* Padding extra para o card crescer no hover sem cortar nas bordas */}
      <div className="flex snap-x gap-3 overflow-x-auto px-8 py-8 sm:px-14 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((item) => (
          <ContentCard key={item.id} item={item} onSelect={onSelect} onPlay={onPlay} />
        ))}
      </div>
    </section>
  );
}
