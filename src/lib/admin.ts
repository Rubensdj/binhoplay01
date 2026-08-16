/**
 * Autenticação do painel administrativo (área #/admin, fora do site do cliente).
 *
 * - Com Supabase configurado: o login usa a conta do Supabase e o acesso é
 *   validado contra a tabela `admins` (email autorizado pelo SQL da migração).
 * - Sem Supabase: fallback local ao dispositivo (hash PBKDF2 + sessão em
 *   localStorage).
 */

import { supabase, supabaseConfigured } from "./supabase";
import { checkAdmin } from "./adminSync";

export interface AdminAccount {
  name: string;
  email: string;
  salt: string;
  hash: string;
  createdAt: string;
}

const ACCOUNT_KEY = "binho:admin-account";
const SESSION_KEY = "binho:admin-session";

const enc = new TextEncoder();

async function derive(password: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: enc.encode(salt), iterations: 100_000, hash: "SHA-256" },
    key,
    256
  );
  return btoa(String.fromCharCode(...new Uint8Array(bits)));
}

function getAccount(): AdminAccount | null {
  try {
    return JSON.parse(localStorage.getItem(ACCOUNT_KEY) ?? "null");
  } catch {
    return null;
  }
}

export function hasAdminAccount(): boolean {
  return getAccount() !== null;
}

export function isAdminAuthed(): boolean {
  try {
    return localStorage.getItem(SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

export function adminEmail(): string | null {
  return getAccount()?.email ?? null;
}

export async function setupAdmin(name: string, email: string, password: string): Promise<void> {
  if (supabaseConfigured) {
    throw new Error(
      "Com o Supabase, o administrador é definido no banco: insira seu e-mail na tabela 'admins' " +
        "(veja supabase/migrations/0001_admin_tables.sql) e depois entre com ele."
    );
  }
  const cleanName = name.trim();
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanName) throw new Error("Informe seu nome.");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleanEmail)) throw new Error("Informe um e-mail válido.");
  if (password.length < 6) throw new Error("A senha precisa ter pelo menos 6 caracteres.");
  if (hasAdminAccount()) throw new Error("Já existe uma conta de administrador neste dispositivo.");

  const salt = Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const hash = await derive(password, salt);
  const account: AdminAccount = {
    name: cleanName,
    email: cleanEmail,
    salt,
    hash,
    createdAt: new Date().toISOString(),
  };
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account));
  localStorage.setItem(SESSION_KEY, "1");
}

export async function loginAdmin(email: string, password: string): Promise<void> {
  const cleanEmail = email.trim().toLowerCase();

  if (supabaseConfigured && supabase) {
    const { error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
    if (error) throw new Error(mapSupabaseError(error.message));
    const isAdmin = await checkAdmin(cleanEmail);
    if (!isAdmin) {
      await supabase.auth.signOut();
      throw new Error("Este e-mail não é um administrador cadastrado (tabela admins).");
    }
    localStorage.setItem(SESSION_KEY, "1");
    return;
  }

  const account = getAccount();
  if (!account) throw new Error("Nenhuma conta de administrador configurada.");
  if (account.email.toLowerCase() !== cleanEmail) {
    throw new Error("E-mail ou senha incorretos.");
  }
  const hash = await derive(password, account.salt);
  if (hash !== account.hash) throw new Error("E-mail ou senha incorretos.");
  localStorage.setItem(SESSION_KEY, "1");
}

function mapSupabaseError(message: string): string {
  if (/invalid login credentials/i.test(message)) return "E-mail ou senha incorretos.";
  if (/email not confirmed/i.test(message)) return "Confirme seu e-mail antes de entrar.";
  if (/rate limit/i.test(message)) return "Muitas tentativas — aguarde um pouco e tente de novo.";
  return message;
}

export function logoutAdmin(): void {
  localStorage.removeItem(SESSION_KEY);
}
