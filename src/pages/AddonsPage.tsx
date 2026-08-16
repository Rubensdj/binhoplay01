import { useCallback, useEffect, useState } from "react";
import Catalog from "../components/Catalog";
import { catalog, formatBytes, formatDate, typeLabel, type ExtraFile } from "../catalog";
import { fetchOfficialRepo, type OfficialPull } from "../lib/repos";

const AGE_KEY = "binho:+18-ok";

function ExtraCard({ extra }: { extra: ExtraFile }) {
  const [confirmed, setConfirmed] = useState(
    () => extra.adult && typeof sessionStorage !== "undefined" && sessionStorage.getItem(AGE_KEY) === "1"
  );
  const [asking, setAsking] = useState(false);

  const confirmAge = () => {
    try {
      sessionStorage.setItem(AGE_KEY, "1");
    } catch {
      // ignora falha de storage
    }
    setConfirmed(true);
    setAsking(false);
  };

  return (
    <article className="group flex flex-col rounded-2xl border border-white/5 bg-ink-800/70 p-5 shadow-lg shadow-black/20 transition hover:-translate-y-1 hover:border-brand-500/30 hover:shadow-xl">
      <div className="flex items-start gap-4">
        <div
          className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl text-lg font-black text-white ${
            extra.adult
              ? "bg-gradient-to-br from-rose-600 to-rose-900"
              : "bg-gradient-to-br from-brand-500 to-accent-600"
          }`}
        >
          {extra.name.charAt(0)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-base font-bold text-white">{extra.name}</h3>
            {extra.version && (
              <span className="rounded-full border border-brand-500/30 bg-brand-500/10 px-2 py-0.5 text-[11px] font-semibold text-brand-300">
                v{extra.version}
              </span>
            )}
            {extra.adult && (
              <span className="rounded-full border border-rose-500/40 bg-rose-500/10 px-2 py-0.5 text-[11px] font-bold text-rose-300">
                +18
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-500">{typeLabel[extra.type]}</p>
        </div>
      </div>

      <p className="mt-4 line-clamp-2 text-sm leading-relaxed text-slate-400">
        {extra.summary || "Arquivo do repositório."}
      </p>

      <div className="mt-auto pt-5">
        {confirmed || !extra.adult ? (
          <a
            href={extra.url}
            download
            className="block rounded-lg bg-gradient-to-r from-brand-500 to-accent-600 px-4 py-2.5 text-center text-sm font-bold text-white shadow-md shadow-brand-600/25 transition hover:brightness-110"
          >
            Baixar ({formatBytes(extra.size)})
          </a>
        ) : (
          <button
            type="button"
            onClick={() => setAsking(true)}
            className="block w-full rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-2.5 text-center text-sm font-bold text-rose-300 transition hover:bg-rose-500/20"
          >
            Conteúdo +18 — revelar
          </button>
        )}
      </div>

      {asking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-5 backdrop-blur-sm" onClick={() => setAsking(false)}>
          <div
            className="w-full max-w-sm rounded-3xl border border-white/10 bg-ink-900 p-6 text-center shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-2xl">🔞</p>
            <h4 className="mt-3 text-lg font-bold text-white">Conteúdo adulto</h4>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              Este arquivo contém conteúdos +18. Confirme que você tem 18 anos ou mais para
              continuar.
            </p>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={confirmAge}
                className="flex-1 rounded-xl bg-gradient-to-r from-rose-500 to-rose-700 px-4 py-2.5 text-sm font-bold text-white transition hover:brightness-110"
              >
                Tenho 18+
              </button>
              <button
                type="button"
                onClick={() => setAsking(false)}
                className="flex-1 rounded-xl border border-white/10 px-4 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-white/5"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}

export default function AddonsPage() {
  const [live, setLive] = useState<OfficialPull | null>(null);
  const [liveStatus, setLiveStatus] = useState<"loading" | "ok" | "error">("loading");

  const pull = useCallback(() => {
    setLiveStatus("loading");
    fetchOfficialRepo(catalog.repoUrl)
      .then((result) => {
        setLive(result);
        setLiveStatus("ok");
      })
      .catch(() => {
        setLiveStatus("error");
      });
  }, []);

  useEffect(() => {
    pull();
  }, [pull]);

  const liveAddons = live?.addons ?? catalog.addons;

  return (
    <>
      <section className="pt-10">
        <div className="mx-auto max-w-6xl px-5">
          <div
            className={`flex flex-col gap-3 rounded-2xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${
              liveStatus === "error"
                ? "border-amber-500/20 bg-amber-500/5"
                : "border-white/5 bg-ink-800/60"
            }`}
          >
            <p className="text-xs leading-relaxed text-slate-400">
              {liveStatus === "loading" && "Puxando tudo do repositório oficial…"}
              {liveStatus === "ok" && (
                <>
                  <span className="font-semibold text-emerald-300">● Ao vivo</span> — tudo do{" "}
                  <code className="rounded bg-white/5 px-1 py-0.5 text-[10px] text-slate-300">
                    {catalog.repoUrl}/addons/repo/addons.xml
                  </code>{" "}
                  (+ matrix), puxado às {formatDate(live?.fetchedAt ?? "")} · {liveAddons.length} addons
                </>
              )}
              {liveStatus === "error" &&
                "Não foi possível puxar ao vivo (rede/CORS) — exibindo o catálogo embutido."}
            </p>
            <button
              type="button"
              onClick={pull}
              disabled={liveStatus === "loading"}
              className="shrink-0 rounded-lg border border-white/10 px-4 py-2 text-xs font-semibold text-slate-300 transition enabled:hover:bg-white/5 disabled:opacity-40"
            >
              {liveStatus === "loading" ? "Puxando…" : "↻ Puxar agora"}
            </button>
          </div>
        </div>
      </section>
      <Catalog
        addons={liveAddons}
        sourceLabel={
          live
            ? `Puxado ao vivo do repositório oficial · atualizado em ${formatDate(live.fetchedAt)}`
            : `Catálogo embutido · atualizado em ${formatDate(catalog.generatedAt)}`
        }
      />
      {catalog.extraFiles.length > 0 && (
        <section className="pb-4">
          <div className="mx-auto max-w-6xl px-5">
            <h3 className="text-lg font-bold text-white">Mais do repositório</h3>
            <p className="mt-1 text-xs text-slate-500">
              Outros pacotes distribuídos no repositório, com metadados lidos de dentro dos zips.
            </p>
            <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {catalog.extraFiles.map((extra) => (
                <ExtraCard key={extra.id} extra={extra} />
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="pb-20 pt-10">
        <div className="mx-auto max-w-6xl px-5">
          <h3 className="text-lg font-bold text-white">Todos os arquivos do repositório</h3>
          <p className="mt-1 text-xs text-slate-500">
            Inventário completo da pasta <code className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-slate-300">addons/</code>.
          </p>
          <div className="mt-4 overflow-hidden rounded-2xl border border-white/5">
            {catalog.files.map((file, i) => (
              <a
                key={file.url}
                href={file.url}
                download
                className={`flex items-center justify-between gap-4 px-5 py-4 transition hover:bg-white/5 ${
                  i % 2 ? "bg-white/[0.02]" : ""
                }`}
              >
                <span className="flex min-w-0 items-center gap-3 text-sm font-medium text-slate-200">
                  <svg
                    className="h-4 w-4 shrink-0 text-slate-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 10v6m0 0l-3-3m3 3l3-3M4 19V5a2 2 0 012-2h9l5 5v11a2 2 0 01-2 2H6a2 2 0 01-2-2z"
                    />
                  </svg>
                  <span className="truncate font-mono text-xs">{file.name}</span>
                </span>
                <span className="shrink-0 text-xs text-slate-500">{formatBytes(file.size)}</span>
              </a>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
