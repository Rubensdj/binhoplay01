import { useAdminData } from "../lib/adminStore";

export default function Footer() {
  const { config } = useAdminData();
  const siteName = config.siteName || "Binhoplay";

  return (
    <footer className="border-t border-white/5 py-12">
      <div className="mx-auto max-w-6xl px-5">
        <div className="flex flex-col items-center gap-6 text-center">
          <p className="max-w-3xl text-sm leading-relaxed text-slate-500">
            <strong className="text-slate-300">{siteName}</strong> é apenas um agregador de links e,
            assim como o Google, apenas agrega e organiza links externos — não somos responsáveis
            pelos arquivos encontrados. Proibida a venda dos add-ons. Não vendemos IPTV: qualquer
            site ou app que ofereça isso é falso.
          </p>
          <a
            href={config.telegramUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-sky-500/30 bg-sky-500/10 px-5 py-2.5 text-sm font-semibold text-sky-300 transition hover:bg-sky-500/20"
          >
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M21.9 4.3c.3-1.2-.9-2.2-2-1.7L2.5 9.9c-1.2.5-1.1 2.2.1 2.6l4.2 1.3 1.6 5.1c.3 1.1 1.7 1.4 2.5.6l2.3-2.3 4.3 3.2c1 .7 2.4.2 2.7-1l3.7-15.1zM8.4 13.4l9.5-6c.4-.2.7.3.4.6l-7.4 7.1-.3 3.1-2.2-4.8z" />
            </svg>
            Participe do Telegram
          </a>
          <p className="text-xs text-slate-600">
            <strong>Binhoplay</strong> — Projeto comunitário, sem anúncios e com comunicação
            transparente. © 2026.
          </p>
        </div>
      </div>
    </footer>
  );
}
