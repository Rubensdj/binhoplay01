import { useState } from "react";
import { currentUser } from "../lib/auth";

const NAV_LINKS = [
  { href: "#/tv", label: "TV" },
  { href: "#/addons", label: "Addons" },
  { href: "#/repos", label: "Repositórios" },
  { href: "#/player", label: "Player" },
];

export default function Header({ onLogout }: { onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const user = currentUser();

  return (
    <header className="sticky top-0 z-50 border-b border-white/5 bg-ink-950/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <a href="#/" className="flex items-center gap-3">
          <img
            src="/addons/repo/Plugins/plugin.video.BrazucaPlay/icon.png"
            alt="Logo Binho Play"
            className="h-9 w-9 rounded-lg object-cover ring-1 ring-white/10"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
          <span className="text-lg font-extrabold tracking-tight text-white">
            BINHO<span className="text-brand-400">PLAY</span>
          </span>
        </a>

        <nav className="hidden items-center gap-7 text-sm font-medium text-slate-300 md:flex">
          {NAV_LINKS.map((link) => (
            <a key={link.href} href={link.href} className="transition hover:text-white">
              {link.label}
            </a>
          ))}
          {user && (
            <span className="text-xs text-slate-500" title="Usuário logado">
              {user}
            </span>
          )}
          <button
            type="button"
            onClick={onLogout}
            className="rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:bg-white/5 hover:text-white"
          >
            Sair
          </button>
        </nav>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Fechar menu" : "Abrir menu"}
          aria-expanded={open}
          className="rounded-lg border border-white/10 p-2 text-slate-300 transition hover:bg-white/5 md:hidden"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            {open ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M4 12h16M4 17h16" />
            )}
          </svg>
        </button>
      </div>

      {open && (
        <nav className="border-t border-white/5 bg-ink-900/95 px-5 py-4 md:hidden">
          <div className="flex flex-col gap-3 text-sm font-medium text-slate-300">
            {NAV_LINKS.map((link) => (
              <a key={link.href} href={link.href} onClick={() => setOpen(false)} className="transition hover:text-white">
                {link.label}
              </a>
            ))}
            {user && <span className="text-xs text-slate-500">Logado como {user}</span>}
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onLogout();
              }}
              className="rounded-full border border-white/10 px-4 py-2 text-left font-semibold text-slate-300 transition hover:bg-white/5"
            >
              Sair
            </button>
          </div>
        </nav>
      )}
    </header>
  );
}
