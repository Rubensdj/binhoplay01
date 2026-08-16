import { useEffect, useState } from "react";
import { catalog } from "../catalog";
import { fetchRepo, getRepos, parseRepoXml, saveRepos, type Repo, type RepoAddon } from "../lib/repos";

const DEFAULT_REPO_URL = `${catalog.repoUrl}/addons/repo/addons.xml`;

function AddonRow({ addon }: { addon: RepoAddon }) {
  return (
    <div className="flex items-start gap-4 rounded-2xl border border-white/5 bg-ink-900/60 p-4">
      {addon.icon && (
        <img
          src={addon.icon}
          alt=""
          loading="lazy"
          className="h-12 w-12 shrink-0 rounded-xl object-cover ring-1 ring-white/10"
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="truncate text-sm font-bold text-white">{addon.name}</h4>
          {addon.version && (
            <span className="rounded-full border border-brand-500/30 bg-brand-500/10 px-2 py-0.5 text-[10px] font-semibold text-brand-300">
              v{addon.version}
            </span>
          )}
        </div>
        {addon.provider && <p className="mt-0.5 text-[11px] text-slate-500">{addon.provider}</p>}
        {addon.summary && (
          <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-slate-400">{addon.summary}</p>
        )}
      </div>
      <a
        href={addon.downloadUrl}
        download
        className="shrink-0 rounded-lg bg-gradient-to-r from-brand-500 to-accent-600 px-3.5 py-2 text-xs font-bold text-white shadow-md shadow-brand-600/25 transition hover:brightness-110"
      >
        Baixar
      </a>
    </div>
  );
}

function RepoCard({ repo, onRefresh, onRemove }: { repo: Repo; onRefresh: () => void; onRemove: () => void }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="overflow-hidden rounded-2xl border border-white/5 bg-ink-800/70 shadow-lg shadow-black/20">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-white/[0.03]"
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-bold text-white">{repo.name}</span>
          <span className="mt-0.5 block truncate font-mono text-[11px] text-slate-500">{repo.url}</span>
          <span className="mt-1 block text-[11px] text-slate-500">
            {repo.addons.length} addons · lido em{" "}
            {new Date(repo.fetchedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </span>
        </span>
        <svg
          className={`h-4 w-4 shrink-0 text-slate-500 transition ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="border-t border-white/5 p-5">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onRefresh}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-white/5"
            >
              ↻ Atualizar
            </button>
            <button
              type="button"
              onClick={onRemove}
              className="rounded-lg border border-rose-500/30 px-3 py-1.5 text-xs font-medium text-rose-300 transition hover:bg-rose-500/10"
            >
              Remover
            </button>
          </div>

          <p className="mt-4 text-xs text-slate-500">
            No Kodi, adicione este link em <strong className="text-slate-300">Instalações → Instalar a partir de repositório</strong>.
          </p>

          <div className="mt-4 space-y-3">
            {repo.addons.length === 0 ? (
              <p className="text-sm text-slate-500">Nenhum addon encontrado neste repositório.</p>
            ) : (
              repo.addons.map((addon) => <AddonRow key={addon.id} addon={addon} />)
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ReposPage() {
  const [repos, setRepos] = useState<Repo[]>(() => getRepos());
  const [urlInput, setUrlInput] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seedLoading, setSeedLoading] = useState(() => getRepos().length === 0);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");

  useEffect(() => {
    if (getRepos().length > 0) return;
    let alive = true;
    setSeedLoading(true);
    fetchRepo(DEFAULT_REPO_URL)
      .then((repo) => {
        const next = [repo];
        saveRepos(next);
        if (alive) setRepos(next);
      })
      .catch(() => {
        // Seed opcional — o usuário pode adicionar repositórios manualmente.
      })
      .finally(() => {
        if (alive) setSeedLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const addRepo = async (url: string) => {
    const clean = url.trim();
    if (!clean) return;
    setAdding(true);
    setError(null);
    try {
      const repo = await fetchRepo(clean);
      const next = [repo, ...getRepos().filter((r) => r.url !== clean)];
      saveRepos(next);
      setRepos(next);
      setUrlInput("");
      setPasteText("");
      setPasteOpen(false);
    } catch (err) {
      setError(
        err instanceof TypeError
          ? "Não foi possível acessar este link (rede/CORS). Verifique a URL ou cole o conteúdo do addons.xml abaixo."
          : err instanceof Error
            ? err.message
            : "Falha ao ler o repositório."
      );
      setPasteOpen(true);
    } finally {
      setAdding(false);
    }
  };

  const importPaste = () => {
    if (!pasteText.trim()) return;
    try {
      const repo = parseRepoXml(pasteText, urlInput.trim() || "colado");
      const next = [repo, ...getRepos().filter((r) => r.url !== repo.url)];
      saveRepos(next);
      setRepos(next);
      setError(null);
      setPasteText("");
      setPasteOpen(false);
    } catch {
      setError("Não foi possível interpretar o conteúdo colado como addons.xml.");
    }
  };

  const refreshRepo = (repo: Repo) => {
    fetchRepo(repo.url)
      .then((fresh) => {
        const next = getRepos().map((r) => (r.url === repo.url ? fresh : r));
        saveRepos(next);
        setRepos(next);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Falha ao atualizar o repositório.");
      });
  };

  const removeRepo = (repo: Repo) => {
    const next = getRepos().filter((r) => r.url !== repo.url);
    saveRepos(next);
    setRepos(next);
  };

  return (
    <section className="py-10">
      <div className="mx-auto max-w-4xl px-5">
        <div className="max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-brand-400">Repositórios</p>
          <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            Leia repositórios Kodi como o Kodi faz
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-400">
            Adicione o endereço do <code className="rounded bg-white/5 px-1.5 py-0.5 text-xs text-slate-300">addons.xml</code>{" "}
            de qualquer repositório Kodi. O app lê os metadados, resolve o{" "}
            <code className="rounded bg-white/5 px-1.5 py-0.5 text-xs text-slate-300">datadir</code> dos zips e organiza os
            addons para download.
          </p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void addRepo(urlInput);
          }}
          className="mt-8 flex flex-col gap-3 sm:flex-row"
        >
          <input
            type="url"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="https://exemplo.com/repo/addons.xml"
            className="w-full flex-1 rounded-xl border border-white/10 bg-ink-800/80 px-4 py-3 font-mono text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-brand-500/60 focus:ring-2 focus:ring-brand-500/20"
          />
          <button
            type="submit"
            disabled={adding || !urlInput.trim()}
            className="rounded-xl bg-gradient-to-r from-brand-500 to-accent-600 px-6 py-3 text-sm font-bold text-white shadow-md shadow-brand-600/25 transition enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {adding ? "Lendo…" : "Adicionar"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => setPasteOpen((v) => !v)}
          className="mt-3 text-xs font-medium text-slate-500 transition hover:text-slate-300"
        >
          {pasteOpen ? "Ocultar" : "Prefere colar o conteúdo do addons.xml?"}
        </button>

        {pasteOpen && (
          <div className="mt-3 rounded-2xl border border-white/5 bg-ink-800/60 p-4">
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              rows={6}
              placeholder={"<?xml version=\"1.0\"?>\n<addons>…</addons>"}
              className="w-full rounded-xl border border-white/10 bg-ink-950 px-3 py-2.5 font-mono text-xs text-white outline-none transition placeholder:text-slate-600 focus:border-brand-500/60"
            />
            <button
              type="button"
              onClick={importPaste}
              disabled={!pasteText.trim()}
              className="mt-3 rounded-xl bg-gradient-to-r from-brand-500 to-accent-600 px-5 py-2.5 text-sm font-bold text-white transition enabled:hover:brightness-110 disabled:opacity-40"
            >
              Importar do texto
            </button>
          </div>
        )}

        {error && (
          <p className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-xs font-medium text-amber-200/90">
            {error}
          </p>
        )}

        <div className="mt-8 space-y-4">
          {seedLoading && (
            <div className="rounded-2xl border border-dashed border-white/10 py-10 text-center text-sm text-slate-500">
              Lendo o repositório padrão…
            </div>
          )}
          {!seedLoading && repos.length === 0 && (
            <div className="rounded-2xl border border-dashed border-white/10 py-10 text-center text-sm text-slate-500">
              Nenhum repositório ainda. Adicione um link acima.
            </div>
          )}
          {repos.map((repo) => (
            <RepoCard
              key={repo.url}
              repo={repo}
              onRefresh={() => refreshRepo(repo)}
              onRemove={() => removeRepo(repo)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
