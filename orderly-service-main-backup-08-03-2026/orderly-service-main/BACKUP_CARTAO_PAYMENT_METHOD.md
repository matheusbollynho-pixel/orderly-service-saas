# Backup - Adição de Método de Pagamento 'Cartão'

**Data:** 28 de janeiro de 2026
**Commit:** `03b903d` - fix: adicionar 'cartao' como método de pagamento válido na tabela cash_flow

## Problema Original
Ao tentar salvar uma transação no Fluxo de Caixa com a opção **Cartão** como método de pagamento, o sistema retornava erro **400 Bad Request** do Supabase.

**Erro:** `xqndblstrblqleraepzs.supabase.co/rest/v1/cash_flow?select=*:1 Failed to load resource: the server responded with a status of 400`

## Causa
A tabela `cash_flow` tinha uma constraint que aceitava apenas estes valores para `payment_method`:
- `dinheiro`
- `pix`
- `credito`
- `debito`
- `transferencia`
- `outro`

Mas o formulário tentava enviar `cartao`, que não estava na lista de valores permitidos.

## Solução Implementada

### 1. Arquivo Original (Antes)
**Arquivo:** `supabase/migrations/202601262000_create_cash_flow.sql`

```sql
payment_method TEXT CHECK (payment_method IN ('dinheiro', 'pix', 'credito', 'debito', 'transferencia', 'outro')),
```

### 2. Arquivo Modificado (Depois)
**Arquivo:** `supabase/migrations/202601262000_create_cash_flow.sql`

```sql
payment_method TEXT CHECK (payment_method IN ('dinheiro', 'pix', 'cartao', 'credito', 'debito', 'transferencia', 'outro')),
```

### 3. Migração Criada
**Arquivo:** `supabase/migrations/202601280400_add_cartao_payment_method.sql`

```sql
-- Adicionar 'cartao' como método de pagamento válido na tabela cash_flow
-- Remover a constraint antiga
ALTER TABLE cash_flow DROP CONSTRAINT cash_flow_payment_method_check;

-- Adicionar a nova constraint com 'cartao' incluído
ALTER TABLE cash_flow ADD CONSTRAINT cash_flow_payment_method_check 
  CHECK (payment_method IN ('dinheiro', 'pix', 'cartao', 'credito', 'debito', 'transferencia', 'outro'));
```

## Como Restaurar (Se Necessário)

Se precisar desfazer essa mudança:

```sql
ALTER TABLE cash_flow DROP CONSTRAINT cash_flow_payment_method_check;

ALTER TABLE cash_flow ADD CONSTRAINT cash_flow_payment_method_check 
  CHECK (payment_method IN ('dinheiro', 'pix', 'credito', 'debito', 'transferencia', 'outro'));
```

## Status
✅ **Implementado e Testado**
- Migração criada e commitada
- Push realizado ao repositório
- Testado localmente em `http://localhost:8080/`
- Funcionalidade de selecionar "Cartão" no Fluxo de Caixa está operacional

## Arquivos Alterados
1. `supabase/migrations/202601262000_create_cash_flow.sql` - Adicionado 'cartao' na constraint
2. `supabase/migrations/202601280400_add_cartao_payment_method.sql` - Nova migração para aplicar a mudança

## Git Commit
```
commit 03b903d
Author: [seu-usuario]
Date:   28 de janeiro de 2026

    fix: adicionar 'cartao' como método de pagamento válido na tabela cash_flow
    
    - Adicionado 'cartao' como opção válida de payment_method
    - Criada migração para atualizar constraint na tabela cash_flow
    - Testes passando em ambiente local
```
