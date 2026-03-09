# 🔧 EXECUTAR TRIGGER - Atualizar Data do Pagamento no Caixa

## Problema
Quando a data de um pagamento é alterada, a data no fluxo de caixa não estava sendo atualizada automaticamente.

## Solução
Executar o SQL abaixo no Supabase para criar o trigger que sincroniza as datas.

---

## 📋 PASSO A PASSO

### 1. Acesse o Supabase SQL Editor
**Link direto:** https://supabase.com/dashboard/project/xqndblstrblqleraepzs/sql/new

### 2. Cole e Execute o SQL abaixo:

```sql
-- Trigger para atualizar a data no cash_flow quando a data do pagamento é alterada

CREATE OR REPLACE FUNCTION update_payment_date_in_cash_flow()
RETURNS TRIGGER AS $$
BEGIN
  -- Se a data do pagamento foi alterada, atualiza no cash_flow
  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    UPDATE cash_flow
    SET date = DATE(NEW.created_at)
    WHERE payment_id = NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Criar trigger para atualizar quando payment é modificado
DROP TRIGGER IF EXISTS trigger_update_payment_date_in_cash_flow ON payments;

CREATE TRIGGER trigger_update_payment_date_in_cash_flow
  AFTER UPDATE ON payments
  FOR EACH ROW
  EXECUTE FUNCTION update_payment_date_in_cash_flow();
```

### 3. Clique em "RUN" ou pressione Ctrl+Enter

### 4. Verifique o sucesso
Deve aparecer a mensagem: "Success. No rows returned"

---

## ✅ Após Executar

Depois de executar o SQL:
1. Volte no sistema local (http://localhost:8080)
2. Vá em Relatórios → Pagamentos
3. Altere a data de um pagamento
4. Verifique no Fluxo de Caixa se a entrada mudou de data

---

## 🔄 Como Funciona

Agora, sempre que você alterar a data de um pagamento:
- A data será atualizada na tabela `payments`
- O trigger detectará a mudança automaticamente
- Atualizará a data correspondente na tabela `cash_flow`
- O fluxo de caixa mostrará a entrada na data correta

---

**Data da criação:** 28/01/2026
