# Rodada 1: Dev

Conferido no código (main `a06871b`). **Viável, com 4 ajustes obrigatórios.**

## 1. Abrir OS: viável com ajuste
**O Express não é um campo da OS: é um texto na descrição.** O sistema reconhece a OS Express procurando "cadastro express" (`OrderDetails.tsx:130`). Esse texto controla:
- receber sem a assinatura de entrega (`:655`);
- gerar e enviar o PDF sem a assinatura de inspeção (`:723`, `:847`);
- abrir direto na aba de materiais (`:149`, `:405`);
- mostrar o formulário "completar cadastro" (`:433-464`);
- o selo Express (`OrderCard.tsx:42`).

**Decisão do dono:** a OS única passa a exigir assinatura ou não? As OS antigas continuam sendo reconhecidas como hoje.

**Cliente duplicado:**
- Hoje a Nova OS verifica pelo CPF (`useClients.ts:231`) e o Express pelo telefone (`ExpressCadastroPage.tsx:204`).
- Na v2: usa o id escolhido na busca; se não houver, procura pelo telefone; se não achar, cria o cliente.

**Campos obrigatórios hoje:**
| Tela | Exige | Onde |
|---|---|---|
| Nova OS | nome, CPF, placa e atendente (se houver equipe) | `OrderForm.tsx:280-284`, `Index.tsx:135` |
| Express | nome, telefone, placa, marca, modelo, ano, cor, serviço e atendente | `ExpressCadastroPage.tsx:157-192` |

**O que só a Nova OS faz:**
- várias motos e o km gravados no texto do veículo (`Index.tsx:194-207`);
- data de entrada;
- "Retirada: Outra pessoa - Nome|Tel|CPF" gravado na descrição. Esse formato não pode mudar, porque é lido de volta em `OrderDetails.tsx:349-354`;
- a marca sai da primeira palavra do modelo (`Index.tsx:169`).

**O que só o Express faz:** cria o lembrete de manutenção na abertura (`:269-286`).

**Campos que nunca foram gravados:** o adesivo (`OrderForm.tsx:525`) e o `created_by_staff_id`.

**Agenda → converter em OS:** passa o `client_id` (`Index.tsx:710-719`). Manter.

## 2. Receber pagamento: a tela é comum, a gravação continua separada
**Como cada lugar grava hoje:**
| Origem | Como grava | Onde |
|---|---|---|
| OS | em `payments`; um gatilho lança no caixa; a tela fecha a OS quando quita; exige assinatura e quem recebeu | `Index.tsx:496-505`, `OrderDetails.tsx:655-666` |
| Balcão | em `payment_methods`; só vai ao caixa ao finalizar, sem transação | `useBalcao.ts:235-251` |
| Fiado | 4 gravações soltas | `useFiados.ts:123-172` |
| Encomenda | direto no caixa | `useEncomendas.ts:230` |

**Proposta:**
- `<ReceberPagamento>` é só a tela (drawer).
- A gravação fica em 4 adaptadores: `useReceberOS`, `useReceberBalcao`, `useReceberFiado` e `useReceberEncomenda`.

**Débito/crédito na OS:**
- O banco já aceita.
- Falta ajustar `PaymentsTab.tsx:115`, que agrupa tudo como "cartao", e o tipo em `service-order.ts:62`.

**Bug para corrigir antes:**
- O fiado que não é de OS grava `type:'devolucao'` (`useFiados.ts:165`), mas o caixa não aceita esse tipo.
- O erro não é verificado, então o lançamento some sem aviso. São os 15 pagamentos perdidos.
- A correção mexe no banco.

## 3. Cores e fonte
- **Trocar o `--primary`** (`index.css:26`, `:93`) muda mais de 126 usos, incluindo a página pública de avaliação (24) e o Login.
- **Ficam de fora:** 87 `#C1272D` escritos direto no código (16 arquivos) e 876 classes de cor fixas. Esses exigem varredura tela por tela.
- **PDF e impressão não quebram.**
- **Tema:** `useTheme.tsx:13` começa no escuro e guarda a escolha em `localStorage`. Mudar o padrão só afeta quem nunca escolheu, então a Bandara continua no escuro. Há também um `body{#18181b}` fixo em `index.css:1`.
- **Barlow:** carregar no `index.html` e no `tailwind.config.ts`. Hoje não existe `fontFamily` configurada. Risco baixo.

## 4. Menu de 5: viável com ajuste
**O bloqueio de plano só existe no `BottomNav.tsx:30`.** Botões do Início ou do "Mais" que chamem `setCurrentView` direto **furam esse bloqueio**.
- Solução: um único `goTo(view)` em `src/lib/navegacao.ts`, com o mapa de cada tela → permissão + recurso do plano.

**Manter os ids `new` e `express`** em:
- `PLAN_FEATURES`;
- `custom_features` do SuperAdmin;
- permissões dos colaboradores.

"Abrir OS" aparece para quem tiver `nova_os` ou `express`.

**"Só o dono" não está protegido de verdade:** `isAdmin = !!user` (`useAuth.ts:42`), ou seja, qualquer pessoa logada. Usar `isOwner` ou `permissions.caixa` (`StoreContext.tsx:120`).

**Rotas soltas, para a etapa de segurança:** `/fluxo-caixa` e `/pos-venda` (`App.tsx:146-147`) abrem sem checar permissão.

**IA 24h:** não existe na lista de telas (`Index.tsx:42`). Pode remover.

## 5. CPF opcional na OS
- Dá para fazer. No banco, `client_cpf` é NOT NULL mas aceita `''`.
- **Quem depende do CPF:**
  - lançar fiado na OS e no Balcão;
  - o aviso de fiado em aberto (busca por CPF);
  - Asaas (PIX e boleto);
  - a IA, que cai para o CPF quando não acha pelo telefone;
  - a verificação de cliente duplicado.
- **Solução:** o painel Receber pede o CPF na hora de lançar fiado ou gerar link. O Express já faz isso (`OrderDetails.tsx:520-525`).

## Componentes novos (`src/components/v2/`)
- `BuscaCliente` + `useBuscaCliente`. Hoje a busca por veículo devolve só o primeiro resultado (`useClients.ts:132`); precisa devolver lista.
- `ClienteMotoForm`.
- `AbrirOS`, com a gravação em `services/abrirOS.ts`.
- `ReceberPagamento` + os 4 adaptadores.
- `ConfirmarAcao`: substitui 11 `window.confirm` e o `alert()` de `OrderDetails.tsx:656`.
- `NavPrincipal`.

**Saem depois de validados:** `ClientSearch`, `OrderForm`, `ExpressCadastroPage`, os backups, `pdfGenerator_old` e os painéis de debug.

## Ordem de execução (cada fatia vai ao ar sozinha)
| # | Tam. | O quê |
|---|---|---|
| 1 | P | Limpeza: backups, código morto do Express, `/debug-os` |
| 2 | P | Fiado no caixa (`devolucao` → `entrada`). Mexe no banco |
| 3 | P | `--destructive` separado do primary (primary continua vermelho), logo de 32px, fonte Barlow |
| 4 | M | `navegacao.ts` + menu de 5. Testar com o plano Básico e com colaborador limitado |
| 5 | M | `ConfirmarAcao` |
| 6 | M | `BuscaCliente`: primeiro Agenda e Encomendas, depois Balcão |
| 7 | G | `AbrirOS` atrás de chave, com Nova OS e Express mantidos até a Bandara validar |
| 8 | G | `ReceberPagamento`, nesta ordem: Encomenda → Fiado → Balcão → OS |
| 9 | G | Azul no primary + troca das cores fixas, tela por tela |

## Dívidas antes de começar
- Tirar a gravação de pagamento de dentro das telas (`Index.tsx:483-513`, `OrderDetails.tsx:513-644`) e passar para hooks.
- Quebrar o `OrderDetails` antes da fatia 8.
- Testes do `abrirOS` antes da fatia 7.

## Decisões do dono
1. Assinatura obrigatória para receber e gerar PDF?
2. Tema claro como padrão?
3. Corrigir o fiado no banco?
