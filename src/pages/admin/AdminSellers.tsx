import { useState } from "react";
import {
  addSeller,
  removeSeller,
  updateSeller,
  useAdminData,
  type Seller,
} from "../../lib/adminStore";
import { Badge, Card, EmptyState, Field, Form, FormError, GhostButton, Modal, PrimaryButton, TextInput, Toggle } from "./ui";

interface FormState {
  name: string;
  phone: string;
  email: string;
  commission: string;
  discount: string;
  canCreateTests: boolean;
  testDays: string;
}

const emptyForm = (defaultDays: number): FormState => ({
  name: "",
  phone: "",
  email: "",
  commission: "10",
  discount: "0",
  canCreateTests: true,
  testDays: String(defaultDays),
});

export default function AdminSellers() {
  const { sellers, clients, config } = useAdminData();
  const [editing, setEditing] = useState<Seller | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(() => emptyForm(config.testDaysDefault));
  const [error, setError] = useState<string | null>(null);

  const clientCount = (id: string) => clients.filter((c) => c.sellerId === id).length;

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm(config.testDaysDefault));
    setError(null);
    setOpen(true);
  };

  const openEdit = (s: Seller) => {
    setEditing(s);
    setForm({
      name: s.name,
      phone: s.phone,
      email: s.email,
      commission: String(s.commission),
      discount: String(s.discount ?? 0),
      canCreateTests: s.canCreateTests ?? true,
      testDays: String(s.testDays || config.testDaysDefault),
    });
    setError(null);
    setOpen(true);
  };

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setError("Informe o nome do vendedor.");
      return;
    }
    const clamp = (v: number, max: number) => Math.min(max, Math.max(0, Number(v) || 0));
    const payload = {
      name: form.name.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
      commission: clamp(Number(form.commission.replace(",", ".")), 100),
      discount: clamp(Number(form.discount.replace(",", ".")), 100),
      canCreateTests: form.canCreateTests,
      testDays: Math.max(1, Math.round(Number(form.testDays) || config.testDaysDefault)),
    };
    if (editing) updateSeller(editing.id, payload);
    else addSeller({ ...payload, active: true });
    setOpen(false);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight text-white">Vendedores</h2>
          <p className="text-sm text-slate-500">{sellers.length} cadastrados</p>
        </div>
        <PrimaryButton onClick={openNew}>+ Novo vendedor</PrimaryButton>
      </div>

      {sellers.length === 0 ? (
        <EmptyState text="Nenhum vendedor cadastrado. Cadastre sua equipe para vincular clientes e contas de teste." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {sellers.map((s) => (
            <Card key={s.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-base font-bold text-white">{s.name}</p>
                  <p className="mt-0.5 truncate text-xs text-slate-500">
                    {s.phone || s.email || "sem contato"}
                  </p>
                </div>
                {s.active ? <Badge tone="emerald">ativo</Badge> : <Badge tone="slate">inativo</Badge>}
              </div>

              <div className="mt-4 grid grid-cols-3 gap-3">
                <div className="rounded-xl bg-ink-900/60 px-3 py-3">
                  <p className="text-[11px] uppercase tracking-wider text-slate-500">Clientes</p>
                  <p className="text-xl font-black text-white">{clientCount(s.id)}</p>
                </div>
                <div className="rounded-xl bg-ink-900/60 px-3 py-3">
                  <p className="text-[11px] uppercase tracking-wider text-slate-500">Comissão</p>
                  <p className="text-xl font-black text-brand-400">{s.commission}%</p>
                </div>
                <div className="rounded-xl bg-ink-900/60 px-3 py-3">
                  <p className="text-[11px] uppercase tracking-wider text-slate-500">Desconto máx.</p>
                  <p className="text-xl font-black text-emerald-400">{s.discount}%</p>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                <span className="rounded-full border border-white/10 bg-ink-900/60 px-2.5 py-1 text-slate-400">
                  {s.canCreateTests ? (
                    <span className="text-sky-300">✓ Pode criar contas de teste</span>
                  ) : (
                    <span>Sem permissão para contas de teste</span>
                  )}
                </span>
                {s.canCreateTests && (
                  <span className="rounded-full border border-white/10 bg-ink-900/60 px-2.5 py-1 text-slate-400">
                    Testes padrão: <strong className="text-white">{s.testDays}d</strong>
                  </span>
                )}
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <GhostButton onClick={() => openEdit(s)}>Editar</GhostButton>
                <GhostButton onClick={() => updateSeller(s.id, { active: !s.active })}>
                  {s.active ? "Desativar" : "Ativar"}
                </GhostButton>
                <GhostButton
                  tone="danger"
                  onClick={() => {
                    if (window.confirm(`Excluir o vendedor "${s.name}"? Os clientes dele ficam sem vendedor.`)) {
                      removeSeller(s.id);
                    }
                  }}
                >
                  Excluir
                </GhostButton>
              </div>
            </Card>
          ))}
        </div>
      )}

      {open && (
        <Modal title={editing ? "Editar vendedor" : "Novo vendedor"} onClose={() => setOpen(false)}>
          <Form onSubmit={submit}>
            <div className="space-y-4">
              <Field label="Nome *">
                <TextInput value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Nome do vendedor" />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Telefone">
                  <TextInput value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="(11) 99999-9999" />
                </Field>
                <Field label="E-mail">
                  <TextInput type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="vendedor@email.com" />
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Comissão (%)">
                  <TextInput inputMode="decimal" value={form.commission} onChange={(e) => set("commission", e.target.value)} placeholder="10" />
                </Field>
                <Field label="Desconto máx. (%)" hint="Limite que ele pode aplicar nas vendas.">
                  <TextInput inputMode="decimal" value={form.discount} onChange={(e) => set("discount", e.target.value)} placeholder="0" />
                </Field>
                <Field label="Dias de teste padrão">
                  <TextInput inputMode="numeric" value={form.testDays} onChange={(e) => set("testDays", e.target.value)} placeholder="3" />
                </Field>
              </div>
              <Toggle
                checked={form.canCreateTests}
                onChange={(v) => set("canCreateTests", v)}
                label="Pode criar contas de teste para vendas"
              />

              <FormError message={error} />

              <div className="flex gap-3 pt-1">
                <PrimaryButton type="submit">{editing ? "Salvar alterações" : "Cadastrar vendedor"}</PrimaryButton>
                <GhostButton onClick={() => setOpen(false)}>Cancelar</GhostButton>
              </div>
            </div>
          </Form>
        </Modal>
      )}
    </div>
  );
}
