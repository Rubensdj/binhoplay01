import { useState } from "react";
import { catalog } from "../catalog";

const STEPS = [
  {
    title: "Baixe o repositório",
    body: "Toque em “Baixar repositório” para salvar o arquivo de instalação do repositório.",
  },
  {
    title: "Instale no Kodi",
    body: "Em Instalações → Instalar a partir de arquivo zip, selecione o arquivo baixado.",
  },
  {
    title: "Adicione o link",
    body: "Em Instalações → Instalar a partir de repositório, adicione o endereço abaixo e instale o addon.",
  },
];

export default function InstallGuide() {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(catalog.repoUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard indisponível — o usuário pode copiar manualmente do campo.
    }
  };

  return (
    <section id="install" className="scroll-mt-20 border-t border-white/5 bg-ink-900/50 py-20">
      <div className="mx-auto max-w-6xl px-5">
        <div className="max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-accent-400">Instalação</p>
          <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            Como instalar no Kodi
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-400">
            Compatível com Kodi {catalog.supportedKodi}. Depois de instalar, os addons recebem
            atualizações automaticamente pelo repositório.
          </p>
        </div>

        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {STEPS.map((step, i) => (
            <div
              key={step.title}
              className="relative rounded-2xl border border-white/5 bg-ink-800/70 p-6 shadow-lg shadow-black/20"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-accent-600 text-base font-black text-white">
                {i + 1}
              </span>
              <h3 className="mt-4 text-base font-bold text-white">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{step.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-8 rounded-2xl border border-white/5 bg-ink-800/70 p-6">
          <p className="text-sm font-semibold text-white">Link do repositório (gerenciador de repositórios)</p>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            <input
              readOnly
              value={catalog.repoUrl}
              onFocus={(e) => e.currentTarget.select()}
              className="w-full flex-1 rounded-xl border border-white/10 bg-ink-950 px-4 py-3 font-mono text-sm text-brand-300 outline-none transition focus:border-brand-500/60"
            />
            <button
              type="button"
              onClick={copy}
              className={
                copied
                  ? "rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white transition"
                  : "rounded-xl bg-gradient-to-r from-brand-500 to-accent-600 px-5 py-3 text-sm font-bold text-white shadow-md shadow-brand-600/25 transition hover:brightness-110"
              }
            >
              {copied ? "Copiado!" : "Copiar link"}
            </button>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Atualizações semanais — fique de olho nas novidades no Telegram.
          </p>
        </div>
      </div>
    </section>
  );
}
