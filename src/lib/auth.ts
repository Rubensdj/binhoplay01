import { supabase, supabaseConfigured } from "./supabase";

/**
 * Camada de autenticação.
 * - Com Supabase configurado (VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY):
 *   login/registro por email e senha, sessão gerenciada pelo SDK.
 * - Sem Supabase: fallback local (hash PBKDF2 no dispositivo).
 */

export interface Account {
  username: string;
  salt: string;
  hash: string;
  createdAt: string;
}

export interface Session {
  username: string;
  at: string;
}

const ACCOUNTS_KEY = "binho:accounts";
const SESSION_KEY = "binho:session";

const enc = new TextEncoder();

export function isSupabaseConfigured(): boolean {
  return supabaseConfigured;
}

// ---------------------------------------------------------------------------
// Fallback local (sem Supabase)
// ---------------------------------------------------------------------------
async function deriveLocal(password: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: enc.encode(salt), iterations: 100_000, hash: "SHA-256" },
    key,
    256
  );
  return btoa(String.fromCharCode(...new Uint8Array(bits)));
}

function getLocalAccounts(): Account[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(ACCOUNTS_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function setLocalSession(username: string) {
  const session: Session = { username, at: new Date().toISOString() };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function getLocalSession(): Session | null {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) ?? "null");
  } catch {
    return null;
  }
}

function clearLocalSession() {
  localStorage.removeItem(SESSION_KEY);
}

// ---------------------------------------------------------------------------
// API pública (Supabase primeiro, fallback local)
// ---------------------------------------------------------------------------
/** Usuário ativo do Supabase (atualizado via onAuthStateChange no App). */
let activeUser: string | null = null;

export function setActiveUser(email: string | null): void {
  activeUser = email;
}

export function isAuthenticated(): boolean {
  if (supabaseConfigured) {
    // A sessão do Supabase persiste no localStorage com chave sb-<ref>-auth-token
    // (o estado reativo real é mantido por onAuthStateChange no App).
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith("sb-") && key.endsWith("-auth-token")) return true;
    }
    return false;
  }
  return getLocalSession() !== null;
}

export function currentUser(): string | null {
  if (supabaseConfigured) return activeUser;
  return getLocalSession()?.username ?? null;
}

export interface AuthResult {
  needsEmailConfirmation?: boolean;
}

export async function registerUser(emailOrUsername: string, password: string): Promise<AuthResult> {
  if (supabaseConfigured && supabase) {
    const { data, error } = await supabase.auth.signUp({ email: emailOrUsername.trim(), password });
    if (error) throw new Error(mapSupabaseError(error.message));
    if (!data.session) return { needsEmailConfirmation: true };
    return {};
  }
  // Fallback local
  const name = emailOrUsername.trim();
  if (!name) throw new Error("Informe um usuário.");
  if (password.length < 4) throw new Error("A senha precisa ter pelo menos 4 caracteres.");

  const accounts = getLocalAccounts();
  if (accounts.some((a) => a.username.toLowerCase() === name.toLowerCase())) {
    throw new Error("Este usuário já existe.");
  }

  const salt = Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const hash = await deriveLocal(password, salt);
  const account: Account = { username: name, salt, hash, createdAt: new Date().toISOString() };
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify([...accounts, account]));
  setLocalSession(name);
  return {};
}

export async function loginUser(emailOrUsername: string, password: string): Promise<AuthResult> {
  if (supabaseConfigured && supabase) {
    const { error } = await supabase.auth.signInWithPassword({
      email: emailOrUsername.trim(),
      password,
    });
    if (error) throw new Error(mapSupabaseError(error.message));
    return {};
  }
  const name = emailOrUsername.trim();
  const account = getLocalAccounts().find((a) => a.username.toLowerCase() === name.toLowerCase());
  if (!account) throw new Error("Usuário não encontrado.");
  const hash = await deriveLocal(password, account.salt);
  if (hash !== account.hash) throw new Error("Senha incorreta.");
  setLocalSession(account.username);
  return {};
}

export async function logoutUser(): Promise<void> {
  if (supabaseConfigured && supabase) {
    await supabase.auth.signOut();
    return;
  }
  clearLocalSession();
}

function mapSupabaseError(message: string): string {
  if (/invalid login credentials/i.test(message)) return "Email ou senha incorretos.";
  if (/email not confirmed/i.test(message)) return "Confirme seu e-mail antes de entrar.";
  if (/already registered/i.test(message)) return "Este email já está cadastrado.";
  if (/password should be at least/i.test(message)) return "A senha precisa ter pelo menos 6 caracteres.";
  if (/rate limit/i.test(message)) return "Muitas tentativas — aguarde um pouco e tente de novo.";
  return message;
}
