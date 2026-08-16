import { fmtBRL, updateClient, useAdminData } from "../../lib/adminStore";
import { Badge, Card, EmptyState } from "./ui";

const STATUS_TONE: Record<string, "emerald" | "amber" | "rose" | "slate"> = {
  ativo: "emerald",
  pendente: "amber",
  bloqueado: "rose",
  inativo: "slate",
};

export default function AdminDashboard({
  onGoClients,
  onGoSellers,
}: {
  onGoClients: () => void;
  onGoSellers: () => void;
}) {
  const { clients, sellers, config } = useAdminData();

  const ativos = clients.filter((c) => c.status === "ativo");
  const pendentes = clients.filter((c) => c.status === "pendente");
  const bloqueados = clients.filter((c) => c.status === "bloqueado");
  const testes = clients.filter((c) => c.accountType === "teste");
  const receitaMensal = ativos
    .filter((c) => c.accountType !== "teste")
    .reduce((sum, c) => sum + c.price, 0);

  const sellerName = (id: string | null) => sellers.find((s) => s.id === id)?.name ?? "—";

  const recent = [...clients].sort((a, b) => b.createdAt - a.createdAt).slice(0, 6);

  const stats = [
    { label: "Clientes ativos", value: String(ativos.length), accent: "text-emerald-400" },
    { label: "Contas de teste", value: String(testes.length), accent: "text-sky-400" },
    { label: "Clientes pendentes", value: String(pendentes.length), accent: "text-amber-400" },
    { label: "Clientes bloqueados", value: String(bloqueados.length), accent: "text-rose-400" },
    { label: "Receita estimada (ativos)", value: fmtBRL(receitaMensal), accent: "text-brand-400" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl border border-white/5 bg-ink-800/70 p-5 shadow-lg shadow-black/20">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{s.label}</p>
            <p className={`mt-2 text-2xl font-black tracking-tight ${s.accent}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <Card
        title="Vendedores"
        action={
          <button type="button" onClick={onGoSellers} className="text-xs font-bold text-brand-400 transition hover:text-brand-300">
            Gerenciar vendedores →
          </button>
        }
      >
        {sellers.length === 0 ? (
          <EmptyState text="Nenhum vendedor cadastrado ainda." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {sellers.map((s) => {
              const total = clients.filter((c) => c.sellerId === s.id).length;
              return (
                <div key={s.id} className="rounded-xl border border-white/5 bg-ink-900/60 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-bold text-white">{s.name}</p>
                    {s.active ? (
                      <Badge tone="emerald">ativo</Badge>
                    ) : (
                      <Badge tone="slate">inativo</Badge>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{s.phone || s.email || "sem contato"}</p>
                  <p className="mt-2 text-xs text-slate-400">
                    <span className="font-bold text-white">{total}</span> clientes · comissão{" "}
                    <span className="font-bold text-brand-300">{s.commission}%</span>
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card
        title="Clientes recentes"
        action={
          <button type="button" onClick={onGoClients} className="text-xs font-bold text-brand-400 transition hover:text-brand-300">
            Gerenciar clientes →
          </button>
        }
      >
        {recent.length === 0 ? (
          <EmptyState text="Nenhum cliente cadastrado ainda." />
        ) : (
          <div className="divide-y divide-white/5">
            {recent.map((c) => {
              const plan = config.plans.find((p) => p.id === c.planId);
              return (
                <div key={c.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-white">{c.name}</p>
                    <p className="truncate text-xs text-slate-500">
                      {plan ? `${plan.name} · ` : ""}
                      {c.phone || c.email} · vendedor: {sellerName(c.sellerId)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {c.discount > 0 && (
                      <span className="text-xs font-bold text-emerald-300">-{c.discount}%</span>
                    )}
                    <span className="text-sm font-bold text-slate-200">
                      {c.accountType === "teste" ? "Grátis" : fmtBRL(c.price)}
                    </span>
                    {c.accountType === "teste" ? (
                      <Badge tone="sky">teste</Badge>
                    ) : (
                      <Badge tone="emerald">perm.</Badge>
                    )}
                    <Badge tone={STATUS_TONE[c.status] ?? "slate"}>{c.status}</Badge>
                    {c.status === "pendente" && (
                      <button
                        type="button"
                        onClick={() => updateClient(c.id, { status: "ativo" })}
                        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-500"
                      >
                        Aprovar
                      </button>
                    )}
                    {c.status === "bloqueado" && (
                      <button
                        type="button"
                        onClick={() => updateClient(c.id, { status: "ativo" })}
                        className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-rose-500"
                      >
                        Desbloquear
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
