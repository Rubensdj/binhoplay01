import { useEffect, useState } from "react";

export type Route =
  | { page: "home" }
  | { page: "tv" }
  | { page: "addons" }
  | { page: "repos" }
  | { page: "player"; url?: string; title?: string };

function parseHash(hash: string): Route {
  const cleaned = hash.replace(/^#\/?/, "");
  const [path, queryString] = cleaned.split("?");
  const params = new URLSearchParams(queryString ?? "");
  const page = path.split("/")[0] || "home";
  switch (page) {
    case "tv":
      return { page: "tv" };
    case "addons":
      return { page: "addons" };
    case "repos":
      return { page: "repos" };
    case "player":
      return {
        page: "player",
        url: params.get("url") ?? undefined,
        title: params.get("title") ?? undefined,
      };
    default:
      return { page: "home" };
  }
}

export function useHashRoute(): [Route, (route: Route) => void] {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));

  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  const navigate = (next: Route) => {
    const base = next.page === "home" ? "/" : `/${next.page}`;
    const params = new URLSearchParams();
    if (next.page === "player") {
      if (next.url) params.set("url", next.url);
      if (next.title) params.set("title", next.title);
    }
    const suffix = params.toString() ? `?${params}` : "";
    window.location.hash = `#${base}${suffix}`;
  };

  return [route, navigate];
}
