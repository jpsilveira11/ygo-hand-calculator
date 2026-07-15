import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Sparkles, Upload, Wand2, Plus, Trash2, RefreshCw, Copy, FileText, Moon, Sun, Image as ImageIcon, FileDown, Zap } from "lucide-react";
import { toPng } from "html-to-image";
import { jsPDF } from "jspdf";

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
    label: "Master",
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
  if (deckSize <= 40) {
    // 30-40 is ambiguous between speed (max 30) and rush (30-40); pick rush for 31+
    if (deckSize <= 30) return "speed";
    return "rush";
  }
  return "master";
}

// -------------------- Categories --------------------

interface Category {
  id: string;
  name: string;
  count: number; // number of cards of this category in the deck
  min: number; // minimum copies desired in opening hand
  maxEnabled: boolean;
  max: number;
  include: boolean; // include in probability calculation
}

let catIdCounter = 0;
const nextCatId = () => `cat_${++catIdCounter}`;

function makeDefaultCategories(format: FormatKey): Category[] {
  return FORMATS[format].categories.map((name) => ({
    id: nextCatId(),
    name,
    count: 0,
    min: name.toLowerCase().includes("garnet") ? 0 : 1,
    maxEnabled: name.toLowerCase().includes("garnet"),
    max: 0,
    include: !name.toLowerCase().includes("garnet"),
  }));
}

// -------------------- Component --------------------

interface Combo {
  id: string;
  name: string;
  entries: { categoryId: string; min: number }[];
}
let comboIdCounter = 0;
const nextComboId = () => `combo_${++comboIdCounter}`;

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
  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stored = typeof window !== "undefined" ? window.localStorage.getItem("theme") : null;
    const initial: "light" | "dark" =
      stored === "light" || stored === "dark"
        ? stored
        : typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
    setTheme(initial);
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.classList.toggle("dark", theme === "dark");
    try {
      window.localStorage.setItem("theme", theme);
    } catch {
      // ignore storage errors
    }
  }, [theme]);


  const activeFormatKey: FormatKey = formatOption === "auto" ? detectFormat(deckSize) : formatOption;
  const spec = FORMATS[activeFormatKey];
  const hands: { turn: 1 | 2; size: number }[] = [
    { turn: 1, size: spec.turn1Hand },
    { turn: 2, size: spec.turn2Hand },
  ];

  // ---- Derived category counts from card assignments (if any) ----
  const derivedCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    parsedCards.forEach((card, idx) => {
      const cid = cardAssignments[idx];
      if (cid && cid !== "__none__") {
        counts[cid] = (counts[cid] ?? 0) + card.quantity;
      }
    });
    return counts;
  }, [parsedCards, cardAssignments]);

  const hasImportedCards = parsedCards.length > 0;

  // Effective count per category: derived from assignments if imported, otherwise the manual count.
  const effectiveCount = (c: Category): number =>
    hasImportedCards ? (derivedCounts[c.id] ?? 0) : c.count;

  const totalCategorized = categories.reduce((s, c) => s + effectiveCount(c), 0);

  // -------------------- Actions --------------------

  const applyFormat = (key: FormatKey, resetSize = true) => {
    setCategories(makeDefaultCategories(key));
    if (resetSize) setDeckSize(FORMATS[key].defaultSize);
    setParsedCards([]);
    setCardAssignments({});
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

  const updateCategory = (id: string, patch: Partial<Category>) => {
    setCategories((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };

  const addCategory = () => {
    setCategories((prev) => [
      ...prev,
      {
        id: nextCatId(),
        name: `Categoria ${prev.length + 1}`,
        count: 0,
        min: 1,
        maxEnabled: false,
        max: 0,
        include: true,
      },
    ]);
  };

  const removeCategory = (id: string) => {
    setCategories((prev) => prev.filter((c) => c.id !== id));
    setCardAssignments((prev) => {
      const next: Record<number, string> = {};
      for (const [k, v] of Object.entries(prev)) {
        if (v !== id) next[Number(k)] = v;
      }
      return next;
    });
  };

  // -------------------- Probability calculation --------------------

  const included = categories.filter((c) => c.include);
  const constraints: CategoryConstraint[] = included.map((c) => ({
    size: effectiveCount(c),
    min: c.min,
    max: c.maxEnabled ? c.max : undefined,
  }));

  // Also compute effective counts for categories NOT included but that still occupy deck slots.
  const excludedCategorizedSize = categories
    .filter((c) => !c.include)
    .reduce((s, c) => s + effectiveCount(c), 0);

  // For the multivariate model, we pass ALL categorized cards as constraint categories,
  // with the excluded ones having min:0 and no max — so remaining "other" slots are truly other.
  const fullConstraints: CategoryConstraint[] = categories.map((c) => ({
    size: effectiveCount(c),
    min: c.include ? c.min : 0,
    max: c.include && c.maxEnabled ? c.max : undefined,
  }));

  const maxHandSize = Math.max(spec.turn1Hand, spec.turn2Hand);

  const validation = useMemo(() => {
    const errors: string[] = [];
    if (deckSize < spec.min || deckSize > spec.max) {
      errors.push(
        `Deck fora do intervalo do formato ${spec.label} (${spec.min}–${spec.max} cartas).`,
      );
    }
    if (totalCategorized > deckSize) {
      errors.push(
        `Soma das categorias (${totalCategorized}) excede o tamanho do deck (${deckSize}).`,
      );
    }
    for (const c of included) {
      const size = effectiveCount(c);
      if (c.min > size) {
        errors.push(`"${c.name}": mínimo ${c.min} > cartas disponíveis (${size}).`);
      }
      if (c.min > maxHandSize) {
        errors.push(`"${c.name}": mínimo ${c.min} > tamanho da mão (${maxHandSize}).`);
      }
      if (c.maxEnabled && c.max < c.min) {
        errors.push(`"${c.name}": máximo (${c.max}) menor que mínimo (${c.min}).`);
      }
    }
    return errors;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories, derivedCounts, deckSize, maxHandSize, spec, hasImportedCards]);

  // Global result per turn
  const resultsByTurn = useMemo(() => {
    if (validation.length > 0 || included.length === 0) return null;
    return hands.map(({ turn, size }) => ({
      turn,
      handSize: size,
      res: multivariateProbability(deckSize, size, fullConstraints),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [validation, deckSize, categories, derivedCounts, hasImportedCards]);

  // Per-category "at least min" probability for each turn
  const perCategoryResults = included.map((c) => {
    const size = effectiveCount(c);
    const constraint: CategoryConstraint = {
      size,
      min: c.min,
      max: c.maxEnabled ? c.max : undefined,
    };
    const byTurn = hands.map(({ turn, size: hs }) => {
      let res: ReturnType<typeof multivariateProbability> | null = null;
      if (size >= c.min && c.min <= hs) {
        res = multivariateProbability(deckSize, hs, [constraint]);
      }
      return { turn, handSize: hs, res };
    });
    return { cat: c, size, byTurn };
  });

  // Combo results: probability of holding at least `min` of each entry category simultaneously.
  const comboResults = combos.map((combo) => {
    const valid = combo.entries.length > 0 && combo.entries.every((e) => {
      const cat = categories.find((c) => c.id === e.categoryId);
      return cat && effectiveCount(cat) >= e.min && e.min >= 0;
    });
    const byTurn = hands.map(({ turn, size: hs }) => {
      if (!valid) return { turn, handSize: hs, res: null as ReturnType<typeof multivariateProbability> | null };
      const totalMin = combo.entries.reduce((s, e) => s + e.min, 0);
      if (totalMin > hs) return { turn, handSize: hs, res: null };
      // Build constraints across ALL categories: combo entries use their min, others min:0.
      const cs: CategoryConstraint[] = categories.map((c) => {
        const entry = combo.entries.find((e) => e.categoryId === c.id);
        return {
          size: effectiveCount(c),
          min: entry ? entry.min : 0,
        };
      });
      return { turn, handSize: hs, res: multivariateProbability(deckSize, hs, cs) };
    });
    return { combo, valid, byTurn };
  });

  const addCombo = () => {
    setCombos((prev) => [
      ...prev,
      {
        id: nextComboId(),
        name: `Combo ${prev.length + 1}`,
        entries: categories.slice(0, 2).map((c) => ({ categoryId: c.id, min: 1 })),
      },
    ]);
  };
  const updateCombo = (id: string, patch: Partial<Combo>) =>
    setCombos((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const removeCombo = (id: string) =>
    setCombos((prev) => prev.filter((c) => c.id !== id));

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
          <div className="flex items-center gap-2">
            <Badge className="bg-gold font-medium">{spec.label}</Badge>
            <Badge variant="secondary">
              Deck {deckSize} · Mão T1 {spec.turn1Hand} · T2 {spec.turn2Hand}
            </Badge>
            <Button
              size="icon"
              variant="outline"
              onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
              aria-label={theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"}
              title={theme === "dark" ? "Tema claro" : "Tema escuro"}
            >
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] gap-6">
        {/* LEFT: Configuration + Import */}
        <div className="space-y-6">
          {/* Format + deck size */}
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

          {/* Import */}
          <Card className="card-elevated">
            <CardHeader>
              <CardTitle className="text-lg">Importar deck</CardTitle>
              <CardDescription>
                Cole a decklist, informe um link ydke:// ou envie um arquivo .ydk. IDs do Konami são
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

          {/* Parsed card list */}
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

        {/* RIGHT: Categories + Results */}
        <div className="space-y-6">
          <Card className="card-elevated">
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg">Categorias</CardTitle>
                <CardDescription>
                  Renomeie, ajuste contagens e defina mínimos/máximos para a mão inicial.
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
                        <Label className="text-xs text-muted-foreground">Mín. na mão</Label>
                        <Input
                          type="number"
                          min={0}
                          max={maxHandSize}
                          value={c.min}
                          onChange={(e) =>
                            updateCategory(c.id, { min: Math.max(0, Number(e.target.value) || 0) })
                          }
                          className="h-8"
                          disabled={!c.include}
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground flex items-center gap-1">
                          <Switch
                            checked={c.maxEnabled}
                            onCheckedChange={(v) => updateCategory(c.id, { maxEnabled: v })}
                            className="scale-75"
                            disabled={!c.include}
                          />
                          Máx.
                        </Label>
                        <Input
                          type="number"
                          min={0}
                          max={maxHandSize}
                          value={c.max}
                          disabled={!c.maxEnabled || !c.include}
                          onChange={(e) =>
                            updateCategory(c.id, { max: Math.max(0, Number(e.target.value) || 0) })
                          }
                          className="h-8"
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
              {excludedCategorizedSize > 0 && (
                <p className="text-xs text-muted-foreground">
                  {excludedCategorizedSize} carta(s) em categorias não incluídas no cálculo continuam
                  ocupando espaço no deck.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Results */}
          <Card className="card-elevated overflow-hidden">
            <CardHeader className="gradient-gold">
              <CardTitle className="text-gold-foreground text-lg">Probabilidade de abertura</CardTitle>
              <CardDescription className="text-gold-foreground/80">
                Probabilidade de a mão inicial satisfazer todos os mínimos/máximos das categorias
                selecionadas.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              {validation.length > 0 && (
                <div className="rounded-md bg-destructive/10 border border-destructive/40 p-3 space-y-1">
                  {validation.map((err, i) => (
                    <p key={i} className="text-xs text-destructive">
                      • {err}
                    </p>
                  ))}
                </div>
              )}

              {included.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Ative pelo menos uma categoria (interruptor à esquerda do nome) para calcular.
                </p>
              )}

              {result && (
                <div className="space-y-3">
                  <div className="flex items-baseline gap-3">
                    <span className="text-5xl font-bold text-gold font-display">
                      {(result.probability * 100).toFixed(2)}%
                    </span>
                    <span className="text-sm text-muted-foreground">de chance</span>
                  </div>
                  <div className="text-xs text-muted-foreground font-mono break-all">
                    ≈ {formatFraction(result.numerator, result.denominator)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Combinando: {included.map((c) => `≥${c.min} ${c.name}`).join(" · ")}
                    {included.some((c) => c.maxEnabled)
                      ? " (com limites máximos aplicados)"
                      : ""}
                  </div>
                </div>
              )}

              <Separator />

              <div className="space-y-2">
                <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                  Por categoria (≥ mínimo)
                </p>
                {perCategoryResults.length === 0 && (
                  <p className="text-xs text-muted-foreground">Nenhuma categoria incluída.</p>
                )}
                {perCategoryResults.map(({ cat, size, res }) => (
                  <div
                    key={cat.id}
                    className="flex items-center justify-between text-sm p-2 rounded bg-muted/40"
                  >
                    <div>
                      <span className="font-medium">{cat.name}</span>
                      <span className="text-xs text-muted-foreground ml-2">
                        {size} no deck · ≥ {cat.min}
                      </span>
                    </div>
                    <span className="font-mono text-gold">
                      {res ? `${(res.probability * 100).toFixed(2)}%` : "—"}
                    </span>
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
