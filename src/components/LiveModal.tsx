import { useCallback, useEffect, useState } from "react";
import { liveBrowse, livePlay, playbackUrl, type LiveItem } from "../lib/live";
import type { Route } from "../lib/router";

export function LiveCard({
  item,
  onSelect,
}: {
  item: LiveItem;
  onSelect: (item: LiveItem) => void;
}) {
  const [imgError, setImgError] = useState(false);
  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      className="group flex flex-col overflow-hidden rounded-xl border border-white/5 bg-ink-800/70 text-left shadow-lg shadow-black/20 transition hover:-translate-y-1 hover:border-brand-500/40 hover:shadow-xl"
    >
      <div className="relative aspect-video w-full overflow-hidden bg-ink-900">
        {item.thumb && !imgError ? (
          <img
            src={item.thumb}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition group-hover:scale-105"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-brand-500/30 to-accent-600/30">
            <span className="text-2xl font-black text-white/70">
              {item.name.replace(/^\W+/, "").charAt(0).toUpperCase() || "▶"}
            </span>
          </div>
        )}
        {item.folder && (
          <span className="absolute right-2 top-2 rounded-md bg-black/60 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur">
            {item.category ? item.category.toUpperCase() : "MENU"}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 px-3 py-2.5">
        <span className="line-clamp-2 min-w-0 flex-1 text-xs font-semibold leading-snug text-slate-200 group-hover:text-white">
          {item.name}
        </span>
        <svg
          className={`h-4 w-4 shrink-0 ${item.folder ? "text-brand-400" : "text-white"}`}
          fill="currentColor"
          viewBox="0 0 24 24"
        >
          {item.folder ? (
            <path d="M10 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2h-8l-2-2z" />
          ) : (
            <path d="M8 5l11 7-11 7V5z" />
          )}
        </svg>
      </div>
    </button>
  );
}

interface Level {
  title: string;
  items: LiveItem[];
}

export default function LiveModal({
  item,
  onClose,
  navigate,
}: {
  item: LiveItem;
  onClose: () => void;
  navigate: (route: Route) => void;
}) {
  const [stack, setStack] = useState<Level[]>([{ title: item.name, items: [] }]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const level = stack[stack.length - 1];

  const playItem = useCallback(
    async (target: LiveItem) => {
      setBusy(true);
      setError(null);
      try {
        const res = await livePlay(target.url);
        if (res.type === "stream") {
          onClose();
          navigate({ page: "player", url: playbackUrl(res.stream, res.headers), title: target.name });
          return;
        }
        if (res.type === "listing") {
          setStack((s) => [...s, { title: target.name, items: res.items }]);
          return;
        }
        setError(res.message);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro inesperado.");
      } finally {
        setBusy(false);
      }
    },
    [navigate, onClose]
  );

  const openItem = useCallback(
    async (target: LiveItem) => {
      setBusy(true);
      setError(null);
      try {
        if (target.folder) {
          const res = await liveBrowse(target.url);
          if (res.type === "listing") {
            setStack((s) => [...s, { title: target.name, items: res.items }]);
            return;
          }
          if (res.type === "stream") {
            onClose();
            navigate({ page: "player", url: playbackUrl(res.stream, res.headers), title: target.name });
            return;
          }
          setError(res.message);
        } else {
          await playItem(target);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro inesperado.");
      } finally {
        setBusy(false);
      }
    },
    [navigate, onClose, playItem]
  );

  useEffect(() => {
    if (stack.length === 1 && stack[0].items.length === 0) {
      openItem(item);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const back = () => {
    if (stack.length > 1) {
      setStack((s) => s.slice(0, -1));
      setError(null);
    } else {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/85 backdrop-blur-sm" onClick={onClose}>
      <div
        className="mx-auto my-8 w-[min(94vw,980px)] overflow-hidden rounded-2xl bg-ink-900 shadow-2xl shadow-black/60 ring-1 ring-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-white/5 px-5 py-4">
          <button
            type="button"
            onClick={back}
            aria-label="Voltar"
            className="rounded-full border border-white/10 p-2 text-slate-300 transition hover:bg-white/5"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-white">{level.title}</p>
            {item.folder && (
              <p className="text-[11px] text-slate-500">
                Navegando o catálogo ao vivo do addon (mesma fonte do Kodi)
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-full border border-white/10 p-2 text-slate-300 transition hover:bg-white/5"
          >
            ✕
          </button>
        </div>

        <div className="p-5 sm:p-6">
          {busy && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="aspect-video animate-pulse rounded-xl bg-ink-800/80" />
              ))}
            </div>
          )}

          {!busy && error && (
            <p className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-xs font-medium leading-relaxed text-amber-200">
              {error}
            </p>
          )}

          {!busy && !error && level.items.length === 0 && (
            <p className="py-10 text-center text-sm text-slate-500">Nada disponível neste menu.</p>
          )}

          {!busy && level.items.length > 0 && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {level.items.map((sub, i) => (
                <LiveCard key={`${sub.name}-${i}-${sub.url}`} item={sub} onSelect={openItem} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
