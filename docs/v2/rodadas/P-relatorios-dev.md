# Relatórios v2 — dev (rodada 1, 13/11/2026)

**Diagnóstico confirmado, com ajustes:**
- Limite 200 é pior: useServiceOrders pega as 200 mais recentes por created_at; Resumo/Peças filtram por saída -> OS antiga entregue este mês some. MechanicDetailReport lê direto (corte de 1000 do servidor). Comissão de peças no Balcão usa as mesmas 200 por created_at.
- Datas: Resumo/Peças/Mecânico usam exit_date || updated_at || created_at (updated_at faz a OS pular de período); Balcão-OS created_at; nota finalized_at.
- **exit_date não é confiável:** o seletor de status (Index.tsx:319-323) só grava conclusion_date (e sobrescreve). exit_date só vem da tela de detalhe e do Fiado. Medido: 24 de 659 entregues sem exit_date (20 dá pra acertar por conclusion_date).
- Faturado = só mão de obra, bruto (sem descontos); comissão sobre o bruto.
- % de comissão atual em 3 lugares; comissão de balcão não tem "marcar pago".
- console.log em ReportsPage a cada render; emoji/log em SatisfactionDashboardPage.
- Custo: Relatórios carrega 200 OS + todas as notas + estoque inteiro; Satisfação tem tempo real próprio.
- Sem índice em materials/payments/checklist_items(order_id): 574 milhões de leituras completas cada (corrigido na migration 20261113004).

**Viabilidade:**
- Contas no banco: médio. RPC relatorio_resumo(p_store_id, p_ini, p_fim) SECURITY DEFINER conferindo a loja (padrão estornar_pagamento_os). Não copiar saldo_os (não confere loja; revogado em 20261113004). Fuso America/Bahia. Origem do caixa: Oficina por order_id/payment_id, Balcão category='venda_balcao', Fiado category='Fiado' (fixar constantes). Estornos via estorno_de/estornado_em. staleTime 5 min, sem refetchInterval/tempo real.
- Período anterior: fácil (mesma RPC devolve os dois).
- Data de entrega: fácil + migration (gatilho grava exit_date ao virar entregue; acerto dos antigos por conclusion_date).
- % guardada: médio, colunas novas materials.comissao_pct e balcao_orders.comissao_pct por gatilho; histórico antigo acerta com a % de hoje (avisar o dono).
- Marcar pago atendente: médio (paid_at no balcão ou tabela comissao_pagamentos).
- Comissão paga -> saída no Caixa: difícil, decisão separada (risco de contar em dobro se a loja já lança vale à mão); RPC única + estorno ao desmarcar.
- Novos/voltaram/sumidos: médio (OS sem client_id, clientes duplicados; medir antes).
- Peças: médio (estoque_minimo_para_faltas existe; não carregar todos os produtos na tela).

**Estrutura:** src/components/relatorios/ com BarraPeriodo (calendar+popover, período na URL/contexto), CartaoNumero (valor, anterior, tom, olho via useOcultarValores comum com o Caixa), LinhaClicavel (48px). hooks/useRelatorio.ts. Sai PaymentsTab de Relatórios, peças por mecânico, console.log, ouvinte reports:openDetailed. MechanicDetail + BalcaoCommission viram uma aba.

**Ordem:** 1 tirar logs/emoji • 2 migration exit_date • 3 RPC relatorio_resumo + Resumo novo atrás de chave, antigo até bater com o Caixa num mês fechado • 4 BarraPeriodo + comparação; depois tirar Pagtos • 5 migration % guardada + aba Equipe • 6 Peças e Clientes (RPC cada) • 7 decisão: comissão paga no Caixa.
**Dívida:** Resumo novo não usa useServiceOrders/useBalcao. CashFlowPage.tsx:26-28 tem "Matheus"/"Anderson" fixos. Permissão `relatorios` só no front; a RPC pode conferir.
