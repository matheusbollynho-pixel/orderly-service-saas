# Plano da v2: SpeedSeekOS

Fechado pelo time de produto (Designer, Dev e Crítico-cliente) em 12/11/2026.
- Nota final do crítico: **8/10**, "vale a troca".
- Detalhes de cada rodada ficam em `docs/v2/rodadas/`.
- **Nenhum código muda antes de o dono aprovar.**

## A ideia em 3 linhas
- O sistema não é reescrito. Ele é **reorganizado e padronizado por partes**, sempre no ar.
- O menu de 19 botões vira **5 fixos**: Início, Oficina, Balcão, Caixa e Mais.
- Cada função tem **um jeito só** de funcionar (busca de cliente, receber pagamento, confirmar ação). As telas são desenhadas **primeiro para o celular** e depois adaptadas ao PC.

## 1. Navegação
| Área | O que tem |
|---|---|
| **Início** | Botões Abrir OS / Vender / Receber • motos por etapa • agenda de hoje • caixa do dia (com olho para esconder) • fiados vencendo |
| **Oficina** | Quadro • Ordens (a busca acha também OS entregues) • Agenda. "Abrir OS" substitui Nova OS e Express |
| **Balcão** | Vendas (botão principal: **Venda rápida**, cliente "Consumidor") • Encomendas |
| **Caixa** | Hoje • **Fiado** (com juros, cobrança no WhatsApp, receber e fiado avulso) • Contas a pagar (os "Boletos" de hoje) |
| **Mais** | Peças (Estoque, Faltas e cotação) • Relatórios (Pagtos abre a OS para corrigir; Comissões) • Clientes (Lembretes, Aniversários, Avaliações) • Ajustes (Loja, Horário e pagamentos, Oficina, Cobrança online, WhatsApp, Equipe, Atendente IA) • busca "Onde está…?" |
| **Avatar** | Assinatura SpeedSeek • Sair |

- **Saem:** IA 24h (tela vazia), o `AdminMenu` (código morto que nunca aparece), Mensagens antigas, /debug-os e os backups.
- **Função fora do plano:** aparece com cadeado e "Disponível no Pro". Toda navegação passa por uma porta só, que confere plano e permissão.
- **Tela inicial por aparelho:** o celular do mecânico abre direto no Quadro.
- **Aviso único na Bandara:** "Nova OS e Express agora são Abrir OS".

### 1.1 Configurações × menu (pedido do dono, 12/11)
**A engrenagem do topo (Configurações) é o painel de administração do cliente e continua.** O que muda é o que fica dentro dela.

**Regra:** Configurações (Ajustes) guarda o que se ajusta uma vez. O que se usa no dia a dia fica no menu, perto de onde é usado.

| Hoje em Configurações | Problema | Vai para |
|---|---|---|
| Ferramentas → Reabrir OS | **fica onde está** (decisão do dono, 12/11): escondido em Configurações para que qualquer um não reabra OS pronta | continua em Configurações. Na etapa de segurança, ganha **PIN do dono** (junto com estornar e excluir) |
| Ferramentas → Palavras-chave | aparece em 2 lugares (aqui e em Pós-Venda) | só em Clientes → Lembretes |
| Loja → Alerta de boletos no WhatsApp | fica longe dos boletos | Caixa → Contas a pagar |
| Loja → Limites de agendamento | fica longe da agenda | ajuste dentro da Agenda |
| Loja → Chave do Asaas | está misturada com os dados da loja | Ajustes → Cobrança online |
| Loja → Horário e formas de pagamento | quem usa é a IA | Ajustes, com o aviso "a IA usa isso" |
| Colaboradores (logins) × Equipe (menu) | parecem a mesma coisa | Ajustes → Equipe: a pessoa, a comissão e o login (opcional) |
| Minha Conta (assinatura) | é do SpeedSeek, não da oficina | menu do avatar |

**Ajustes final:** Dados da loja • Horário e pagamentos • Oficina (termos) • WhatsApp (conexão + mensagens) • Cobrança online • Equipe • Atendente IA.

## 2. Padrões únicos (o mesmo em todo lugar)
| Padrão | Como fica |
|---|---|
| **BuscaCliente** | Um campo para nome, telefone, CPF ou placa (com ou sem hífen). Mostra lista; ao escolher o cliente, as motos aparecem em botões; "Cadastrar novo" já vem preenchido. Usado em Abrir OS, Agenda, Balcão, Fiado e Encomendas |
| **Cliente + moto** | Telefone, Nome, Placa, **KM**, Modelo. "Mais dados" começa fechado. CPF opcional (só é pedido no fiado e no link de cobrança) |
| **Receber pagamento** | Painel que sobe de baixo: "Falta R$ X", [Tudo] [Dividir], Dinheiro / Pix / Débito / Crédito / Fiado / Link. Fica aberto até zerar e tem o Confirmar fixo no rodapé. **A tela é a mesma; a gravação continua separada por origem** |
| **Confirmar ação** | Diz exatamente o que vai acontecer ("Excluir OS #1234 do João?"). Estornar e Reabrir pedem o motivo |
| **Listas** | Busca sem acento, até 4 filtros. Cartões no celular, tabela no PC |
| **Estados** | Vazio com ação • carregando • erro com "Tentar de novo" • faixa "Sem internet" |
| **Etapa da moto** | Mesmas 4 cores no Quadro, em Ordens e na OS. O mecânico tem botões [Aguardando peça] e [Pronta], mais "Desfazer" por 5 segundos |

Botões principais (Abrir OS, Confirmar) ficam **fixos no rodapé**, porque o teclado do celular os esconderia.

## 3. Visual
| Papel | Cor |
|---|---|
| Ação principal | azul |
| Dinheiro que entrou / moto pronta | verde |
| Pendente / aguardando peça | âmbar |
| Perigo / atraso | vermelho (só para isso) |

- A cor da loja aparece só no logo, que cai de 128px para 32px, e numa faixa no topo.
- Fonte Barlow, com texto de no mínimo 16px e valores grandes.
- Área de toque de no mínimo 48px (56px nos botões de etapa e de pagamento).
- Ícones sempre acompanhados de texto, sem emoji.

## 4. Ordem de execução (cada parte vai ao ar sozinha)
| # | Tam. | O quê | Mexe no banco? |
|---|---|---|---|
| 1 | P | Limpeza: backups, código morto, /debug-os, botão IA 24h | Não |
| 2 | P | **Fiado recebido entra no caixa** (bug dos 15 pagamentos perdidos) | Só para recuperar os 15 |
| 3 | P | **Conserto do aviso de moto pronta** (nunca funcionou): conta da OS marcada Concluída, só as últimas 24h e com senha | Publicar a função |
| 4 | P | "Excluir" deixa de ser igual a "Salvar", fonte nova, logo menor | Não |
| 5 | P | Placas sem hífen (busca acha ABC-1234 e ABC1234) | Sim |
| 6 | M | Menu de 5 + porta única de navegação + tela inicial por aparelho (menu antigo fica disponível por 1 semana) | Não |
| 7 | M | Confirmação única (substitui 11 janelas diferentes) | Não |
| 8 | M | Início novo atrás de chave + lista "A receber" | Não |
| 9 | M | BuscaCliente: Agenda → Encomendas → Balcão | Não |
| 10 | M | **Oficina simplificada** (hoje a loja não usa as etapas) + Quadro e status da OS andando juntos + [Avisar agora]. Passa antes pelo pente fino com o time | Não |
| 11 | G | Quebrar a tela da OS (2.400 linhas) e tirar a gravação de pagamento de dentro da tela | Não |
| 12 | G | Abrir OS com a pergunta "Cliente espera ou deixa a moto?" (deixa = CPF + assinatura + checklist obrigatórios). Nova OS e Express continuam até a Bandara aprovar | Não |
| 13 | G | Receber pagamento único: Encomenda → Fiado → Balcão → OS | Não |
| 14 | G | Azul e troca das cores fixas, tela por tela | Não |

Partes 1 a 5 são consertos e preparação. A Bandara só sente diferença a partir da 6. Cada parte é testada **em modo local** e só vai ao ar com aprovação (decisão 7).

### Depois: pente fino em cada função (pedido do dono, 12/11)
Com a casca padronizada, passar **função por função** e simplificar o fluxo por dentro, como foi feito na Cotação.

**O que a Cotação mostrou que funciona:**
- passos numerados na ordem do trabalho real;
- uma ação clara em cada passo;
- nomes do dia a dia;
- nada que obrigue a adivinhar.

**Candidatas, por uso:** OS por dentro (a tela de 2.400 linhas), Balcão, Fiado, Caixa, Estoque (cadastro com 45 campos), Agenda, Pós-venda/Lembretes e Relatórios.

**Como cada uma roda:**
1. `/time-produto` com o pedido "pente fino na função X".
2. O crítico percorre o fluxo real.
3. O designer propõe a versão simplificada.
4. O dev diz como fazer sem quebrar.
5. O dono aprova.
6. A mudança entra como uma fatia.

## 5. Decisões do dono (respondidas em 12/11/2026)
| # | Decisão | O dono decidiu |
|---|---|---|
| 1 | Assinatura e CPF na OS | **Depende do serviço.** Serviço rápido, com o cliente esperando a moto: não exige nada. Cliente que **deixa a moto**: exige CPF, assinatura e checklist completos, para não ter imprevisto. O "Abrir OS" pergunta isso logo no começo ("Cliente vai esperar?" / "Vai deixar a moto?") e cobra os campos conforme a resposta, como Express × Nova OS fazem hoje. |
| 2 | Tema | **Manter a chave claro/escuro em cada aparelho**, sem padrão forçado. Na loja, um PC usa claro e outro escuro; o dono usa escuro. Os dois temas precisam ficar bons. |
| 3 | Valor do caixa | Começa escondido (olho). ✅ |
| 4 | CPF | Mesma regra da decisão 1. |
| 5 | "Moto pronta" para o aviso | A loja **não usa o Quadro com as etapas**; muda o status direto na OS. Então o aviso conta a partir da **OS marcada como Concluída** (só as últimas 24h, nada retroativo). O **Quadro/Oficina precisa ser simplificado** para a loja conseguir usar: vai para o pente fino, e Quadro e status da OS passam a andar juntos. |
| 6 | Os 15 fiados fora do caixa | **Lançar com a data em que cada um foi acertado**, depois de o dono conferir a lista. |
| 7 | Como liberar a v2 | **Testar em modo local primeiro** (no computador, antes de publicar), depois atualizar tudo de uma vez. Cada parte só vai ao ar depois de testada localmente e aprovada. |

## 6. Pendências e onde o time discordou
- **Reabrir OS:** continua escondido em Configurações (decisão do dono). A proteção de verdade vem com o PIN do dono, na etapa de segurança.
- **Atendente lembrado:** no celular, sim. No PC do balcão, escolher a cada OS (senão a comissão vai para a pessoa errada).
- **Segurança:** fica para depois, com uma exceção urgente: apagar as 3 funções antigas abertas (`setup-fiados` e outras).

## 7. Ideias para depois (só anotadas, não estão no plano)
- **Gestão financeira para o dono** (pedido 12/11/2026): ajudar o proprietário com o que ensinam nos cursos de gestão financeira. Exemplos: recomendação de quanto comprar/gastar, separar custos fixos e variáveis, preço certo (margem), capital de giro, ponto de equilíbrio e pró-labore. Usa os dados que o sistema já tem (caixa, contas a pagar, estoque, vendas). Entra depois da v2 e do pente fino, passando pelo time de produto.
- **IA 24h como vitrine** (dono, 12/11): o botão antigo existia para chamar quem está no teste (ou sem o plano com IA) a assinar, com cadeado e convite de upgrade. Para quem tinha o plano, abria tela vazia; por isso saiu na parte 1. **Refazer depois, chamando atenção:** sem o plano, uma vitrine do que a IA faz (atende no WhatsApp 24h, agenda, responde preço), com botão para assinar. Com o plano, um resumo do que a IA fez ("atendeu X clientes, marcou Y agendamentos"). Passa pelo time de produto.

## Relatórios v2 (pente fino com o time, 13/11/2026)
Detalhe em `docs/v2/rodadas/P-relatorios-final.md` (+ designer, dev, critico). Nota final do crítico: 8/10 com 3 ajustes, já incorporados abaixo.

**Por que mexer:** os relatórios de OS só enxergam as últimas 200 OS e cada aba conta por uma data diferente (updated_at faz OS pular de mês); "Faturado" é só mão de obra; a comissão usa a % de hoje; Pagtos mexe em dinheiro; console.log a cada render.

**4 abas, 1 período (comparando com o mesmo pedaço do mês anterior):**
- **Resumo:** Vendeu -> Ficou a receber -> Entradas (= Caixa) -> Saídas (= Caixa) -> Saldo (sobrou) -> Pra pagar (contas + comissão + encomendas a pagar se houver campo) -> Atenção (estornos com quem/motivo, descontos, fiado vencido). **A conta tem que fechar na tela**: linha explicando a diferença Vendeu x Entradas (sinal recebido antes, desconto, vendas antigas).
- **Comissões:** mecânicos + atendentes, produziu / a pagar / pago, [Marcar pago].
- **Oficina:** motos paradas agora por etapa, top 10 serviços por mão de obra, OS por mecânico.
- **Peças:** lucro das peças vendidas (peça sem custo fica FORA do lucro, com aviso), top 10 por lucro, valor do estoque, abaixo do mínimo.
- Sai: Hoje, ticket médio, NPS/novos x voltaram (Satisfação vai pra Mais > Clientes > Avaliações), peças por mecânico. Pagtos vira lista só leitura e só sai quando a OS fizer o mesmo com os mesmos toques.

**Regras:** fuso America/Bahia; dinheiro = data do caixa; venda de OS = exit_date (gatilho); nota = finalized_at; nunca updated_at; nomes iguais ao Caixa; aceite = outubro bate no centavo com Caixa > Mês. Contas no banco (RPC que confere loja e permissão), staleTime 5 min, sem recarga automática.
**Permissões:** `relatorios` (Resumo/Oficina/Peças) e nova `comissoes`; desligadas pra colaborador; valores abrem escondidos (olho). "Minha comissão" só depois de confirmar o vínculo login-pessoa (Bandara usa login único).

**Fatias:** 1 tirar console.log/emoji • 2 migration exit_date (24 OS entregues sem data hoje) • 3 RPC relatorio_resumo + Resumo novo atrás de chave • 4 barra de período + comparação; depois Pagtos • 5+7 JUNTAS: % de comissão guardada + aba Comissões + permissão + marcar pago lança no Caixa com opção [Já lancei à mão] • 6 Oficina e Peças • 8 toque "voltou na garantia" na OS (começa a juntar dado; relatório de retorno depois) • 9 Minha comissão.
**Discordância resolvida:** crítico pediu comissão no Caixa junto com o marcar pago (designer/dev queriam depois): fica junto, com a trava "Já lancei à mão". Retorno de garantia: sem campo hoje; entra o toque na OS agora e o relatório quando houver dado.
**Feito antes (13/11):** índices por OS em materials/payments/checklist_items (574 mi de leituras completas cada) e saldo_os fechada.
**Semana de acerto (dono, 13/11):** a Bandara paga os mecânicos todo sábado, semana de domingo a sábado. Hoje a "Semana atual" começa na SEGUNDA (ReportsPage.tsx startOfWeek) e conta pela última edição: corrigir. A aba Comissões abre em [Esta semana] / [Semana passada] (dom-sáb); o dia do acerto vira configuração da loja (padrão sábado); "marcar pago" fecha a semana do mecânico de uma vez.
**Filtro de período único (dono, 13/11):** mesmo componente no Caixa e nos Relatórios: [Dia] [Semana] [Mês] [Escolher datas] (de-até livre). [Semana] segue o "dia do acerto" da loja (Ajustes, padrão sábado; Bandara = dom-sáb; quem paga na sexta = sáb-sex). Hoje o Caixa tem semana fixa seg-sáb (useCashFlow.ts, domingo fica fora) e os Relatórios seg-hoje: os dois passam a usar o filtro novo.
**Decisão do dono (13/11): comissão paga NÃO lança no Caixa.** Fica para a área de Financeiro (gestão financeira completa, depois). No Resumo: "Saldo (sobrou)" vira **"Saldo do caixa"** (Entradas - Saídas, igual ao Caixa) e logo abaixo, visível, **"Comissões pagas no período: R$ X"**. O "quanto sobrou de verdade" vai para o Financeiro. Fatia 7 sai do plano; a fatia 5 (Comissões + marcar pago) vai sozinha.
