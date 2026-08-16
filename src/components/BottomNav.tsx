import type { ReactNode } from "react";
import type { Route } from "../lib/router";

const TABS: Array<{
  page: "home" | "tv" | "list" | "mais";
  label: string;
  icon: ReactNode;
}> = [
  {
    page: "home",
    label: "Início",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3 10.5L12 3l9 7.5M5 9.5V21h14V9.5M9 21v-6h6v6"
        />
      </svg>
    ),
  },
  {
    page: "tv",
    label: "TV",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <rect x="3" y="7" width="18" height="13" rx="2" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 3l4 4 4-4" />
      </svg>
    ),
  },
  {
    page: "list",
    label: "Lista",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 21s-7.5-4.7-10-9.3C.6 8.6 2.5 5 6 5c2.2 0 3.6 1.2 4.4 2.5h3.2C14.4 6.2 15.8 5 18 5c3.5 0 5.4 3.6 4 6.7C19.5 16.3 12 21 12 21z"
        />
      </svg>
    ),
  },
  {
    page: "mais",
    label: "Mais",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <circle cx="12" cy="5" r="1.6" fill="currentColor" />
        <circle cx="12" cy="12" r="1.6" fill="currentColor" />
        <circle cx="12" cy="19" r="1.6" fill="currentColor" />
      </svg>
    ),
  },
];

export default function BottomNav({
  route,
  navigate,
}: {
  route: Route;
  navigate: (route: Route) => void;
}) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/5 bg-ink-900/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden">
      <div className="grid grid-cols-4">
        {TABS.map((tab) => {
          const active =
            route.page === tab.page || (route.page === "category" && tab.page === "home");
          return (
            <button
              key={tab.page}
              type="button"
              onClick={() => navigate({ page: tab.page })}
              className={`flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition ${
                active ? "text-brand-400" : "text-slate-500 hover:text-slate-300"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
