import { useMemo, useState } from "react";
import {
  CATEGORY_KEYS,
  addClient,
  applyDiscount,
  defaultAccess,
  fmtBRL,
  isTestExpired,
  removeClient,
  updateClient,
  useAdminData,
  type AccountType,
  type Client,
  type ClientAccess,
  type ClientStatus,
  type SiteConfig,
} from "../../lib/adminStore";
import {
  Badge,
  EmptyState,
  Field,
  Form,
  FormError,
  GhostButton,
  Modal,
  PrimaryButton,
  Select,
  TextInput,
  Toggle,
} from "./ui";

const STATUS_TONE: Record<ClientStatus, "emerald" | "amber" | "slate"> = {
  ativo: "emerald",
  pendente: "amber",
  inativo: "slate",
};

const STATUS_OPTIONS: ClientStatus[] = ["ativo", "pendente", "inativo"];

function AccountBadge({ client }: { client: Client }) {
  if (client.accountType === "teste") {
    const expired = isTestExpired(client);
    return <Badge tone={expired ? "rose" : "sky"}>{expired ? "teste expirado" : "teste"}</Badge>;
  }
  return <Badge tone="emerald">permanente</Badge>;
}

function accessLabel(access: ClientAccess | null): string {
  if (!access) return "Acesso completo";
  const parts: string[] = [];
  if (access.tv) parts.push("TV ao vivo");
  CATEGORY_KEYS.forEach((k) => {
    if (access.categories[k]) parts.push(k);
  });
  return parts.length > 0 ? parts.join(" · ") : "Sem acesso";
}

/** Se tudo estiver ligado, guarda null (acesso completo = herda o site). */
function normalizeAccess(a: ClientAccess): ClientAccess | null {
  const allOn = a.tv && CATEGORY_KEYS.every((k) => a.categories[k] ?? true);
  return allOn ? null : a;
}

function AccessEditor({ value, onChange }: { value: ClientAccess; onChange: (v: ClientAccess) => void }) {
  return (
    <div className="space-y-2 rounded-xl border border-white/5 bg-ink-950/60 p-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
          Acesso do cliente
        </span>
        <button
          type="button"
          onClick={() => onChange(defaultAccess())}
          className="text-[11px] font-bold text-brand-400 transition hover:text-brand-300"
        >
          Acesso completo
        </button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Toggle
          checked={value.tv}
          onChange={(v) => onChange({ ...value, tv: v })}
          label="TV ao vivo"
        />
        {CATEGORY_KEYS.map((key) => (
          <Toggle
            key={key}
            checked={value.categories[key] ?? true}
            onChange={(v) =>
              onChange({ ...value, categories: { ...value.categories, [key]: v } })
            }
            label={key}
          />
        ))}
      </div>
    </div>
  );
}

function genPassword(): string {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  let p = "";
  for (let i = 0; i < 8; i++) p += chars[Math.floor(Math.random() * chars.length)];
  return p;
}

function buildMessage(
  name: string,
  email: string,
  password: string,
  days: number,
  pending: boolean
): string {
  const url = window.location.origin;
  const aprovacao = pending
    ? " Sua conta está aguardando a aprovação do administrador — assim que for aprovada, o acesso será liberado."
    : "";
  return (
    `Olá ${name}! 🎬\n\n` +
    `Sua conta de teste do BINHO PLAY foi criada por ${days} dias.${aprovacao}\n\n` +
    `🔑 Seus dados de acesso:\n` +
    `E-mail: ${email}\n` +
    `Senha: ${password}\n\n` +
    `👉 Acesse agora: ${url}\n\n` +
    `Aproveite: TV ao vivo, Filmes, Séries, Desenhos, Doramas, Animes e Novelas.\n\n` +
    `Qualquer dúvida, é só chamar! 😉`
  );
}

interface FormState {
  name: string;
  phone: string;
  email: string;
  planId: string;
  price: string;
  discount: string;
  accountType: AccountType;
  testDays: string;
  status: ClientStatus;
  sellerId: string;
  access: ClientAccess;
  notes: string;
}

const emptyForm = (cfg: SiteConfig): FormState => ({
  name: "",
  phone: "",
  email: "",
  planId: cfg.plans[0]?.id ?? "",
  price: String(cfg.plans[0]?.price ?? ""),
  discount: "0",
  accountType: "permanente",
  testDays: String(cfg.testDaysDefault),
  status: cfg.requireApproval ? "pendente" : "ativo",
  sellerId: "",
  access: defaultAccess(),
  notes: "",
});

interface TestForm {
  name: string;
  email: string;
  sellerId: string;
  planId: string;
  days: string;
  discount: string;
  access: ClientAccess;
}

const emptyTestForm = (cfg: SiteConfig): TestForm => ({
  name: "",
  email: "",
  sellerId: "",
  planId: cfg.plans[0]?.id ?? "",
  days: String(cfg.testDaysDefault),
  discount: "0",
  access: defaultAccess(),
});

export default function AdminClients() {
  const { clients, sellers, config } = useAdminData();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"todos" | ClientStatus>("todos");
  const [typeFilter, setTypeFilter] = useState<"todos" | AccountType>("todos");
  const [editing, setEditing] = useState<Client | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(() => emptyForm(config));
  const [error, setError] = useState<string | null>(null);

  const [testOpen, setTestOpen] = useState(false);
  const [testForm, setTestForm] = useState<TestForm>(() => emptyTestForm(config));
  const [testError, setTestError] = useState<string | null>(null);
  const [delivery, setDelivery] = useState<{ email: string; password: string; message: string; days: number } | null>(null);
  const [copied, setCopied] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...clients]
      .sort((a, b) => b.createdAt - a.createdAt)
      .filter((c) => statusFilter === "todos" || c.status === statusFilter)
      .filter((c) => typeFilter === "todos" || c.accountType === typeFilter)
      .filter((c) => (q ? [c.name, c.phone, c.email].join(" ").toLowerCase().includes(q) : true));
  }, [clients, query, statusFilter, typeFilter]);

  const planName = (id: string) => config.plans.find((p) => p.id === id)?.name ?? "—";
  const sellerName = (id: string | null) => sellers.find((s) => s.id === id)?.name ?? "Sem vendedor";

  const planPrice = (id: string) => config.plans.find((p) => p.id === id)?.price ?? 0;

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm(config));
    setError(null);
    setOpen(true);
  };

  const openEdit = (c: Client) => {
    setEditing(c);
    setForm({
      name: c.name,
      phone: c.phone,
      email: c.email,
      planId: c.planId,
      price: String(c.price),
      discount: String(c.discount ?? 0),
      accountType: c.accountType,
      testDays: String(c.testDays || config.testDaysDefault),
      status: c.status,
      sellerId: c.sellerId ?? "",
      access: c.access ?? defaultAccess(),
      notes: c.notes,
    });
    setError(null);
    setOpen(true);
  };

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const discount = Math.min(100, Math.max(0, Number(form.discount.replace(",", ".")) || 0));
  const effective = form.accountType === "teste" ? 0 : applyDiscount(planPrice(form.planId), discount);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setError("Informe o nome do cliente.");
      return;
    }
    const price =
      form.accountType === "teste"
        ? 0
        : Number(form.price.replace(",", "."));
    if (form.accountType === "permanente" && (!price || price <= 0)) {
      setError("Informe um valor válido para o plano.");
      return;
    }
    const days = Math.max(1, Math.round(Number(form.testDays) || config.testDaysDefault));
    const payload = {
      name: form.name.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
      planId: form.planId,
      price,
      discount,
      accountType: form.accountType,
      testDays: form.accountType === "teste" ? days : 0,
      testExpiresAt:
        form.accountType === "teste" ? Date.now() + days * 86_400_000 : null,
      status: form.status,
      sellerId: form.sellerId || null,
      access: normalizeAccess(form.access),
      notes: form.notes.trim(),
    };
    if (editing) updateClient(editing.id, payload);
    else addClient(payload);
    setOpen(false);
  };

  // -------------------------------------------------------------------------
  // Conta de teste (para vendas) — cria credenciais e entrega por e-mail
  // -------------------------------------------------------------------------
  const openTest = () => {
    setTestForm(emptyTestForm(config));
    setTestError(null);
    setDelivery(null);
    setCopied(false);
    setTestOpen(true);
  };

  const setTest = <K extends keyof TestForm>(key: K, value: TestForm[K]) =>
    setTestForm((f) => ({ ...f, [key]: value }));

  const submitTest = (e: React.FormEvent) => {
    e.preventDefault();
    const name = testForm.name.trim();
    const email = testForm.email.trim().toLowerCase();
    if (!name) {
      setTestError("Informe o nome do cliente.");
      return;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setTestError("Informe um e-mail válido — é ele que recebe o acesso.");
      return;
    }
    const seller = sellers.find((s) => s.id === testForm.sellerId) ?? null;
    const days = Math.max(1, Math.round(Number(testForm.days) || config.testDaysDefault));
    let d = Math.min(100, Math.max(0, Number(testForm.discount.replace(",", ".")) || 0));
    if (seller && d > seller.discount) {
      setTestError(`O desconto máximo deste vendedor é ${seller.discount}%.`);
      return;
    }
    const password = genPassword();
    addClient({
      name,
      phone: "",
      email,
      planId: testForm.planId,
      price: 0,
      discount: d,
      accountType: "teste",
      testDays: days,
      testExpiresAt: Date.now() + days * 86_400_000,
      status: config.requireApproval ? "pendente" : "ativo",
      sellerId: seller?.id ?? null,
      access: normalizeAccess(testForm.access),
      notes: `Conta de teste criada por ${days} dias${seller ? ` (vendedor: ${seller.name})` : ""}.`,
    });
    setDelivery({
      email,
      password,
      days,
      message: buildMessage(name, email, password, days, config.requireApproval),
    });
    setCopied(false);
  };

  const copyDelivery = async () => {
    if (!delivery) return;
    try {
      await navigator.clipboard.writeText(delivery.message);
      setCopied(true);
    } catch {
      // Clipboard indisponível — usuário pode copiar manualmente do box.
    }
  };

  const mailtoHref = delivery
    ? `mailto:${delivery.email}?subject=${encodeURIComponent(
        "Seu acesso de teste — BINHO PLAY"
      )}&body=${encodeURIComponent(delivery.message)}`
    : "#";

  const testDiscount = Math.min(
    100,
    Math.max(0, Number(testForm.discount.replace(",", ".")) || 0)
  );
  const testDays = Math.max(1, Math.round(Number(testForm.days) || config.testDaysDefault));
  const testSeller = sellers.find((s) => s.id === testForm.sellerId) ?? null;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight text-white">Clientes</h2>
          <p className="text-sm text-slate-500">{clients.length} cadastrados</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <PrimaryButton onClick={openTest}>🎁 + Conta de teste</PrimaryButton>
          <GhostButton onClick={openNew}>+ Novo cliente</GhostButton>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nome, telefone ou e-mail…"
            className="w-full flex-1 rounded-xl border border-white/10 bg-ink-900 px-4 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-brand-500/60 focus:ring-2 focus:ring-brand-500/20"
          />
          <div className="flex gap-1 rounded-xl border border-white/10 bg-ink-900 p-1">
            {(["todos", ...STATUS_OPTIONS] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-bold capitalize transition ${
                  statusFilter === s ? "bg-brand-500/90 text-white" : "text-slate-400 hover:text-white"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-1 self-start rounded-xl border border-white/10 bg-ink-900 p-1">
          {(
            [
              { key: "todos", label: "Todos" },
              { key: "permanente", label: "Permanentes" },
              { key: "teste", label: "Testes" },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTypeFilter(t.key)}
              className={`flex-1 rounded-lg px-4 py-1.5 text-xs font-bold transition ${
                typeFilter === t.key ? "bg-sky-500/90 text-white" : "text-slate-400 hover:text-white"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState text="Nenhum cliente encontrado." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filtered.map((c) => {
            const expired = isTestExpired(c);
            return (
              <div key={c.id} className="rounded-2xl border border-white/5 bg-ink-800/70 p-5 shadow-lg shadow-black/20">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-base font-bold text-white">{c.name}</p>
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {c.phone || c.email || "sem contato"}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <AccountBadge client={c} />
                    <Badge tone={STATUS_TONE[c.status]}>{c.status}</Badge>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between rounded-xl bg-ink-900/60 px-4 py-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-slate-500">Plano</p>
                    <p className="text-sm font-bold text-white">{planName(c.planId)}</p>
                  </div>
                  <div className="text-right">
                    {c.discount > 0 && (
                      <p className="text-[10px] font-bold text-emerald-300">{c.discount}% de desconto</p>
                    )}
                    <p className={`text-lg font-black ${c.accountType === "teste" ? "text-emerald-400" : "text-brand-400"}`}>
                      {c.accountType === "teste" ? "Grátis" : fmtBRL(c.price)}
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                  <span>
                    Vendedor: <strong className="text-slate-300">{sellerName(c.sellerId)}</strong>
                  </span>
                  <span>
                    Cadastro:{" "}
                    <strong className="text-slate-300">
                      {new Date(c.createdAt).toLocaleDateString("pt-BR")}
                    </strong>
                  </span>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                  <span className="rounded-full border border-white/10 bg-ink-900/60 px-2.5 py-1">
                    {accessLabel(c.access)}
                  </span>
                  {c.accountType === "teste" && c.testExpiresAt && (
                    <span
                      className={`rounded-full border px-2.5 py-1 font-semibold ${
                        expired
                          ? "border-rose-500/40 bg-rose-500/10 text-rose-300"
                          : "border-sky-500/30 bg-sky-500/10 text-sky-300"
                      }`}
                    >
                      {expired
                        ? `Expirado em ${new Date(c.testExpiresAt).toLocaleDateString("pt-BR")}`
                        : `Expira em ${new Date(c.testExpiresAt).toLocaleDateString("pt-BR")}`}
                    </span>
                  )}
                </div>

                {c.notes && (
                  <p className="mt-3 rounded-lg border border-white/5 bg-ink-900/40 px-3 py-2 text-xs text-slate-400">
                    {c.notes}
                  </p>
                )}

                <div className="mt-4 flex flex-wrap gap-2">
                  {c.status === "pendente" && (
                    <button
                      type="button"
                      onClick={() => updateClient(c.id, { status: "ativo" })}
                      className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white shadow-md shadow-emerald-600/25 transition hover:bg-emerald-500"
                    >
                      ✓ Aprovar acesso
                    </button>
                  )}
                  <GhostButton onClick={() => openEdit(c)}>Editar</GhostButton>
                  <GhostButton
                    tone="danger"
                    onClick={() => {
                      if (window.confirm(`Excluir o cliente "${c.name}"?`)) removeClient(c.id);
                    }}
                  >
                    Excluir
                  </GhostButton>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* Novo cliente / editar cliente                                        */}
      {/* ------------------------------------------------------------------- */}
      {open && (
        <Modal title={editing ? "Editar cliente" : "Novo cliente"} onClose={() => setOpen(false)}>
          <Form onSubmit={submit}>
            <div className="space-y-4">
              <Field label="Nome *">
                <TextInput value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Nome do cliente" />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Telefone">
                  <TextInput value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="(11) 99999-9999" />
                </Field>
                <Field label="E-mail">
                  <TextInput type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="cliente@email.com" />
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Tipo de conta">
                  <Select
                    value={form.accountType}
                    onChange={(e) => set("accountType", e.target.value as AccountType)}
                  >
                    <option value="permanente">Permanente (paga)</option>
                    <option value="teste">Teste (temporária)</option>
                  </Select>
                </Field>
                {form.accountType === "teste" ? (
                  <Field label="Dias de teste">
                    <TextInput
                      inputMode="numeric"
                      value={form.testDays}
                      onChange={(e) => set("testDays", e.target.value)}
                      placeholder={String(config.testDaysDefault)}
                    />
                  </Field>
                ) : (
                  <Field label="Valor (R$)">
                    <TextInput
                      inputMode="decimal"
                      value={form.price}
                      onChange={(e) => set("price", e.target.value)}
                      placeholder="19.90"
                    />
                  </Field>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Plano">
                  <Select
                    value={form.planId}
                    onChange={(e) => {
                      const plan = config.plans.find((p) => p.id === e.target.value);
                      set("planId", e.target.value);
                      if (plan) set("price", String(plan.price));
                    }}
                  >
                    {config.plans.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} — {fmtBRL(p.price)}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Desconto (%)" hint="Aplicado sobre o preço do plano.">
                  <TextInput
                    inputMode="decimal"
                    value={form.discount}
                    onChange={(e) => {
                      const d = Math.min(100, Math.max(0, Number(e.target.value.replace(",", ".")) || 0));
                      set("discount", String(d));
                      if (form.accountType === "permanente") {
                        set("price", String(applyDiscount(planPrice(form.planId), d)));
                      }
                    }}
                    placeholder="0"
                  />
                </Field>
              </div>

              <div className="rounded-xl border border-brand-500/20 bg-brand-500/5 px-4 py-3 text-xs text-slate-300">
                {form.accountType === "teste" ? (
                  <>
                    Conta de teste — <strong className="text-emerald-300">grátis</strong> por{" "}
                    <strong className="text-white">
                      {Math.max(1, Math.round(Number(form.testDays) || config.testDaysDefault))} dias
                    </strong>
                  </>
                ) : discount > 0 ? (
                  <>
                    Preço de tabela{" "}
                    <span className="text-slate-500 line-through">{fmtBRL(planPrice(form.planId))}</span>{" "}
                    → <strong className="text-brand-300">{fmtBRL(effective)}</strong>{" "}
                    <span className="font-bold text-emerald-300">({discount}% off)</span>
                  </>
                ) : (
                  <>Valor cobrado: <strong className="text-white">{fmtBRL(effective)}</strong></>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Status"
                  hint={
                    config.requireApproval
                      ? "Novas contas ficam pendentes até você aprovar o acesso."
                      : undefined
                  }
                >
                  <Select value={form.status} onChange={(e) => set("status", e.target.value as ClientStatus)}>
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s.charAt(0).toUpperCase() + s.slice(1)}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Vendedor">
                  <Select value={form.sellerId} onChange={(e) => set("sellerId", e.target.value)}>
                    <option value="">Sem vendedor</option>
                    {sellers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              <AccessEditor value={form.access} onChange={(a) => set("access", a)} />

              <Field label="Observações">
                <textarea
                  value={form.notes}
                  onChange={(e) => set("notes", e.target.value)}
                  rows={2}
                  placeholder="Anotações sobre o cliente, forma de pagamento, etc."
                  className="w-full rounded-xl border border-white/10 bg-ink-950 px-4 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-brand-500/60 focus:ring-2 focus:ring-brand-500/20"
                />
              </Field>

              <FormError message={error} />

              <div className="flex gap-3 pt-1">
                <PrimaryButton type="submit">{editing ? "Salvar alterações" : "Cadastrar cliente"}</PrimaryButton>
                <GhostButton onClick={() => setOpen(false)}>Cancelar</GhostButton>
              </div>
            </div>
          </Form>
        </Modal>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* Conta de teste para vendas (entrega por e-mail)                      */}
      {/* ------------------------------------------------------------------- */}
      {testOpen && (
        <Modal
          title={delivery ? "Conta de teste criada!" : "Criar conta de teste"}
          onClose={() => setTestOpen(false)}
        >
          {delivery ? (
            <div className="space-y-4">
              <p className="text-sm leading-relaxed text-slate-400">
                A conta de teste de <strong className="text-white">{delivery.days} dias</strong> foi criada
                como cliente <Badge tone="sky">teste</Badge>
                {config.requireApproval && (
                  <>
                    {" "}
                    e está <Badge tone="amber">aguardando aprovação</Badge> — o acesso só abre depois
                    do seu OK no painel
                  </>
                )}
                . Envie as credenciais para <strong className="text-white">{delivery.email}</strong> — por
                e-mail ou copiando a mensagem pronta (WhatsApp/Telegram).
              </p>

              <div className="space-y-1 rounded-xl border border-white/10 bg-ink-950 p-4 font-mono text-xs text-slate-200">
                <p>
                  E-mail: <span className="font-bold text-white">{delivery.email}</span>
                </p>
                <p>
                  Senha: <span className="font-bold text-brand-300">{delivery.password}</span>
                </p>
                <p className="text-slate-500">Validade: {delivery.days} dias</p>
              </div>

              <div className="max-h-44 overflow-y-auto whitespace-pre-wrap rounded-xl border border-white/5 bg-ink-950/70 p-3 text-xs leading-relaxed text-slate-300">
                {delivery.message}
              </div>

              {copied && <p className="text-xs font-semibold text-emerald-300">✓ Mensagem copiada!</p>}

              <div className="flex flex-wrap gap-3">
                <PrimaryButton onClick={copyDelivery}>Copiar mensagem</PrimaryButton>
                <a
                  href={mailtoHref}
                  className="rounded-xl border border-sky-500/30 bg-sky-500/10 px-5 py-2.5 text-sm font-bold text-sky-300 transition hover:bg-sky-500/20"
                >
                  ✉ Enviar por e-mail
                </a>
                <GhostButton onClick={() => setTestOpen(false)}>Concluir</GhostButton>
              </div>
            </div>
          ) : (
            <Form onSubmit={submitTest}>
              <div className="space-y-4">
                <p className="text-xs leading-relaxed text-slate-500">
                  Conta temporária e gratuita para fechar vendas. As credenciais são geradas
                  automaticamente e entregues por e-mail.
                </p>
                <Field label="Nome do cliente *">
                  <TextInput value={testForm.name} onChange={(e) => setTest("name", e.target.value)} placeholder="Nome do cliente" />
                </Field>
                <Field label="E-mail do cliente *" hint="É para este e-mail que o acesso será enviado.">
                  <TextInput type="email" value={testForm.email} onChange={(e) => setTest("email", e.target.value)} placeholder="cliente@email.com" />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Vendedor">
                    <Select
                      value={testForm.sellerId}
                      onChange={(e) => {
                        const id = e.target.value;
                        const seller = sellers.find((s) => s.id === id);
                        setTest("sellerId", id);
                        if (seller) {
                          setTest("days", String(seller.testDays || config.testDaysDefault));
                        }
                      }}
                    >
                      <option value="">Sem vendedor</option>
                      {sellers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Dias de teste">
                    <TextInput
                      inputMode="numeric"
                      value={testForm.days}
                      onChange={(e) => setTest("days", e.target.value)}
                    />
                  </Field>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Plano (referência)">
                    <Select value={testForm.planId} onChange={(e) => setTest("planId", e.target.value)}>
                      {config.plans.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} — {fmtBRL(p.price)}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field
                    label="Desconto (%)"
                    hint={testSeller ? `Limite do vendedor: ${testSeller.discount}%` : "Sem limite (administrador)"}
                  >
                    <TextInput
                      inputMode="decimal"
                      value={testForm.discount}
                      onChange={(e) => setTest("discount", e.target.value)}
                      placeholder="0"
                    />
                  </Field>
                </div>
                <AccessEditor value={testForm.access} onChange={(a) => setTest("access", a)} />
                <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 px-4 py-3 text-xs text-slate-300">
                  Grátis por <strong className="text-white">{testDays} dias</strong>
                  {testDiscount > 0 && (
                    <>
                      {" "}· desconto registrado: <strong className="text-emerald-300">{testDiscount}%</strong>
                    </>
                  )}
                </div>

                <FormError message={testError} />

                <div className="flex gap-3 pt-1">
                  <PrimaryButton type="submit">Criar conta de teste</PrimaryButton>
                  <GhostButton onClick={() => setTestOpen(false)}>Cancelar</GhostButton>
                </div>
              </div>
            </Form>
          )}
        </Modal>
      )}
    </div>
  );
}
