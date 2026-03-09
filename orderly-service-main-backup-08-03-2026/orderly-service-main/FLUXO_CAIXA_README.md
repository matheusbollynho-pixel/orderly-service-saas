# Sistema de Fluxo de Caixa - Implementado ✅

## O que foi implementado:

### 1. **Banco de Dados** 
- Tabela `cash_flow` criada com todos os campos necessários
- Triggers automáticos para registrar pagamentos de OS no fluxo de caixa
- Triggers para remover do fluxo quando um pagamento é excluído

### 2. **Backend/Hook**
- `useCashFlow.ts` - Hook completo para gerenciar o fluxo de caixa
- Busca de transações por data
- Cálculo automático de resumo (entradas, saídas, saldo)
- Criação, edição e exclusão de registros

### 3. **Interface**
- Página completa de Fluxo de Caixa (`CashFlowPage.tsx`)
- Visualização de resumo diário (cards coloridos)
- Lista de entradas (verde) e saídas (vermelho)
- Formulário para adicionar saídas manualmente
- Seletor de data para consultar outros dias

### 4. **Integração Automática**
- ✅ Pagamentos de OS são registrados **automaticamente** como entradas
- ✅ Descrição inclui nome do cliente e equipamento
- ✅ Forma de pagamento é registrada
- ✅ Ao excluir um pagamento, remove do fluxo automaticamente

### 5. **Navegação**
- Link "Caixa" adicionado ao menu inferior (apenas para admin)
- Rota `/fluxo-caixa` configurada

## Como aplicar a migration:

### Opção 1: Via Supabase Dashboard (Recomendado)
1. Acesse o dashboard do Supabase
2. Vá em **SQL Editor**
3. Copie o conteúdo de `supabase/migrations/202601262000_create_cash_flow.sql`
4. Cole e execute o SQL

### Opção 2: Via CLI do Supabase
```bash
cd c:\Users\Bollynho\Desktop\sites\orderly-service-main
supabase db push
```

## Funcionalidades:

### ✅ Entradas Automáticas
- Quando um pagamento é registrado em uma OS, automaticamente cria uma entrada no fluxo de caixa
- Descrição: "Pagamento OS - [Nome Cliente] ([Moto])"
- Categoria: "Ordem de Serviço"
- Forma de pagamento registrada

### ✅ Saídas Manuais
- Adicione saídas como:
  - Compra de peças
  - Retiradas do caixa
  - Despesas gerais
  - Pagamento de fornecedores

### ✅ Visualização em Tempo Real
- Cards com totais do dia
- Saldo calculado automaticamente
- Listas separadas de entradas e saídas
- Horário de cada transação

### ✅ Controles
- Seletor de data para ver dias anteriores
- Exclusão de registros manuais
- Entradas automáticas (de pagamentos) não podem ser excluídas manualmente

## Próximos passos sugeridos:

1. ✅ Aplicar a migration no banco
2. ✅ Testar criando um pagamento em uma OS
3. ✅ Verificar se aparece automaticamente no fluxo de caixa
4. ✅ Adicionar algumas saídas manualmente
5. ✅ Conferir o cálculo do saldo

## Melhorias futuras possíveis:

- Relatório mensal de fluxo de caixa
- Exportação para Excel/PDF
- Gráficos de entradas vs saídas
- Categorias customizáveis
- Filtros por categoria ou forma de pagamento
- Fechamento de caixa diário com conferência
