# Relatórios v2 — versão FINAL (designer rodada 2, 13/11/2026)

## Abas (4): Resumo | Comissões | Oficina | Peças
- **Resumo:** Vendeu (+ Ficou a receber) • Entradas (= Caixa; das vendas acima / de vendas antigas / sinal e avulsas) • Saídas (= Caixa) • Saldo (sobrou) + "comissão paga fora do caixa" informativa • Pra pagar (contas até fim do mês + comissão a pagar) • Atenção (estornos com quem/motivo, descontos, fiado vencido).
- **Comissões** (não "Equipe"): mecânicos + atendentes; produziu / a pagar / pago; detalhe com [Marcar pago] (atendente também); % só leitura com link pra Ajustes > Equipe.
- **Oficina:** motos paradas AGORA por etapa (dias desde a entrada; "pronta" desde conclusion_date), top 10 serviços por mão de obra, nº de OS por mecânico.
- **Peças:** lucro das peças vendidas (venda - unit_cost do movimento; avisa "X sem custo"), top 10 por lucro, valor do estoque, abaixo do mínimo (link Faltas e cotação).
- **Saiu:** botão Hoje; ticket médio, NPS, novos x voltaram x sumidos; sem venda 90 dias; aba Clientes (Satisfação vai pra Mais > Clientes > Avaliações); peças por mecânico. Pagtos vira lista só leitura (toca abre a OS) e só sai quando editar/estornar na OS tiver no máximo os mesmos toques.

## Datas e nomes
Fuso America/Bahia. Dinheiro = data do lançamento no caixa. Venda de OS = exit_date (gatilho grava ao virar entregue; antigas acertadas por conclusion_date). Nota = finalized_at. updated_at nunca. Comparação com o mesmo pedaço do mês anterior. Nomes iguais ao Caixa: Entradas, Saídas, Saldo. Aceite: outubro fechado bate no centavo com Caixa > Mês.

## Permissões
`relatorios` = Resumo, Oficina, Peças. Nova `comissoes` = aba Comissões + marcar pago. Ambas desligadas pra colaborador. RPC confere loja e permissão no servidor. Valores abrem escondidos (olho, useOcultarValores comum com o Caixa). "Minha comissão" em Mais, só a de quem está logado (depende do vínculo login-pessoa).

## Resumo (390px)
```
| <  Relatórios                 [olho] |
| [Este mês][Mês passado][7d][Escolher]|
| Resumo  Comissões  Oficina  Peças    |
| 1-13/nov   comparando c/ 1-13/out    |
| VENDEU                 R$ 52.700 +8% |
|  86 OS entregues · 214 notas         |
|  Ficou a receber       R$ 6.600   >  |
| ENTRADAS (= Caixa)     R$ 48.320  >  |
|  Das vendas acima      R$ 40.900     |
|  De vendas antigas     R$  5.200     |
|  Sinal e avulsas       R$  2.220     |
| SAÍDAS (= Caixa)       R$ 23.100  >  |
| SALDO (sobrou)  R$ 25.220  +15% out  |
|  Comissão paga fora do caixa R$1.800 |
| PRA PAGAR (em aberto)  R$ 12.750     |
|  Contas até 30/nov     R$ 8.400   >  |
|  Comissão a pagar      R$ 4.350   >  |
| ATENÇÃO                              |
|  6 estornos R$ 1.140 (quem, motivo) >|
|  Descontos dados R$ 870           >  |
|  Fiado vencido R$ 2.300           >  |
```

## Fatias
1 tirar console.log/emoji • 2 migration exit_date • 3 RPC relatorio_resumo + Resumo novo atrás de chave (antigo até outubro bater com o Caixa) • 4 barra de período + comparação; depois Pagtos • 5 migration % guardada + Comissões + permissão comissoes • 6 Oficina e Peças (RPC cada); Satisfação -> Clientes > Avaliações • 7 comissão paga no Caixa • 8 Minha comissão.

## Decisões pro dono
1. Marcar comissão paga lança saída no Caixa? Recomendado: sim, perguntando na hora [Lançar R$ X no caixa] / [Já lancei à mão]; desmarcar estorna.
2. Comissões antigas usam a % de hoje (histórico não guardou). Recomendado: aceitar, com aviso "calculado com a % atual".

## Discordâncias
- Retorno de garantia por mecânico: não existe campo; "mesma placa em 30 dias" acusaria revisão programada. Fora até medir com dados da Bandara (crítico queria).
- Comissão paga no Caixa: crítico queria já; designer segue o dev (fatia 7, com trava "Já lancei à mão").
- Parada por etapa é parcial (sem histórico de etapa).
