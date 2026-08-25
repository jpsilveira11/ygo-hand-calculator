# Estrela alternável e categoria sempre editável

Duas melhorias na lista de cartas importadas (seção "Cartas do main deck").

## 1. Estrela que liga e desliga

Hoje, quando uma carta é destacada, a estrela desaparece e é substituída por um selo "★ Destaque" fixo — só é possível remover o destaque na seção "Cartas em destaque", pelo ícone de lixeira.

Passará a funcionar como um botão de alternância:
- Carta sem destaque: estrela vazia, clique adiciona o destaque (como hoje).
- Carta com destaque: estrela preenchida em dourado, clique remove o destaque daquela carta.
- Tooltip/aria-label muda entre "Destacar carta" e "Remover destaque", nos três idiomas.
- Ao remover, a categoria de destaque correspondente é apagada e as cópias voltam a contar integralmente na categoria de origem; qualquer combo que usasse aquela carta em destaque tem essa referência removida (mesmo comportamento seguro já usado pela lixeira).

## 2. Categoria editável mesmo com estrela

Hoje o seletor de categoria fica desabilitado quando a carta está destacada.

Passará a ficar sempre habilitado. Trocar a categoria de uma carta destacada:
- atualiza a atribuição da carta, e
- atualiza a categoria-mãe do destaque, para que a carta continue somando dentro do grupo correto (ex.: mover "Snake-Eye Ash" de Starters para Extenders faz "pelo menos 1 extender" incluir o Ash).
- Escolher "Sem categoria" deixa o destaque sem mãe: ele conta apenas como condição própria.

Nada muda nos cálculos de probabilidade em si — a matemática de grupos já existente continua válida, só a categoria-mãe passa a ser reconfigurável.

## Detalhes técnicos

Arquivo: `src/routes/index.tsx`.

- Novo helper `removeFocusByKey(key)` reaproveitando a limpeza feita por `removeCategory` (remoção da categoria + limpeza de referências em combos).
- O bloco da linha ~1677 (`focused ? <Badge/> : <Button/>`) passa a renderizar sempre o `Button` com `Star` preenchida (`fill-gold text-gold`) quando `focused`, chamando `removeFocusByKey`.
- `Select` de categoria: remover `disabled={!!focused}`; no `onValueChange`, além de `setCardAssignments`, chamar `updateCategory(focused.id, { parentCatId: v === "__none__" ? undefined : v })` quando existir `focused`.
- `src/lib/i18n.ts`: adicionar chave `focus_remove` (PT/EN/ES).
