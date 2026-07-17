import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Sparkles,
  Upload,
  Wand2,
  Plus,
  Trash2,
  RefreshCw,
  Copy,
  FileText,
  Moon,
  Sun,
  Image as ImageIcon,
  FileDown,
  Zap,
  Save,
  FolderOpen,
  Share2,
  AlertTriangle,
  CheckCircle2,
  Languages as LanguagesIcon,
  Download,
  Upload as UploadIcon,
} from "lucide-react";
import { toPng } from "html-to-image";
import { jsPDF } from "jspdf";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Toaster } from "@/components/ui/sonner";

import {
  multivariateProbability,
  formatFraction,
  type CategoryConstraint,
} from "@/lib/hypergeometric";
import {
  parseTextDecklist,
  parseYdk,
  parseYdkeUrl,
  type ParsedCard,
} from "@/lib/deck-parser";
import { resolveCardNames } from "@/lib/cards.functions";
import { makeT, LANGS, type Lang } from "@/lib/i18n";


export const Route = createFileRoute("/")({
  component: HypergeometricCalculator,
});


// -------------------- Format definitions --------------------

type FormatKey = "master" | "speed" | "rush";
type FormatOption = FormatKey | "auto";

interface FormatSpec {
  label: string;
  min: number;
  max: number;
  defaultSize: number;
  turn1Hand: number;
  turn2Hand: number;
  categories: string[];
}

const FORMATS: Record<FormatKey, FormatSpec> = {
  master: {
    label: "Avançado/Genesys",
    min: 40,
    max: 60,
    defaultSize: 40,
    turn1Hand: 5,
    turn2Hand: 6,
    categories: ["Starters", "Extenders", "Garnets", "Techs"],
  },
  speed: {
    label: "Speed",
    min: 20,
    max: 30,
    defaultSize: 20,
    turn1Hand: 4,
    turn2Hand: 5,
    categories: ["Starters", "Extenders", "Garnets", "Techs"],
  },
  rush: {
    label: "Rush",
    min: 30,
    max: 40,
    defaultSize: 30,
    turn1Hand: 5,
    turn2Hand: 5,
    categories: ["Starters", "Extenders", "Garnets", "Techs"],
  },
};

function detectFormat(deckSize: number): FormatKey {
  if (deckSize <= 30) return "speed";
  if (deckSize <= 40) return "rush";
  return "master";
}

// -------------------- Types --------------------

type Mode = "atLeast" | "exactly" | "atMost";

interface Category {
  id: string;
  name: string;
  count: number; // manual count if no import
  mode: Mode;
  value: number;
  include: boolean;
}

interface ComboEntry {
  categoryId: string;
  mode: Mode;
  value: number;
}
interface Combo {
  id: string;
  name: string;
  entries: ComboEntry[];
}

interface Preset {
  name: string;
  combos: { name: string; entries: { catName: string; mode: Mode; value: number }[] }[];
}

let catIdCounter = 0;
const nextCatId = () => `cat_${++catIdCounter}`;
let comboIdCounter = 0;
const nextComboId = () => `combo_${++comboIdCounter}`;

function makeDefaultCategories(format: FormatKey): Category[] {
  return FORMATS[format].categories.map((name) => {
    const isGarnet = name.toLowerCase().includes("garnet");
    return {
      id: nextCatId(),
      name,
      count: 0,
      mode: isGarnet ? "atMost" : "atLeast",
      value: isGarnet ? 0 : 1,
      include: true,
    };
  });
}

// Turn a Category into a CategoryConstraint for the hypergeometric engine.
function catToConstraint(c: Category, effectiveSize: number): CategoryConstraint {
  const size = effectiveSize;
  if (!c.include) return { size, min: 0 };
  switch (c.mode) {
    case "atLeast":
      return { size, min: c.value };
    case "exactly":
      return { size, min: c.value, max: c.value };
    case "atMost":
      return { size, min: 0, max: c.value };
  }
}

function entryToConstraint(entry: ComboEntry, size: number): CategoryConstraint {
  switch (entry.mode) {
    case "atLeast":
      return { size, min: entry.value };
    case "exactly":
      return { size, min: entry.value, max: entry.value };
    case "atMost":
      return { size, min: 0, max: entry.value };
  }
}

function modeLabel(m: Mode): string {
  return m === "atLeast" ? "≥" : m === "exactly" ? "=" : "≤";
}

// -------------------- Share encoding --------------------

interface ShareState {
  fmt: FormatOption;
  size: number;
  cats: { name: string; count: number; mode: Mode; value: number; include: boolean }[];
  combos: { name: string; entries: { catIdx: number; mode: Mode; value: number }[] }[];
  presets?: Preset[];
  lang?: Lang;
}

function encodeShare(state: ShareState): string {
  const json = JSON.stringify(state);
  const b64 =
    typeof window === "undefined"
      ? Buffer.from(json).toString("base64")
      : btoa(unescape(encodeURIComponent(json)));
  return b64.replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function decodeShare(s: string): ShareState | null {
  try {
    const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4 ? "=".repeat(4 - (b64.length % 4)) : "";
    const json = decodeURIComponent(escape(atob(b64 + pad)));
    return JSON.parse(json) as ShareState;
  } catch {
    return null;
  }
}

// -------------------- Component --------------------

function HypergeometricCalculator() {
  const [formatOption, setFormatOption] = useState<FormatOption>("auto");
  const [deckSize, setDeckSize] = useState<number>(40);
  const [categories, setCategories] = useState<Category[]>(() => makeDefaultCategories("master"));
  const [combos, setCombos] = useState<Combo[]>([]);

  const [parsedCards, setParsedCards] = useState<ParsedCard[]>([]);
  const [cardAssignments, setCardAssignments] = useState<Record<number, string>>({});

  const [pasteText, setPasteText] = useState<string>("");
  const [ydkeUrl, setYdkeUrl] = useState<string>("");

  const [importing, setImporting] = useState<boolean>(false);
  const [exporting, setExporting] = useState<boolean>(false);

  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [themeUserSet, setThemeUserSet] = useState<boolean>(false);

  const [presets, setPresets] = useState<Preset[]>([]);
  const [presetName, setPresetName] = useState<string>("");

  const [lang, setLang] = useState<Lang>("en");
  const t = useMemo(() => makeT(lang), [lang]);

  const resultsRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const shareLoadedRef = useRef<boolean>(false);
  const presetFileRef = useRef<HTMLInputElement>(null);

  // ---- Theme: follow system by default; user toggle overrides & persists ----
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem("theme");
    if (stored === "light" || stored === "dark") {
      setTheme(stored);
      setThemeUserSet(true);
    } else {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      setTheme(prefersDark ? "dark" : "light");
    }
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const listener = (e: MediaQueryListEvent) => {
      // Only follow system if user hasn't manually set a preference this session
      const persisted = window.localStorage.getItem("theme");
      if (persisted !== "light" && persisted !== "dark") {
        setTheme(e.matches ? "dark" : "light");
      }
    };
    mql.addEventListener?.("change", listener);
    return () => mql.removeEventListener?.("change", listener);
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.classList.toggle("dark", theme === "dark");
    if (themeUserSet) {
      try {
        window.localStorage.setItem("theme", theme);
      } catch {
        /* ignore */
      }
    }
  }, [theme, themeUserSet]);

  const toggleTheme = () => {
    setThemeUserSet(true);
    setTheme((t) => (t === "dark" ? "light" : "dark"));
  };

  // ---- Presets + language: load once from localStorage ----
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("ygo-combo-presets");
      if (raw) setPresets(JSON.parse(raw));
    } catch {
      /* ignore */
    }
    try {
      const l = window.localStorage.getItem("lang");
      if (l === "pt" || l === "en" || l === "es") {
        setLang(l);
      } else {
        const nav = (navigator.language || "en").toLowerCase();
        if (nav.startsWith("pt")) setLang("pt");
        else if (nav.startsWith("es")) setLang("es");
        else setLang("en");
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem("lang", lang);
    } catch {
      /* ignore */
    }
  }, [lang]);

  const persistPresets = (next: Preset[]) => {
    setPresets(next);
    try {
      window.localStorage.setItem("ygo-combo-presets", JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  // ---- Share link: apply on first mount if hash present ----
  useEffect(() => {
    if (shareLoadedRef.current) return;
    shareLoadedRef.current = true;
    if (typeof window === "undefined") return;
    const hash = window.location.hash;
    const match = hash.match(/[#&]s=([^&]+)/);
    if (!match) return;
    const state = decodeShare(match[1]);
    if (!state) return;
    // Rebuild categories with new IDs; map indices to new IDs for combos.
    const newCats: Category[] = state.cats.map((c) => ({
      id: nextCatId(),
      name: c.name,
      count: c.count,
      mode: c.mode,
      value: c.value,
      include: c.include,
    }));
    const newCombos: Combo[] = state.combos.map((cb) => ({
      id: nextComboId(),
      name: cb.name,
      entries: cb.entries
        .filter((e) => e.catIdx >= 0 && e.catIdx < newCats.length)
        .map((e) => ({
          categoryId: newCats[e.catIdx].id,
          mode: e.mode,
          value: e.value,
        })),
    }));
    setFormatOption(state.fmt);
    setDeckSize(state.size);
    setCategories(newCats);
    setCombos(newCombos);
    if (state.lang === "pt" || state.lang === "en" || state.lang === "es") setLang(state.lang);
    if (Array.isArray(state.presets) && state.presets.length > 0) {
      // Merge shared presets into existing (shared takes precedence on name conflicts)
      setPresets((prev) => {
        const byName = new Map(prev.map((p) => [p.name, p]));
        for (const p of state.presets!) byName.set(p.name, p);
        const merged = Array.from(byName.values());
        try {
          window.localStorage.setItem("ygo-combo-presets", JSON.stringify(merged));
        } catch {
          /* ignore */
        }
        return merged;
      });
    }
    toast.success(makeT(state.lang ?? lang)("share_loaded"));
  }, []);

  const activeFormatKey: FormatKey = formatOption === "auto" ? detectFormat(deckSize) : formatOption;
  const spec = FORMATS[activeFormatKey];
  const hands: { turn: 1 | 2; size: number }[] = [
    { turn: 1, size: spec.turn1Hand },
    { turn: 2, size: spec.turn2Hand },
  ];

  const derivedCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    parsedCards.forEach((card, idx) => {
      const cid = cardAssignments[idx];
      if (cid && cid !== "__none__") counts[cid] = (counts[cid] ?? 0) + card.quantity;
    });
    return counts;
  }, [parsedCards, cardAssignments]);

  const hasImportedCards = parsedCards.length > 0;
  const effectiveCount = (c: Category): number =>
    hasImportedCards ? (derivedCounts[c.id] ?? 0) : c.count;

  const totalCategorized = categories.reduce((s, c) => s + effectiveCount(c), 0);
  const importedTotal = parsedCards.reduce((s, c) => s + c.quantity, 0);

  // -------------------- Actions --------------------

  const applyFormat = (key: FormatKey, resetSize = true) => {
    setCategories(makeDefaultCategories(key));
    if (resetSize) setDeckSize(FORMATS[key].defaultSize);
    setParsedCards([]);
    setCardAssignments({});
    setCombos([]);
  };

  const handleFormatChange = (value: string) => {
    setFormatOption(value as FormatOption);
    if (value !== "auto") applyFormat(value as FormatKey);
  };

  const importFromText = (text: string) => {
    try {
      const parsed = parseTextDecklist(text);
      if (parsed.mainCount === 0) {
        toast.error("Nenhuma carta identificada na decklist.");
        return;
      }
      setParsedCards(parsed.main);
      setCardAssignments({});
      setDeckSize(parsed.mainCount);
      toast.success(`Decklist importada: ${parsed.mainCount} cartas no main deck.`);
    } catch (e) {
      toast.error("Não foi possível interpretar a decklist.");
      console.error(e);
    }
  };

  const enrichWithNames = async (cards: ParsedCard[]): Promise<ParsedCard[]> => {
    const ids = Array.from(new Set(cards.map((c) => c.id).filter((v): v is string => !!v)));
    if (ids.length === 0) return cards;
    try {
      const { names } = await resolveCardNames({ data: { ids } });
      const resolved = cards.map((c) => (c.id && names[c.id] ? { ...c, name: names[c.id] } : c));
      const unresolved = cards.filter((c) => c.id && !names[c.id]).length;
      if (unresolved > 0) {
        toast.warning(`${unresolved} carta(s) sem nome resolvido — mantidas como "Card #ID".`);
      }
      return resolved;
    } catch (e) {
      console.error(e);
      toast.warning("Não consegui resolver os nomes das cartas online. Mostrando IDs.");
      return cards;
    }
  };

  const importFromYdkeUrl = async () => {
    try {
      setImporting(true);
      const parsed = parseYdkeUrl(ydkeUrl.trim());
      const enriched = await enrichWithNames(parsed.main);
      setParsedCards(enriched);
      setCardAssignments({});
      setDeckSize(parsed.mainCount);
      toast.success(`Link ydke importado: ${parsed.mainCount} cartas no main deck.`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setImporting(false);
    }
  };

  const importYdkFile = async (file: File) => {
    try {
      setImporting(true);
      const text = await file.text();
      const parsed = parseYdk(text);
      const enriched = await enrichWithNames(parsed.main);
      setParsedCards(enriched);
      setCardAssignments({});
      setDeckSize(parsed.mainCount);
      toast.success(`Arquivo .ydk importado: ${parsed.mainCount} cartas no main deck.`);
    } catch (e) {
      toast.error("Falha ao ler o arquivo .ydk.");
      console.error(e);
    } finally {
      setImporting(false);
    }
  };

  const clearImport = () => {
    setParsedCards([]);
    setCardAssignments({});
    setPasteText("");
    setYdkeUrl("");
    toast.info("Importação limpa.");
  };

  const updateCategory = (id: string, patch: Partial<Category>) =>
    setCategories((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  const addCategory = () =>
    setCategories((prev) => [
      ...prev,
      {
        id: nextCatId(),
        name: `Categoria ${prev.length + 1}`,
        count: 0,
        mode: "atLeast",
        value: 1,
        include: true,
      },
    ]);

  const removeCategory = (id: string) => {
    setCategories((prev) => prev.filter((c) => c.id !== id));
    setCardAssignments((prev) => {
      const next: Record<number, string> = {};
      for (const [k, v] of Object.entries(prev)) if (v !== id) next[Number(k)] = v;
      return next;
    });
    setCombos((prev) =>
      prev.map((cb) => ({
        ...cb,
        entries: cb.entries.filter((e) => e.categoryId !== id),
      })),
    );
  };

  // -------------------- Probability --------------------

  const included = categories.filter((c) => c.include);
  const maxHandSize = Math.max(spec.turn1Hand, spec.turn2Hand);

  const fullConstraints: CategoryConstraint[] = categories.map((c) =>
    catToConstraint(c, effectiveCount(c)),
  );

  const validation = useMemo(() => {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (deckSize < spec.min || deckSize > spec.max) {
      warnings.push(
        `Deck com ${deckSize} cartas está fora da faixa do formato ${spec.label} (${spec.min}–${spec.max}).`,
      );
    }
    if (hasImportedCards && importedTotal !== deckSize) {
      warnings.push(
        `Decklist importada tem ${importedTotal} cartas, mas o tamanho do deck está em ${deckSize}.`,
      );
    }
    if (totalCategorized > deckSize) {
      errors.push(
        `Soma das categorias (${totalCategorized}) excede o tamanho do deck (${deckSize}).`,
      );
    }
    for (const c of included) {
      const size = effectiveCount(c);
      if (c.mode !== "atMost" && c.value > size) {
        errors.push(`"${c.name}": ${modeLabel(c.mode)} ${c.value} > cartas disponíveis (${size}).`);
      }
      if (c.value > maxHandSize) {
        errors.push(`"${c.name}": ${modeLabel(c.mode)} ${c.value} > tamanho da mão (${maxHandSize}).`);
      }
    }
    return { errors, warnings };
  }, [
    categories,
    derivedCounts,
    deckSize,
    maxHandSize,
    spec,
    hasImportedCards,
    importedTotal,
    totalCategorized,
    included,
  ]);

  const canCompute = validation.errors.length === 0 && included.length > 0;

  const resultsByTurn = useMemo(() => {
    if (!canCompute) return null;
    return hands.map(({ turn, size }) => ({
      turn,
      handSize: size,
      res: multivariateProbability(deckSize, size, fullConstraints),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canCompute, deckSize, categories, derivedCounts]);

  const perCategoryResults = included.map((c) => {
    const size = effectiveCount(c);
    const constraint = catToConstraint(c, size);
    const byTurn = hands.map(({ turn, size: hs }) => {
      let res: ReturnType<typeof multivariateProbability> | null = null;
      const feasible =
        (c.mode === "atMost" || c.value <= size) && c.value <= hs;
      if (feasible) res = multivariateProbability(deckSize, hs, [constraint]);
      return { turn, handSize: hs, res };
    });
    return { cat: c, size, byTurn };
  });

  const comboResults = combos.map((combo) => {
    const valid =
      combo.entries.length > 0 &&
      combo.entries.every((e) => {
        const cat = categories.find((c) => c.id === e.categoryId);
        if (!cat) return false;
        const size = effectiveCount(cat);
        if (e.value < 0) return false;
        if (e.mode !== "atMost" && e.value > size) return false;
        return true;
      });
    const byTurn = hands.map(({ turn, size: hs }) => {
      if (!valid)
        return { turn, handSize: hs, res: null as ReturnType<typeof multivariateProbability> | null };
      // Minimum forced picks (atLeast/exactly) sum
      const forcedMin = combo.entries.reduce(
        (s, e) => s + (e.mode === "atMost" ? 0 : e.value),
        0,
      );
      if (forcedMin > hs) return { turn, handSize: hs, res: null };
      // Build constraints per category; combined entries override defaults.
      const cs: CategoryConstraint[] = categories.map((cat) => {
        const size = effectiveCount(cat);
        const entry = combo.entries.find((e) => e.categoryId === cat.id);
        if (entry) return entryToConstraint(entry, size);
        return { size, min: 0 };
      });
      return { turn, handSize: hs, res: multivariateProbability(deckSize, hs, cs) };
    });
    return { combo, valid, byTurn };
  });

  const addCombo = () =>
    setCombos((prev) => [
      ...prev,
      {
        id: nextComboId(),
        name: `Combo ${prev.length + 1}`,
        entries: categories.slice(0, 2).map((c) => ({
          categoryId: c.id,
          mode: "atLeast" as Mode,
          value: 1,
        })),
      },
    ]);
  const updateCombo = (id: string, patch: Partial<Combo>) =>
    setCombos((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const removeCombo = (id: string) => setCombos((prev) => prev.filter((c) => c.id !== id));

  // -------------------- Chart data --------------------

  const chartData = useMemo(() => {
    const rows: {
      label: string;
      T1: number;
      T2: number;
      kind: string;
      T1frac: string;
      T2frac: string;
    }[] = [];
    const fracOrDash = (r: { numerator: bigint; denominator: bigint } | null) =>
      r ? formatFraction(r.numerator, r.denominator) : "—";
    for (const p of perCategoryResults) {
      rows.push({
        label: p.cat.name,
        kind: t("categorized"),
        T1: p.byTurn[0].res ? +(p.byTurn[0].res.probability * 100).toFixed(2) : 0,
        T2: p.byTurn[1].res ? +(p.byTurn[1].res.probability * 100).toFixed(2) : 0,
        T1frac: fracOrDash(p.byTurn[0].res),
        T2frac: fracOrDash(p.byTurn[1].res),
      });
    }
    for (const cr of comboResults) {
      rows.push({
        label: cr.combo.name,
        kind: "Combo",
        T1: cr.valid && cr.byTurn[0].res ? +(cr.byTurn[0].res.probability * 100).toFixed(2) : 0,
        T2: cr.valid && cr.byTurn[1].res ? +(cr.byTurn[1].res.probability * 100).toFixed(2) : 0,
        T1frac: cr.valid ? fracOrDash(cr.byTurn[0].res) : "—",
        T2frac: cr.valid ? fracOrDash(cr.byTurn[1].res) : "—",
      });
    }
    return rows;
  }, [perCategoryResults, comboResults, t]);

  // -------------------- Presets --------------------

  const savePreset = () => {
    const name = presetName.trim();
    if (!name) {
      toast.error(t("preset_needs_name"));
      return;
    }
    if (combos.length === 0) {
      toast.error(t("preset_needs_combo"));
      return;
    }
    const catById = new Map(categories.map((c) => [c.id, c]));
    const p: Preset = {
      name,
      combos: combos.map((cb) => ({
        name: cb.name,
        entries: cb.entries.map((e) => ({
          catName: catById.get(e.categoryId)?.name ?? "?",
          mode: e.mode,
          value: e.value,
        })),
      })),
    };
    const filtered = presets.filter((x) => x.name !== name);
    persistPresets([...filtered, p]);
    toast.success(t("preset_saved", { name }));
  };

  const loadPreset = (name: string) => {
    const p = presets.find((x) => x.name === name);
    if (!p) return;
    const byName = new Map(categories.map((c) => [c.name.toLowerCase(), c]));
    const loaded: Combo[] = p.combos.map((cb) => ({
      id: nextComboId(),
      name: cb.name,
      entries: cb.entries
        .map((e) => {
          const cat = byName.get(e.catName.toLowerCase());
          if (!cat) return null;
          return { categoryId: cat.id, mode: e.mode, value: e.value };
        })
        .filter((v): v is ComboEntry => v !== null),
    }));
    setCombos(loaded);
    const missing = p.combos.reduce(
      (s, cb) => s + cb.entries.filter((e) => !byName.has(e.catName.toLowerCase())).length,
      0,
    );
    if (missing > 0) {
      toast.warning(t("preset_loaded_missing", { name, n: missing }));
    } else {
      toast.success(t("preset_loaded", { name }));
    }
  };

  const deletePreset = (name: string) => {
    persistPresets(presets.filter((x) => x.name !== name));
    toast.info(t("preset_removed", { name }));
  };

  const exportPresetsJson = () => {
    try {
      const blob = new Blob([JSON.stringify(presets, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "ygo-combo-presets.json";
      a.click();
      URL.revokeObjectURL(url);
      toast.success(t("presets_exported"));
    } catch (e) {
      console.error(e);
      toast.error(t("presets_invalid"));
    }
  };

  const importPresetsJson = async (file: File) => {
    const text = await file.text().catch(() => "");
    if (!text) {
      toast.error(`${t("presets_invalid")} — arquivo vazio ou ilegível.`);
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      const msg = (e as Error).message || "JSON inválido";
      // Try to extract position → line/column
      const posMatch = msg.match(/position\s+(\d+)/i);
      let where = "";
      if (posMatch) {
        const pos = Number(posMatch[1]);
        const upto = text.slice(0, pos);
        const line = upto.split("\n").length;
        const col = pos - upto.lastIndexOf("\n");
        where = ` (linha ${line}, coluna ${col})`;
      }
      toast.error(`${t("presets_invalid")} — ${msg}${where}`, { duration: 8000 });
      return;
    }
    if (!Array.isArray(parsed)) {
      toast.error(`${t("presets_invalid")} — raiz deve ser um array de presets.`, { duration: 8000 });
      return;
    }
    const errors: string[] = [];
    const valid: Preset[] = [];
    (parsed as unknown[]).forEach((raw, i) => {
      const path = `presets[${i}]`;
      if (!raw || typeof raw !== "object") {
        errors.push(`${path}: deve ser objeto.`);
        return;
      }
      const p = raw as Record<string, unknown>;
      if (typeof p.name !== "string" || !p.name.trim()) {
        errors.push(`${path}.name: string obrigatória.`);
        return;
      }
      if (!Array.isArray(p.combos)) {
        errors.push(`${path}.combos: array obrigatório.`);
        return;
      }
      const combosOut: Preset["combos"] = [];
      let comboOk = true;
      (p.combos as unknown[]).forEach((rawCb, j) => {
        const cp = `${path}.combos[${j}]`;
        if (!rawCb || typeof rawCb !== "object") {
          errors.push(`${cp}: deve ser objeto.`); comboOk = false; return;
        }
        const cb = rawCb as Record<string, unknown>;
        if (typeof cb.name !== "string") {
          errors.push(`${cp}.name: string obrigatória.`); comboOk = false; return;
        }
        if (!Array.isArray(cb.entries)) {
          errors.push(`${cp}.entries: array obrigatório.`); comboOk = false; return;
        }
        const entriesOut: Preset["combos"][number]["entries"] = [];
        let entriesOk = true;
        (cb.entries as unknown[]).forEach((rawE, k) => {
          const ep = `${cp}.entries[${k}]`;
          if (!rawE || typeof rawE !== "object") {
            errors.push(`${ep}: deve ser objeto.`); entriesOk = false; return;
          }
          const e = rawE as Record<string, unknown>;
          if (typeof e.catName !== "string") { errors.push(`${ep}.catName: string obrigatória.`); entriesOk = false; return; }
          if (e.mode !== "atLeast" && e.mode !== "exactly" && e.mode !== "atMost") {
            errors.push(`${ep}.mode: deve ser "atLeast" | "exactly" | "atMost".`); entriesOk = false; return;
          }
          if (typeof e.value !== "number" || !Number.isFinite(e.value) || e.value < 0) {
            errors.push(`${ep}.value: número >= 0 obrigatório.`); entriesOk = false; return;
          }
          entriesOut.push({ catName: e.catName, mode: e.mode as Mode, value: e.value });
        });
        if (entriesOk) combosOut.push({ name: cb.name, entries: entriesOut });
        else comboOk = false;
      });
      if (comboOk) valid.push({ name: p.name, combos: combosOut });
    });
    if (errors.length > 0) {
      const preview = errors.slice(0, 5).join("\n");
      const more = errors.length > 5 ? `\n… e mais ${errors.length - 5} erro(s).` : "";
      toast.error(`${t("presets_invalid")}\n${preview}${more}`, { duration: 12000 });
      return;
    }
    if (valid.length === 0) {
      toast.error(`${t("presets_invalid")} — nenhum preset válido encontrado.`);
      return;
    }
    const byName = new Map(presets.map((p) => [p.name, p]));
    for (const p of valid) byName.set(p.name, p);
    persistPresets(Array.from(byName.values()));
    toast.success(t("presets_imported", { n: valid.length }));
  };

  // -------------------- Share --------------------

  const buildShareLink = (): string => {
    const state: ShareState = {
      fmt: formatOption,
      size: deckSize,
      cats: categories.map((c) => ({
        name: c.name,
        count: effectiveCount(c),
        mode: c.mode,
        value: c.value,
        include: c.include,
      })),
      combos: combos.map((cb) => ({
        name: cb.name,
        entries: cb.entries.map((e) => ({
          catIdx: categories.findIndex((c) => c.id === e.categoryId),
          mode: e.mode,
          value: e.value,
        })),
      })),
      presets,
      lang,
    };
    const enc = encodeShare(state);
    const base = `${window.location.origin}${window.location.pathname}`;
    return `${base}#s=${enc}`;
  };

  const copyShareLink = async () => {
    try {
      const url = buildShareLink();
      await navigator.clipboard.writeText(url);
      window.history.replaceState(null, "", url);
      toast.success(t("share_copied"));
    } catch (e) {
      console.error(e);
      toast.error(t("share_fail"));
    }
  };

  const copyShortShareLink = async () => {
    try {
      const url = buildShareLink();
      // Try is.gd first, tinyurl as fallback (both support CORS).
      let short = "";
      try {
        const r = await fetch(
          `https://is.gd/create.php?format=simple&url=${encodeURIComponent(url)}`,
        );
        if (r.ok) {
          const txt = (await r.text()).trim();
          if (/^https?:\/\//.test(txt)) short = txt;
        }
      } catch {
        /* fallback below */
      }
      if (!short) {
        const r2 = await fetch(
          `https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`,
        );
        if (!r2.ok) throw new Error("shortener failed");
        const txt = (await r2.text()).trim();
        if (!/^https?:\/\//.test(txt)) throw new Error("bad shortener response");
        short = txt;
      }
      await navigator.clipboard.writeText(short);
      window.history.replaceState(null, "", url);
      toast.success(`${t("share_copied")} (${short})`);
    } catch (e) {
      console.error(e);
      toast.error(t("share_fail"));
    }
  };

  // -------------------- Export --------------------

  const exportResults = async (kind: "png" | "pdf") => {
    if (!resultsRef.current) return;
    try {
      setExporting(true);
      const bg = getComputedStyle(document.body).backgroundColor || "#ffffff";
      const dataUrl = await toPng(resultsRef.current, {
        pixelRatio: 2,
        backgroundColor: bg,
        cacheBust: true,
      });
      if (kind === "png") {
        const a = document.createElement("a");
        a.href = dataUrl;
        a.download = `probabilidades-${spec.label.toLowerCase()}.png`;
        a.click();
        toast.success(t("export_png_ok"));
      } else {
        const img = new Image();
        img.src = dataUrl;
        await new Promise((r) => (img.onload = r));
        const pdf = new jsPDF({
          orientation: img.width > img.height ? "landscape" : "portrait",
          unit: "px",
          format: [img.width, img.height],
        });
        pdf.addImage(dataUrl, "PNG", 0, 0, img.width, img.height);
        pdf.save(`probabilidades-${spec.label.toLowerCase()}.pdf`);
        toast.success(t("export_pdf_ok"));
      }
    } catch (e) {
      console.error(e);
      toast.error(t("export_fail"));
    } finally {
      setExporting(false);
    }
  };

  const exportChart = async (kind: "png" | "pdf") => {
    if (!chartRef.current) return;
    // Inject a temporary summary table so the exported image includes T1/T2 % + fractions
    // (tooltips are interactive-only and don't appear in static captures).
    const host = chartRef.current;
    const summary = document.createElement("div");
    summary.setAttribute("data-chart-summary", "1");
    summary.style.cssText = `
      margin-top: 10px; padding: 8px 10px; border: 1px solid var(--border);
      border-radius: 8px; background: var(--muted); font-size: 11px;
      color: var(--foreground); font-family: ui-monospace, SFMono-Regular, monospace;
    `;
    const rowsHtml = chartData
      .map(
        (r) => `
        <div style="display:flex;justify-content:space-between;gap:12px;padding:2px 0;">
          <span style="min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${r.label}</span>
          <span style="color:var(--gold);">T1 ${r.T1}% <span style="opacity:.6">${r.T1frac}</span></span>
          <span style="color:var(--accent);">T2 ${r.T2}% <span style="opacity:.6">${r.T2frac}</span></span>
        </div>`,
      )
      .join("");
    summary.innerHTML = `<div style="font-weight:700;margin-bottom:4px;">T1 vs T2 — valores exatos</div>${rowsHtml}`;
    host.appendChild(summary);
    const toHide = Array.from(host.querySelectorAll<HTMLElement>("[data-export-hide]"));
    const prevDisplay = toHide.map((el) => el.style.display);
    toHide.forEach((el) => (el.style.display = "none"));
    try {
      setExporting(true);
      const bg = getComputedStyle(document.body).backgroundColor || "#ffffff";
      const dataUrl = await toPng(host, { pixelRatio: 2, backgroundColor: bg, cacheBust: true });
      if (kind === "png") {
        const a = document.createElement("a");
        a.href = dataUrl;
        a.download = `grafico-t1-t2-${spec.label.toLowerCase()}.png`;
        a.click();
        toast.success(t("export_png_ok"));
      } else {
        const img = new Image();
        img.src = dataUrl;
        await new Promise((r) => (img.onload = r));
        const pdf = new jsPDF({
          orientation: img.width > img.height ? "landscape" : "portrait",
          unit: "px",
          format: [img.width, img.height],
        });
        pdf.addImage(dataUrl, "PNG", 0, 0, img.width, img.height);
        pdf.save(`grafico-t1-t2-${spec.label.toLowerCase()}.pdf`);
        toast.success(t("export_pdf_ok"));
      }
    } catch (e) {
      console.error(e);
      toast.error(t("export_fail"));
    } finally {
      toHide.forEach((el, i) => (el.style.display = prevDisplay[i]));
      host.removeChild(summary);
      setExporting(false);
    }
  };


  return (
    <div className="min-h-screen">
      <Toaster richColors position="top-center" />

      {/* Hero */}
      <header className="border-b border-border/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl gradient-gold flex items-center justify-center glow-gold">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gold leading-tight">
                {t("app_title")}
              </h1>
              <p className="text-sm text-muted-foreground">{t("app_subtitle")}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className="bg-gold font-medium">{spec.label}</Badge>
            <Badge variant="secondary">
              {t("deck_badge", { size: deckSize, t1: spec.turn1Hand, t2: spec.turn2Hand })}
            </Badge>
            <Button size="sm" variant="outline" onClick={copyShareLink} className="gap-2" title={t("share_title")}>
              <Share2 className="w-4 h-4" /> {t("share")}
            </Button>
            <Button size="sm" variant="outline" onClick={copyShortShareLink} className="gap-2" title="Copiar link curto (is.gd/tinyurl)">
              <Share2 className="w-4 h-4" /> Link curto
            </Button>
            <Select value={lang} onValueChange={(v) => setLang(v as Lang)}>
              <SelectTrigger className="w-[140px] h-9" aria-label={t("language")}>
                <div className="flex items-center gap-2">
                  <LanguagesIcon className="w-4 h-4" />
                  <SelectValue />
                </div>
              </SelectTrigger>
              <SelectContent>
                {LANGS.map((l) => (
                  <SelectItem key={l.code} value={l.code}>
                    <span className="mr-2">{l.flag}</span>{l.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="icon"
              variant="outline"
              onClick={toggleTheme}
              aria-label={theme === "dark" ? t("theme_light") : t("theme_dark")}
              title={theme === "dark" ? t("theme_light") : t("theme_dark")}
            >
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      </header>


      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] gap-6">
        {/* LEFT: Configuration + Import + Validation */}
        <div className="space-y-6">
          <Card className="card-elevated">
            <CardHeader>
              <CardTitle className="text-lg">{t("format_card_title")}</CardTitle>
              <CardDescription>{t("format_card_desc")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{t("format_label")}</Label>
                  <Select value={formatOption} onValueChange={handleFormatChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">{t("auto")}</SelectItem>
                      <SelectItem value="master">{t("fmt_master")}</SelectItem>
                      <SelectItem value="speed">{t("fmt_speed")}</SelectItem>
                      <SelectItem value="rush">{t("fmt_rush")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>{t("deck_size")}</Label>
                  <Input
                    type="number"
                    min={1}
                    max={80}
                    value={deckSize}
                    onChange={(e) => setDeckSize(Math.max(1, Number(e.target.value) || 0))}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {t("format_range_hint", {
                  min: spec.min,
                  max: spec.max,
                  cats: spec.categories.join(", "),
                })}
              </p>
            </CardContent>
          </Card>


          {/* Validation */}
          <Card className="card-elevated">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                {validation.errors.length === 0 && validation.warnings.length === 0 ? (
                  <CheckCircle2 className="w-4 h-4 text-gold" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-destructive" />
                )}
                {t("validation_title")}
              </CardTitle>
              <CardDescription>{t("validation_desc")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className="p-2 rounded bg-muted/40">
                  <div className="text-muted-foreground">{t("size")}</div>
                  <div className="font-mono text-sm font-bold">{deckSize}</div>
                </div>
                <div className="p-2 rounded bg-muted/40">
                  <div className="text-muted-foreground">{t("categorized")}</div>
                  <div className="font-mono text-sm font-bold">{totalCategorized}</div>
                </div>
                <div className="p-2 rounded bg-muted/40">
                  <div className="text-muted-foreground">{t("imported")}</div>
                  <div className="font-mono text-sm font-bold">
                    {hasImportedCards ? importedTotal : "—"}
                  </div>
                </div>
                <div className="p-2 rounded bg-muted/40">
                  <div className="text-muted-foreground">{t("range", { label: spec.label })}</div>
                  <div className="font-mono text-sm font-bold">{spec.min}–{spec.max}</div>
                </div>
              </div>


              <div className="space-y-1">
                {categories.map((c) => {
                  const size = effectiveCount(c);
                  return (
                    <div key={c.id} className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-2">
                        <span
                          className="inline-block w-2 h-2 rounded-full"
                          style={{ background: c.include ? "var(--gold)" : "var(--muted-foreground)" }}
                        />
                        {c.name}
                      </span>
                      <span className="font-mono">{size}</span>
                    </div>
                  );
                })}
              </div>

              {validation.errors.length > 0 && (
                <div className="rounded-md bg-destructive/10 border border-destructive/40 p-2 space-y-1">
                  {validation.errors.map((err, i) => (
                    <p key={i} className="text-xs text-destructive">• {err}</p>
                  ))}
                </div>
              )}
              {validation.warnings.length > 0 && (
                <div className="rounded-md bg-gold/10 border border-gold/40 p-2 space-y-1">
                  {validation.warnings.map((w, i) => (
                    <p key={i} className="text-xs text-gold">• {w}</p>
                  ))}
                </div>
              )}
              {validation.errors.length === 0 && validation.warnings.length === 0 && (
                <p className="text-xs text-muted-foreground">{t("all_consistent", { label: spec.label })}</p>
              )}
            </CardContent>
          </Card>

          {/* Import */}
          <Card className="card-elevated">
            <CardHeader>
              <CardTitle className="text-lg">{t("import_title")}</CardTitle>
              <CardDescription>{t("import_desc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="paste">
                <TabsList className="w-full flex-wrap h-auto">
                  <TabsTrigger value="paste" className="flex-1 gap-2 min-w-[110px]">
                    <Copy className="w-4 h-4" /> {t("tab_paste")}
                  </TabsTrigger>
                  <TabsTrigger value="ydke" className="flex-1 gap-2 min-w-[110px]">
                    <Wand2 className="w-4 h-4" /> {t("tab_ydke")}
                  </TabsTrigger>
                  <TabsTrigger value="ydk" className="flex-1 gap-2 min-w-[110px]">
                    <FileText className="w-4 h-4" /> {t("tab_ydk")}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="paste" className="space-y-3 pt-3">
                  <Textarea
                    placeholder={`Monster:\n3x Ash Blossom & Joyous Spring\n...\n\nSpell:\n1x Called by the Grave\n...`}
                    rows={8}
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                    className="font-mono text-xs"
                  />
                  <div className="flex gap-2 flex-wrap">
                    <Button onClick={() => importFromText(pasteText)} className="bg-gold gap-2" disabled={importing}>
                      <Upload className="w-4 h-4" /> {t("import_btn")}
                    </Button>
                    <Button variant="ghost" onClick={clearImport} className="gap-2">
                      <RefreshCw className="w-4 h-4" /> {t("clear")}
                    </Button>
                  </div>
                </TabsContent>

                <TabsContent value="ydke" className="space-y-3 pt-3">
                  <Input
                    placeholder="ydke://..."
                    value={ydkeUrl}
                    onChange={(e) => setYdkeUrl(e.target.value)}
                    className="font-mono text-xs"
                  />
                  <p className="text-xs text-muted-foreground">{t("ydke_hint")}</p>
                  <div className="flex gap-2 flex-wrap">
                    <Button onClick={importFromYdkeUrl} className="bg-gold gap-2" disabled={importing}>
                      <Upload className="w-4 h-4" /> {importing ? t("importing") : t("import_ydke_btn")}
                    </Button>
                    <Button variant="ghost" onClick={clearImport} className="gap-2">
                      <RefreshCw className="w-4 h-4" /> {t("clear")}
                    </Button>
                  </div>
                </TabsContent>

                <TabsContent value="ydk" className="space-y-3 pt-3">
                  <Input
                    type="file"
                    accept=".ydk,text/plain"
                    disabled={importing}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) importYdkFile(f);
                    }}
                  />
                  <p className="text-xs text-muted-foreground">{t("ydk_hint")}</p>
                  <div className="flex gap-2 flex-wrap">
                    <Button variant="ghost" onClick={clearImport} className="gap-2">
                      <RefreshCw className="w-4 h-4" /> {t("clear")}
                    </Button>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          {hasImportedCards && (
            <Card className="card-elevated">
              <CardHeader className="flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-lg">{t("main_cards")}</CardTitle>
                  <CardDescription>{t("main_cards_desc")}</CardDescription>
                </div>
                <Badge variant="secondary">{parsedCards.length} {t("entries")}</Badge>

              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[320px] pr-3">
                  <div className="space-y-1.5">
                    {parsedCards.map((card, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-2 p-2 rounded-md bg-muted/40 hover:bg-muted transition-colors"
                      >
                        <Badge variant="outline" className="shrink-0 font-mono text-gold border-gold/40">
                          {card.quantity}x
                        </Badge>
                        <span className="text-sm flex-1 truncate">{card.name}</span>
                        <Select
                          value={cardAssignments[idx] ?? "__none__"}
                          onValueChange={(v) =>
                            setCardAssignments((prev) => ({ ...prev, [idx]: v }))
                          }
                        >
                          <SelectTrigger className="w-[180px] h-8 text-xs">
                            <SelectValue placeholder="Categoria..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">— nenhuma —</SelectItem>
                            {categories.map((c) => (
                              <SelectItem key={c.id} value={c.id}>
                                {c.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          )}
        </div>

        {/* RIGHT: Categories + Combos + Results */}
        <div className="space-y-6">
          <Card className="card-elevated">
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg">{t("categories")}</CardTitle>
                <CardDescription>{t("categories_desc")}</CardDescription>
              </div>
              <Button size="sm" variant="outline" onClick={addCategory} className="gap-1">
                <Plus className="w-4 h-4" /> {t("new_f")}
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {categories.map((c) => {
                const count = effectiveCount(c);
                return (
                  <div
                    key={c.id}
                    className="p-3 rounded-lg border border-border bg-surface/60 space-y-2"
                  >
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={c.include}
                        onCheckedChange={(v) => updateCategory(c.id, { include: v })}
                      />
                      <Input
                        value={c.name}
                        onChange={(e) => updateCategory(c.id, { name: e.target.value })}
                        className="h-8 font-medium"
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => removeCategory(c.id)}
                        aria-label={t("remove_cat")}
                        className="h-8 w-8 shrink-0"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <Label className="text-xs text-muted-foreground">{t("in_deck")}</Label>
                        <Input
                          type="number"
                          min={0}
                          value={count}
                          disabled={hasImportedCards}
                          onChange={(e) =>
                            updateCategory(c.id, { count: Math.max(0, Number(e.target.value) || 0) })
                          }
                          className="h-8"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">{t("mode")}</Label>
                        <Select
                          value={c.mode}
                          onValueChange={(v) => updateCategory(c.id, { mode: v as Mode })}
                          disabled={!c.include}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="atLeast">{t("mode_atleast")}</SelectItem>
                            <SelectItem value="exactly">{t("mode_exactly")}</SelectItem>
                            <SelectItem value="atMost">{t("mode_atmost")}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">{t("value")}</Label>
                        <Input
                          type="number"
                          min={0}
                          max={maxHandSize}
                          value={c.value}
                          onChange={(e) =>
                            updateCategory(c.id, { value: Math.max(0, Number(e.target.value) || 0) })
                          }
                          className="h-8"
                          disabled={!c.include}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}

              <Separator />
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{t("categorized")}</span>
                <span className="font-mono">
                  {totalCategorized} / {deckSize}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Combos */}
          <Card className="card-elevated">
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Zap className="w-4 h-4 text-gold" /> {t("combos_title")}
                </CardTitle>
                <CardDescription>{t("combos_desc")}</CardDescription>
              </div>
              <Button size="sm" variant="outline" onClick={addCombo} className="gap-1" disabled={categories.length === 0}>
                <Plus className="w-4 h-4" /> {t("new_m")}
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Preset controls */}
              <div className="p-2 rounded-lg border border-dashed border-border bg-muted/30 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Input
                    placeholder={t("preset_name_ph")}
                    value={presetName}
                    onChange={(e) => setPresetName(e.target.value)}
                    className="h-8 flex-1 min-w-[140px] text-sm"
                  />
                  <Button size="sm" variant="outline" onClick={savePreset} className="gap-1">
                    <Save className="w-3.5 h-3.5" /> {t("save")}
                  </Button>
                  <Select onValueChange={loadPreset}>
                    <SelectTrigger className="h-8 w-[160px] text-xs">
                      <FolderOpen className="w-3.5 h-3.5 mr-1" />
                      <SelectValue placeholder={t("load_preset")} />
                    </SelectTrigger>
                    <SelectContent>
                      {presets.length === 0 && (
                        <div className="px-2 py-1 text-xs text-muted-foreground">{t("no_presets")}</div>
                      )}
                      {presets.map((p) => (
                        <SelectItem key={p.name} value={p.name}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={exportPresetsJson}
                    className="gap-1 h-8"
                    disabled={presets.length === 0}
                  >
                    <Download className="w-3.5 h-3.5" /> {t("export_presets")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => presetFileRef.current?.click()}
                    className="gap-1 h-8"
                  >
                    <UploadIcon className="w-3.5 h-3.5" /> {t("import_presets")}
                  </Button>
                  <input
                    ref={presetFileRef}
                    type="file"
                    accept="application/json,.json"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) importPresetsJson(f);
                      if (e.target) e.target.value = "";
                    }}
                  />
                </div>
                {presets.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {presets.map((p) => (
                      <Badge
                        key={p.name}
                        variant="secondary"
                        className="text-[10px] gap-1 pr-1"
                      >
                        {p.name}
                        <button
                          className="hover:text-destructive"
                          onClick={() => deletePreset(p.name)}
                          aria-label={`${t("remove_cat")} ${p.name}`}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              {combos.length === 0 && (
                <p className="text-xs text-muted-foreground">{t("no_combos")}</p>
              )}
              {combos.map((combo) => (
                <div key={combo.id} className="p-3 rounded-lg border border-border bg-surface/60 space-y-2">
                  <div className="flex items-center gap-2">
                    <Input
                      value={combo.name}
                      onChange={(e) => updateCombo(combo.id, { name: e.target.value })}
                      className="h-8 font-medium"
                    />
                    <Button size="icon" variant="ghost" onClick={() => removeCombo(combo.id)} className="h-8 w-8 shrink-0">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="space-y-1.5">
                    {combo.entries.map((entry, i) => (
                      <div key={i} className="flex items-center gap-1.5">
                        <Select
                          value={entry.categoryId}
                          onValueChange={(v) => {
                            const entries = [...combo.entries];
                            entries[i] = { ...entry, categoryId: v };
                            updateCombo(combo.id, { entries });
                          }}
                        >
                          <SelectTrigger className="h-8 flex-1 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {categories.map((c) => (
                              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select
                          value={entry.mode}
                          onValueChange={(v) => {
                            const entries = [...combo.entries];
                            entries[i] = { ...entry, mode: v as Mode };
                            updateCombo(combo.id, { entries });
                          }}
                        >
                          <SelectTrigger className="h-8 w-[70px] text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="atLeast">≥</SelectItem>
                            <SelectItem value="exactly">=</SelectItem>
                            <SelectItem value="atMost">≤</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input
                          type="number"
                          min={0}
                          max={maxHandSize}
                          value={entry.value}
                          onChange={(e) => {
                            const entries = [...combo.entries];
                            entries[i] = { ...entry, value: Math.max(0, Number(e.target.value) || 0) };
                            updateCombo(combo.id, { entries });
                          }}
                          className="h-8 w-16"
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 shrink-0"
                          onClick={() => {
                            const entries = combo.entries.filter((_, j) => j !== i);
                            updateCombo(combo.id, { entries });
                          }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ))}
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1 h-7"
                      disabled={categories.length === 0}
                      onClick={() => {
                        const first = categories[0];
                        if (!first) return;
                        updateCombo(combo.id, {
                          entries: [...combo.entries, { categoryId: first.id, mode: "atLeast", value: 1 }],
                        });
                      }}
                    >
                      <Plus className="w-3 h-3" /> {t("add_category")}
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Results */}
          <Card className="card-elevated overflow-hidden" ref={resultsRef}>
            <CardHeader className="gradient-gold">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <CardTitle className="text-gold-foreground text-lg">{t("results_title")}</CardTitle>
                  <CardDescription className="text-gold-foreground/80">
                    {t("results_desc", { label: spec.label, size: deckSize, t1: spec.turn1Hand, t2: spec.turn2Hand })}
                  </CardDescription>
                </div>
                <div className="flex gap-2" data-export-hide>
                  <Button size="sm" variant="secondary" onClick={() => exportResults("png")} disabled={exporting} className="gap-1">
                    <ImageIcon className="w-3.5 h-3.5" /> PNG
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => exportResults("pdf")} disabled={exporting} className="gap-1">
                    <FileDown className="w-3.5 h-3.5" /> PDF
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              {validation.errors.length > 0 && (
                <div className="rounded-md bg-destructive/10 border border-destructive/40 p-3 space-y-1">
                  {validation.errors.map((err, i) => (
                    <p key={i} className="text-xs text-destructive">• {err}</p>
                  ))}
                </div>
              )}

              {included.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  {t("activate_cat_hint")}
                </p>
              )}

              {resultsByTurn && (
                <div className="grid grid-cols-2 gap-3">
                  {resultsByTurn.map(({ turn, handSize, res }) => (
                    <div key={turn} className="rounded-lg border border-gold/30 bg-muted/30 p-3 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                          {t("turn", { n: turn })}
                        </span>
                        <Badge variant="outline" className="text-xs">{t("hand_cards", { n: handSize })}</Badge>
                      </div>
                      <div className="text-3xl sm:text-4xl font-bold text-gold font-display">
                        {(res.probability * 100).toFixed(2)}%
                      </div>
                      <div className="text-[10px] text-muted-foreground font-mono break-all">
                        ≈ {formatFraction(res.numerator, res.denominator)}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {resultsByTurn && (
                <div className="text-xs text-muted-foreground">
                  {t("combining", { list: included.map((c) => `${modeLabel(c.mode)}${c.value} ${c.name}`).join(" · ") })}
                </div>
              )}

              {/* Chart T1 vs T2 */}
              {chartData.length > 0 && (
                <div ref={chartRef} className="rounded-lg border border-border bg-muted/20 p-3">
                  <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                      Comparativo T1 vs T2 (%)
                    </p>
                    <div className="flex gap-2" data-export-hide>
                      <Button size="sm" variant="outline" onClick={() => exportChart("png")} disabled={exporting} className="gap-1 h-7">
                        <ImageIcon className="w-3.5 h-3.5" /> PNG
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => exportChart("pdf")} disabled={exporting} className="gap-1 h-7">
                        <FileDown className="w-3.5 h-3.5" /> PDF
                      </Button>
                    </div>
                  </div>
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData} margin={{ top: 8, right: 8, left: -12, bottom: 40 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis
                          dataKey="label"
                          tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                          angle={-25}
                          textAnchor="end"
                          interval={0}
                        />
                        <YAxis
                          tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                          domain={[0, 100]}
                          unit="%"
                        />
                        <Tooltip
                          cursor={{ fill: "var(--muted)", opacity: 0.15 }}
                          contentStyle={{
                            background: "var(--popover)",
                            border: "1px solid var(--border)",
                            borderRadius: 8,
                            fontSize: 12,
                            color: "var(--popover-foreground)",
                          }}
                          content={({ active, payload, label }) => {
                            if (!active || !payload || payload.length === 0) return null;
                            const row = payload[0].payload as {
                              label: string;
                              kind: string;
                              T1: number;
                              T2: number;
                              T1frac: string;
                              T2frac: string;
                            };
                            return (
                              <div
                                style={{
                                  background: "var(--popover)",
                                  border: "1px solid var(--border)",
                                  borderRadius: 8,
                                  fontSize: 12,
                                  color: "var(--popover-foreground)",
                                  padding: "8px 10px",
                                  minWidth: 180,
                                }}
                              >
                                <div style={{ fontWeight: 700, marginBottom: 4 }}>{label}</div>
                                <div style={{ opacity: 0.7, marginBottom: 6 }}>{row.kind}</div>
                                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                                  <span style={{ color: "var(--gold)" }}>T1</span>
                                  <span>
                                    <strong>{row.T1}%</strong>{" "}
                                    <span style={{ opacity: 0.6, fontFamily: "monospace" }}>{row.T1frac}</span>
                                  </span>
                                </div>
                                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                                  <span style={{ color: "var(--accent)" }}>T2</span>
                                  <span>
                                    <strong>{row.T2}%</strong>{" "}
                                    <span style={{ opacity: 0.6, fontFamily: "monospace" }}>{row.T2frac}</span>
                                  </span>
                                </div>
                              </div>
                            );
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar dataKey="T1" fill="var(--gold)" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="T2" fill="var(--accent)" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {comboResults.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                      Combos personalizados
                    </p>
                    {comboResults.map(({ combo, valid, byTurn }) => (
                      <div key={combo.id} className="p-2 rounded-md bg-gold/10 border border-gold/30 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-sm">{combo.name}</span>
                          <span className="text-[10px] text-muted-foreground">
                            {combo.entries
                              .map((e) => {
                                const cat = categories.find((c) => c.id === e.categoryId);
                                return `${modeLabel(e.mode)}${e.value} ${cat?.name ?? "?"}`;
                              })
                              .join(" + ")}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {byTurn.map(({ turn, res }) => (
                            <div key={turn} className="flex items-baseline justify-between text-sm">
                              <span className="text-xs text-muted-foreground">T{turn}</span>
                              <span className="font-mono text-gold font-bold">
                                {valid && res ? `${(res.probability * 100).toFixed(2)}%` : "—"}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              <Separator />

              <div className="space-y-2">
                <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                  Por categoria
                </p>
                {perCategoryResults.length === 0 && (
                  <p className="text-xs text-muted-foreground">Nenhuma categoria incluída.</p>
                )}
                {perCategoryResults.map(({ cat, size, byTurn }) => (
                  <div
                    key={cat.id}
                    className="p-2 rounded bg-muted/40 space-y-1"
                  >
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{cat.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {size} no deck · {modeLabel(cat.mode)} {cat.value}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {byTurn.map(({ turn, res }) => (
                        <div key={turn} className="flex items-baseline justify-between text-xs">
                          <span className="text-muted-foreground">T{turn}</span>
                          <span className="font-mono text-gold">
                            {res ? `${(res.probability * 100).toFixed(2)}%` : "—"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </main>

      <footer className="max-w-7xl mx-auto px-4 sm:px-6 py-8 text-center text-xs text-muted-foreground">
        Cálculo baseado na distribuição hipergeométrica multivariada. Yu-Gi-Oh! é marca registrada da
        Konami.
      </footer>
    </div>
  );
}
