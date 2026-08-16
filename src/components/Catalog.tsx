import { useMemo, useState } from "react";
import {
  catalog,
  formatBytes,
  formatDate,
  typeLabel,
  type Addon,
  type AddonType,
} from "../catalog";

const FILTERS: Array<{ key: AddonType | "all"; label: string }> = [
  { key: "all", label: "Todos" },
  { key: "video", label: "Vídeo" },
  { key: "repository", label: "Repositório" },
  { key: "script", label: "Script" },
  { key: "other", label: "Utilitário" },
];

function SearchIcon() {
  return (
    <svg
      className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 10.5a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z" />
    </svg>
  );
}

function AddonCard({ addon, list }: { addon: Addon; list: Addon[] }) {
  const [expanded, setExpanded] = useState(false);
  const size = formatBytes(addon.size);

  // Dependências presentes na mesma lista (ex.: f4mTester → F4mProxy).
  const deps = (addon.dependencies ?? [])
    .map((depId) => list.find((a) => a.id === depId))
    .filter((a): a is Addon => Boolean(a));

  const downloadTogether = () => {
    const urls = [addon.downloadUrl, ...deps.map((d) => d.downloadUrl)].filter(Boolean);
    for (const url of urls) {
      const a = document.createElement("a");
      a.href = url;
      a.download = "";
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
  };

  return (
    <article className="group flex flex-col rounded-2xl border border-white/5 bg-ink-800/70 p-5 shadow-lg shadow-black/20 transition hover:-translate-y-1 hover:border-brand-500/30 hover:shadow-xl">
      <div className="flex items-start gap-4">
        {addon.icon ? (
          <img
            src={addon.icon}
            alt=""
            loading="lazy"
            className="h-14 w-14 shrink-0 rounded-xl object-cover ring-1 ring-white/10"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        ) : (
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-accent-600 text-lg font-black text-white">
            {addon.name.charAt(0)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-base font-bold text-white">{addon.name}</h3>
            <span className="rounded-full border border-brand-500/30 bg-brand-500/10 px-2 py-0.5 text-[11px] font-semibold text-brand-300">
              v{addon.version}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {typeLabel[addon.type]}
            {addon.provider ? ` · ${addon.provider}` : ""}
          </p>
        </div>
      </div>

      <p className="mt-4 line-clamp-2 text-sm leading-relaxed text-slate-400">
        {addon.summary || addon.description || "Sem descrição disponível."}
      </p>

      {expanded && (
        <div className="mt-4 space-y-3 border-t border-white/5 pt-4 text-sm">
          {addon.description && (
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Descrição</h4>
              <p className="mt-1 leading-relaxed text-slate-400">{addon.description}</p>
            </div>
          )}
          {addon.news && (
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Novidades</h4>
              <p className="mt-1 text-slate-300">{addon.news}</p>
            </div>
          )}
          {addon.disclaimer && (
            <p className="rounded-lg bg-amber-500/5 px-3 py-2 text-xs leading-relaxed text-amber-200/70">
              {addon.disclaimer}
            </p>
          )}
        </div>
      )}

      {deps.length > 0 && (
        <div className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2.5">
          <p className="text-xs font-semibold text-amber-200">
            Requer:{" "}
            {deps.map((d) => (
              <span key={d.id} className="font-bold text-amber-300">
                {d.name} v{d.version}
              </span>
            ))}
          </p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-amber-200/60">
            No Kodi, as dependências são instaladas automaticamente. Aqui, baixe os dois juntos
            e instale {deps.length > 1 ? "na ordem" : "o addon e depois a dependência"} pelo arquivo zip.
          </p>
        </div>
      )}

      <div className="mt-auto flex items-center gap-2 pt-5">
        <a
          href={addon.downloadUrl}
          download
          className="flex-1 rounded-lg bg-gradient-to-r from-brand-500 to-accent-600 px-4 py-2.5 text-center text-sm font-bold text-white shadow-md shadow-brand-600/25 transition hover:brightness-110"
        >
          Baixar {size && `(${size})`}
        </a>
        {deps.length > 0 && (
          <button
            type="button"
            onClick={downloadTogether}
            className="rounded-lg bg-gradient-to-r from-amber-500 to-orange-600 px-3 py-2.5 text-sm font-bold text-white shadow-md shadow-amber-600/25 transition hover:brightness-110"
          >
            Baixar tudo ({deps.length + 1})
          </button>
        )}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="rounded-lg border border-white/10 px-3 py-2.5 text-sm text-slate-300 transition hover:bg-white/5"
        >
          {expanded ? "Ocultar" : "Detalhes"}
        </button>
      </div>
    </article>
  );
}

export default function Catalog({
  addons,
  sourceLabel,
}: {
  /** Lista de addons (padrão: catálogo embutido). Use para puxar do repositório ao vivo. */
  addons?: Addon[];
  /** Texto exibido no subtítulo explicando a origem dos dados. */
  sourceLabel?: string;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<AddonType | "all">("all");

  const list = addons ?? catalog.addons;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return list.filter((addon) => {
      if (filter !== "all" && addon.type !== filter) return false;
      if (!q) return true;
      return [addon.id, addon.name, addon.summary, addon.description, addon.provider]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [list, query, filter]);

  return (
    <section id="catalog" className="scroll-mt-20 py-20">
      <div className="mx-auto max-w-6xl px-5">
        <div className="max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-brand-400">Catálogo</p>
          <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            Addons organizados automaticamente
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-400">
            {sourceLabel ??
              `Lido de addons/repo/addons.xml · atualizado em ${formatDate(catalog.generatedAt)}`}
          </p>
        </div>

        <div className="mt-8 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-sm">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar addon, descrição…"
              className="w-full rounded-xl border border-white/10 bg-ink-800/80 py-2.5 pl-10 pr-4 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-brand-500/60 focus:ring-2 focus:ring-brand-500/20"
            />
            <SearchIcon />
          </div>
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((f) => {
              const active = filter === f.key;
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFilter(f.key)}
                  className={
                    active
                      ? "rounded-full bg-gradient-to-r from-brand-500 to-accent-600 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-brand-600/25"
                      : "rounded-full border border-white/10 px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-white/5 hover:text-white"
                  }
                >
                  {f.label}
                </button>
              );
            })}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-dashed border-white/10 py-16 text-center text-sm text-slate-500">
            Nenhum addon encontrado{query.trim() ? ` para “${query.trim()}”` : ""}.
          </div>
        ) : (
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((addon) => (
              <AddonCard key={addon.id} addon={addon} list={list} />
            ))}
          </div>
        )}

      </div>
    </section>
  );
}
