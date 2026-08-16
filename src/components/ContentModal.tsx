import { useMemo } from "react";
import { type ContentItem } from "../catalog";
import { formatStartTime, previewFor } from "../lib/content";

export default function ContentModal({
  item,
  inList,
  onToggleList,
  onPlay,
  onClose,
}: {
  item: ContentItem;
  inList: boolean;
  onToggleList: () => void;
  onPlay: () => void;
  onClose: () => void;
}) {
  // Prévia em vídeo no banner: stream real quando houver; senão, vídeo demo determinístico.
  const previewUrl = useMemo(() => previewFor(item), [item]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl border border-white/10 bg-ink-900 shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative h-64 overflow-hidden sm:h-80">
          <div className="absolute inset-0 bg-gradient-to-br from-brand-600/40 via-ink-900/70 to-ink-950" />
          {previewUrl ? (
            <video
              src={previewUrl}
              muted
              autoPlay
              loop
              playsInline
              className="absolute inset-0 h-full w-full object-cover opacity-50"
            />
          ) : (
            item.logo && (
              <img
                src={item.logo}
                alt=""
                className="absolute inset-0 h-full w-full scale-110 object-contain p-10 blur-[1px]"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            )
          )}
          <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-ink-900 to-transparent" />
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="absolute right-4 top-4 rounded-full bg-black/60 p-2.5 text-slate-300 transition hover:text-white"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 sm:p-8">
          <div className="flex flex-wrap items-center gap-3 text-xs font-semibold text-slate-300">
            <span>{formatStartTime(item.start)}</span>
            <span className="border border-white/30 px-1.5 py-0.5 text-[10px] font-black text-white">HD</span>
            {item.adult ? (
              <span className="border border-rose-500/60 px-1.5 py-0.5 text-[10px] font-black text-rose-400">18</span>
            ) : (
              <span className="border border-white/30 px-1.5 py-0.5 text-[10px] font-black text-slate-300">L</span>
            )}
            <span className="text-slate-500">{item.category}</span>
          </div>

          <h3 className="mt-3 text-2xl font-extrabold text-white sm:text-3xl">{item.title}</h3>
          <p className="mt-1.5 text-xs text-slate-400">
            Transmitido por <span className="font-semibold text-brand-300">{item.channelName}</span>
          </p>

          {item.description && (
            <p className="mt-4 text-sm leading-relaxed text-slate-300">{item.description}</p>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={onPlay}
              className="flex-1 rounded bg-white px-5 py-2.5 text-sm font-bold text-black transition hover:bg-white/80"
            >
              ▶ Assistir
            </button>
            <button
              type="button"
              onClick={onToggleList}
              className={
                inList
                  ? "rounded bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-500"
                  : "rounded bg-white/20 px-5 py-2.5 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/30"
              }
            >
              {inList ? "✓ Na minha lista" : "+ Minha lista"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
