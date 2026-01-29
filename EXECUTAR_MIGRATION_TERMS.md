# 🔧 Migration - Salvar Aceitação de Termos

## Problema Corrigido
O checkbox de aceitar os termos da OS estava sendo desmarcado quando a OS era reaberta.

## Solução Implementada
Adicionado um campo `terms_accepted` à tabela `service_orders` para persistir o estado de aceitação dos termos.

## Arquivos Modificados

### 1. [src/types/service-order.ts](src/types/service-order.ts)
- Adicionado campo `terms_accepted?: boolean` à interface `ServiceOrder`

### 2. [src/components/OrderDetails.tsx](src/components/OrderDetails.tsx)
- Atualizado `termsAccepted` para carregar do `order.terms_accepted`
- Modificado `handleTermsChange` para salvar via `onUpdateOrder`
- Adicionado prop `onUpdateOrder` à interface `OrderDetailsProps`

### 3. [src/pages/Index.tsx](src/pages/Index.tsx)
- Adicionado `onUpdateOrder={updateOrder}` ao componente `<OrderDetails>`

### 4. [src/integrations/supabase/types.ts](src/integrations/supabase/types.ts)
- Adicionado `terms_accepted: boolean` em `Row`, `Insert` e `Update` da tabela `service_orders`

### 5. [supabase/migrations/202601290002_add_terms_accepted_column.sql](supabase/migrations/202601290002_add_terms_accepted_column.sql)
- Nova migration para adicionar a coluna `terms_accepted`

## Como Aplicar

### Via Supabase Dashboard
1. Acesse: https://app.supabase.com/project/xqndblstrblqleraepzs/sql/new
2. Cole este comando:
```sql
ALTER TABLE public.service_orders
ADD COLUMN terms_accepted BOOLEAN DEFAULT false;
```
3. Clique em "RUN"

### Pronto! ✅
Agora quando você marcar o checkbox de termos, ele será salvo no banco de dados e permanecerá marcado ao reabrir a OS.
