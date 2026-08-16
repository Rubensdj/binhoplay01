import { catalog } from "../catalog";
import type { Route } from "../lib/router";

export default function Hero({ navigate }: { navigate: (route: Route) => void }) {
  const repoAddon = catalog.addons.find((a) => a.id === "repository.BrazucaPlay");
  const stats = [
    { value: String(catalog.channels.length), label: "canais de TV" },
    { value: String(catalog.addons.length), label: "addons no catálogo" },
    { value: String(catalog.logos.length), label: "logos de canais" },
  ];

  return (
    <section id="top" className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-44 left-1/2 h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-brand-600/25 blur-[120px]" />
        <div className="absolute -left-40 top-40 h-[420px] w-[420px] rounded-full bg-accent-600/20 blur-[100px]" />
        <div className="absolute -right-40 bottom-0 h-[380px] w-[380px] rounded-full bg-brand-500/10 blur-[100px]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.06)_1px,transparent_1px)] bg-[size:56px_56px]" />
      </div>

      <div className="mx-auto max-w-6xl px-5 pb-20 pt-24 text-center sm:pt-32">
        <span className="animate-fade-up inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-semibold tracking-wide text-slate-300">
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          Catálogo gerado automaticamente a partir do repositório
        </span>

        <h1 className="animate-fade-up mt-6 text-5xl font-black tracking-tight text-white sm:text-7xl">
          BINHO{" "}
          <span className="bg-gradient-to-r from-brand-400 via-brand-500 to-accent-500 bg-clip-text text-transparent">
            PLAY
          </span>
        </h1>

        <p className="animate-fade-up mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-400">
          TV, Filmes, Séries, Desenhos e Animes — em qualquer lugar. Catálogo interativo e player
          de vídeo no Android, no iOS e na web.
        </p>

        <div className="animate-fade-up mt-10 flex flex-wrap items-center justify-center gap-4">
          <button
            type="button"
            onClick={() => navigate({ page: "tv" })}
            className="rounded-xl bg-gradient-to-r from-brand-500 to-accent-600 px-7 py-3.5 text-base font-bold text-white shadow-xl shadow-brand-600/30 transition hover:-translate-y-0.5 hover:brightness-110"
          >
            Assistir TV
          </button>
          <button
            type="button"
            onClick={() => navigate({ page: "addons" })}
            className="rounded-xl border border-white/10 bg-white/5 px-7 py-3.5 text-base font-semibold text-white backdrop-blur transition hover:-translate-y-0.5 hover:bg-white/10"
          >
            Ver catálogo de addons
          </button>
          <a
            href="/addons/repository.BrazucaPlay.zip"
            download
            className="rounded-xl border border-white/10 bg-white/5 px-7 py-3.5 text-base font-semibold text-white backdrop-blur transition hover:-translate-y-0.5 hover:bg-white/10"
          >
            Baixar repositório (.zip)
          </a>
        </div>

        <dl className="animate-fade-up mx-auto mt-16 grid max-w-xl grid-cols-3 gap-4">
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-5">
              <dd className="text-2xl font-extrabold text-white">{stat.value}</dd>
              <dt className="mt-1 block text-xs text-slate-500">{stat.label}</dt>
            </div>
          ))}
        </dl>

        <p className="mt-4 text-xs text-slate-600">
          Repositório Brazuca Play · v{repoAddon?.version ?? "1.5"}
        </p>
      </div>
    </section>
  );
}
