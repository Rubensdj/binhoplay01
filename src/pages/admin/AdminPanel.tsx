import { useState } from "react";
import { adminEmail, logoutAdmin } from "../../lib/admin";
import { useAdminData } from "../../lib/adminStore";
import { isRemoteReady } from "../../lib/adminSync";
import { supabaseConfigured } from "../../lib/supabase";
import AdminClients from "./AdminClients";
import AdminDashboard from "./AdminDashboard";
import AdminSellers from "./AdminSellers";
import AdminSettings from "./AdminSettings";

type Tab = "painel" | "clientes" | "vendedores" | "config";

const TABS: Array<{ key: Tab; label: string }> = [
  { key: "painel", label: "Painel" },
  { key: "clientes", label: "Clientes" },
  { key: "vendedores", label: "Vendedores" },
  { key: "config", label: "Configurações" },
];

export default function AdminPanel({ onLogout }: { onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>("painel");
  const { clients } = useAdminData();
  const pendentes = clients.filter((c) => c.status === "pendente").length;

  return (
    <div className="min-h-screen bg-ink-950 pb-20 text-slate-200 antialiased">
      <header className="sticky top-0 z-40 border-b border-white/5 bg-ink-950/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-5">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-sky-600 text-white shadow-lg shadow-emerald-600/20">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z"
                />
              </svg>
            </span>
            <div>
              <p className="text-sm font-extrabold tracking-tight text-white">
                BINHO<span className="text-emerald-400">PLAY</span>
                <span className="ml-1 text-xs font-bold text-emerald-400/80">ADMIN</span>
              </p>
              <p className="text-[10px] text-slate-500">{adminEmail() ?? "Área restrita"}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a
              href="#/"
              className="rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:bg-white/5 hover:text-white"
            >
              Ver site
            </a>
            <button
              type="button"
              onClick={() => {
                logoutAdmin();
                onLogout();
              }}
              className="rounded-xl border border-rose-500/30 px-4 py-2 text-sm font-semibold text-rose-300 transition hover:bg-rose-500/10"
            >
              Sair
            </button>
          </div>
        </div>

        <nav className="mx-auto max-w-5xl px-5">
          <div className="flex gap-1 overflow-x-auto pb-2">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                  tab === t.key
                    ? "bg-gradient-to-r from-brand-500 to-accent-600 text-white shadow-md shadow-brand-600/25"
                    : "text-slate-400 hover:bg-white/5 hover:text-white"
                }`}
              >
                {t.key === "clientes" && pendentes > 0
                  ? `Clientes (${pendentes})`
                  : t.label}
              </button>
            ))}
          </div>
        </nav>
      </header>

      <main className="mx-auto max-w-5xl px-5 pt-8">
        {supabaseConfigured && !isRemoteReady() && (
          <div className="mb-6 rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-xs font-medium leading-relaxed text-amber-200">
            Supabase conectado, mas as tabelas do painel ainda não existem. Rode o arquivo{" "}
            <code className="rounded bg-black/20 px-1 py-0.5 text-[10px]">supabase/migrations/0001_admin_tables.sql</code>{" "}
            no SQL Editor do Supabase (e cadastre seu e-mail na tabela{" "}
            <code className="rounded bg-black/20 px-1 py-0.5 text-[10px]">admins</code>) para os dados
            ficarem online. Até lá, tudo continua salvo apenas neste dispositivo.
          </div>
        )}
        {tab === "painel" && <AdminDashboard onGoClients={() => setTab("clientes")} onGoSellers={() => setTab("vendedores")} />}
        {tab === "clientes" && <AdminClients />}
        {tab === "vendedores" && <AdminSellers />}
        {tab === "config" && <AdminSettings />}
      </main>
    </div>
  );
}
