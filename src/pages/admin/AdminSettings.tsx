import { useState } from "react";
import {
  CATEGORY_KEYS,
  fmtBRL,
  removePlan,
  uid,
  updateConfig,
  upsertPlan,
  useAdminData,
  type Plan,
} from "../../lib/adminStore";
import { Badge, Card, Field, GhostButton, PrimaryButton, TextInput, Toggle } from "./ui";

export default function AdminSettings() {
  const { config } = useAdminData();
  const [siteName, setSiteName] = useState(config.siteName);
  const [slogan, setSlogan] = useState(config.slogan);
  const [announcement, setAnnouncement] = useState(config.announcement);
  const [announcementEnabled, setAnnouncementEnabled] = useState(config.announcementEnabled);
  const [telegramUrl, setTelegramUrl] = useState(config.telegramUrl);
  const [repoUrl, setRepoUrl] = useState(config.repoUrl);
  const [categories, setCategories] = useState<Record<string, boolean>>({ ...config.categoriesVisible });
  const [plans, setPlans] = useState<Plan[]>(config.plans.map((p) => ({ ...p })));
  const [testDaysDefault, setTestDaysDefault] = useState(String(config.testDaysDefault));
  const [requireApproval, setRequireApproval] = useState(config.requireApproval);
  const [saved, setSaved] = useState(false);

  const save = () => {
    updateConfig({
      siteName: siteName.trim() || "Binho Play",
      slogan: slogan.trim(),
      announcement: announcement.trim(),
      announcementEnabled,
      telegramUrl: telegramUrl.trim(),
      repoUrl: repoUrl.trim(),
      categoriesVisible: categories,
      testDaysDefault: Math.max(1, Math.round(Number(testDaysDefault) || 3)),
      requireApproval,
    });
    const currentIds = new Set(config.plans.map((p) => p.id));
    const keptIds = new Set(plans.map((p) => p.id));
    plans.forEach((p) => upsertPlan(p));
    currentIds.forEach((id) => {
      if (!keptIds.has(id)) removePlan(id);
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const setPlan = (id: string, patch: Partial<Plan>) =>
    setPlans((list) => list.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  const addPlan = () =>
    setPlans((list) => [...list, { id: uid(), name: "Novo plano", price: 0, period: "mês" }]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight text-white">Configurações do site</h2>
          <p className="text-sm text-slate-500">
            Tudo aqui reflete no app na hora — as mudanças ficam salvas neste dispositivo.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {saved && <Badge tone="emerald">Salvo!</Badge>}
          <PrimaryButton onClick={save}>Salvar alterações</PrimaryButton>
        </div>
      </div>

      <Card title="Identidade">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome do site">
            <TextInput value={siteName} onChange={(e) => setSiteName(e.target.value)} placeholder="Binho Play" />
          </Field>
          <Field label="Slogan">
            <TextInput value={slogan} onChange={(e) => setSlogan(e.target.value)} placeholder="Filmes, séries, desenhos e TV ao vivo" />
          </Field>
        </div>
      </Card>

      <Card title="Aviso / Anúncio">
        <div className="space-y-4">
          <Field
            label="Texto do aviso"
            hint="Aparece no topo da página inicial do app (ex.: avisos de manutenção, novidades). Deixe vazio para não exibir."
          >
            <TextInput
              value={announcement}
              onChange={(e) => setAnnouncement(e.target.value)}
              placeholder="Ex.: Novo canal adicionado! Fique ligado no Telegram."
            />
          </Field>
          <Toggle
            checked={announcementEnabled}
            onChange={setAnnouncementEnabled}
            label="Exibir aviso no site"
          />
        </div>
      </Card>

      <Card title="Links">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Link do Telegram" hint="Usado no rodapé do site.">
            <TextInput value={telegramUrl} onChange={(e) => setTelegramUrl(e.target.value)} placeholder="https://t.me/…" />
          </Field>
          <Field label="Link do repositório Kodi" hint="Mostrado no guia de instalação.">
            <TextInput value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)} placeholder="https://…/addons.xml" />
          </Field>
        </div>
      </Card>

      <Card title="Categorias visíveis" action={<Badge tone="sky">Home do app</Badge>}>
        <p className="mb-4 text-xs text-slate-500">
          Escolha quais fileiras de conteúdo aparecem na página inicial (as vazias já somem sozinhas).
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {CATEGORY_KEYS.map((key) => (
            <Toggle
              key={key}
              checked={categories[key] ?? true}
              onChange={(v) => setCategories((c) => ({ ...c, [key]: v }))}
              label={key}
            />
          ))}
        </div>
      </Card>

      <Card title="Vendas" action={<Badge tone="sky">Clientes e vendedores</Badge>}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Duração padrão de conta de teste (dias)"
            hint="Usado como padrão ao criar contas de teste; cada vendedor pode ter seu próprio padrão."
          >
            <TextInput
              inputMode="numeric"
              value={testDaysDefault}
              onChange={(e) => setTestDaysDefault(e.target.value)}
            />
          </Field>
        </div>
        <div className="mt-4">
          <Toggle
            checked={requireApproval}
            onChange={setRequireApproval}
            label="Exigir aprovação do administrador para ativar novas contas"
          />
        </div>
        <p className="mt-3 text-[11px] text-slate-600">
          Com a aprovação ligada, contas novas (incluindo testes criados por vendedores) ficam
          <strong className="text-amber-300"> pendentes</strong> até você aprovar em Clientes — o
          cliente só enxerga o app depois do seu OK. Desligue para contas novas nascerem ativas.
          No cadastro de clientes você também define o tipo de conta (teste ou permanente), o
          desconto (%) e o que cada cliente acessa (TV ao vivo e categorias).
        </p>
      </Card>

      <Card
        title="Planos de venda"
        action={<GhostButton onClick={addPlan}>+ Adicionar plano</GhostButton>}
      >
        <div className="space-y-3">
          {plans.map((plan) => (
            <div key={plan.id} className="grid grid-cols-2 items-end gap-3 rounded-xl border border-white/5 bg-ink-900/60 p-4 sm:grid-cols-[1fr_110px_130px_auto]">
              <Field label="Nome">
                <TextInput value={plan.name} onChange={(e) => setPlan(plan.id, { name: e.target.value })} />
              </Field>
              <Field label="Valor (R$)">
                <TextInput
                  inputMode="decimal"
                  value={String(plan.price)}
                  onChange={(e) => setPlan(plan.id, { price: Number(e.target.value.replace(",", ".")) || 0 })}
                />
              </Field>
              <Field label="Período">
                <TextInput
                  value={plan.period}
                  onChange={(e) => setPlan(plan.id, { period: e.target.value })}
                  placeholder="mês / trimestre / ano"
                />
              </Field>
              <button
                type="button"
                onClick={() => setPlans((list) => list.filter((p) => p.id !== plan.id))}
                className="justify-self-start rounded-lg border border-rose-500/30 px-3 py-2 text-xs font-bold text-rose-300 transition hover:bg-rose-500/10"
              >
                Remover
              </button>
            </div>
          ))}
          <p className="text-[11px] text-slate-600">
            Os planos aparecem no cadastro de clientes com o valor pré-preenchido (ex.: {fmtBRL(config.plans[0]?.price ?? 0)}).
          </p>
        </div>
      </Card>
    </div>
  );
}
