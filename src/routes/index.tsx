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

  const resultsRef = useRef<HTMLDivElement>(null);
  const shareLoadedRef = useRef<boolean>(false);

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

  // ---- Presets: load once from localStorage ----
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("ygo-combo-presets");
      if (raw) setPresets(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, []);

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
    toast.success("Configuração carregada do link compartilhado.");
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
    const rows: { label: string; T1: number; T2: number; kind: string }[] = [];
    for (const p of perCategoryResults) {
      rows.push({
        label: p.cat.name,
        kind: "Categoria",
        T1: p.byTurn[0].res ? +(p.byTurn[0].res.probability * 100).toFixed(2) : 0,
        T2: p.byTurn[1].res ? +(p.byTurn[1].res.probability * 100).toFixed(2) : 0,
      });
    }
    for (const cr of comboResults) {
      rows.push({
        label: cr.combo.name,
        kind: "Combo",
        T1: cr.valid && cr.byTurn[0].res ? +(cr.byTurn[0].res.probability * 100).toFixed(2) : 0,
        T2: cr.valid && cr.byTurn[1].res ? +(cr.byTurn[1].res.probability * 100).toFixed(2) : 0,
      });
    }
    return rows;
  }, [perCategoryResults, comboResults]);

  // -------------------- Presets --------------------

  const savePreset = () => {
    const name = presetName.trim();
    if (!name) {
      toast.error("Dê um nome ao preset.");
      return;
    }
    if (combos.length === 0) {
      toast.error("Crie ao menos um combo antes de salvar.");
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
    toast.success(`Preset "${name}" salvo.`);
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
      toast.warning(`Preset "${name}" carregado; ${missing} entrada(s) ignorada(s) (categoria ausente).`);
    } else {
      toast.success(`Preset "${name}" carregado.`);
    }
  };

  const deletePreset = (name: string) => {
    persistPresets(presets.filter((x) => x.name !== name));
    toast.info(`Preset "${name}" removido.`);
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
      toast.success("Link copiado para a área de transferência.");
    } catch (e) {
      console.error(e);
      toast.error("Não consegui copiar o link.");
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
        toast.success("Imagem exportada.");
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
        toast.success("PDF exportado.");
      }
    } catch (e) {
      console.error(e);
      toast.error("Falha ao exportar os resultados.");
    } finally {
      setExporting(false);
    }
  };

  // -------------------- Render --------------------

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
                Calculadora Hipergeométrica
              </h1>
              <p className="text-sm text-muted-foreground">
                Yu-Gi-Oh — Master · Speed · Rush
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className="bg-gold font-medium">{spec.label}</Badge>
            <Badge variant="secondary">
              Deck {deckSize} · Mão T1 {spec.turn1Hand} · T2 {spec.turn2Hand}
            </Badge>
            <Button size="sm" variant="outline" onClick={copyShareLink} className="gap-2" title="Copiar link com as configurações atuais">
              <Share2 className="w-4 h-4" /> Compartilhar
            </Button>
            <Button
              size="icon"
              variant="outline"
              onClick={toggleTheme}
              aria-label={theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"}
              title={theme === "dark" ? "Tema claro" : "Tema escuro"}
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
              <CardTitle className="text-lg">Formato e configuração</CardTitle>
              <CardDescription>
                Escolha o formato ou deixe em automático para detectar pelo tamanho do deck.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Formato</Label>
                  <Select value={formatOption} onValueChange={handleFormatChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Automático</SelectItem>
                      <SelectItem value="master">Master (40–60)</SelectItem>
                      <SelectItem value="speed">Speed (20–30)</SelectItem>
                      <SelectItem value="rush">Rush (30–40)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Tamanho do deck</Label>
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
                Faixa do formato: <span className="text-gold font-medium">{spec.min}–{spec.max}</span>{" "}
                cartas · Categorias sugeridas: {spec.categories.join(", ")}
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
                Validação do deck
              </CardTitle>
              <CardDescription>
                Contagens totais e verificação de consistência com o formato selecionado.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className="p-2 rounded bg-muted/40">
                  <div className="text-muted-foreground">Tamanho</div>
                  <div className="font-mono text-sm font-bold">{deckSize}</div>
                </div>
                <div className="p-2 rounded bg-muted/40">
                  <div className="text-muted-foreground">Categorizado</div>
                  <div className="font-mono text-sm font-bold">{totalCategorized}</div>
                </div>
                <div className="p-2 rounded bg-muted/40">
                  <div className="text-muted-foreground">Importado</div>
                  <div className="font-mono text-sm font-bold">
                    {hasImportedCards ? importedTotal : "—"}
                  </div>
                </div>
                <div className="p-2 rounded bg-muted/40">
                  <div className="text-muted-foreground">Faixa {spec.label}</div>
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
                <p className="text-xs text-muted-foreground">Tudo consistente com o formato {spec.label}.</p>
              )}
            </CardContent>
          </Card>

          {/* Import */}
          <Card className="card-elevated">
            <CardHeader>
              <CardTitle className="text-lg">Importar deck</CardTitle>
              <CardDescription>
                Cole a decklist, informe um link ydke:// ou envie um arquivo .ydk. IDs das cartas são
                resolvidos em nomes automaticamente.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="paste">
                <TabsList className="w-full flex-wrap h-auto">
                  <TabsTrigger value="paste" className="flex-1 gap-2 min-w-[110px]">
                    <Copy className="w-4 h-4" /> Colar
                  </TabsTrigger>
                  <TabsTrigger value="ydke" className="flex-1 gap-2 min-w-[110px]">
                    <Wand2 className="w-4 h-4" /> ydke://
                  </TabsTrigger>
                  <TabsTrigger value="ydk" className="flex-1 gap-2 min-w-[110px]">
                    <FileText className="w-4 h-4" /> .ydk
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
                      <Upload className="w-4 h-4" /> Importar
                    </Button>
                    <Button variant="ghost" onClick={clearImport} className="gap-2">
                      <RefreshCw className="w-4 h-4" /> Limpar
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
                  <p className="text-xs text-muted-foreground">
                    Os IDs numéricos são resolvidos em nomes via YGOPRODeck. Cartas não encontradas
                    ficam como "Card #ID".
                  </p>
                  <Button onClick={importFromYdkeUrl} className="bg-gold gap-2" disabled={importing}>
                    <Upload className="w-4 h-4" /> {importing ? "Importando..." : "Importar link ydke"}
                  </Button>
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
                  <p className="text-xs text-muted-foreground">
                    Os IDs do arquivo .ydk são resolvidos em nomes via YGOPRODeck automaticamente.
                  </p>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          {hasImportedCards && (
            <Card className="card-elevated">
              <CardHeader className="flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-lg">Cartas do main deck</CardTitle>
                  <CardDescription>
                    Atribua cada carta a uma categoria — as contagens são somadas automaticamente.
                  </CardDescription>
                </div>
                <Badge variant="secondary">{parsedCards.length} entradas</Badge>
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
                <CardTitle className="text-lg">Categorias</CardTitle>
                <CardDescription>
                  Escolha um modo (≥, =, ≤) para cada categoria e defina o valor alvo.
                </CardDescription>
              </div>
              <Button size="sm" variant="outline" onClick={addCategory} className="gap-1">
                <Plus className="w-4 h-4" /> Nova
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
                        aria-label="Remover categoria"
                        className="h-8 w-8 shrink-0"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <Label className="text-xs text-muted-foreground">No deck</Label>
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
                        <Label className="text-xs text-muted-foreground">Modo</Label>
                        <Select
                          value={c.mode}
                          onValueChange={(v) => updateCategory(c.id, { mode: v as Mode })}
                          disabled={!c.include}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="atLeast">≥ ao menos</SelectItem>
                            <SelectItem value="exactly">= exatamente</SelectItem>
                            <SelectItem value="atMost">≤ no máximo</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Valor</Label>
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
                <span className="text-muted-foreground">Categorizado</span>
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
                  <Zap className="w-4 h-4 text-gold" /> Combos personalizados
                </CardTitle>
                <CardDescription>
                  Combine categorias com modos (≥ ao menos, = exatamente, ≤ no máximo).
                </CardDescription>
              </div>
              <Button size="sm" variant="outline" onClick={addCombo} className="gap-1" disabled={categories.length === 0}>
                <Plus className="w-4 h-4" /> Novo
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Preset controls */}
              <div className="p-2 rounded-lg border border-dashed border-border bg-muted/30 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Input
                    placeholder="Nome do preset"
                    value={presetName}
                    onChange={(e) => setPresetName(e.target.value)}
                    className="h-8 flex-1 min-w-[140px] text-sm"
                  />
                  <Button size="sm" variant="outline" onClick={savePreset} className="gap-1">
                    <Save className="w-3.5 h-3.5" /> Salvar
                  </Button>
                  <Select onValueChange={loadPreset}>
                    <SelectTrigger className="h-8 w-[160px] text-xs">
                      <FolderOpen className="w-3.5 h-3.5 mr-1" />
                      <SelectValue placeholder="Carregar preset" />
                    </SelectTrigger>
                    <SelectContent>
                      {presets.length === 0 && (
                        <div className="px-2 py-1 text-xs text-muted-foreground">Nenhum preset salvo</div>
                      )}
                      {presets.map((p) => (
                        <SelectItem key={p.name} value={p.name}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                          aria-label={`Remover ${p.name}`}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              {combos.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Nenhum combo criado. Clique em "Novo" para adicionar uma combinação de categorias.
                </p>
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
                      <Plus className="w-3 h-3" /> Adicionar categoria
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
                  <CardTitle className="text-gold-foreground text-lg">Probabilidade de abertura</CardTitle>
                  <CardDescription className="text-gold-foreground/80">
                    Formato {spec.label} · Deck {deckSize} · T1 {spec.turn1Hand} / T2 {spec.turn2Hand}
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
                  Ative pelo menos uma categoria (interruptor à esquerda do nome) para calcular.
                </p>
              )}

              {resultsByTurn && (
                <div className="grid grid-cols-2 gap-3">
                  {resultsByTurn.map(({ turn, handSize, res }) => (
                    <div key={turn} className="rounded-lg border border-gold/30 bg-muted/30 p-3 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                          Turno {turn}
                        </span>
                        <Badge variant="outline" className="text-xs">{handSize} cartas</Badge>
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
                  Combinando: {included.map((c) => `${modeLabel(c.mode)}${c.value} ${c.name}`).join(" · ")}
                </div>
              )}

              {/* Chart T1 vs T2 */}
              {chartData.length > 0 && (
                <div className="rounded-lg border border-border bg-muted/20 p-3">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-2">
                    Comparativo T1 vs T2 (%)
                  </p>
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
                          contentStyle={{
                            background: "var(--popover)",
                            border: "1px solid var(--border)",
                            borderRadius: 8,
                            fontSize: 12,
                            color: "var(--popover-foreground)",
                          }}
                          formatter={(v: number) => `${v}%`}
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
