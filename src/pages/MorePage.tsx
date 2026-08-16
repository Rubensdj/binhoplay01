import InstallGuide from "../components/InstallGuide";
import { currentUser } from "../lib/auth";
import type { Route } from "../lib/router";

const LINKS: Array<{ page: "addons" | "repos"; label: string; description: string }> = [
  { page: "addons", label: "Addons Kodi", description: "Catálogo de addons e downloads" },
  { page: "repos", label: "Repositórios", description: "Leia outros repositórios como o Kodi" },
];

export default function MorePage({
  navigate,
  onLogout,
}: {
  navigate: (route: Route) => void;
  onLogout: () => void;
}) {
  const user = currentUser();

  return (
    <section className="pt-24 pb-10">
      <div className="mx-auto max-w-4xl px-5">
        <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">Mais</h2>

        <div className="mt-8 space-y-4">
          {LINKS.map((link) => (
            <button
              key={link.page}
              type="button"
              onClick={() => navigate({ page: link.page })}
              className="flex w-full items-center justify-between gap-4 rounded-2xl border border-white/5 bg-ink-800/70 px-5 py-4 text-left shadow-lg shadow-black/20 transition hover:-translate-y-0.5 hover:border-brand-500/30"
            >
              <span>
                <span className="block text-sm font-bold text-white">{link.label}</span>
                <span className="mt-0.5 block text-xs text-slate-500">{link.description}</span>
              </span>
              <svg className="h-4 w-4 shrink-0 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          ))}
        </div>

        <div className="mt-10 rounded-2xl border border-white/5 bg-ink-800/70 p-6">
          <p className="text-sm font-semibold text-white">Conta</p>
          <p className="mt-1 text-xs text-slate-500">
            {user ? `Logado como ${user}` : "Sessão local"}
          </p>
          <button
            type="button"
            onClick={onLogout}
            className="mt-4 rounded-xl border border-rose-500/30 px-5 py-2.5 text-sm font-semibold text-rose-300 transition hover:bg-rose-500/10"
          >
            Sair da conta
          </button>
          <a
            href="#/admin"
            className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-slate-600 transition hover:text-slate-300"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16 8.5a4 4 0 11-8 0 4 4 0 018 0zM5 21a7 7 0 0114 0"
              />
            </svg>
            Painel administrativo (fora do site)
          </a>
        </div>

        <div className="mt-10">
          <InstallGuide />
        </div>
      </div>
    </section>
  );
}
