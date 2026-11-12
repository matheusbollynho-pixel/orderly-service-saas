# Parte 10: Oficina, plano fechado (Designer + Dev + Crítico)

Crítico: nota 7, **AJUSTAR**. Dev: **viável sem mexer no banco**, desde que se resolva antes o limite de 200 OS, o tamanho do OrderDetails e a exceção do Express.

## Regras
- **Etapa única**, sempre derivada do `status`:

  | Etapa | status + status_oficina |
  |---|---|
  | Na fila | aberta |
  | Em serviço | em_andamento + em_servico |
  | Esperando peça | em_andamento + aguardando_peca |
  | Pronta | concluida (+ pronta_para_buscar) |
  | Entregue | concluida_entregue |

  - `aberta` + `em_servico`/`aguardando_peca` conta como Serviço/Peça. São 9 OS nesse caso hoje; assim os dados não precisam ser corrigidos.
  - Toda troca grava os dois campos juntos, numa gravação só. Só grava se a OS ainda estiver na etapa que o aparelho viu.
- **Botões de 1 toque**, iguais no cartão da oficina e DENTRO da OS (ajuste do crítico): [Começar] · [Peça] [Pronta] · [Peça chegou] · [Entregar e receber].
- **Começar sem mecânico:** abre "Quem vai fazer?" e já grava o mecânico e a etapa.
- **Pronta:** atribui o mecânico aos serviços (numa gravação só), grava conclusion_date e exit_date (meio-dia) e abre "Avisar o cliente?". A mensagem só sai pelo botão. O automático espera 10 minutos e pula OS já avisadas ou desfeitas.
- **Desfazer (5 s):** restaura os 4 campos e o `aviso_retirada_enviado_em`. Não vale para Entregar.
- **"Quem está recebendo":** já vem marcado com o último que recebeu.
- **Decisão 2:** só entrega com saldo zerado ou como Fiado. Hoje a loja já faz isso: 117 quitadas contra 4 entregues sem quitar em 90 dias.
- **Decisão 3:** pago antes de ficar Pronta não vira Entregue; ganha o selo "Pago". **Exceção: Express.** Vale para `Index.tsx:523` e para `asaas-webhook:497`, que precisa ser publicada de novo.
- **Juntar Ordens e Quadro em "Na oficina":** os ids continuam. `quadro` vira apelido. Plano, custom_features e o 'quadro' salvo no aparelho seguem funcionando.
- **Express:** a regra sai do texto da descrição e vai para `lib/etapaOS.ts` (`ehExpress`). Express não assina na entrega, como hoje.

## Fatias
| # | Tam. | O quê | Testar |
|---|---|---|---|
| 1 | P | `lib/etapaOS.ts` + testes (sem tela) | 5 etapas, aberta+em_servico, Express, decisões 2 e 3 |
| 2 | P | Quadro lê por `etapaDe()` e busca as ativas direto no banco, sem o limite de 200 (hoje 26 das 47 ativas da Bandara somem) | 47 ativas; filtros batem com a contagem do banco |
| 3 | M | `useMudarEtapa` + botões no Quadro (sem Entregar) + desfazer + aviso automático esperando 10 min | Pronta grava os 4 campos e abre o aviso; desfazer; duas abas abertas; "Quem vai fazer?" |
| 4 | M | Na OS: bloco "Etapa" com os mesmos botões, no lugar dos 2 selects; "Mudar etapa…"; selo único no OrderCard | cada transição; Entregue sem assinatura continua bloqueado |
| 5 | P | Decisão 3 (Index:523 + asaas-webhook) | Express quitada → Entregue; OS em serviço quitada → selo Pago |
| 6 | G | Tirar assinatura e pagamento de dentro do OrderDetails; "Entregar e receber" no cartão com a decisão 2 | saldo > 0 → receber ou Fiado; saldo 0 → confirmar |
| 7 | P | Juntar as abas | 'quadro' salvo no aparelho; plano Básico; navegacao.test |

Fatias 1 a 3 mexem só no Quadro. As fatias 4 a 6 mexem na OS e no pagamento, então ficam paradas até o dono ver.
