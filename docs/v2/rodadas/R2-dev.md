# Rodada 2: Dev (fechamento)

## Grave: o aviso de moto pronta nunca funcionou
- A função `os-pronta-aviso` filtra `status = 'concluido'` (`index.ts:32` e `:70`). Esse valor não existe: os status reais são aberta, em_andamento, concluida e concluida_entregue.
- O mesmo erro aparece em `ia-atendimento:1523`.
- Quando a moto fica "Pronta" no Quadro, o sistema só muda o `status_oficina`. Nenhum gatilho passa isso para o `status` da OS.
- **Conferido no banco (12/11):**
  - `whatsapp_send_log` não tem nenhum envio com `feature = 'os_pronta'`.
  - Nenhuma OS tem o status "concluido".
  - **701 OS concluídas** estão com `aviso_retirada_enviado_em` vazio.
- **Cuidado ao consertar:** se o filtro só for corrigido, as 701 OS disparam aviso de uma vez. O conserto precisa olhar apenas as OS das **últimas 24h**.
- A função também é pública e não confere `CRON_SECRET`. Dá para colocar essa trava no mesmo conserto.

## Itens novos
| Item | Viável | Custo | Detalhe |
|---|---|---|---|
| [Avisar agora] | sim, sem mexer no banco | P | Marca o aviso na OS (`where is null`) → envia → se falhar, desmarca. Depende do conserto do aviso |
| Tela inicial por aparelho | sim | P | Colaborador sem acesso a caixa/balcão e com acesso ao quadro → abre no Quadro |
| Lista "A receber" | sim, sem mexer no banco | M | Criar `src/lib/saldoOS.ts` (hoje o cálculo está repetido em `OrderDetails` e `PaymentsTab`). Precisa de consulta própria, porque a lista atual carrega no máximo 200 |
| Venda rápida "Consumidor" | sim | P | `client_name` vazio, mostrado como "Consumidor". Sem cliente falso. Fiado continua bloqueado sem cliente |
| Placa sem hífen | sim, **mexe no banco** | P | Fica em `motorcycles.placa`. `upsertMotorcycle` só tira espaços, e placas antigas podem ter hífen. Passos: contar duplicadas → acertar uma vez → gatilho. Conferir qual índice único existe |
| KM | sim | P | Não tem coluna própria: vai no texto da moto ("base 23450 km (PLACA)"). Mover para `src/lib/equipamento.ts`, com teste |
| Olho do caixa | sim | P | Já existe no Caixa. Fazer `useValorOculto`. Não substitui permissão. Sem salvar, volta a esconder |
| Quadro em 4 colunas | sim com ajuste | – | Hoje são 5 status. "Pronta" junta `servico_concluido` e `pronta_para_buscar` |

## Ordem final
| # | Tam. | O quê | Banco? | Bandara sente? |
|---|---|---|---|---|
| 1 | P | Limpeza (backups, pdfGenerator_old, /debug-os, IA 24h) | Não | Não |
| 2 | P | Fiado recebido entra no caixa (`devolucao` → `entrada` + conferir erro) | Só para recuperar os 15 | Sim |
| 3 | P | Conserto do aviso de pronta (status certo, só últimas 24h, `CRON_SECRET`) | Deploy de função | Sim |
| 4 | P | Botão de perigo separado, fonte Barlow, logo de 32px | Não | Pouco |
| 5 | P | Placa normalizada | Sim | Não |
| 6 | M | `navegacao.ts` + menu de 5 + tela inicial por aparelho (menu antigo disponível por 1 semana) | Não | Sim |
| 7 | M | `ConfirmarAcao` | Não | Pouco |
| 8 | M | Início v2 atrás de chave + "A receber" | Não | Quem ligar |
| 9 | M | `BuscaCliente`: Agenda → Encomendas → Balcão | Não | Sim |
| 10 | P | Quadro em 4 colunas + [Avisar agora] | Não | Sim |
| 11 | G | Quebrar `OrderDetails` + tirar a gravação de pagamento da tela | Não | Não deve |
| 12 | G | `AbrirOS` atrás de chave (Nova OS e Express continuam no ar) | Não | Quem ligar |
| 13 | G | `ReceberPagamento`: Encomenda → Fiado → Balcão → OS | Não | Sim |
| 14 | G | Azul + troca das cores fixas, tela por tela | Não | Sim |

## Decisões antes da fatia 1
1. **Aviso de pronta:** o que conta como "pronta"? Recomendo **o Quadro** (`status_oficina`). Só últimas 24h, nada retroativo.
2. **Os 15 fiados:** lançar com a data antiga? Recomendo **lançar**, depois de o dono conferir a lista.
3. **Chave da v2:** por aparelho ou por loja? Recomendo **por aparelho**.
