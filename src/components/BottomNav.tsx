import type { ReactNode } from "react";
import type { Route } from "../lib/router";

const TABS: Array<{
  page: Route["page"];
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
    page: "addons",
    label: "Addons",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M4 6h16M4 12h16M4 18h16"
        />
        <circle cx="9" cy="6" r="1.5" fill="currentColor" />
        <circle cx="15" cy="12" r="1.5" fill="currentColor" />
        <circle cx="7" cy="18" r="1.5" fill="currentColor" />
      </svg>
    ),
  },
  {
    page: "repos",
    label: "Repos",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M4 5a2 2 0 012-2h4l2 2h6a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V5z"
        />
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 11h8M8 15h5" />
      </svg>
    ),
  },
  {
    page: "player",
    label: "Player",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 5l11 7-11 7V5z" />
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
      <div className="grid grid-cols-5">
        {TABS.map((tab) => {
          const active = route.page === tab.page;
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
