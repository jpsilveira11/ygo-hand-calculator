## Objetivo

1. Ao importar `.ydk` ou `ydke://`, mostrar os **nomes reais** das cartas em vez de "Card #12345".
2. Aceitar **URLs de decks do MasterDuelMeta e DuelLinksMeta** como fonte de importação.
3. Esclarecer o suporte a "links internos" do Master Duel / Duel Links.

## 1. Resolver IDs → nomes de carta

Vou usar a API pública gratuita do **YGOPRODeck** (`https://db.ygoprodeck.com/api/v7/cardinfo.php?id=1,2,3`) para traduzir IDs em nomes. Ela retorna também tipo/atributo/imagem, mas nesse primeiro passo só uso o nome.

- **Onde chamar:** em um `createServerFn` (`src/lib/cards.functions.ts`) — evita CORS e permite cachear.
- **Cache em memória** dentro do módulo do server function: `Map<string, string>` (id → nome). Persiste enquanto o worker vive.
- **Batching:** a API aceita várias IDs por vírgula; o server function agrupa todas as IDs desconhecidas em uma única requisição.
- **Fallback:** se a API falhar ou algum ID não for encontrado, mantém "Card #ID" e mostra um toast informando que X cartas não puderam ser resolvidas.
- **Fluxo no cliente:** logo depois de `parseYdk` / `parseYdkeUrl`, chamo `resolveCardNames(ids)` e substituo `name` nas entradas antes de setar `parsedCards`.

O `.ydk` e o `ydke://` só carregam IDs numéricos do Konami — não há como resolver nomes sem consultar um banco externo, então essa é a única rota viável.

## 2. Importação por URL de meta sites

**MasterDuelMeta e DuelLinksMeta expõem endpoints públicos** (o próprio site consome), no formato:

- `https://www.masterduelmeta.com/api/v1/decks?url=<slug-do-deck>`
- `https://www.duellinksmeta.com/api/v1/top-decks?url=<slug-do-deck>` (o path exato varia entre "decks" e "top-decks"; o server function tenta ambos)

O JSON retorna `main`, `extra`, `side` como arrays de `{ card: { name, konamiID }, amount }`.

- **Novo server function** `importFromMetaUrl(url: string)` em `src/lib/deck-import.functions.ts`:
  1. Detecta o host (`masterduelmeta.com` ou `duellinksmeta.com`) e extrai o slug do path.
  2. Faz o `fetch` do endpoint correspondente com `User-Agent` de navegador.
  3. Normaliza o retorno para o mesmo `ParsedDeck` que os outros parsers.
  4. Se o formato do site mudar / retornar erro, devolve `{ error }` legível.
- **Nova aba na UI de importação:** ao lado de "Colar / ydke:// / .ydk", uma aba **"Link (Meta)"** com um input de URL e botão Importar. Sugere o formato correto do formato ativo (Master → MDM, Speed/Rush Duel Links → DLM).
- **Detecção automática de formato:** se o deck vier do MasterDuelMeta e tiver 40+ cartas, define formato Master; se vier do DuelLinksMeta, define Speed (ou Rush conforme tamanho).

**Restrições conhecidas** (vou registrar como toast/hint se acontecer):
- O CORS impede chamar direto do browser — por isso o server function.
- Alguns decks podem estar por trás de páginas dinâmicas; quando o endpoint direto não devolver JSON, o server function volta para scraping simples do HTML (regex sobre `<script>` embutido do Next.js) como fallback. Se ainda assim falhar, mostra erro claro pedindo para colar a decklist.

## 3. Links "internos" do Master Duel / Duel Links

Aqui preciso ser franco: **Master Duel e Duel Links não geram URLs de deck**. O que existe é o **Deck Share ID / Recipe Code** — um código alfanumérico ("Deck ID") exibido dentro do jogo para copiar/importar entre jogadores, mas não é um link web e a Konami não expõe API pública para resolvê-lo.

Duas alternativas que posso oferecer:
- **Aceitar o "Deck Share Code" no campo de URL** e tentar resolvê-lo via MasterDuelMeta (que às vezes indexa decks por esse código). Sem garantia de acerto.
- **Deixar claro na UI** que para decks do jogo o caminho é: abrir o deck no MasterDuelMeta/DuelLinksMeta, copiar a URL, colar aqui — ou usar exportação para `.ydk` de ferramentas como YGOPRODeck.

Vou adotar a segunda opção como padrão (texto de ajuda ao lado da nova aba). Se quiser tentar a primeira, me diga depois do plano aprovado.

## Detalhes técnicos

- **Server functions ficam em arquivos `.functions.ts`** (não `src/server/`), conforme regras do template.
- **Sem novos pacotes**: uso `fetch` nativo do runtime worker.
- **Cache:** simples `Map` no módulo do server function; sem persistência entre deploys, mas suficiente para uma sessão de uso.
- **Arquivos alterados/novos:**
  - `src/lib/cards.functions.ts` — novo, resolve IDs em nomes.
  - `src/lib/deck-import.functions.ts` — novo, importa URLs do MDM/DLM.
  - `src/lib/deck-parser.ts` — pequenos ajustes para expor os IDs originais junto do nome (para o resolver saber o que buscar).
  - `src/routes/index.tsx` — nova aba "Link (Meta)", chamada assíncrona ao resolver nomes após `.ydk` / `ydke://`, feedback de loading.

## Resultado esperado

- Importar um `.ydk` mostra `3x Ash Blossom & Joyous Spring` em vez de `3x Card #14558127`.
- Colar `https://www.masterduelmeta.com/deck/<slug>` puxa o main deck completo com nomes.
- Aviso claro sobre não haver "URL de deck" oficial no cliente do jogo, direcionando para MDM/DLM.