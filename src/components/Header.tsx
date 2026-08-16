import { useEffect, useState } from "react";
import { currentUser } from "../lib/auth";
import { useHashRoute } from "../lib/router";

const TOP_LINKS = [
  { label: "Início", href: "#/" },
  { label: "Séries", href: "#/categoria/Séries" },
  { label: "Filmes", href: "#/categoria/Filmes" },
  { label: "Minha lista", href: "#/list" },
];

const DROPDOWN_LINKS = [
  { label: "TV ao Vivo", href: "#/tv" },
  { label: "Desenhos", href: "#/categoria/Desenhos" },
  { label: "Doramas", href: "#/categoria/Doramas" },
  { label: "Animes", href: "#/categoria/Animes" },
  { label: "Novelas", href: "#/categoria/Novelas" },
  { label: "Mais", href: "#/mais" },
];

export default function Header({
  onLogout,
  onOpenSearch,
}: {
  onLogout: () => void;
  onOpenSearch: () => void;
}) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [route] = useHashRoute();
  const user = currentUser();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const activeLabel =
    route.page === "home"
      ? "Início"
      : route.page === "list"
        ? "Minha lista"
        : route.page === "category" && (route.name === "Séries" || route.name === "Filmes")
          ? route.name
          : "";

  const initials = (user ?? "B").charAt(0).toUpperCase();

  return (
    <header
      className={`fixed inset-x-0 top-0 z-40 transition-colors duration-300 ${
        scrolled || menuOpen || profileOpen
          ? "bg-ink-950/95 shadow-lg shadow-black/40"
          : "bg-gradient-to-b from-black/80 via-black/30 to-transparent"
      }`}
    >
      <div className="flex h-16 items-center gap-8 px-5 md:px-10">
        <a href="#/" className="shrink-0 text-2xl font-black tracking-tight text-white">
          BINHO<span className="text-brand-500">PLAY</span>
        </a>

        <nav className="hidden items-center gap-5 text-sm text-slate-300 md:flex">
          {TOP_LINKS.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className={`transition hover:text-white ${
                activeLabel === link.label ? "font-bold text-white" : ""
              }`}
            >
              {link.label}
            </a>
          ))}

          <div className="group relative">
            <button
              type="button"
              className="flex items-center gap-1 transition hover:text-white"
            >
              Navegar
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            <div className="invisible absolute left-0 top-full pt-2 opacity-0 transition group-hover:visible group-hover:opacity-100">
              <div className="w-52 rounded-xl border border-white/10 bg-ink-900/95 py-2 shadow-2xl shadow-black/60 backdrop-blur">
                {DROPDOWN_LINKS.map((link) => (
                  <a
                    key={link.label}
                    href={link.href}
                    className="block px-4 py-2 text-sm text-slate-300 transition hover:bg-white/5 hover:text-white"
                  >
                    {link.label}
                  </a>
                ))}
              </div>
            </div>
          </div>
        </nav>

        <div className="ml-auto flex items-center gap-3 md:gap-5">
          <button
            type="button"
            onClick={onOpenSearch}
            aria-label="Buscar"
            className="text-slate-300 transition hover:text-white"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 10.5a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z" />
            </svg>
          </button>

          <button
            type="button"
            aria-label="Notificações"
            className="relative hidden text-slate-300 transition hover:text-white sm:block"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2c0 .5-.2 1-.6 1.4L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
              />
            </svg>
            <span className="absolute right-0 top-0 h-1.5 w-1.5 rounded-full bg-brand-500" />
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() => setProfileOpen((v) => !v)}
              aria-label="Conta"
              className="flex h-8 w-8 items-center justify-center rounded bg-gradient-to-br from-brand-500 to-accent-600 text-xs font-black text-white ring-1 ring-white/20 transition hover:ring-white/50"
            >
              {initials}
            </button>
            {profileOpen && (
              <>
                <button
                  type="button"
                  aria-label="Fechar menu da conta"
                  className="fixed inset-0 z-10 cursor-default"
                  onClick={() => setProfileOpen(false)}
                />
                <div className="absolute right-0 top-full z-20 mt-2 w-56 rounded-xl border border-white/10 bg-ink-900/95 py-2 shadow-2xl shadow-black/60 backdrop-blur">
                  <p className="truncate px-4 pb-2 text-xs text-slate-500">{user ?? "Sessão local"}</p>
                  <a
                    href="#/list"
                    onClick={() => setProfileOpen(false)}
                    className="block px-4 py-2 text-sm text-slate-200 transition hover:bg-white/5 hover:text-white"
                  >
                    Minha lista
                  </a>
                  <a
                    href="#/mais"
                    onClick={() => setProfileOpen(false)}
                    className="block px-4 py-2 text-sm text-slate-200 transition hover:bg-white/5 hover:text-white"
                  >
                    Mais
                  </a>
                  <a
                    href="#/admin"
                    onClick={() => setProfileOpen(false)}
                    className="block px-4 py-2 text-sm text-slate-200 transition hover:bg-white/5 hover:text-white"
                  >
                    Painel administrativo
                  </a>
                  <button
                    type="button"
                    onClick={() => {
                      setProfileOpen(false);
                      onLogout();
                    }}
                    className="block w-full border-t border-white/5 px-4 py-2 text-left text-sm text-rose-300 transition hover:bg-rose-500/10"
                  >
                    Sair
                  </button>
                </div>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? "Fechar menu" : "Abrir menu"}
            className="text-slate-300 transition hover:text-white md:hidden"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              {menuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M4 12h16M4 17h16" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {menuOpen && (
        <nav className="border-t border-white/5 bg-ink-950/95 px-5 py-4 md:hidden">
          <div className="flex flex-col gap-1 text-sm text-slate-300">
            {[...TOP_LINKS, ...DROPDOWN_LINKS].map((link) => (
              <a
                key={link.label + link.href}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className="rounded-lg px-3 py-2.5 transition hover:bg-white/5 hover:text-white"
              >
                {link.label}
              </a>
            ))}
          </div>
        </nav>
      )}
    </header>
  );
}
