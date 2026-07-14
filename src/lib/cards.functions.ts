import { createServerFn } from "@tanstack/react-start";

// In-memory cache: konami card ID -> name. Lives for the worker's lifetime.
const nameCache = new Map<string, string>();

interface YgoProCard {
  id: number;
  name: string;
}

async function fetchNames(ids: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (ids.length === 0) return result;
  // YGOPRODeck accepts comma-separated ids. Chunk to keep URL length reasonable.
  const CHUNK = 75;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const url = `https://db.ygoprodeck.com/api/v7/cardinfo.php?id=${chunk.join(",")}`;
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (LovableApp)" },
      });
      if (!res.ok) continue;
      const json = (await res.json()) as { data?: YgoProCard[] };
      for (const c of json.data ?? []) {
        result.set(String(c.id), c.name);
      }
    } catch {
      // ignore chunk failure; unresolved IDs stay unresolved
    }
  }
  return result;
}

/**
 * Resolves a list of Konami card IDs to their English names via YGOPRODeck.
 * Returns a map keyed by ID; missing IDs simply aren't included.
 */
export const resolveCardNames = createServerFn({ method: "POST" })
  .inputValidator((data: { ids: string[] }) => {
    if (!data || !Array.isArray(data.ids)) throw new Error("ids must be an array");
    return { ids: data.ids.map(String).filter((s) => /^\d+$/.test(s)) };
  })
  .handler(async ({ data }) => {
    const unique = Array.from(new Set(data.ids));
    const missing = unique.filter((id) => !nameCache.has(id));
    if (missing.length > 0) {
      const fetched = await fetchNames(missing);
      for (const [id, name] of fetched) nameCache.set(id, name);
    }
    const out: Record<string, string> = {};
    for (const id of unique) {
      const n = nameCache.get(id);
      if (n) out[id] = n;
    }
    return { names: out };
  });
