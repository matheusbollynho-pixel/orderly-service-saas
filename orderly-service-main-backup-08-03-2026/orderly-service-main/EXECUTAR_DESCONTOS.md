# 🚀 Executar Migrations de Descontos - Passo a Passo

## ⚠️ IMPORTANTE: Execute NESTA ORDEM

Vá para: **Supabase Dashboard → SQL Editor** e execute cada script abaixo, **um de cada vez**, aguardando sucesso antes de passar ao próximo.

---

## ✅ PASSO 1: Adicionar coluna de desconto em R$

```sql
-- Adiciona desconto em valor absoluto (R$) para pagamentos
ALTER TABLE public.payments
ADD COLUMN IF NOT EXISTS discount_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0);
```

**Resultado esperado:** ✅ Sem erro (pode retornar "column already exists" se já tiver)

---

## ✅ PASSO 2: Atualizar cash_flow para considerar desconto

```sql
-- Corrige integração de pagamentos com fluxo de caixa considerando desconto em R$
-- Regra: valor de entrada no caixa = amount - discount_amount

-- 1) Função usada em ambientes com trigger unificado (insert/update)
CREATE OR REPLACE FUNCTION sync_payment_to_cash_flow()
RETURNS TRIGGER AS $$
BEGIN
  -- Remove entrada antiga se existir
  DELETE FROM cash_flow WHERE payment_id = NEW.id;

  -- Insere nova entrada com valor líquido (já com desconto)
  INSERT INTO cash_flow (
    type,
    amount,
    description,
    category,
    payment_method,
    order_id,
    payment_id,
    date
  )
  SELECT
    'entrada',
    GREATEST(NEW.amount - COALESCE(NEW.discount_amount, 0), 0),
    'Pagamento OS - ' || so.client_name || ' (' || so.equipment || ')' ||
      CASE
        WHEN COALESCE(NEW.discount_amount, 0) > 0
          THEN ' [Desc R$ ' || COALESCE(NEW.discount_amount, 0)::text || ']'
        ELSE ''
      END,
    'Ordem de Serviço',
    NEW.method,
    NEW.order_id,
    NEW.id,
    DATE(NEW.created_at)
  FROM service_orders so
  WHERE so.id = NEW.order_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2) Função usada em ambientes com trigger antigo (somente insert)
CREATE OR REPLACE FUNCTION register_payment_in_cash_flow()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM cash_flow WHERE payment_id = NEW.id;

  INSERT INTO cash_flow (
    type,
    amount,
    description,
    category,
    payment_method,
    order_id,
    payment_id,
    date
  )
  SELECT
    'entrada',
    GREATEST(NEW.amount - COALESCE(NEW.discount_amount, 0), 0),
    'Pagamento OS - ' || so.client_name || ' (' || so.equipment || ')' ||
      CASE
        WHEN COALESCE(NEW.discount_amount, 0) > 0
          THEN ' [Desc R$ ' || COALESCE(NEW.discount_amount, 0)::text || ']'
        ELSE ''
      END,
    'Ordem de Serviço',
    NEW.method,
    NEW.order_id,
    NEW.id,
    DATE(NEW.created_at)
  FROM service_orders so
  WHERE so.id = NEW.order_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3) Garante que alteração de desconto atualize o caixa (ambiente com trigger unificado)
DROP TRIGGER IF EXISTS trigger_payment_update_cash_flow ON payments;
CREATE TRIGGER trigger_payment_update_cash_flow
  AFTER UPDATE ON payments
  FOR EACH ROW
  WHEN (
    OLD.created_at IS DISTINCT FROM NEW.created_at OR
    OLD.amount IS DISTINCT FROM NEW.amount OR
    OLD.discount_amount IS DISTINCT FROM NEW.discount_amount OR
    OLD.method IS DISTINCT FROM NEW.method
  )
  EXECUTE FUNCTION sync_payment_to_cash_flow();

-- 4) Corrige histórico já existente no caixa (somente entradas vinculadas a payment)
UPDATE cash_flow cf
SET
  amount = GREATEST(p.amount - COALESCE(p.discount_amount, 0), 0),
  description = 'Pagamento OS - ' || so.client_name || ' (' || so.equipment || ')' ||
    CASE
      WHEN COALESCE(p.discount_amount, 0) > 0
        THEN ' [Desc R$ ' || COALESCE(p.discount_amount, 0)::text || ']'
      ELSE ''
    END,
  payment_method = p.method,
  order_id = p.order_id,
  date = DATE(p.created_at)
FROM payments p
JOIN service_orders so ON so.id = p.order_id
WHERE cf.payment_id = p.id;
```

**Resultado esperado:** ✅ Sem erro

---

## ✅ PASSO 3: Corrigir timezone para Paulo Afonso

```sql
-- Corrigir timezone do caixa para usar horário de Paulo Afonso (UTC-3)
-- Problema: CURRENT_DATE estava retornando a data em UTC, não na hora local do Brasil

-- Atualizar a função para usar timezone correto
CREATE OR REPLACE FUNCTION register_payment_in_cash_flow()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM cash_flow WHERE payment_id = NEW.id;

  INSERT INTO cash_flow (
    type,
    amount,
    description,
    category,
    payment_method,
    order_id,
    payment_id,
    date
  )
  SELECT
    'entrada',
    NEW.amount,
    'Pagamento OS - ' || so.client_name || ' (' || so.equipment || ')',
    'Ordem de Serviço',
    NEW.method,
    NEW.order_id,
    NEW.id,
    (NEW.created_at AT TIME ZONE 'America/Fortaleza')::date  -- Usar timezone de Paulo Afonso
  FROM service_orders so
  WHERE so.id = NEW.order_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Atualizar trigger para usar a nova função
DROP TRIGGER IF EXISTS trigger_register_payment_in_cash_flow ON payments;

CREATE TRIGGER trigger_register_payment_in_cash_flow
  AFTER INSERT ON payments
  FOR EACH ROW
  EXECUTE FUNCTION register_payment_in_cash_flow();

-- Também atualizar a função sync_payment_to_cash_flow se existir
CREATE OR REPLACE FUNCTION sync_payment_to_cash_flow()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM cash_flow WHERE payment_id = NEW.id;
  INSERT INTO cash_flow (
    type,
    amount,
    description,
    category,
    payment_method,
    order_id,
    payment_id,
    date
  )
  SELECT
    'entrada',
    GREATEST(NEW.amount - COALESCE(NEW.discount_amount, 0), 0),
    'Pagamento OS - ' || so.client_name || ' (' || so.equipment || ')' ||
      CASE WHEN COALESCE(NEW.discount_amount, 0) > 0
        THEN ' [Desc R$ ' || COALESCE(NEW.discount_amount, 0)::text || ']'
        ELSE ''
      END,
    'Ordem de Serviço',
    NEW.method,
    NEW.order_id,
    NEW.id,
    (NEW.created_at AT TIME ZONE 'America/Fortaleza')::date  -- Usar timezone de Paulo Afonso
  FROM service_orders so
  WHERE so.id = NEW.order_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Corrigir todas as datas existentes no cash_flow para usar timezone correto
UPDATE cash_flow cf
SET date = (p.created_at AT TIME ZONE 'America/Fortaleza')::date
FROM payments p
WHERE cf.payment_id = p.id
  AND cf.date != (p.created_at AT TIME ZONE 'America/Fortaleza')::date;

-- Corrigir também as datas de entrada manual se houver (sem payment_id)
UPDATE cash_flow
SET date = (created_at AT TIME ZONE 'America/Fortaleza')::date
WHERE payment_id IS NULL
  AND date != (created_at AT TIME ZONE 'America/Fortaleza')::date;
```

**Resultado esperado:** ✅ Sem erro

---

## 🧪 Após executar os 3 passos:

1. **Verifique se a coluna foi criada:**
```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'payments' 
ORDER BY ordinal_position;
```

Você deve ver:
```
id                  | uuid
order_id            | uuid
amount              | numeric
method              | text
discount_amount     | numeric  ← NOVO!
created_at          | timestamp
```

2. **Teste o desconto:**
   - Abra uma OS
   - Vá para Pagamentos
   - Clique em "Editar Pagamento" ou crie um novo
   - Você deve ver um campo "Desconto" para adicionar o desconto em R$
   - O cash flow deve descontar automaticamente

3. **Verifique no cash_flow:**
```sql
SELECT id, amount, description, discount_amount
FROM payments 
ORDER BY created_at DESC 
LIMIT 5;
```

Se tiver desconto, a descrição mostrará: `[Desc R$ 50.00]`

---

## ❌ Se algo der erro:

- Copie a mensagem de erro
- Execute no SQL Editor:
```sql
-- Verificar estado das funções
SELECT routine_name FROM information_schema.routines 
WHERE routine_name LIKE '%cash_flow%' OR routine_name LIKE '%payment%';
```

- Verifique se `discount_amount` existe:
```sql
SELECT * FROM payments LIMIT 1;
```

---

**Status:** 🚀 Pronto para executar!
