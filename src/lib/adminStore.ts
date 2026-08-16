import { useSyncExternalStore } from "react";
import { catalog } from "../catalog";
import { hydrateAdminData, pushAdminData } from "./adminSync";

/**
 * Dados do painel administrativo: configurações do site, vendedores e clientes.
 *
 * Persistidos no dispositivo (localStorage) enquanto o Supabase não estiver
 * configurado. A estrutura espelha tabelas (site_config, sellers, clients)
 * para facilitar a migração futura para o Supabase.
 */

export interface Plan {
  id: string;
  name: string;
  price: number;
  period: string;
}

export interface Seller {
  id: string;
  name: string;
  phone: string;
  email: string;
  commission: number; // % de comissão
  /** % máximo de desconto que o vendedor pode aplicar nas vendas. */
  discount: number;
  /** Pode criar contas de teste para vender. */
  canCreateTests: boolean;
  /** Duração padrão (dias) das contas de teste criadas por ele. */
  testDays: number;
  active: boolean;
  createdAt: number;
}

export type ClientStatus = "ativo" | "pendente" | "inativo";

/** Tipo de conta: teste (temporária, para vender) ou permanente (paga). */
export type AccountType = "teste" | "permanente";

/** O que o cliente tem acesso: TV ao vivo + categorias de conteúdo. */
export interface ClientAccess {
  tv: boolean;
  categories: Record<string, boolean>;
}

export interface Client {
  id: string;
  name: string;
  phone: string;
  email: string;
  planId: string;
  price: number;
  /** % de desconto aplicado sobre o preço do plano. */
  discount: number;
  accountType: AccountType;
  /** Dias de teste (válido quando accountType = "teste"). */
  testDays: number;
  /** Timestamp de expiração da conta de teste (null = sem expiração). */
  testExpiresAt: number | null;
  status: ClientStatus;
  sellerId: string | null;
  /** Acessos do cliente; null = acesso completo (herda o que o site exibe). */
  access: ClientAccess | null;
  notes: string;
  createdAt: number;
}

export interface SiteConfig {
  siteName: string;
  slogan: string;
  announcement: string;
  announcementEnabled: boolean;
  telegramUrl: string;
  repoUrl: string;
  categoriesVisible: Record<string, boolean>;
  plans: Plan[];
  /** Duração padrão (dias) de uma conta de teste. */
  testDaysDefault: number;
  /** Exige aprovação do administrador (status pendente) para ativar novas contas. */
  requireApproval: boolean;
}

export interface AdminData {
  config: SiteConfig;
  sellers: Seller[];
  clients: Client[];
}

export const CATEGORY_KEYS = ["Filmes", "Séries", "Desenhos", "Doramas", "Animes", "Novelas"];

const KEY = "binho:admin-data";

export function defaultAccess(): ClientAccess {
  return {
    tv: true,
    categories: Object.fromEntries(CATEGORY_KEYS.map((k) => [k, true])),
  };
}

export function defaultConfig(): SiteConfig {
  return {
    siteName: "Binhoplay",
    slogan: "Filmes, séries, desenhos e TV ao vivo",
    announcement: "",
    announcementEnabled: false,
    telegramUrl: "https://t.me/+6oulWWlEwpo0ZDE5",
    repoUrl: catalog.repoUrl,
    categoriesVisible: Object.fromEntries(CATEGORY_KEYS.map((k) => [k, true])),
    plans: [
      { id: "plan-mensal", name: "Mensal", price: 19.9, period: "mês" },
      { id: "plan-trimestral", name: "Trimestral", price: 49.9, period: "trimestre" },
      { id: "plan-semestral", name: "Semestral", price: 89.9, period: "semestre" },
      { id: "plan-anual", name: "Anual", price: 149.9, period: "ano" },
    ],
    testDaysDefault: 3,
    requireApproval: true,
  };
}

function seed(): AdminData {
  return { config: defaultConfig(), sellers: [], clients: [] };
}

function load(): AdminData {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "") as AdminData | null;
    if (!raw || typeof raw !== "object") return seed();
    const defaults = defaultConfig();
    const config: SiteConfig = {
      ...defaults,
      ...(raw.config ?? {}),
      categoriesVisible: { ...defaults.categoriesVisible, ...(raw.config?.categoriesVisible ?? {}) },
      plans:
        Array.isArray(raw.config?.plans) && raw.config.plans.length > 0
          ? raw.config.plans
          : defaults.plans,
      testDaysDefault:
        typeof raw.config?.testDaysDefault === "number" ? raw.config.testDaysDefault : defaults.testDaysDefault,
      requireApproval:
        typeof raw.config?.requireApproval === "boolean" ? raw.config.requireApproval : defaults.requireApproval,
    };
    const sellerDefaults = {
      discount: 0,
      canCreateTests: true,
      testDays: config.testDaysDefault,
    };
    const clientDefaults = {
      discount: 0,
      accountType: "permanente" as AccountType,
      testDays: 0,
      testExpiresAt: null,
      access: null,
    };
    return {
      config,
      sellers: Array.isArray(raw.sellers) ? raw.sellers.map((s) => ({ ...sellerDefaults, ...s })) : [],
      clients: Array.isArray(raw.clients) ? raw.clients.map((c) => ({ ...clientDefaults, ...c })) : [],
    };
  } catch {
    return seed();
  }
}

let data: AdminData = load();
const listeners = new Set<() => void>();

function persist(next: AdminData, pushRemote = true) {
  data = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage cheio/indisponível — mantém apenas em memória.
  }
  if (pushRemote) void pushAdminData(next);
  listeners.forEach((fn) => fn());
}

/** Substitui o estado inteiro (usado ao hidratar do Supabase). */
export function replaceData(next: AdminData): void {
  persist(next, false);
}

/**
 * Hidrata os dados do painel a partir do Supabase (quando configurado).
 * Se o Supabase estiver vazio mas houver dados locais, faz a migração
 * inicial enviando os dados locais para o servidor.
 */
export async function hydrateStore(): Promise<void> {
  const result = await hydrateAdminData();
  if (!result || !result.data) return;

  const remote = result.data;
  const hasRemoteData =
    remote.clients.length > 0 ||
    remote.sellers.length > 0 ||
    JSON.stringify(remote.config) !== JSON.stringify(defaultConfig());

  // Migração: Supabase recém-criado e este dispositivo tem dados — envia como semente.
  if (result.isAdmin && !hasRemoteData && (data.clients.length > 0 || data.sellers.length > 0)) {
    void pushAdminData(data);
  }

  replaceData(remote);
}

export function getAdminData(): AdminData {
  return data;
}

export function subscribeAdmin(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useAdminData(): AdminData {
  return useSyncExternalStore(subscribeAdmin, getAdminData);
}

export const uid = (): string =>
  Math.random().toString(36).slice(2, 9) + Date.now().toString(36);

export function fmtBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Aplica um desconto percentual a um valor e arredonda em centavos. */
export function applyDiscount(price: number, discount: number): number {
  const d = Math.min(100, Math.max(0, Number(discount) || 0));
  return Math.round(price * (1 - d / 100) * 100) / 100;
}

/** Conta de teste já expirou? */
export function isTestExpired(client: Client): boolean {
  return (
    client.accountType === "teste" &&
    client.testExpiresAt !== null &&
    client.testExpiresAt < Date.now()
  );
}

/** Ficha do cliente cujo e-mail bate com o usuário logado no app. */
export function clientForEmail(email: string | null): Client | null {
  if (!email) return null;
  const e = email.trim().toLowerCase();
  return data.clients.find((c) => c.email.trim().toLowerCase() === e) ?? null;
}

/** Acessos do cliente logado (null = acesso completo). */
export function clientAccessFor(email: string | null): ClientAccess | null {
  return clientForEmail(email)?.access ?? null;
}

// ---------------------------------------------------------------------------
// Configurações do site
// ---------------------------------------------------------------------------
export function updateConfig(patch: Partial<SiteConfig>): void {
  persist({ ...data, config: { ...data.config, ...patch } });
}

export function toggleCategory(key: string, visible: boolean): void {
  persist({
    ...data,
    config: {
      ...data.config,
      categoriesVisible: { ...data.config.categoriesVisible, [key]: visible },
    },
  });
}

export function upsertPlan(plan: Plan): void {
  const exists = data.config.plans.some((p) => p.id === plan.id);
  const plans = exists
    ? data.config.plans.map((p) => (p.id === plan.id ? plan : p))
    : [...data.config.plans, plan];
  persist({ ...data, config: { ...data.config, plans } });
}

export function removePlan(id: string): void {
  persist({
    ...data,
    config: { ...data.config, plans: data.config.plans.filter((p) => p.id !== id) },
  });
}

// ---------------------------------------------------------------------------
// Vendedores
// ---------------------------------------------------------------------------
export function addSeller(input: Omit<Seller, "id" | "createdAt">): void {
  const seller: Seller = { ...input, id: uid(), createdAt: Date.now() };
  persist({ ...data, sellers: [...data.sellers, seller] });
}

export function updateSeller(id: string, patch: Partial<Seller>): void {
  persist({
    ...data,
    sellers: data.sellers.map((s) => (s.id === id ? { ...s, ...patch } : s)),
  });
}

export function removeSeller(id: string): void {
  persist({
    ...data,
    sellers: data.sellers.filter((s) => s.id !== id),
    clients: data.clients.map((c) => (c.sellerId === id ? { ...c, sellerId: null } : c)),
  });
}

// ---------------------------------------------------------------------------
// Clientes
// ---------------------------------------------------------------------------
export function addClient(input: Omit<Client, "id" | "createdAt">): void {
  const client: Client = { ...input, id: uid(), createdAt: Date.now() };
  persist({ ...data, clients: [...data.clients, client] });
}

export function updateClient(id: string, patch: Partial<Client>): void {
  persist({
    ...data,
    clients: data.clients.map((c) => (c.id === id ? { ...c, ...patch } : c)),
  });
}

export function removeClient(id: string): void {
  persist({ ...data, clients: data.clients.filter((c) => c.id !== id) });
}
