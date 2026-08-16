import { useAdminData } from "../lib/adminStore";
import { useHashRoute } from "../lib/router";

/** Categorias do app final (cliente). Ordem de exibição no menu. */
export const CLIENT_CATEGORIES = [
  { label: "TV ao Vivo", href: "#/tv" },
  { label: "Filmes", href: "#/categoria/Filmes" },
  { label: "Séries", href: "#/categoria/Séries" },
  { label: "Animes", href: "#/categoria/Animes" },
  { label: "Doramas", href: "#/categoria/Doramas" },
  { label: "Novelas", href: "#/categoria/Novelas" },
  { label: "Desenhos", href: "#/categoria/Desenhos" },
];

export default function CategoryNav() {
  const { config } = useAdminData();
  const [route] = useHashRoute();

  const active = route.page === "category" ? route.name : route.page === "tv" ? "TV ao Vivo" : "";

  const items = CLIENT_CATEGORIES.filter(
    (c) => c.label === "TV ao Vivo" || (config.categoriesVisible[c.label] ?? true)
  );

  return (
    <nav className="border-b border-white/5 bg-ink-950/70 backdrop-blur">
      <div className="mx-auto flex max-w-6xl gap-5 overflow-x-auto px-5 py-3 text-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((item) => (
          <a
            key={item.label}
            href={item.href}
            className={`whitespace-nowrap transition ${
              active === item.label ? "font-bold text-white" : "text-slate-400 hover:text-white"
            }`}
          >
            {item.label}
          </a>
        ))}
      </div>
    </nav>
  );
}
