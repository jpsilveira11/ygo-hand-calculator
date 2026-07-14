import { createServerFn } from "@tanstack/react-start";

export interface ImportedDeckCard {
  id?: string;
  name: string;
  quantity: number;
}

export interface ImportedDeck {
  source: "masterduelmeta" | "duellinksmeta";
  main: ImportedDeckCard[];
  extra: ImportedDeckCard[];
  side: ImportedDeckCard[];
  mainCount: number;
  extraCount: number;
  sideCount: number;
  deckName?: string;
}

interface MetaDeckCardEntry {
  card?: { name?: string; konamiID?: number | string; _id?: string };
  amount?: number;
}

interface MetaDeckPayload {
  main?: MetaDeckCardEntry[];
  extra?: MetaDeckCardEntry[];
  side?: MetaDeckCardEntry[];
  name?: string;
  deckName?: string;
}

const UA = "Mozilla/5.0 (LovableApp DeckImporter)";

function normalize(entries: MetaDeckCardEntry[] | undefined): ImportedDeckCard[] {
  if (!Array.isArray(entries)) return [];
  const out: ImportedDeckCard[] = [];
  for (const e of entries) {
    const name = e.card?.name?.trim();
    const qty = Number(e.amount ?? 0);
    if (!name || !qty) continue;
    const card: ImportedDeckCard = { name, quantity: qty };
    if (e.card?.konamiID != null) card.id = String(e.card.konamiID);
    out.push(card);
  }
  return out;
}


function sum(cards: ImportedDeckCard[]) {
  return cards.reduce((s, c) => s + c.quantity, 0);
}

async function fetchMetaDeck(
  host: "masterduelmeta.com" | "duellinksmeta.com",
  slug: string,
): Promise<MetaDeckPayload | null> {
  // The meta sites expose the deck via `?url=<slug>` on multiple collections.
  // Try the most common ones in order.
  const collections = ["decks", "top-decks", "tier-list-decks"];
  for (const coll of collections) {
    const apiUrl = `https://www.${host}/api/v1/${coll}?url=${encodeURIComponent(slug)}`;
    try {
      const res = await fetch(apiUrl, { headers: { "User-Agent": UA, Accept: "application/json" } });
      if (!res.ok) continue;
      const json = (await res.json()) as MetaDeckPayload | MetaDeckPayload[];
      const deck = Array.isArray(json) ? json[0] : json;
      if (deck && (deck.main || deck.extra)) return deck;
    } catch {
      // try next collection
    }
  }

  // Fallback: scrape the HTML page for an embedded JSON blob.
  try {
    const pageUrl = `https://www.${host}/deck/${encodeURIComponent(slug)}`;
    const res = await fetch(pageUrl, { headers: { "User-Agent": UA } });
    if (!res.ok) return null;
    const html = await res.text();
    // Look for a JSON object with a "main" array containing card objects.
    const match = html.match(/"main":\s*\[[\s\S]{20,20000}?\](?:,\s*"extra":\s*\[[\s\S]{0,20000}?\])?(?:,\s*"side":\s*\[[\s\S]{0,20000}?\])?/);
    if (!match) return null;
    try {
      const wrapped = `{${match[0]}}`;
      return JSON.parse(wrapped) as MetaDeckPayload;
    } catch {
      return null;
    }
  } catch {
    return null;
  }
}

export const importDeckFromUrl = createServerFn({ method: "POST" })
  .inputValidator((data: { url: string }) => {
    if (!data?.url || typeof data.url !== "string") throw new Error("url is required");
    return { url: data.url.trim() };
  })
  .handler(async ({ data }) => {
    let parsed: URL;
    try {
      parsed = new URL(data.url);
    } catch {
      throw new Error("URL inválida");
    }
    const host = parsed.hostname.replace(/^www\./, "");
    let source: "masterduelmeta" | "duellinksmeta";
    if (host === "masterduelmeta.com") source = "masterduelmeta";
    else if (host === "duellinksmeta.com") source = "duellinksmeta";
    else throw new Error("Suportamos apenas links de masterduelmeta.com ou duellinksmeta.com");

    // Path is typically /deck/<slug> or /deck-name/<slug>
    const parts = parsed.pathname.split("/").filter(Boolean);
    const slug = parts[parts.length - 1];
    if (!slug) throw new Error("Não foi possível extrair o slug do deck da URL");

    const payload = await fetchMetaDeck(
      source === "masterduelmeta" ? "masterduelmeta.com" : "duellinksmeta.com",
      slug,
    );
    if (!payload) {
      throw new Error(
        "Não consegui obter o deck a partir dessa URL. Verifique o link ou cole a decklist manualmente.",
      );
    }

    const main = normalize(payload.main);
    const extra = normalize(payload.extra);
    const side = normalize(payload.side);
    if (main.length === 0) {
      throw new Error("O deck importado não tem cartas no main deck.");
    }

    const result: ImportedDeck = {
      source,
      main,
      extra,
      side,
      mainCount: sum(main),
      extraCount: sum(extra),
      sideCount: sum(side),
      deckName: payload.deckName ?? payload.name,
    };
    return result;
  });
