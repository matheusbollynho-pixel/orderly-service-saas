# 🚀 AÇÃO RÁPIDA - Modo Automático Não Funciona

## 📋 O Que Fazer AGORA

### ✅ Passo 1: Copiar este script completo
```
supabase/test_automatic_messages.sql
```

### ✅ Passo 2: Colar no Supabase Editor
- Dashboard → SQL Editor
- Cole e execute

### ✅ Passo 3: Verificar Resultado
**Procure por:**
- ❌ `http` em EXTENSÕES? → Problema 1
- ❌ `trigger_payment_send_survey` em TRIGGERS? → Problema 2
- ❌ `send_satisfaction_message_rpc` em FUNCTIONS? → Problema 3

### ✅ Passo 4: Executar as Migrations

Copie e execute NA ORDEM:

**1. PRIMEIRO:**
```
supabase/migrations/202602190001_rpc_satisfaction_survey.sql
```

**2. DEPOIS:**
```
supabase/migrations/202602161500_enable_satisfaction_survey_cron.sql
```

### ✅ Passo 5: Testar Imediatamente

Cole isto no SQL Editor:

```sql
-- Encontre uma ordem
SELECT id FROM service_orders 
WHERE client_phone IS NOT NULL 
LIMIT 1;

-- Copie o ID e use aqui:
INSERT INTO payments (order_id, amount, method) 
VALUES ('cole-o-id-aqui', 10, 'pix');

-- Aguarde 3 segundos

-- Verifique:
SELECT satisfaction_survey_sent_at 
FROM service_orders 
WHERE id = 'cole-o-id-aqui';
```

**Resultado:**
- ✅ Se tiver data/hora = **FUNCIONANDO!**
- ❌ Se tiver NULL = **Problema não resolvido**

---

## 🆘 Se Não Funcionar

### Cenário 1: "Extensão não encontrada"
```sql
CREATE EXTENSION IF NOT EXISTS http WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
```

### Cenário 2: "net.http_post não existe"
```sql
-- Tente este teste para debugar:
SELECT net.http_post(
  url := 'https://httpbin.org/post',
  body := '{"test":"value"}'::text
);
```

### Cenário 3: Ainda assim não funciona
```
supabase/migrations/202602190002_trigger_v2_better_error_handling.sql
```
(Execute esta versão alternativa do trigger)

### Cenário 4: Precisa de debug avançado
```
supabase/debug_automatic_messages_advanced.sql
```
(Script com 10 partes de diagnóstico profundo)

---

## 📊 Resultado Esperado

| Antes | Depois |
|-------|--------|
| ❌ Automático não funciona | ✅ Automático em 3-5 segundos |
| ✅ Manual funciona | ✅ Manual continua funcionando |
| ⚠️ Cron quebrado | ✅ Cron funciona |

---

## 🎯 Resumo Rápido dos Problemas

```
PROBLEMA 1: current_setting() vazio
├─ Solução: URL hardcoded
└─ Arquivo: 202602190001_rpc_satisfaction_survey.sql

PROBLEMA 2: Extensão http não habilitada
├─ Solução: CREATE EXTENSION IF NOT EXISTS http
└─ Arquivo: 202602161500_enable_satisfaction_survey_cron.sql

PROBLEMA 3: Timeout muito curto (5s)
├─ Solução: Aumentado para 10s
└─ Arquivo: Ambas as migrations

PROBLEMA 4: Sem tratamento de erros
├─ Solução: Logs RAISE LOG em vários pontos
└─ Arquivo: 202602190002_trigger_v2_better_error_handling.sql
```

---

## 📁 Arquivos Criados (Referência)

```
✅ Documentação:
  - FIX_AUTOMATIC_MESSAGES_QUICK.md
  - DIAGNOSE_AUTOMATIC_MESSAGES.md
  - SUMMARY_AUTOMATIC_MESSAGES_FIX.md

✅ SQL de Teste:
  - supabase/test_automatic_messages.sql
  - supabase/debug_automatic_messages_advanced.sql

✅ Migrations:
  - supabase/migrations/202602190001_rpc_satisfaction_survey.sql
  - supabase/migrations/202602190002_trigger_v2_better_error_handling.sql
  - supabase/migrations/202602161500_enable_satisfaction_survey_cron.sql (atualizada)

✅ Edge Function:
  - supabase/functions/send-satisfaction-survey/index.ts (atualizada)
```

---

## ⏱️ Tempo Estimado

- Diagnóstico: **2 minutos**
- Aplicar solução: **3 minutos**
- Testar: **2 minutos**
- **Total: 7 minutos**

---

**Executou tudo? Compartilhe o resultado do `test_automatic_messages.sql` para eu poder diagnosticar se houver problemas!**
