import { useEffect, useState } from "react";
import { resolveVod, resolveEpisode, botBase, type VodItem, type Season, type Episode } from "../lib/vod";
import type { Route } from "../lib/router";

export default function VodModal({
  item,
  onClose,
  navigate,
}: {
  item: VodItem;
  onClose: () => void;
  navigate: (route: Route) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [seasons, setSeasons] = useState<Season[] | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const play = (url: string) => {
    onClose();
    navigate({ page: "player", url, title: item.t });
  };

  const watch = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await resolveVod(item);
      if (result.kind === "stream") {
        play(result.stream);
        return;
      }
      if (result.kind === "seasons") {
        setSeasons(result.seasons);
        return;
      }
      setError(result.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setBusy(false);
    }
  };

  const playEpisode = async (ep: Episode) => {
    setBusy(true);
    setError(null);
    try {
      const url = await resolveEpisode(ep);
      play(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao abrir o episódio.");
      setBusy(false);
    }
  };

  const img = item.f || item.p;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <div
        className="mx-auto my-8 w-[min(92vw,880px)] overflow-hidden rounded-2xl bg-ink-900 shadow-2xl shadow-black/60 ring-1 ring-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative aspect-video w-full overflow-hidden">
          {img && (
            <img
              src={img}
              alt=""
              className="h-full w-full object-cover"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-ink-900 via-ink-900/60 to-transparent" />
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur transition hover:bg-black/80"
          >
            ✕
          </button>
          <div className="absolute bottom-0 left-0 right-0 p-5 sm:p-8">
            <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-brand-400">{item.c}</p>
            <h2 className="mt-1 text-2xl font-black tracking-tight text-white sm:text-4xl">{item.t}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold text-slate-300">
              {item.y && <span>{item.y}</span>}
              {item.r && <span className="text-amber-300">★ {item.r}</span>}
              {item.g && <span className="text-slate-400">{item.g}</span>}
            </div>
          </div>
        </div>

        <div className="p-5 sm:p-8">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={watch}
              disabled={busy}
              className="rounded bg-white px-8 py-2.5 text-sm font-bold text-black transition hover:bg-white/80 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Buscando…" : seasons ? "▶ Assistir" : "▶ Assistir"}
            </button>
            {botBase() === "/api" && (
              <span className="text-[11px] font-medium text-slate-500">
                Reprodução via bot de resolução
              </span>
            )}
          </div>

          {error && (
            <p className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2.5 text-xs font-medium leading-relaxed text-amber-200">
              {error}
            </p>
          )}

          {item.d && (
            <p className="mt-5 text-sm leading-relaxed text-slate-300">{item.d}</p>
          )}

          {seasons && (
            <div className="mt-6 max-h-[46vh] space-y-4 overflow-y-auto pr-1">
              {seasons.map((season) => (
                <div key={season.name}>
                  <p className="text-sm font-extrabold tracking-tight text-white">{season.name}</p>
                  <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                    {season.episodes.map((ep, i) => (
                      <button
                        key={`${season.name}-${ep.name}-${i}`}
                        type="button"
                        disabled={busy}
                        onClick={() => playEpisode(ep)}
                        className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-left text-xs font-semibold text-slate-200 transition hover:border-brand-500/50 hover:bg-white/10 disabled:opacity-50"
                      >
                        <span className="text-slate-500">{i + 1}.</span> {ep.name}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
