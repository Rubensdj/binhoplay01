import { useState, type FormEvent } from "react";
import { hasAdminAccount, loginAdmin, setupAdmin } from "../../lib/admin";
import { hydrateStore } from "../../lib/adminStore";
import { supabaseConfigured } from "../../lib/supabase";
import AdminPanel from "./AdminPanel";
import { Field, Form, FormError, PrimaryButton, TextInput } from "./ui";

function AdminLogin({ onAuthed }: { onAuthed: () => void }) {
  const supabaseMode = supabaseConfigured;
  const [setup] = useState(() => !supabaseMode && !hasAdminAccount());
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (setup) {
        if (password !== confirm) throw new Error("As senhas não conferem.");
        await setupAdmin(name, email, password);
      } else {
        await loginAdmin(email, password);
      }
      // Com Supabase, recarrega os dados do painel a partir do banco.
      void hydrateStore();
      onAuthed();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado. Tente novamente.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-ink-950 px-5 py-10">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-40 left-1/2 h-[440px] w-[680px] -translate-x-1/2 rounded-full bg-emerald-600/15 blur-[120px]" />
        <div className="absolute -bottom-32 -right-24 h-[360px] w-[360px] rounded-full bg-sky-600/15 blur-[100px]" />
      </div>

      <div className="w-full max-w-md">
        <div className="text-center">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-ink-900 shadow-xl shadow-black/40">
            <svg className="h-8 w-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z"
              />
            </svg>
          </span>
          <h1 className="mt-4 text-2xl font-black tracking-tight text-white">Painel Administrativo</h1>
          <p className="mt-1 text-sm text-slate-500">
            {setup ? "Crie a conta de administrador (primeiro acesso)" : "Acesso restrito ao administrador"}
          </p>
        </div>

        <Form onSubmit={submit}>
          <div className="mt-8 space-y-4 rounded-3xl border border-white/10 bg-ink-900/80 p-6 shadow-2xl shadow-black/40 backdrop-blur">
            {setup && (
              <Field label="Seu nome">
                <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome" autoComplete="name" />
              </Field>
            )}
            <Field label="E-mail">
              <TextInput
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@exemplo.com"
                autoComplete="email"
              />
            </Field>
            <Field label="Senha">
              <TextInput
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete={setup ? "new-password" : "current-password"}
              />
            </Field>
            {setup && (
              <Field label="Confirmar senha">
                <TextInput
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                />
              </Field>
            )}

            <FormError message={error} />

            <PrimaryButton
              type="submit"
              disabled={busy || !email.trim() || !password || (setup && (!name.trim() || password !== confirm))}
              className="w-full"
            >
              {busy ? "Aguarde…" : setup ? "Criar administrador e entrar" : "Entrar no painel"}
            </PrimaryButton>

            {supabaseMode && (
              <p className="text-center text-xs leading-relaxed text-slate-500">
                O login usa a conta do Supabase. Para liberar o acesso, cadastre seu e-mail na tabela{" "}
                <code className="rounded bg-white/5 px-1 py-0.5 text-[10px] text-emerald-300">admins</code>{" "}
                (veja <code className="rounded bg-white/5 px-1 py-0.5 text-[10px] text-emerald-300">supabase/migrations/0001_admin_tables.sql</code>).
              </p>
            )}
            {!setup && !supabaseMode && (
              <p className="text-center text-xs text-slate-600">
                Esqueceu a senha? Como o painel é local a este dispositivo, entre no navegador onde o
                administrador foi criado — ou limpe os dados do site para recadastrar.
              </p>
            )}
          </div>
        </Form>

        <div className="mt-6 text-center">
          <a href="#/" className="text-xs font-medium text-slate-500 transition hover:text-slate-300">
            ← Voltar ao site
          </a>
        </div>
      </div>
    </div>
  );
}

export default function AdminGate() {
  const [authed, setAuthed] = useState(() => {
    try {
      return localStorage.getItem("binho:admin-session") === "1";
    } catch {
      return false;
    }
  });

  if (!authed) return <AdminLogin onAuthed={() => setAuthed(true)} />;
  return <AdminPanel onLogout={() => setAuthed(false)} />;
}

