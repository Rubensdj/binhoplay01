import { supabase, supabaseConfigured } from "./supabase";
import type { AdminData, Client, Seller, SiteConfig } from "./adminStore";
import { defaultConfig } from "./adminStore";

/**
 * Sincronização do painel administrativo com o Supabase.
 *
 * - Sem Supabase configurado: nada acontece (o app segue 100% em localStorage).
 * - Com Supabase: os dados passam a viver nas tabelas `site_config`, `sellers`
 *   e `clients` (veja supabase/migrations/0001_admin_tables.sql).
 *   - O administrador carrega e grava tudo.
 *   - O cliente comum carrega apenas o próprio registro (RLS) — usado pela
 *     tela de aprovação/validade dentro do app.
 *
 * Se as tabelas não existirem (SQL ainda não rodado), degrada silenciosamente
 * para o modo local — o painel continua funcionando como antes.
 */

export interface HydrateResult {
  /** true quando o Supabase está configurado E as tabelas existem. */
  remoteReady: boolean;
  /** true quando o usuário logado é um administrador cadastrado. */
  isAdmin: boolean;
  /** Dados carregados do Supabase (fonte da verdade). */
  data: AdminData;
}

let remoteReady = false;
let isAdmin = false;

export function isRemoteReady(): boolean {
  return remoteReady;
}

export function isRemoteAdmin(): boolean {
  return isAdmin;
}

function mapClient(row: Record<string, unknown>): Client {
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    phone: String(row.phone ?? ""),
    email: String(row.email ?? ""),
    planId: String(row.plan_id ?? ""),
    price: Number(row.price ?? 0),
    discount: Number(row.discount ?? 0),
    accountType: (row.account_type as Client["accountType"]) ?? "permanente",
    testDays: Number(row.test_days ?? 0),
    testExpiresAt: row.test_expires_at == null ? null : Number(row.test_expires_at),
    status: (row.status as Client["status"]) ?? "pendente",
    sellerId: row.seller_id == null ? null : String(row.seller_id),
    access: (row.access as Client["access"]) ?? null,
    notes: String(row.notes ?? ""),
    createdAt: Number(row.created_at ?? 0),
  };
}

function mapSeller(row: Record<string, unknown>): Seller {
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    phone: String(row.phone ?? ""),
    email: String(row.email ?? ""),
    commission: Number(row.commission ?? 0),
    discount: Number(row.discount ?? 0),
    canCreateTests: Boolean(row.can_create_tests ?? true),
    testDays: Number(row.test_days ?? 3),
    active: Boolean(row.active ?? true),
    createdAt: Number(row.created_at ?? 0),
  };
}

function clientToRow(c: Client): Record<string, unknown> {
  return {
    id: c.id,
    name: c.name,
    phone: c.phone,
    email: c.email,
    plan_id: c.planId,
    price: c.price,
    discount: c.discount,
    account_type: c.accountType,
    test_days: c.testDays,
    test_expires_at: c.testExpiresAt,
    status: c.status,
    seller_id: c.sellerId,
    access: c.access,
    notes: c.notes,
    created_at: c.createdAt,
  };
}

function sellerToRow(s: Seller): Record<string, unknown> {
  return {
    id: s.id,
    name: s.name,
    phone: s.phone,
    email: s.email,
    commission: s.commission,
    discount: s.discount,
    can_create_tests: s.canCreateTests,
    test_days: s.testDays,
    active: s.active,
    created_at: s.createdAt,
  };
}

export async function checkAdmin(email: string): Promise<boolean> {
  const { data, error } = await supabase!
    .from("admins")
    .select("email")
    .eq("email", email.trim().toLowerCase())
    .maybeSingle();
  if (error) throw error;
  return data !== null;
}

async function fetchConfig(): Promise<SiteConfig> {
  const { data, error } = await supabase!
    .from("site_config")
    .select("config")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw error;
  const raw = data?.config as SiteConfig | undefined;
  const defaults = defaultConfig();
  return {
    ...defaults,
    ...(raw ?? {}),
    categoriesVisible: { ...defaults.categoriesVisible, ...(raw?.categoriesVisible ?? {}) },
    plans: Array.isArray(raw?.plans) && raw.plans.length > 0 ? raw.plans : defaults.plans,
    testDaysDefault:
      typeof raw?.testDaysDefault === "number" ? raw.testDaysDefault : defaults.testDaysDefault,
    requireApproval:
      typeof raw?.requireApproval === "boolean" ? raw.requireApproval : defaults.requireApproval,
  };
}

/**
 * Carrega os dados do painel a partir do Supabase (usar como fonte da verdade).
 * Retorna `null` quando o Supabase não está configurado ou as tabelas não existem.
 */
export async function hydrateAdminData(): Promise<HydrateResult | null> {
  if (!supabaseConfigured || !supabase) return null;

  try {
    const session = await supabase.auth.getSession();
    const email = session.data.session?.user.email ?? null;
    const userIsAdmin = email ? await checkAdmin(email) : false;

    const [config, sellers, clients] = await Promise.all([
      fetchConfig(),
      userIsAdmin
        ? supabase.from("sellers").select("*").order("created_at", { ascending: false })
        : Promise.resolve({ data: [] as unknown[] }),
      userIsAdmin
        ? supabase.from("clients").select("*").order("created_at", { ascending: false })
        : supabase
            .from("clients")
            .select("*")
            .eq("auth_id", session.data.session?.user.id ?? "")
            .order("created_at", { ascending: false }),
    ]);

    const sellersData = Array.isArray(sellers.data) ? sellers.data : [];
    const clientsData = Array.isArray(clients.data) ? clients.data : [];

    remoteReady = true;
    isAdmin = userIsAdmin;

    return {
      remoteReady: true,
      isAdmin: userIsAdmin,
      data: {
        config,
        sellers: sellersData.map(mapSeller),
        clients: clientsData.map(mapClient),
      },
    };
  } catch (err) {
    // Tabelas ausentes ou erro de rede — mantém o modo local.
    console.warn("Supabase admin sync indisponível (rode o SQL da migração?):", err);
    remoteReady = false;
    isAdmin = false;
    return null;
  }
}

/**
 * Grava o estado do painel no Supabase (upsert). Falhas são silenciosas:
 * o app continua funcionando com os dados locais.
 */
export async function pushAdminData(data: AdminData): Promise<void> {
  if (!supabaseConfigured || !supabase || !remoteReady) return;

  try {
    await supabase
      .from("site_config")
      .upsert({ id: 1, config: data.config as unknown as object, updated_at: new Date().toISOString() });

    if (!isAdmin) return;

    if (data.sellers.length > 0) {
      await supabase.from("sellers").upsert(data.sellers.map(sellerToRow));
    }
    if (data.clients.length > 0) {
      await supabase.from("clients").upsert(data.clients.map(clientToRow));
    }
  } catch (err) {
    console.warn("Falha ao sincronizar com o Supabase (mantendo local):", err);
  }
}
