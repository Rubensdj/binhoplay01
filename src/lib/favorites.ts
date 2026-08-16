const KEY = "binho:channels";

export function getFavorites(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function toggleFavorite(id: string): string[] {
  const current = getFavorites();
  const next = current.includes(id)
    ? current.filter((x) => x !== id)
    : [...current, id];
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // storage indisponível (modo privado etc.) — segue sem persistir
  }
  return next;
}
