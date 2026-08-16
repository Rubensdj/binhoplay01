import { useState, type FormEvent } from "react";
import { isSupabaseConfigured, loginUser, registerUser } from "../lib/auth";
import { useAdminData } from "../lib/adminStore";

export default function LoginPage({ onLogin }: { onLogin: () => void }) {
  const supabaseMode = isSupabaseConfigured();
  const { config } = useAdminData();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      if (mode === "register" && password !== confirm) throw new Error("As senhas não conferem.");
      const result =
        mode === "register" ? await registerUser(email, password) : await loginUser(email, password);
      if (result.needsEmailConfirmation) {
        setNotice("Conta criada! Confirme seu e-mail para ativar e entrar.");
        setMode("login");
        setPassword("");
        setConfirm("");
        return;
      }
      onLogin();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado. Tente novamente.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-ink-950 px-5 py-10">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-40 left-1/2 h-[480px] w-[720px] -translate-x-1/2 rounded-full bg-brand-600/25 blur-[120px]" />
        <div className="absolute -bottom-32 -right-24 h-[380px] w-[380px] rounded-full bg-accent-600/20 blur-[100px]" />
      </div>

      <div className="w-full max-w-md">
        <div className="text-center">
          <img
            src="/addons/repo/Plugins/plugin.video.BrazucaPlay/icon.png"
            alt="Logo Binho Play"
            className="mx-auto h-16 w-16 rounded-2xl object-cover ring-1 ring-white/10"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
          <h1 className="mt-4 text-3xl font-black tracking-tight text-white">
            BINHO<span className="bg-gradient-to-r from-brand-400 via-brand-500 to-accent-500 bg-clip-text text-transparent">PLAY</span>
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            {mode === "login" ? "Entre para continuar" : "Crie sua conta para começar"}
          </p>
        </div>

        <form onSubmit={submit} className="mt-8 rounded-3xl border border-white/10 bg-ink-900/80 p-6 shadow-2xl shadow-black/40 backdrop-blur">
          <label htmlFor="email" className="text-sm font-medium text-slate-300">
            {supabaseMode ? "Email" : "Usuário"}
          </label>
          <input
            id="email"
            type={supabaseMode ? "email" : "text"}
            autoComplete={supabaseMode ? "email" : "username"}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={supabaseMode ? "voce@email.com" : "seu usuário"}
            className="mt-1.5 w-full rounded-xl border border-white/10 bg-ink-950 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-brand-500/60 focus:ring-2 focus:ring-brand-500/20"
          />

          <label htmlFor="password" className="mt-4 block text-sm font-medium text-slate-300">
            Senha
          </label>
          <input
            id="password"
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="mt-1.5 w-full rounded-xl border border-white/10 bg-ink-950 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-brand-500/60 focus:ring-2 focus:ring-brand-500/20"
          />

          {mode === "register" && config.requireApproval && (
            <p className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2.5 text-xs font-medium text-amber-200/90">
              Contas novas ficam <strong>aguardando aprovação</strong> do administrador antes de
              liberar o conteúdo.
            </p>
          )}

          {mode === "register" && (
            <>
              <label htmlFor="confirm" className="mt-4 block text-sm font-medium text-slate-300">
                Confirmar senha
              </label>
              <input
                id="confirm"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••"
                className="mt-1.5 w-full rounded-xl border border-white/10 bg-ink-950 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-brand-500/60 focus:ring-2 focus:ring-brand-500/20"
              />
            </>
          )}

          {error && (
            <p className="mt-4 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2.5 text-xs font-medium text-rose-300">
              {error}
            </p>
          )}
          {notice && (
            <p className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2.5 text-xs font-medium text-emerald-300">
              {notice}
            </p>
          )}

          <button
            type="submit"
            disabled={busy || !email.trim() || !password}
            className="mt-5 w-full rounded-xl bg-gradient-to-r from-brand-500 to-accent-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-brand-600/25 transition enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? "Aguarde…" : mode === "login" ? "Entrar" : "Criar conta e entrar"}
          </button>

          <button
            type="button"
            onClick={() => {
              setMode((m) => (m === "login" ? "register" : "login"));
              setError(null);
              setNotice(null);
            }}
            className="mt-4 w-full text-center text-xs text-slate-500 transition hover:text-slate-300"
          >
            {mode === "login"
              ? "Ainda não tem conta? Criar conta"
              : "Já tem conta? Fazer login"}
          </button>
        </form>

        <p className="mt-6 text-center text-[11px] leading-relaxed text-slate-600">
          {supabaseMode
            ? "Contas e sessão gerenciadas pelo Supabase (email e senha)."
            : "Supabase não configurado — usando login local neste dispositivo (hash PBKDF2)."}
        </p>
      </div>
    </div>
  );
}
