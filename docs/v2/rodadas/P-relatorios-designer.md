# Relatórios v2 — proposta do designer (rodada 1, 13/11/2026)

## 1. Diagnóstico (lido do código)
**Serve:** detalhe do mecânico + marcar comissão paga; comissão do balcão (inclusive parte de peças de OS); valor do estoque (custo/venda/lucro possível); ranking de satisfação.
**Duplicado:** comissão de mecânico em Resumo e Mecânicos (% em Equipe); Pagtos repete pagamento da OS e do Caixa; 4 filtros de período diferentes (Resumo/Peças só semana atual/mês atual; Mecânicos/Balcão com calendário e abrem vazios).
**Fora de lugar:** Pagtos lança/edita/estorna dinheiro (deve ser só na OS); Satisfação é tela separada; aba Peças atribui peças da OS ao mecânico.
**Contas erradas (o mais grave):**
- Relatórios de OS só enxergam as últimas 200 OS (useServiceOrders limite 200). Balcão sem limite, mas servidor corta em 1000 sem avisar.
- Cada aba usa uma data diferente (saída/última edição; abertura; finalização). Mesmo período, números não batem.
- "Faturado" no Resumo soma só mão de obra (sem peças e balcão).
- Comissão usa a % atual do cadastro: se mudar, o histórico muda.
- Marcar comissão paga não lança saída no Caixa.
- Emoji nos títulos da Satisfação; console.log listando todas as OS no ReportsPage.
**Falta:** entrou de verdade (líquido de estornos), fiado, estornos, contas a pagar, ticket médio, comparação com período anterior, estoque parado/abaixo do mínimo, mais vendidas, cliente que voltou/sumiu.

## 2. Proposta: 4 abas, 1 período
Barra fixa: [Hoje] [7 dias] [Este mês] [Mês passado] [Escolher]. Abre em Este mês. Todo número "vs. período anterior".
Regra de datas: dinheiro = data do lançamento no caixa; venda = data de entrega da OS / finalização da nota. Contas no banco, sem limite de 200.

- **Resumo:** Entrou no caixa (líquido de estornos: Oficina / Balcão / Fiado recebido) • Vendeu (serviços + peças das OS + balcão; nº OS entregues e notas; ticket médio OS e balcão) • Pagou (contas pagas; "a vencer 7 dias" leva a Contas a pagar) • A receber agora (OS prontas + fiado, vencido em vermelho + notas abertas; abre "A receber") • Atenção (estornos: qtd/valor/motivo; descontos dados; fiado vencido).
- **Equipe:** mecânicos e atendentes numa lista: produziu, comissão a pagar, nota média da pesquisa. Toca e abre o detalhe com "marcar pago". % só leitura (link pra Ajustes > Equipe).
- **Peças:** 10 mais vendidas (OS + balcão); valor do estoque parado a custo; sem venda há 90 dias; abaixo do mínimo (link Faltas e cotação); encomendas pendentes.
- **Clientes:** satisfação (média, NPS, elogios/críticas; sai da tela separada); novos x voltaram; sumidos (sem OS há 6 meses; link Lembretes).

**Sai/vai:** Pagtos sai → lista só-leitura "Pagamentos do período" no Resumo, toca abre a OS. Mecânicos + Balcão-comissão → Equipe. Peças por mecânico sai. Satisfação → aba Clientes (rota antiga 1 semana).
**Novo:** comparação período anterior, Atenção, mais vendidas, sem venda 90 dias, novos x voltaram x sumidos, % de comissão guardada no momento da venda.
**Ordem:** 1 contas certas (data única, sem limite 200) → 2 barra de período → 3 tirar Pagtos → 4 Equipe → 5 Resumo novo → 6 Peças e Clientes.

## 3. Tela (390px)
```
| <  Relatórios                        |
| [Hoje][7d][Este mês][Mês pas.][...]  |
| Resumo | Equipe | Peças | Clientes   |
| ENTROU NO CAIXA          [olho]      |
| R$ 48.320          +12% vs out       |
|  Oficina 31.900 Balcão 13.100        |
|  Fiado recebido 3.320                |
| VENDEU             R$ 52.700         |
|  86 OS entregues  ticket R$ 371      |
| 214 notas balcão  ticket R$ 61       |
| PAGOU (contas)     R$ 21.400         |
|  A vencer 7 dias: 3 = R$ 4.200    >  |
| A RECEBER AGORA    R$ 9.850      >   |
|  OS prontas 5 | Fiado 12 (4 venc.)   |
| ATENÇÃO                              |
|  6 estornos  R$ 1.140            >   |
|  Descontos dados  R$ 870         >   |
|  Fiado vencido  R$ 2.300         >   |
```
Verde só pra entrou; âmbar a receber/a vencer; vermelho vencido/estorno. Linhas com ">" 48px, abrem a origem filtrada.

## 4. Fica pra Gestão financeira
Lucro líquido, margem por peça/serviço, fixo x variável, ponto de equilíbrio, capital de giro, pró-labore, sugestão de compra, DRE, metas.

## Decisões levantadas pelo designer
1. Comissão marcada como paga lança saída no Caixa?
2. Dinheiro do Resumo começa escondido (olho), como no Caixa?
