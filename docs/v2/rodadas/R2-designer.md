# Rodada 2: Designer (versão final)

> Conferido: o aviso de moto pronta já existe (`supabase/functions/os-pronta-aviso`). Roda de 2 em 2 horas, das 8h às 18h. Só avisa motos prontas há 4 horas ou mais (`AVISO_RETIRADA_HORAS`) que ainda não foram avisadas. O botão [Avisar agora] é NOVO.

## 1. Navegação
**Celular:** barra fixa de 64px, sem rolagem lateral, com 5 itens: **Início | Oficina | Balcão | Caixa | Mais**. Ícones de 24px e nomes de 13px.

**PC:** coluna à esquerda, com o "Mais" já aberto.

### O que tem em cada área
- **Início:** botões Abrir OS, Vender e Receber • motos por etapa • agenda de hoje • caixa do dia, com olho para esconder o valor • fiados vencendo.
- **Oficina:**
  - Abas Quadro, Ordens e Agenda.
  - "Abrir OS" substitui Nova OS e Express.
  - "Converter" na Agenda abre o Abrir OS já preenchido.
- **Balcão:**
  - Abas Vendas e **Encomendas** (2 toques).
  - **Venda rápida** é o botão principal.
  - A venda avulsa do Estoque e a venda pelo Caixa viram atalhos para cá.
- **Caixa:**
  - Abas Hoje, **Fiado** e Contas a pagar.
  - Aqui só se lança entrada e saída sem produto.
- **Mais:**
  - Peças: Estoque, Faltas e cotação.
  - Relatórios: Pagtos (só leitura) e Comissões.
  - Clientes: Lembretes (com palavras-chave), Aniversários, Avaliações.
  - Ajustes: Loja, Horário e pagamentos, Oficina, Cobrança online, WhatsApp, Equipe, Atendente IA.
- **Avatar:** Assinatura SpeedSeek e Sair.

### O que sai
IA 24h, a engrenagem flutuante, Mensagens antigas, /debug-os e os backups.

### Regras gerais
- **Função fora do plano:** aparece com cadeado e a mensagem "Disponível no Pro".
- **Navegação:** tudo passa por `goTo(view)`.
- **Tela inicial por aparelho:** escolha entre "Início" ou "Quadro", salva no próprio aparelho. Colaborador com acesso só à oficina cai no Quadro.

## 2. Padrões únicos (celular / PC)
Os padrões abaixo cuidam só da tela. A gravação continua nos adaptadores do Dev.

### A. BuscaCliente
Usada em: Abrir OS, Agenda, Balcão, Fiado e Encomendas.
- **Celular:**
  - Campo único "Nome, telefone, CPF ou placa".
  - A lista aparece a partir de 3 letras. Cada linha mostra nome, final do telefone e placas.
  - Ao escolher o cliente, as motos aparecem como botões.
  - "Cadastrar novo" já vem com o que foi digitado.
- **Placa:** a busca ignora hífen, espaço e maiúscula. A placa é salva sem hífen e em maiúscula. A comparação sem hífen também tem que valer no banco.
- **PC:** lista embaixo do campo; setas e Enter escolhem.

### B. ClienteMotoForm
- **Celular:**
  - Uma coluna: Telefone, Nome, Placa, **KM**, Modelo.
  - Cada campo abre o teclado certo: numérico no telefone e no KM, maiúsculas na placa.
- **"Mais dados"** (começa fechado): CPF, apelido, nascimento, Instagram, marca, ano, cor e retirada por outra pessoa.
- KM e retirada gravam no mesmo formato de hoje, então o PDF não muda.
- **PC:** 2 colunas.

### C. ReceberPagamento
- **Celular:** painel que sobe de baixo, até 90% da tela.
  - Mostra "Falta R$ X", com o valor já preenchido.
  - Botões [Tudo] e [Dividir].
  - Formas de pagamento em botões de 56px, 2 colunas: Dinheiro, Pix, Débito, Crédito, **Fiado**, Link.
  - Botão de confirmar fixo no rodapé.
- **Pagamento parcial:** o painel continua aberto.
  - Mostra "Recebido: Pix R$ 200 / Falta R$ 180", já com os R$ 180 preenchidos.
  - Fecha quando o valor zera ou com "Deixar o resto em aberto".
- **Fiado e Link:**
  - Pedem o CPF se o cliente não tiver.
  - Fiado não pode ficar no cliente "Consumidor".
- **PC:** janela lateral de 420px.

### D. ConfirmarAcao
- A pergunta diz exatamente o que vai acontecer: "Excluir OS #1234 do João?".
- Estornar e Reabrir pedem o motivo.
- **Celular:** painel de baixo, com o botão do verbo (vermelho) em cima e Cancelar embaixo.
- **PC:** janela no centro, com Cancelar à esquerda.

### E. Lista com filtro
- Busca que ignora acento.
- No máximo 4 chips; o resto vai para "Filtros (n)".
- **Celular:** cartões de 64px com 3 informações.
- **PC:** tabela.

### F. Estados da tela
- **Vazio:** uma frase e o botão da ação.
- **Carregando:** linhas cinza no formato do conteúdo (skeleton).
- **Erro:** botão [Tentar de novo].
- **Sem internet:** faixa avisando.

### G. Etiqueta de etapa
As mesmas 4 cores no Quadro, em Ordens e na OS.

## 3. Visual
| Papel | Cor |
|---|---|
| Ação principal | azul #1E5AA8 |
| Dinheiro que entrou / pronta | verde #157A3E |
| Pendente / aguardando peça | âmbar #B76E00 |
| Perigo / atrasado | vermelho #C62828 |
| Texto / secundário / fundo | #14171A / #5B6470 / #F4F6F8 |

- **Cor da loja:** só no logo (32px) e numa faixa no topo. Isso também serve para white-label.
- **Transição de cor:**
  - Na fatia 3, o botão de perigo fica vermelho só no contorno e o botão principal fica sólido. "Salvar" e "Excluir" deixam de ser iguais, mesmo com o primary ainda vermelho.
  - Na fatia 9, entra o azul, tela por tela.
- **Fonte:** Barlow, no mínimo 16px. Placa e valores em Barlow Semi Condensed negrito, com números de largura fixa, entre 28 e 32px.
- **Toque:** mínimo de 48px; 56px nos botões de etapa e de pagamento.
- **Ícones:** lucide, sempre com texto, sem emoji.
- **Animação:** só no "Recebido".

## 4. Rascunhos (celular)
```
INÍCIO                        ABRIR OS                      RECEBER (painel de baixo)     QUADRO (celular do mecânico)
┌──────────────────────┐     ┌──────────────────────┐     ┌──────────────────────┐     ┌──────────────────────┐
│[logo] Bandara     (A)│     │← Abrir OS            │     │OS #1234 João  CG160  │     │Quadro           [🔍] │
│[Abrir OS][Vender]    │     │[Nome,tel,CPF,placa ] │     │Falta R$ 380,00       │     │[Inspeção 2][Serviço 5]│
│[Receber ›]           │     │João Silva …8629      │     │Valor [ 380,00 ]      │     │[Peça 1]   [Pronta 3] │
│Na oficina            │     │[ABC1D23 CG160][+moto]│     │[Tudo]  [Dividir]     │     │┌────────────────────┐│
│ 2 Inspeção  5 Serviço│     │KM [ 23.450 ]         │     │[Dinheiro] [Pix]      │     ││ABC1D23   CG 160    ││
│ 1 Peça     3 Prontas │     │O que fazer?          │     │[Débito]  [Crédito]   │     ││Troca óleo + freio  ││
│Agenda hoje: 3      › │     │[Troca óleo, freio  ] │     │[Fiado]   [Link]      │     ││[ Próxima etapa → ] ││
│Caixa hoje R$ ••• [👁]│     │Mecânico [Carlos][Zé] │     │Recebido: Pix 200     │     │└────────────────────┘│
│Fiado vencendo: 2   › │     │Atendente: Ana (troca)│     │Falta R$ 180 (aberto) │     │ ✓ Pronta. Aviso auto  │
├──────────────────────┤     │▸ Mais dados          │     │[ Confirmar R$ 180 ]  │     │ por volta das 14h     │
│Início Ofic Balc Caixa│     │[    Abrir OS    ]    │     └──────────────────────┘     │ [Avisar agora] [Ok]  │
└──────────────────────┘     └──────────────────────┘                                  └──────────────────────┘
```
- **Receber no Início:** abre a lista do que há para receber (OS prontas com saldo, notas abertas, fiados vencendo), com busca no topo.
- **Abrir OS de cliente que já veio:** 3 a 4 toques e 3 digitações. O atendente fica lembrado no aparelho.
- **Venda rápida:** 5 toques e 1 digitação.
- **Quadro no PC:** 4 colunas, com botão e arrastar.

## 5. Ponto levantado → como resolvi
| Ponto | Resolução |
|---|---|
| KM | Campo logo depois da placa, no formato atual |
| Aviso de pronta | Mostra "Aviso automático por volta das Xh". [Avisar agora] (NOVO) avisa só essa OS e marca `aviso_retirada_enviado_em`; nunca em lote |
| Venda rápida | Botão principal do Balcão, com "Consumidor" como padrão |
| "Fiado" | Mantido como aba do Caixa e como botão no Receber |
| Caixa com 1 login | Olho para esconder, salvo no aparelho. É conforto, não segurança |
| Reabrir "só o dono" | Pede motivo e fica registrado. O PIN (NOVO) fica para a etapa de segurança |
| Receber no Início | Abre a lista do que há para receber |
| "Metade" | Vira [Dividir], com o painel aberto até zerar |
| Mecânico | Aparelho abre no Quadro, com botão de 56px |
| Encomendas | Aba do Balcão, a 2 toques |
| Placa com hífen | Comparação sem hífen e gravação sem hífen, em maiúscula |
| Toques no Abrir OS | Atendente lembrado; mecânico em chips |
| Express como texto (Dev) | OS nova sem a marca; as antigas continuam lidas como hoje |
| Gravação separada (Dev) | O painel só cuida da tela; os adaptadores ficam com o Dev |
| Plano furado (Dev) | Navegação só por `goTo`; ids `new`/`express` mantidos |
| Tema (Dev) | Pergunta uma vez por aparelho |
| Retirada e lembrete do Express | Mesmo formato; o lembrete continua sendo criado na abertura |

## 6. Decisões para o dono
1. **Assinatura na OS:** recomendo não bloquear. Mostrar "Coletar agora" ou "Seguir sem", como o Express já faz.
2. **Tema claro:** padrão nas lojas novas. Na Bandara, perguntar em cada aparelho.
3. **Olho do caixa:** começa escondido e volta a esconder ao sair do Início.
4. **CPF opcional na OS:** sim. Pedir só quando for lançar fiado ou gerar link.
