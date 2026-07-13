// Parse Yu-Gi-Oh decklists in various formats.

export interface ParsedCard {
  name: string;
  quantity: number;
}

export interface ParsedDeck {
  main: ParsedCard[];
  extra: ParsedCard[];
  side: ParsedCard[];
  mainCount: number;
  extraCount: number;
  sideCount: number;
}

const SECTION_HEADERS: Record<string, "main" | "extra" | "side"> = {
  monster: "main",
  monsters: "main",
  spell: "main",
  spells: "main",
  trap: "main",
  traps: "main",
  main: "main",
  "main deck": "main",
  extra: "extra",
  "extra deck": "extra",
  side: "side",
  "side deck": "side",
};

/**
 * Parses a text decklist (typical clipboard format) into main/extra/side cards.
 * Supports lines like "3x Ash Blossom & Joyous Spring" or "3 Ash Blossom".
 * Section headers determine placement; default is main.
 */
export function parseTextDecklist(text: string): ParsedDeck {
  const lines = text.split(/\r?\n/);
  const main: ParsedCard[] = [];
  const extra: ParsedCard[] = [];
  const side: ParsedCard[] = [];
  let section: "main" | "extra" | "side" = "main";

  const cardRegex = /^\s*(\d+)\s*[xX]?\s+(.+?)\s*$/;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const headerKey = line.toLowerCase().replace(/[:\-–]/g, "").trim();
    if (SECTION_HEADERS[headerKey]) {
      section = SECTION_HEADERS[headerKey];
      continue;
    }
    // Also detect lines starting with a header word (e.g. "Monster:")
    const headerMatch = line.match(/^([A-Za-z ]+?)\s*[:\-–]/);
    if (headerMatch) {
      const key = headerMatch[1].toLowerCase().trim();
      if (SECTION_HEADERS[key]) {
        section = SECTION_HEADERS[key];
        continue;
      }
    }

    const m = line.match(cardRegex);
    if (!m) continue;
    const qty = parseInt(m[1], 10);
    const name = m[2].replace(/\s+/g, " ").trim();
    if (!name || qty <= 0) continue;

    const card: ParsedCard = { name, quantity: qty };
    if (section === "main") main.push(card);
    else if (section === "extra") extra.push(card);
    else side.push(card);
  }

  const sum = (arr: ParsedCard[]) => arr.reduce((s, c) => s + c.quantity, 0);
  return {
    main,
    extra,
    side,
    mainCount: sum(main),
    extraCount: sum(extra),
    sideCount: sum(side),
  };
}

/**
 * Parses a .ydk file (YGOPro format) — returns counts by section.
 * Card IDs aren't resolved to names offline; each ID becomes a "Card #ID" entry.
 */
export function parseYdk(text: string): ParsedDeck {
  const lines = text.split(/\r?\n/);
  let section: "main" | "extra" | "side" | null = null;
  const counts: Record<"main" | "extra" | "side", Map<string, number>> = {
    main: new Map(),
    extra: new Map(),
    side: new Map(),
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("#main")) {
      section = "main";
      continue;
    }
    if (line.startsWith("#extra")) {
      section = "extra";
      continue;
    }
    if (line.startsWith("!side")) {
      section = "side";
      continue;
    }
    if (line.startsWith("#")) continue;
    if (!section) continue;
    if (!/^\d+$/.test(line)) continue;
    const map = counts[section];
    map.set(line, (map.get(line) ?? 0) + 1);
  }
  const toCards = (m: Map<string, number>): ParsedCard[] =>
    Array.from(m.entries()).map(([id, q]) => ({ name: `Card #${id}`, quantity: q }));
  const main = toCards(counts.main);
  const extra = toCards(counts.extra);
  const side = toCards(counts.side);
  const sum = (arr: ParsedCard[]) => arr.reduce((s, c) => s + c.quantity, 0);
  return {
    main,
    extra,
    side,
    mainCount: sum(main),
    extraCount: sum(extra),
    sideCount: sum(side),
  };
}

/**
 * Parses a ydke:// URL. Format: ydke://<mainB64>!<extraB64>!<sideB64>!
 * Each base64 chunk decodes to bytes where every 4 bytes is a little-endian card ID.
 */
export function parseYdkeUrl(url: string): ParsedDeck {
  if (!url.startsWith("ydke://")) {
    throw new Error("URL ydke inválida — deve começar com ydke://");
  }
  const rest = url.slice("ydke://".length);
  const parts = rest.split("!");
  if (parts.length < 3) throw new Error("URL ydke incompleta");
  const [mainB64, extraB64, sideB64] = parts;
  const decode = (b64: string): string[] => {
    if (!b64) return [];
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const ids: string[] = [];
    const view = new DataView(bytes.buffer);
    for (let i = 0; i + 4 <= bytes.length; i += 4) {
      ids.push(String(view.getUint32(i, true)));
    }
    return ids;
  };
  const bucket = (ids: string[]): ParsedCard[] => {
    const m = new Map<string, number>();
    for (const id of ids) m.set(id, (m.get(id) ?? 0) + 1);
    return Array.from(m.entries()).map(([id, q]) => ({ name: `Card #${id}`, quantity: q }));
  };
  const main = bucket(decode(mainB64));
  const extra = bucket(decode(extraB64));
  const side = bucket(decode(sideB64));
  const sum = (arr: ParsedCard[]) => arr.reduce((s, c) => s + c.quantity, 0);
  return {
    main,
    extra,
    side,
    mainCount: sum(main),
    extraCount: sum(extra),
    sideCount: sum(side),
  };
}
