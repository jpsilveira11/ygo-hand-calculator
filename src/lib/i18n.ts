export type Lang = "pt" | "en" | "es";

export const LANGS: { code: Lang; label: string; flag: string }[] = [
  { code: "pt", label: "Português", flag: "🇧🇷" },
  { code: "en", label: "English", flag: "🇺🇸" },
  { code: "es", label: "Español", flag: "🇪🇸" },
];

type Dict = Record<string, string>;

const pt: Dict = {
  app_title: "Calculadora Hipergeométrica",
  app_subtitle: "Yu-Gi-Oh — Avançado/Genesys · Speed · Rush",
  deck_badge: "Deck {size} · Mão T1 {t1} · T2 {t2}",
  share: "Compartilhar",
  share_title: "Copiar link com as configurações atuais",
  short_link: "Link curto",
  short_link_title: "Copiar link curto (is.gd/tinyurl)",
  theme_light: "Tema claro",
  theme_dark: "Tema escuro",
  language: "Idioma",
  turns_label: "Turnos",
  turns_hint: "Quantidade de turnos consecutivos a calcular (1–10).",
  rush_note: "Rush: no turno 1 sempre 5 cartas; nos turnos seguintes considera-se que a mão anterior foi jogada e você compra até ter 5 na mão novamente.",
  cards_seen: "{n} cartas vistas",
  paste_placeholder: "Monstro:\n3x Ash Blossom & Joyous Spring\n...\n\nMagia:\n1x Called by the Grave\n...",
  mode_between: "entre",
  value_max: "Máx.",
  category_placeholder: "Categoria...",

  format_card_title: "Formato e configuração",
  format_card_desc: "Escolha o formato ou deixe em automático para detectar pelo tamanho do deck.",
  format_label: "Formato",
  auto: "Automático",
  fmt_master: "Avançado/Genesys (40–60)",
  fmt_speed: "Speed (20–30)",
  fmt_rush: "Rush (30–40)",
  deck_size: "Tamanho do deck",
  format_range_hint: "Faixa do formato: {min}–{max} cartas · Categorias sugeridas: {cats}",

  validation_title: "Validação do deck",
  validation_desc: "Contagens totais e verificação de consistência com o formato selecionado.",
  size: "Tamanho",
  categorized: "Categorizado",
  imported: "Importado",
  range: "Faixa {label}",
  all_consistent: "Tudo consistente com o formato {label}.",

  import_title: "Importar deck",
  import_desc:
    "Cole a decklist, informe um link ydke:// ou envie um arquivo .ydk. IDs das cartas são resolvidos em nomes automaticamente.",
  tab_paste: "Colar",
  tab_ydke: "ydke://",
  tab_ydk: ".ydk",
  import_btn: "Importar",
  importing: "Importando...",
  import_ydke_btn: "Importar link ydke",
  clear: "Limpar",
  ydke_hint:
    'Os IDs numéricos são resolvidos em nomes via YGOPRODeck. Cartas não encontradas ficam como "Card #ID".',
  ydk_hint: "Os IDs do arquivo .ydk são resolvidos em nomes via YGOPRODeck automaticamente.",

  main_cards: "Cartas do main deck",
  main_cards_desc: "Atribua cada carta a uma categoria — as contagens são somadas automaticamente.",
  entries: "entradas",
  none_cat: "— nenhuma —",
  cat_placeholder: "Categoria...",

  categories: "Categorias",
  categories_desc: "Escolha um modo (≥, =, ≤) para cada categoria e defina o valor alvo.",
  new_f: "Nova",
  new_m: "Novo",
  remove_cat: "Remover categoria",
  in_deck: "No deck",
  mode: "Modo",
  value: "Valor",
  mode_atleast: "≥ ao menos",
  mode_exactly: "= exatamente",
  mode_atmost: "≤ no máximo",

  combos_title: "Combos personalizados",
  combos_desc: "Combine categorias com modos (≥ ao menos, = exatamente, ≤ no máximo).",
  no_combos: 'Nenhum combo criado. Clique em "Novo" para adicionar uma combinação de categorias.',
  add_category: "Adicionar categoria",

  preset_name_ph: "Nome do preset",
  save: "Salvar",
  load_preset: "Carregar preset",
  no_presets: "Nenhum preset salvo",
  export_presets: "Exportar presets",
  import_presets: "Importar presets",
  presets_exported: "Presets exportados.",
  presets_imported: "{n} preset(s) importado(s).",
  presets_invalid: "Arquivo de presets inválido.",

  results_title: "Probabilidade de abertura",
  results_desc: "Formato {label} · Deck {size} · T1 {t1} / T2 {t2}",
  turn: "Turno {n}",
  hand_cards: "{n} cartas",
  activate_cat_hint: "Ative pelo menos uma categoria (interruptor à esquerda do nome) para calcular.",
  combining: "Combinando: {list}",
  chart_title: "Comparativo T1 vs T2 (%)",
  by_category: "Por categoria",
  no_cat_included: "Nenhuma categoria incluída.",
  in_deck_short: "{n} no deck",

  footer:
    "Cálculo baseado na distribuição hipergeométrica multivariada. Yu-Gi-Oh! é marca registrada da Konami.",

  share_copied: "Link copiado para a área de transferência.",
  share_fail: "Não consegui copiar o link.",
  share_loaded: "Configuração carregada do link compartilhado.",
  export_png_ok: "Imagem exportada.",
  export_pdf_ok: "PDF exportado.",
  export_fail: "Falha ao exportar os resultados.",
  preset_needs_name: "Dê um nome ao preset.",
  preset_needs_combo: "Crie ao menos um combo antes de salvar.",
  preset_saved: 'Preset "{name}" salvo.',
  preset_loaded: 'Preset "{name}" carregado.',
  preset_loaded_missing: 'Preset "{name}" carregado; {n} entrada(s) ignorada(s) (categoria ausente).',
  preset_removed: 'Preset "{name}" removido.',
  cleared: "Importação limpa.",
};

const en: Dict = {
  app_title: "Hypergeometric Calculator",
  app_subtitle: "Yu-Gi-Oh — Advanced/Genesys · Speed · Rush",
  deck_badge: "Deck {size} · Hand T1 {t1} · T2 {t2}",
  share: "Share",
  share_title: "Copy a link with the current settings",
  theme_light: "Light theme",
  theme_dark: "Dark theme",
  language: "Language",

  format_card_title: "Format & configuration",
  format_card_desc: "Pick a format or leave it auto to detect from deck size.",
  format_label: "Format",
  auto: "Auto",
  fmt_master: "Advanced/Genesys (40–60)",
  fmt_speed: "Speed (20–30)",
  fmt_rush: "Rush (30–40)",
  deck_size: "Deck size",
  format_range_hint: "Format range: {min}–{max} cards · Suggested categories: {cats}",

  validation_title: "Deck validation",
  validation_desc: "Totals and consistency checks against the selected format.",
  size: "Size",
  categorized: "Categorized",
  imported: "Imported",
  range: "{label} range",
  all_consistent: "Everything consistent with the {label} format.",

  import_title: "Import deck",
  import_desc:
    "Paste the decklist, provide a ydke:// link or upload a .ydk file. Card IDs are resolved to names automatically.",
  tab_paste: "Paste",
  tab_ydke: "ydke://",
  tab_ydk: ".ydk",
  import_btn: "Import",
  importing: "Importing...",
  import_ydke_btn: "Import ydke link",
  clear: "Clear",
  ydke_hint:
    'Numeric IDs are resolved to names via YGOPRODeck. Unknown cards fall back to "Card #ID".',
  ydk_hint: ".ydk file IDs are resolved to names via YGOPRODeck automatically.",

  main_cards: "Main deck cards",
  main_cards_desc: "Assign each card to a category — counts are summed automatically.",
  entries: "entries",
  none_cat: "— none —",
  cat_placeholder: "Category...",

  categories: "Categories",
  categories_desc: "Choose a mode (≥, =, ≤) for each category and set the target value.",
  new_f: "New",
  new_m: "New",
  remove_cat: "Remove category",
  in_deck: "In deck",
  mode: "Mode",
  value: "Value",
  mode_atleast: "≥ at least",
  mode_exactly: "= exactly",
  mode_atmost: "≤ at most",

  combos_title: "Custom combos",
  combos_desc: "Combine categories with modes (≥ at least, = exactly, ≤ at most).",
  no_combos: 'No combos yet. Click "New" to add a category combination.',
  add_category: "Add category",

  preset_name_ph: "Preset name",
  save: "Save",
  load_preset: "Load preset",
  no_presets: "No saved presets",
  export_presets: "Export presets",
  import_presets: "Import presets",
  presets_exported: "Presets exported.",
  presets_imported: "{n} preset(s) imported.",
  presets_invalid: "Invalid preset file.",

  results_title: "Opening probability",
  results_desc: "Format {label} · Deck {size} · T1 {t1} / T2 {t2}",
  turn: "Turn {n}",
  hand_cards: "{n} cards",
  activate_cat_hint: "Enable at least one category (switch to the left of the name) to calculate.",
  combining: "Combining: {list}",
  chart_title: "T1 vs T2 comparison (%)",
  by_category: "By category",
  no_cat_included: "No category included.",
  in_deck_short: "{n} in deck",

  footer:
    "Based on the multivariate hypergeometric distribution. Yu-Gi-Oh! is a registered trademark of Konami.",

  share_copied: "Link copied to clipboard.",
  share_fail: "Couldn't copy the link.",
  share_loaded: "Configuration loaded from shared link.",
  export_png_ok: "Image exported.",
  export_pdf_ok: "PDF exported.",
  export_fail: "Failed to export results.",
  preset_needs_name: "Give the preset a name.",
  preset_needs_combo: "Create at least one combo before saving.",
  preset_saved: 'Preset "{name}" saved.',
  preset_loaded: 'Preset "{name}" loaded.',
  preset_loaded_missing: 'Preset "{name}" loaded; {n} entry(ies) skipped (missing category).',
  preset_removed: 'Preset "{name}" removed.',
  cleared: "Import cleared.",
};

const es: Dict = {
  app_title: "Calculadora Hipergeométrica",
  app_subtitle: "Yu-Gi-Oh — Avanzado/Genesys · Speed · Rush",
  deck_badge: "Deck {size} · Mano T1 {t1} · T2 {t2}",
  share: "Compartir",
  share_title: "Copiar enlace con la configuración actual",
  theme_light: "Tema claro",
  theme_dark: "Tema oscuro",
  language: "Idioma",

  format_card_title: "Formato y configuración",
  format_card_desc: "Elige el formato o déjalo en automático para detectarlo por el tamaño del deck.",
  format_label: "Formato",
  auto: "Automático",
  fmt_master: "Avanzado/Genesys (40–60)",
  fmt_speed: "Speed (20–30)",
  fmt_rush: "Rush (30–40)",
  deck_size: "Tamaño del deck",
  format_range_hint: "Rango del formato: {min}–{max} cartas · Categorías sugeridas: {cats}",

  validation_title: "Validación del deck",
  validation_desc: "Totales y consistencia con el formato seleccionado.",
  size: "Tamaño",
  categorized: "Categorizado",
  imported: "Importado",
  range: "Rango {label}",
  all_consistent: "Todo consistente con el formato {label}.",

  import_title: "Importar deck",
  import_desc:
    "Pega la decklist, indica un enlace ydke:// o sube un archivo .ydk. Los IDs se resuelven en nombres automáticamente.",
  tab_paste: "Pegar",
  tab_ydke: "ydke://",
  tab_ydk: ".ydk",
  import_btn: "Importar",
  importing: "Importando...",
  import_ydke_btn: "Importar enlace ydke",
  clear: "Limpiar",
  ydke_hint:
    'Los IDs numéricos se resuelven vía YGOPRODeck. Cartas no encontradas quedan como "Card #ID".',
  ydk_hint: "Los IDs del archivo .ydk se resuelven en nombres vía YGOPRODeck automáticamente.",

  main_cards: "Cartas del main deck",
  main_cards_desc: "Asigna cada carta a una categoría — los conteos se suman automáticamente.",
  entries: "entradas",
  none_cat: "— ninguna —",
  cat_placeholder: "Categoría...",

  categories: "Categorías",
  categories_desc: "Elige un modo (≥, =, ≤) para cada categoría y define el valor objetivo.",
  new_f: "Nueva",
  new_m: "Nuevo",
  remove_cat: "Eliminar categoría",
  in_deck: "En el deck",
  mode: "Modo",
  value: "Valor",
  mode_atleast: "≥ al menos",
  mode_exactly: "= exactamente",
  mode_atmost: "≤ como máximo",

  combos_title: "Combos personalizados",
  combos_desc: "Combina categorías con modos (≥ al menos, = exactamente, ≤ como máximo).",
  no_combos: 'Aún no hay combos. Haz clic en "Nuevo" para añadir una combinación de categorías.',
  add_category: "Añadir categoría",

  preset_name_ph: "Nombre del preset",
  save: "Guardar",
  load_preset: "Cargar preset",
  no_presets: "Sin presets guardados",
  export_presets: "Exportar presets",
  import_presets: "Importar presets",
  presets_exported: "Presets exportados.",
  presets_imported: "{n} preset(s) importado(s).",
  presets_invalid: "Archivo de presets inválido.",

  results_title: "Probabilidad de apertura",
  results_desc: "Formato {label} · Deck {size} · T1 {t1} / T2 {t2}",
  turn: "Turno {n}",
  hand_cards: "{n} cartas",
  activate_cat_hint: "Activa al menos una categoría (interruptor a la izquierda del nombre) para calcular.",
  combining: "Combinando: {list}",
  chart_title: "Comparativa T1 vs T2 (%)",
  by_category: "Por categoría",
  no_cat_included: "Ninguna categoría incluida.",
  in_deck_short: "{n} en el deck",

  footer:
    "Cálculo basado en la distribución hipergeométrica multivariada. Yu-Gi-Oh! es marca registrada de Konami.",

  share_copied: "Enlace copiado al portapapeles.",
  share_fail: "No pude copiar el enlace.",
  share_loaded: "Configuración cargada desde el enlace compartido.",
  export_png_ok: "Imagen exportada.",
  export_pdf_ok: "PDF exportado.",
  export_fail: "Error al exportar los resultados.",
  preset_needs_name: "Dale un nombre al preset.",
  preset_needs_combo: "Crea al menos un combo antes de guardar.",
  preset_saved: 'Preset "{name}" guardado.',
  preset_loaded: 'Preset "{name}" cargado.',
  preset_loaded_missing: 'Preset "{name}" cargado; {n} entrada(s) ignorada(s) (categoría ausente).',
  preset_removed: 'Preset "{name}" eliminado.',
  cleared: "Importación limpiada.",
};

const DICTS: Record<Lang, Dict> = { pt, en, es };

export function makeT(lang: Lang) {
  const dict = DICTS[lang] ?? pt;
  return (key: string, vars?: Record<string, string | number>): string => {
    let s = dict[key] ?? pt[key] ?? key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        s = s.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
      }
    }
    return s;
  };
}
