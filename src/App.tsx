import { useEffect, useState } from "react";
import BottomNav from "./components/BottomNav";
import Header from "./components/Header";
import AddonsPage from "./pages/AddonsPage";
import HomePage from "./pages/HomePage";
import LoginPage from "./pages/LoginPage";
import PlayerPage from "./pages/PlayerPage";
import ReposPage from "./pages/ReposPage";
import TvPage from "./pages/TvPage";
import { isAuthenticated, logoutUser } from "./lib/auth";
import { useHashRoute } from "./lib/router";

function AppShell({ onLogout }: { onLogout: () => void }) {
  const [route, navigate] = useHashRoute();

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [route.page]);

  return (
    <div className="relative min-h-screen overflow-x-clip bg-ink-950 pb-16 text-slate-200 antialiased md:pb-0">
      <Header onLogout={onLogout} />
      {route.page === "home" && <HomePage navigate={navigate} />}
      {route.page === "tv" && <TvPage navigate={navigate} />}
      {route.page === "addons" && <AddonsPage />}
      {route.page === "repos" && <ReposPage />}
      {route.page === "player" && <PlayerPage route={route} navigate={navigate} />}
      {route.page !== "player" && <BottomNav route={route} navigate={navigate} />}
    </div>
  );
}

export default function App() {
  const [authed, setAuthed] = useState<boolean>(() => isAuthenticated());

  if (!authed) {
    return <LoginPage onLogin={() => setAuthed(true)} />;
  }

  return (
    <AppShell
      onLogout={() => {
        logoutUser();
        setAuthed(false);
      }}
    />
  );
}
