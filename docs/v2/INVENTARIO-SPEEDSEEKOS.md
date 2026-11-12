# SpeedSeekOS: inventário completo (base para a v2.0)

Levantado em 12/11/2026, olhando o código (main `a06871b`), o banco e o servidor de produção.

**Em números:** 19 botões no menu de baixo, mais Sair • 6 abas em Configurações • 4 páginas públicas • 43 funções no servidor (34 abertas, sem login) • 13 tarefas automáticas • 46 tabelas no banco.

---

## 1. Menu de baixo (o que o funcionário vê)

É uma faixa que rola para o lado. Cada botão aparece conforme a permissão do colaborador e o plano.

| # | Botão | O que tem dentro |
|---|---|---|
| 1 | **Dashboard** | 4 contadores de OS (clicar filtra a lista) + 3 OS recentes. Ao abrir o app, pula o aviso "Agenda do dia". |
| 2 | **Nova OS** | Formulário completo: cliente (nome, CPF, telefone, apelido, nascimento, Instagram, autorizações), moto, data de entrada, quem vai pegar, quem criou, adesivo, o que fazer. |
| 3 | **Express** | Cadastro rápido de OS (cliente + moto + serviço). Mesma coisa que a Nova OS, só que menor. |
| 4 | **Ordens** | Lista e busca de OS. **Dentro da OS** (a maior tela do sistema, 2.400 linhas): status, mecânico, datas, inspeção com assinatura, termo de entrega com assinatura, checklist, peças e serviços, **pagamentos** (registrar, estornar, virar fiado, cobrar pelo Asaas com PIX/boleto/cartão), enviar OS/PDF por WhatsApp, baixar PDF, excluir. |
| 5 | **Agenda** | Calendário da semana por turno, agendamento com cliente/mecânico/status, "converter em OS". |
| 6 | **Oficina** | Quadro com as motos por etapa (aguardando inspeção, em serviço, aguardando peça, pronta). |
| 7 | **Caixa** | Dia, semana e mês, totais por forma de pagamento, "Nova Transação" (entrada, saída e retirada, podendo puxar peça do estoque), estornar, filtro Oficina/Balcão. |
| 8 | **Balcão** | Notas de balcão: itens, desconto, vários pagamentos, Asaas, virar fiado, imprimir/PDF, cancelar. |
| 9 | **Relatórios** | 6 abas: Resumo, Mecânicos (comissão + relatório detalhado), Peças, Balcão (comissão de atendente), **Pagtos** (lança, edita e estorna pagamento de OS), Estoque. |
| 10 | **Boletos** | Na verdade são **contas a pagar** da loja: credor, vencimento, juros, recorrência, alerta por WhatsApp, marcar pago. |
| 11 | **Fiados** | Fiado com juros, receber pagamento, cobrança por WhatsApp em níveis, histórico, cobrança automática, Asaas. |
| 12 | **Estoque** | Produtos (cadastro com uns 45 campos, preenchimento por IA), movimentações (entrada, venda avulsa, ajuste). |
| 13 | **Cotação** | Faltas, pedir preço (link/IA), fazer pedido, a caminho, representantes, dicionário da IA. |
| 14 | **Encomendas** | Pedido de peça do cliente: avisar, aprovar, sinal, chegou, entregar, desistiu. |
| 15 | **Equipe** | Mecânicos (comissão %) e atendentes de balcão (função, comissão em peças). |
| 16 | **Pós-Venda** | Aniversários (descontos), lembretes de manutenção (monitoramento, pendentes, agendados), palavras-chave de manutenção. |
| 17 | **Satisfação** | Média, NPS, rankings de mecânico e de atendente, elogios/críticas, feed, alerta de crise (nota < 3). |
| 18 | **IA 24h** | ⚠️ **Abre tela vazia.** O botão aparece para todos, mas não tem tela ligada a ele. |
| 19 | **Sair** | |

## 2. Configurações (engrenagem no topo, só o dono vê)

| Aba | O que tem |
|---|---|
| **Loja** | Dados da loja • horário e formas de pagamento (para a IA) • WhatsApp para alertas internos de boletos • **chave da API do Asaas** • limites da agenda • termos de inspeção e de entrega |
| **Mensagens** | Conexão do WhatsApp (QR code) • nome da empresa • modelos de mensagem com prévia |
| **IA** | Liga/desliga o assistente do WhatsApp • "Ensine a IA" (chat que gera notas) |
| **Ferramentas** | Reabrir OS entregue (colando o ID) • palavras-chave de manutenção |
| **Colaboradores** | *(abre outra página)* Convidar login, permissões por tela |
| **Minha Conta** | *(abre outra página)* Plano, pagar mensalidade (PIX), histórico, suporte |

## 3. Coisas fora do menu

- **Menu de testes antigo (`AdminMenu`)**: o código existe (limpar fotos, testar pesquisa com o telefone do dono do SpeedSeek, resetar satisfação), mas **nenhum botão abre**. Não aparece para ninguém; é código morto. *(Corrigido em 12/11: antes estava escrito que todo dono via.)*
- Avisos que aparecem sozinhos: mensalidade atrasada (com PIX) • WhatsApp caiu • Agenda do dia.
- `/print/:id`: impressão da nota de balcão com layout editável.
- `/debug-os/:id`: página de depuração, ainda acessível.
- `/super-admin`: seu painel do SaaS (clientes, plano, funcionalidades, orçamento de IA, WhatsApp, demo de 5 dias, central de erros).
- Cadastro, login, recuperar senha, onboarding (4 passos).

**Páginas públicas (sem login):** `/avaliar/:token` (pesquisa de satisfação) • `/avaliar/loja` • `/avaliacoes/feed` (depoimentos) • `/cotar/:token` (link do representante).

## 4. O que roda sozinho (13 tarefas automáticas)

| Tarefa | Quando |
|---|---|
| Lembrete de agendamento (véspera) | 20h, 21h, 22h |
| Alerta de boletos | todo dia, 11h |
| Lembretes de manutenção | toda hora |
| Mensalidade vencida (pausa a loja) | todo dia |
| Fim do período de teste | todo dia |
| Limpar conversas paradas da IA | toda hora |
| Coletar falhas das tarefas | toda hora |
| Apagar fotos antigas do checklist | meia-noite |
| Aviso "OS pronta" | 6x por dia |
| Follow-up de nota de balcão | seg a sáb, 11h–20h |
| Pesquisa de satisfação (em gotas) | a cada 6 min |
| Relatório de saúde (para você) | todo dia, 12h |
| `veicular-reprocessar` (**outro projeto seu**) | a cada 5 min |

## 5. Onde está **misturado ou repetido** (o principal para a v2)

1. **Vender uma peça tem 3 caminhos:** nota de Balcão • "Nova Transação" no Caixa puxando do estoque • "Venda avulsa" no Estoque. Cada um lança no caixa de um jeito.
2. **Abrir OS tem 3 caminhos:** Nova OS • Express • Agenda → converter.
3. **Pagamento de OS em 2 lugares:** dentro da OS e em Relatórios → Pagtos (que também lança, edita e estorna; relatório não deveria mexer em dinheiro).
4. **Fiado nasce em 3 lugares:** OS, Balcão e tela de Fiados.
5. **Cobrança Asaas espalhada:** OS, Balcão, Fiados, com a chave em Configurações → Loja.
6. **Comissão em 4 lugares:** porcentagem em Equipe • Relatórios → Mecânicos • relatório detalhado do mecânico • Relatórios → Balcão.
7. **"Equipe" × "Colaboradores":** Equipe = mecânicos e atendentes (para comissão). Colaboradores = logins e permissões (escondido em Configurações). Para o cliente, é a mesma coisa.
8. **Palavras-chave de manutenção em 2 lugares:** Pós-Venda e Configurações → Ferramentas (também no `AdminMenu`, que nunca aparece).
9. **Mensagens em 2 lugares:** Configurações → Mensagens e uma tela "Mensagens" antiga que ninguém consegue mais abrir.
10. **Configurações → Loja virou gaveta:** dados da loja + informações para a IA + alertas de boleto + chave do Asaas + agenda + termos jurídicos, tudo junto.
11. **Configurações → Ferramentas:** "reabrir OS" junto com "palavras-chave". Não há relação entre as duas.
12. **Pós-Venda × Satisfação:** as duas são "relacionamento com o cliente depois do serviço", mas ficam separadas.
13. **"Boletos"** parece cobrança do cliente, mas são contas da loja a pagar.
14. **IA espalhada:** IA 24h (vazia) • Configurações → IA • preencher produto no Estoque • ler resposta na Cotação. Não existe um lugar "IA".
15. **Menu com 19 botões em faixa rolando:** o cliente não vê o que está fora da tela e acha que a função não existe.
16. **Assinatura do SpeedSeek** ("Minha Conta") escondida dentro das Configurações da oficina.

## 6. Quebrado ou sobrando

- Botão **IA 24h** abre tela vazia.
- Menu de testes antigo (`AdminMenu`): código morto, nunca abre (pode sair).
- Tela "Mensagens" antiga, sem acesso • `/debug-os` acessível • 2 arquivos de backup da OS no código • painéis de debug não usados.
- Logo do topo muito grande (ocupa espaço da tela).
- No banco: tabelas sem uso (`pericias`, `customers`, `webhook_message_log`) e um backup antigo (`_backup_exp_cpf_20260903`). O mesmo banco também guarda o **projeto veicular** (8 funções + 1 tarefa automática).

## 7. Coisas fixas da Bandara (aparecem para outras lojas)

- Logo padrão `bandara-logo.png`, com altura especial "se for Bandara" no PDF da nota.
- PDF da OS gerado pela API `bandara-os-api.onrender.com` (repo antigo).
- Na OS, o atendente "Matheus" aparece em vermelho (nome fixo no código).
- Mensagem de fiado usa "Bandara Motos" se a loja não tiver nome.
- Gerador de PDF com endereço, telefone e Instagram da Bandara fixos.
- Sincronização local com nomes "bandara-motos".
- Teste de pesquisa com seu número pessoal dentro do `AdminMenu` (código morto, não aparece).

## 8. Segurança (anotado para a última etapa)

- 🔴 **URGENTE: `setup-fiados`, `setup-fiado-v2` e `add-birth-date-column`** estão publicadas e **abertas para qualquer pessoa**. Uma única chamada à `setup-fiados` cria uma regra que libera **os fiados de todas as lojas** (nome, telefone, CPF, dívida) para qualquer um. Hoje a regra não existe; basta alguém chamar. São scripts de instalação que já cumpriram o papel: o certo é apagar do servidor.
- 34 de 43 funções sem exigir login: precisa revisar uma por uma (algumas precisam ser abertas: links públicos, webhooks, tarefas).
- `AdminMenu` (apagar fotos, resetar satisfação): não aparece na tela, mas é bom remover o código.
- Já corrigido nesta semana: envio de WhatsApp sem login • caixa, pagamentos e estoque sem exclusão.
- Ainda aberto: fiado que não é de OS não entra no caixa (falha silenciosa, 15 pagamentos em outras lojas).
