# Rodada 1: proposta do Designer

> Conferido no código: `--primary` e `--destructive` são o mesmo vermelho (`356 72% 45%`, index.css), então "Salvar" e "Excluir" têm a mesma cara. O logo do topo tem 128px (`h-32`). No menu, ícones de 36px e nomes de 11px.

## 1. Navegação: barra fixa com 5 botões, sem rolar
**Início | Oficina | Balcão | Dinheiro | Mais**

| Hoje | Vai para |
|---|---|
| 1 Dashboard | **Início**: motos por etapa, agendados de hoje, 3 botões grandes (Abrir OS, Vender peça, Receber), caixa do dia (só o dono) |
| 2 Nova OS + 3 Express | **Fundem** em "Abrir OS". O rápido é o padrão; "Mais dados" abre os campos extras da Nova OS |
| 4 Ordens / 5 Agenda / 6 Oficina | **Oficina**, com 3 abas: Quadro (padrão do mecânico), Ordens, Agenda. "Converter em OS" abre Abrir OS já preenchido |
| 8 Balcão | **Balcão** (notas). A "Venda avulsa" do Estoque some e vira atalho para cá |
| 7 Caixa / 11 Fiados / 10 Boletos | **Dinheiro**, com 3 abas: Caixa do dia, A receber (fiado), Contas a pagar (Boletos renomeado). O alerta de contas por WhatsApp sai de Config → Loja e vem para cá |
| 12 Estoque / 13 Cotação / 14 Encomendas | Mais → **Peças**: Estoque, Faltas e cotação, Encomendas de cliente |
| 9 Relatórios | Mais → **Relatórios**. A aba Pagtos fica só para ler (lançar e estornar só dentro da OS). Mecânicos, relatório detalhado e Balcão viram uma aba "Comissões" |
| 16 Pós-Venda / 17 Satisfação | Mais → **Clientes**: Lembretes, Aniversários, Avaliações |
| 15 Equipe + Colaboradores | Mais → Ajustes → **Equipe**: cada pessoa tem comissão % e, se quiser, login com permissões |
| 18 IA 24h (tela vazia) | Some do menu. Vira Ajustes → **Atendente IA** (junta com Config → IA). Só nos planos Premium e Enterprise |
| 19 Sair | Menu do avatar, no topo |

**Ajustes:**
- Dados da loja
- Horário e formas de pagamento (a IA também usa)
- Oficina (limites da agenda + termos)
- Cobrança online (chave do Asaas)
- WhatsApp (conexão + modelos)
- Equipe
- Atendente IA

**Saídas e mudanças:**
- "Reabrir OS" vira botão dentro da OS entregue, só para o dono.
- Palavras-chave ficam só em Clientes → Lembretes.
- "Minha Conta" vai para o avatar, com o nome "Assinatura SpeedSeek".
- Somem: a engrenagem flutuante (fica só no /super-admin), a tela Mensagens antiga, o /debug-os e os backups.

Dá para fazer tela por tela. O menu novo aponta para as mesmas "views" que o Index.tsx já tem.

## 2. Padrões únicos

### A. BuscaCliente
Hoje cada tela busca de um jeito.

**Nova OS** (`ClientSearch.tsx`):
- Tem 4 botões de tipo. O className força vermelho nos 4, então não dá para ver qual está ativo.
- A busca por nome pega o **primeiro resultado** ("Mostrando o primeiro"), e pode trazer o cliente errado.
- Joga **todas** as motos do cliente no formulário.
- Busca por placa.

**Express** (`ExpressCadastroPage.tsx`):
- Um campo só, que adivinha o tipo (10 dígitos ou mais é telefone, 11 é CPF, o resto é nome).
- Mostra uma lista e depois as motos para tocar.
- **Não busca por placa**, nem traz apelido, Instagram ou nascimento.

**Outras telas:**
- Agenda busca sozinha quando o telefone está completo e mostra um ✓.
- Encomendas busca por nome ou telefone, com lista.
- Balcão **não tem busca**: tudo é digitado à mão.

**Na v2, um componente só:**
- Um campo "Nome, telefone, CPF ou placa" que reconhece o tipo sozinho, inclusive placa no formato ABC1D23.
- Os resultados aparecem enquanto digita, a partir de 3 caracteres. Cada linha mostra nome, final do telefone e placas.
- Ao tocar no cliente, as motos dele aparecem em botões.
- No fim da lista, "Cadastrar novo", já com o que foi digitado.
- Usado em: Abrir OS, Agenda, Balcão, novo fiado e Encomendas.

### B. Formulário cliente + moto
- Ordem dos campos: Telefone primeiro (é a chave do WhatsApp e evita cliente duplicado), Nome, Placa, Modelo.
- "Mais dados" começa fechado: CPF, apelido, nascimento, Instagram, autorizações, marca, ano, cor.
- **Decisão do dono:** hoje o Express exige marca, ano e cor, e a Nova OS exige CPF. A proposta é pedir o CPF só ao virar fiado ou ao cobrar online, como o Balcão já faz.

### C. Receber pagamento (painel que sobe de baixo)
Hoje são 6 jeitos diferentes:
- **OS:** lista com "Cartão" sem separar débito e crédito, mais Fiado e "Cobrar Online".
- **Balcão, Fiados e Caixa:** lista com débito e crédito separados.
- **Encomendas:** atalhos 50% e Tudo.
- **Pagtos:** só 3 formas.

**Na v2, um painel só:**
- "Falta R$ X" em destaque, com o valor já preenchido.
- Atalhos Tudo e Metade.
- Botões grandes: Dinheiro, Pix, Débito, Crédito, Fiado, Link de cobrança.
- Fiado e Asaas passam a ser opções deste painel.

### D. Confirmar ação perigosa
- Hoje convivem dois jeitos: a janela do sistema (AlertDialog) e o `window.confirm` do navegador (Cotação, Balcão, WhatsApp, palavras-chave, SuperAdmin).
- Na v2, um só:
  - A pergunta diz o nome da coisa: "Excluir OS #1234 do João?".
  - Botão vermelho com o verbo, Cancelar à esquerda.
  - Estorno pede o motivo.

### E. Lista com filtro
- Busca no topo que ignora acento em todas as listas.
- Chips de status.
- Linhas de 64px com 3 informações.

### F. Vazio, carregando, erro
- Vazio: uma frase mais o botão de ação.
- Carregando: linhas cinza no formato da lista (skeleton).
- Erro: "Tentar de novo".
- Faixa "Sem internet".
- Tirar os emojis dos títulos.

### G. Etiqueta de etapa e status
As mesmas 4 cores no Quadro, em Ordens e na OS.

## 3. Visual

### Cores
| Papel | Cor |
|---|---|
| Ação principal (uma por tela) | azul #1E5AA8 |
| Entrou dinheiro / pronta | verde #157A3E |
| Pendente / aguardando peça | âmbar #B76E00 |
| Perigo / atrasado | vermelho #C62828 |
| Texto | #14171A |
| Texto secundário | #5B6470 |
| Fundo | #F4F6F8 |

A cor da marca da loja (Bandara #C1272D) fica só no logo e numa faixa do topo. Isso também serve para o white-label.

### Modo claro
- Claro é o padrão no celular, porque no sol o tema escuro reflete.
- O escuro continua opcional para o PC.
- **Decisão do dono.**

### Tipografia
- Fonte Barlow.
- Placa e valores em Barlow Semi Condensed negrito, com números de largura fixa.
- Texto com no mínimo 16px; valores entre 28 e 32px.

### Tamanhos
- Toque mínimo de 48px.
- Uma coluna no celular, duas no PC.
- Logo de 32px.
- No menu, ícones de 24px e nomes de 13px.

### Ícones e animação
- Ícones lucide, sempre com texto.
- Animação só ao confirmar "Recebido".

## 4. Rascunhos
```
INÍCIO                          ABRIR OS                        RECEBER — OS #1234 João
┌────────────────────────┐     ┌────────────────────────┐     ┌────────────────────────┐
│[logo] Bandara    🔔 (M)│     │← Abrir OS              │     │ Falta receber          │
│[Abrir OS][Vender][Receber]   │[Nome, tel, CPF ou placa]│     │ R$ 380,00              │
│ Na oficina hoje        │     │ João Silva  …8629      │     │ Valor [ 380,00 ]       │
│ 2 Aguard. inspeção     │     │ [ABC1D23 CG160][+moto] │     │ [Tudo] [Metade]        │
│ 5 Em serviço           │     │ O que fazer?           │     │ [Dinheiro] [Pix]       │
│ 1 Aguard. peça (âmbar) │     │ [Trocar óleo, revisão] │     │ [Débito]  [Crédito]    │
│ 3 Prontas (verde)      │     │ Mecânico [Carlos  ▾]   │     │ [Fiado] [Link cobrança]│
│ Agenda: 3 hoje   ›     │     │ Atendente [Ana    ▾]   │     │ Dinheiro: recebi [400] │
│ Caixa hoje R$1.240 (dono)    │ ▸ Mais dados           │     │ Troco R$ 20 (NOVO)     │
│ Fiado vencendo: 2  ›   │     │ [   Abrir OS   ] azul  │     │ [ Confirmar R$ 380 ]   │
├────────────────────────┤     └────────────────────────┘     └────────────────────────┘
│Início Oficina Balcão Dinheiro Mais│
```
- Abrir OS de cliente que já existe: 4 a 5 toques.
- Receber à vista: 2 toques.

## 5. Mudança × problema do inventário
| Mudança | Resolve |
|---|---|
| Menu de 5 botões com Mais | 5.15 e 5.16 |
| Abrir OS único | 5.2 |
| Painel Receber | 5.3, 5.4 e 5.5 |
| Venda só no Balcão | 5.1 |
| Comissões | 5.6 |
| Equipe única | 5.7 |
| Palavras-chave em um lugar | 5.8 |
| Mensagens | 5.9 |
| Ajustes | 5.10 e 5.11 |
| Clientes (Pós-Venda + Satisfação) | 5.12 |
| Contas a pagar | 5.13 |
| Atendente IA | 5.14 e a tela vazia |
| Remoções e logo | Seção 6 |
| Ação em azul e perigo em vermelho | primary igual a destructive |

**Itens NOVO:** troco no dinheiro e "cadastrar novo" já preenchido.

**Ordem sugerida:**
1. Cores, fonte e menu.
2. BuscaCliente.
3. Receber pagamento.
4. Abrir OS.
5. Resto, área por área.

**Decisões do dono:** modo claro como padrão; CPF deixa de ser obrigatório na OS.
