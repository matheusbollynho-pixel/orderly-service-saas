# 🔧 Executar Migration - Adicionar 'cartao' à Tabela Payments

## Problema
A tabela `payments` ainda não aceita `'cartao'` como método de pagamento. O banco de dados tem uma constraint que bloqueia este valor.

## Solução
Execute este SQL na sua conta Supabase:

### 1. Acesse o Supabase Dashboard
https://app.supabase.com/project/xqndblstrblqleraepzs/sql/new

### 2. Cole este comando SQL no editor SQL:

```sql
-- Adicionar 'cartao' como método de pagamento válido na tabela payments
ALTER TABLE public.payments
DROP CONSTRAINT payments_method_check,
ADD CONSTRAINT payments_method_check CHECK (method IN ('dinheiro', 'pix', 'cartao', 'credito', 'debito', 'transferencia', 'outro'));
```

### 3. Clique em "RUN" (botão azul)

Pronto! Agora a tabela `payments` aceitará `'cartao'` como método de pagamento.

## Verificação
Teste novamente no formulário de pagamentos com a opção "Cartão".
