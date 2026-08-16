import { useEffect, useMemo, useState } from "react";
import AccessGate, { type AccessGateKind } from "./components/AccessGate";
import BottomNav from "./components/BottomNav";
import Header from "./components/Header";
import SearchOverlay from "./components/SearchOverlay";
import AdminGate from "./pages/admin/AdminGate";
import AddonsPage from "./pages/AddonsPage";
import CategoryPage from "./pages/CategoryPage";
import HomePage from "./pages/HomePage";
import LoginPage from "./pages/LoginPage";
import MorePage from "./pages/MorePage";
import MyListPage from "./pages/MyListPage";
import PlayerPage from "./pages/PlayerPage";
import ReposPage from "./pages/ReposPage";
import TvPage from "./pages/TvPage";
import { isAuthenticated, isSupabaseConfigured, logoutUser, setActiveUser, currentUser } from "./lib/auth";
import { hydrateStore, isTestExpired, useAdminData } from "./lib/adminStore";
import { supabase } from "./lib/supabase";
import { useHashRoute } from "./lib/router";

function Splash() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-950">
      <div className="text-center">
        <div className="mx-auto h-14 w-14 rounded-2xl bg-gradient-to-br from-brand-500 to-accent-600 flex items-center justify-center ring-1 ring-white/10">
          <svg className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 12c0 4.97-4.03 9-9 9s-9-4.03-9-9 4.03-9 9-9 9 4.03 9 9zm-9 5.75a5.75 5.75 0 110-11.5 5.75 5.75 0 010 11.5z" />
          </svg>
        </div>
        <p className="mt-4 text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
          Binhoplay
        </p>
      </div>
    </div>
  );
}

function useSession(): [boolean, boolean, () => void, () => void] {
  const [authed, setAuthed] = useState<boolean>(() => isAuthenticated());
  const [ready, setReady] = useState<boolean>(() => !isSupabaseConfigured());

  useEffect(() => {
    if (!supabase) return;
    let mounted = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!mounted) return;
        setActiveUser(data.session?.user.email ?? null);
        setAuthed(Boolean(data.session));
        setReady(true);
        void hydrateStore();
      })
      .catch(() => {
        if (!mounted) return;
        setReady(true);
      });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setActiveUser(session?.user.email ?? null);
      setAuthed(Boolean(session));
      setReady(true);
      void hydrateStore();
    });

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const login = () => setAuthed(true);
  const logout = () => {
    void logoutUser();
    setAuthed(false);
  };

  return [authed, ready, login, logout] as const;
}

function AppShell({ onLogout }: { onLogout: () => void }) {
  const [route, navigate] = useHashRoute();
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [route.page]);

  return (
    <div className="relative min-h-screen overflow-x-clip bg-ink-950 pb-16 text-slate-200 antialiased md:pb-0">
      <Header onLogout={onLogout} onOpenSearch={() => setSearchOpen(true)} />
      {route.page === "home" && <HomePage navigate={navigate} />}
      {route.page === "tv" && <TvPage navigate={navigate} />}
      {route.page === "list" && <MyListPage navigate={navigate} />}
      {route.page === "mais" && <MorePage navigate={navigate} onLogout={onLogout} />}
      {route.page === "addons" && <AddonsPage />}
      {route.page === "repos" && <ReposPage />}
      {route.page === "category" && <CategoryPage name={route.name} navigate={navigate} />}
      {route.page === "player" && <PlayerPage route={route} navigate={navigate} />}
      {route.page !== "player" && <BottomNav route={route} navigate={navigate} />}
      {searchOpen && <SearchOverlay navigate={navigate} onClose={() => setSearchOpen(false)} />}
    </div>
  );
}

export default function App() {
  const [authed, ready, login, logout] = useSession();
  const [route] = useHashRoute();
  const { clients } = useAdminData();

  // Aprovação do administrador: só libera o app para contas com acesso ativo.
  const gate = useMemo<AccessGateKind | null>(() => {
    const email = currentUser();
    if (!email) return null;
    const record =
      clients.find((c) => c.email.trim().toLowerCase() === email.trim().toLowerCase()) ?? null;
    if (!record) return "unknown";
    if (isTestExpired(record)) return "expired";
    if (record.status === "pendente") return "pendente";
    if (record.status === "inativo") return "inativo";
    return null;
  }, [clients]);

  // Painel administrativo: área separada (#/admin), fora do login/site do cliente.
  if (route.page === "admin") return <AdminGate />;
  if (!ready) return <Splash />;
  if (!authed) return <LoginPage onLogin={login} />;
  if (gate) return <AccessGate kind={gate} onLogout={logout} />;
  return <AppShell onLogout={logout} />;
}
