import { useState } from "react";
import Player from "../components/Player";
import { catalog } from "../catalog";
import type { Route } from "../lib/router";

export default function PlayerPage({ route, navigate }: { route: Extract<Route, { page: "player" }>; navigate: (route: Route) => void }) {
  const [manualUrl, setManualUrl] = useState("");
  const [active, setActive] = useState<{ url: string; title?: string } | null>(
    route.url ? { url: route.url, title: route.title } : null
  );

  const playUrl = (url: string, title?: string) => {
    setActive({ url, title });
    navigate({ page: "player", url, title });
  };

  return (
    <section className="py-10">
      <div className="mx-auto max-w-4xl px-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-brand-400">Player</p>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
              Reprodução
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">
              Compatível com HLS (m3u8) e MP4/WebM em Android, iOS e web — com fallback nativo no
              iOS e reprodução em tela cheia.
            </p>
          </div>
        </div>

        <div className="mt-8">
          <Player url={active?.url ?? ""} title={active?.title} />
          {!active && (
            <p className="mt-3 rounded-xl border border-dashed border-white/10 px-4 py-3 text-center text-sm text-slate-500">
              Escolha um vídeo de demonstração abaixo ou cole um link de stream (m3u8/mp4).
            </p>
          )}
        </div>

        <div className="mt-8">
          <label htmlFor="stream-url" className="text-sm font-semibold text-white">
            Assistir por link
          </label>
          <div className="mt-2 flex flex-col gap-3 sm:flex-row">
            <input
              id="stream-url"
              type="url"
              value={manualUrl}
              onChange={(e) => setManualUrl(e.target.value)}
              placeholder="https://exemplo.com/stream.m3u8"
              className="w-full flex-1 rounded-xl border border-white/10 bg-ink-800/80 px-4 py-3 font-mono text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-brand-500/60 focus:ring-2 focus:ring-brand-500/20"
            />
            <button
              type="button"
              onClick={() => manualUrl.trim() && playUrl(manualUrl.trim(), "Link personalizado")}
              disabled={!manualUrl.trim()}
              className="rounded-xl bg-gradient-to-r from-brand-500 to-accent-600 px-6 py-3 text-sm font-bold text-white shadow-md shadow-brand-600/25 transition enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Assistir
            </button>
          </div>
        </div>

        <div className="mt-10">
          <h3 className="text-lg font-bold text-white">Vídeos de demonstração</h3>
          <p className="mt-1 text-xs text-slate-500">
            Streams abertos (CC) para validar a reprodução em todas as plataformas.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {catalog.demoVideos.map((video) => (
              <button
                key={video.id}
                type="button"
                onClick={() => playUrl(video.url, video.title)}
                className="flex items-center justify-between gap-4 rounded-2xl border border-white/5 bg-ink-800/70 px-5 py-4 text-left shadow-lg shadow-black/20 transition hover:-translate-y-0.5 hover:border-brand-500/30 hover:shadow-xl"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-slate-200">{video.title}</span>
                  <span className="mt-0.5 block text-xs text-slate-500">
                    {video.url.includes(".m3u8") ? "HLS" : "MP4"} · {video.category}
                  </span>
                </span>
                <svg className="h-5 w-5 shrink-0 text-brand-400" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5l11 7-11 7V5z" />
                </svg>
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
