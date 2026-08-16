/**
 * Autenticação local (por dispositivo): usuário/senha com hash PBKDF2 armazenado
 * no navegador. Protege o acesso ao app neste dispositivo — para segurança
 * multiusuário real (servidor), o próximo passo é Convex Auth ou um provedor.
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

async function derive(password: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: enc.encode(salt), iterations: 100_000, hash: "SHA-256" },
    key,
    256
  );
  return btoa(String.fromCharCode(...new Uint8Array(bits)));
}

function getAccounts(): Account[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(ACCOUNTS_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function setSession(username: string) {
  const session: Session = { username, at: new Date().toISOString() };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function getSession(): Session | null {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) ?? "null");
  } catch {
    return null;
  }
}

export function isAuthenticated(): boolean {
  return getSession() !== null;
}

export function currentUser(): string | null {
  return getSession()?.username ?? null;
}

export async function registerUser(username: string, password: string): Promise<void> {
  const name = username.trim();
  if (!name) throw new Error("Informe um usuário.");
  if (password.length < 4) throw new Error("A senha precisa ter pelo menos 4 caracteres.");

  const accounts = getAccounts();
  if (accounts.some((a) => a.username.toLowerCase() === name.toLowerCase())) {
    throw new Error("Este usuário já existe.");
  }

  const salt = Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const hash = await derive(password, salt);
  const account: Account = { username: name, salt, hash, createdAt: new Date().toISOString() };
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify([...accounts, account]));
  setSession(name);
}

export async function loginUser(username: string, password: string): Promise<void> {
  const name = username.trim();
  const account = getAccounts().find((a) => a.username.toLowerCase() === name.toLowerCase());
  if (!account) throw new Error("Usuário não encontrado.");
  const hash = await derive(password, account.salt);
  if (hash !== account.hash) throw new Error("Senha incorreta.");
  setSession(account.username);
}

export function logoutUser(): void {
  localStorage.removeItem(SESSION_KEY);
}
