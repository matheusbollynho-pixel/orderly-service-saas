# Parte 10: Oficina, proposta do Designer

## O problema hoje
A etapa pode ser mudada em 3 lugares, e cada um faz uma coisa diferente:
- o select de Status da OS (`OrderDetails` ~1197);
- o select "Status" da oficina (`OrderDetails` ~1380);
- o select do Quadro (`QuadroOficinaPage` ~154).

Efeitos disso:
- **No Quadro, "Pronta" muda só o `status_oficina`.** A OS continua "Em andamento", então não sai aviso e a IA diz "em serviço".
- **Falta de mecânico vira toast de erro.**
- **Os selects têm 32px**, pequenos demais para o celular.

## 1. Status único: o status da OS manda
| Etapa | `status` + `status_oficina` | Cor | Quem |
|---|---|---|---|
| Na fila | `aberta` + `aguardando_inspecao` | cinza | balcão |
| Em serviço | `em_andamento` + `em_servico` | azul | mecânico ou balcão |
| Esperando peça | `em_andamento` + `aguardando_peca` | âmbar | mecânico ou balcão |
| Pronta | `concluida` + `pronta_para_buscar` | verde | mecânico ou balcão |
| Entregue | `concluida_entregue` | (sai do quadro) | só balcão |

- **Leitura:** a etapa vem do `status`. O `status_oficina` só conta para "Esperando peça", e só quando a OS está aberta ou em andamento.
- **Gravação:** sempre os dois campos juntos. `servico_concluido` passa a valer como Pronta.
- **O que não muda:** o banco, os relatórios, a IA, o aviso de pronta e a pesquisa.
- **Antes de publicar:** contar quantas OS ativas estão com `status_oficina` fora de sincronia.

## 2. Tela no celular
Oficina = **[Na oficina]** (Ordens e Quadro juntos) e **[Agenda]**.
- Busca no topo, que acha também as OS entregues.
- Filtros: Todas, Na fila, Em serviço, Peça, Pronta.
- Atrasadas e "entrega hoje" aparecem em cima.
- Cartão:
  - topo: número, cliente, moto e placa, dias na oficina, mecânico;
  - selo da etapa;
  - botões de 56px conforme a etapa: [Começar serviço] / [Esperando peça] [Pronta] / [Peça chegou] / [Entregar e receber R$ X].
- Tocar no nome abre a OS. Faixa "Desfazer" por 5 segundos.
- PC: 2 colunas. Sem arrastar.

## 3. Um toque por etapa: `mudarEtapa()` no lugar dos 3 selects
- **Começar sem mecânico:** abre o painel "Quem vai fazer?" com botões grandes; o toque já salva e avança.
- **Selo "Falta assinatura":** aparece quando o cliente deixou a moto e falta assinatura ou checklist. Avisa, não bloqueia.
- **Pronta:**
  - atribui o mecânico aos serviços;
  - grava `conclusion_date`;
  - abre "Avisar o cliente?", que ganha o botão [Desfazer (não está pronta)].
- **Desfazer (5 segundos):** volta o status, o `status_oficina`, o `conclusion_date` e o `exit_date`. Depois disso, a correção é pelo "Mudar etapa…" dentro da OS.
- **Entregar e receber:**
  1. pede a assinatura de entrega, se o cliente deixou a moto;
  2. abre o painel Receber (quitar já marca Entregue);
  3. se já estiver pago, só pede a confirmação.
- **Mecânico x balcão:** no aparelho que abre direto em "Na oficina", o botão Entregar não aparece.

## 4. O que sai
- O cartão "Oficina → Status" dentro da OS.
- O select do Quadro.
- O select de Status da OS vira o bloco "Etapa", com o mecânico logo abaixo e o botão [Trocar].
- O selo duplicado do `OrderCard`.
- **Ordem de execução:** (a) componente EtapaMoto e `mudarEtapa`; (b) Quadro; (c) OS; (d) cartão; (e) juntar as abas.

## 5. Decisões do dono
1. **Juntar Ordens e Quadro em "Na oficina"?** Recomendação: sim.
2. **Entregar sem quitar?** Recomendação: só com o saldo zerado ou indo para Fiado.
3. **Pago antes de ficar pronta vira Entregue sozinho?** Recomendação: só vira Entregue se já estiver Pronta; antes disso, fica com o selo "Pago". Atenção: o `asaas-webhook:497` também marca Entregue.
