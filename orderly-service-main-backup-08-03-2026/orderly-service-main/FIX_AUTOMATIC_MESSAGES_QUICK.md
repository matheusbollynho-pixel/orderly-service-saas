# ⚡ FIX: Mensagens Automáticas Não Funcionam - Passo a Passo

## 🎯 Problema
- ✅ Mensagens manuais funcionam
- ❌ Mensagens automáticas (após pagamento) não são enviadas

## 🔍 Causa Raiz
O trigger tenta usar `current_setting()` que retorna valores vazios/inválidos em ambiente serverless do Supabase.

## ✅ Solução em 3 Passos

### Passo 1: Execute o Script de Diagnóstico
No Supabase Dashboard → SQL Editor, copie e cole todo o conteúdo de:
```
supabase/test_automatic_messages.sql
```

**Procure por:**
- ❓ Se `http` não aparecer em EXTENSÕES → problema encontrado
- ❓ Se `trigger_payment_send_survey` não aparecer em TRIGGERS → trigger não foi criado
- ❓ Se `send_satisfaction_message_rpc` não aparecer em FUNCTIONS → RPC não existe

### Passo 2: Execure as Migrations (pela ordem)

No Supabase Dashboard → SQL Editor:

**1️⃣ Primeira, execute:**
```
supabase/migrations/202602190001_rpc_satisfaction_survey.sql
```
(Cria a RPC function e o novo trigger)

**2️⃣ Depois, execute:**
```
supabase/migrations/202602161500_enable_satisfaction_survey_cron.sql
```
(Atualiza o cron com URL hardcoded)

### Passo 3: Teste Imediatamente

#### Teste A: Testar o Trigger
```sql
-- 1. Encontrar uma ordem
SELECT id, client_phone FROM service_orders 
WHERE client_phone IS NOT NULL LIMIT 1;
-- Copie o UUID

-- 2. Inserir um pagamento (deve disparar o trigger automaticamente)
INSERT INTO payments (order_id, amount, method)
VALUES ('COLE-O-UUID', 10.00, 'pix')
RETURNING id;

-- 3. Aguardar 3 segundos

-- 4. Verificar se foi marcado como enviado
SELECT id, satisfaction_survey_sent_at 
FROM service_orders 
WHERE id = 'COLE-O-UUID';

-- ✅ Se satisfaction_survey_sent_at tem valor = FUNCIONANDO!
-- ❌ Se é NULL = Trigger não disparou
```

#### Teste B: Testar o Cron
```sql
-- Forçar execução agora (sem esperar 08:00 UTC)
SELECT cron.force_now('send-satisfaction-survey-daily');

-- Aguardar 10 segundos

-- Verificar logs em:
-- Supabase Dashboard → Functions → send-satisfaction-survey → Logs
```

## 📊 Checklist Pós-Solução

Confirme que cada passo foi executado:

- [ ] Script de diagnóstico executado
- [ ] `http` extensão aparece na listagem de extensões
- [ ] `trigger_payment_send_survey` aparece em TRIGGERS
- [ ] `send_satisfaction_message_rpc` aparece em FUNCTIONS
- [ ] Migration `202602190001_rpc_satisfaction_survey.sql` executada
- [ ] Migration `202602161500_enable_satisfaction_survey_cron.sql` executada
- [ ] Teste A (Trigger) realizado com sucesso
- [ ] Teste B (Cron) realizado com sucesso
- [ ] Mensagens estão sendo enviadas automaticamente

## 🚨 Se Ainda Não Funcionar

### Problema 1: Edge Function retorna erro 401/403
**Solução:**
```sql
-- A chave de autorização pode estar vencida
-- Vá em Supabase Dashboard → API Settings
-- Copie a nova Bearer Token e substitua em:
-- supabase/migrations/202602190001_rpc_satisfaction_survey.sql
-- linha 41 e outras com 'Bearer'
```

### Problema 2: Edge Function não recebe a chamada
**Verifique:**
```sql
-- Confirme que a URL está correta
-- Deve ser seu_project_id.supabase.co, não xqndblstrblqleraepzs
-- Atualize em ambas as migrations:
-- - supabase/migrations/202602190001_rpc_satisfaction_survey.sql
-- - supabase/migrations/202602161500_enable_satisfaction_survey_cron.sql
```

### Problema 3: "Extension not found" ao executar
**Solução:**
```sql
-- Execute isto ANTES das migrations:
CREATE EXTENSION IF NOT EXISTS http WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- Depois execute as migrations
```

## 📞 Debug: Ver logs do que está acontecendo

```sql
-- Ver últimos erros do banco de dados
SELECT * FROM pg_stat_statements 
WHERE query LIKE '%satisfaction%' 
ORDER BY query_calls DESC 
LIMIT 10;

-- Ver logs da RPC function
-- (Se você habilitou RAISE LOG)
-- Vá em Supabase Dashboard → Logs → Postgres
```

## 🎉 Resultado Final

Após completar estes passos:

| Modo | Status | Tempo |
|------|--------|-------|
| Manual (teste) | ✅ Funcionando | Imediato |
| Automático (trigger) | ✅ Será Funcionando | 3-5 seg após pagamento |
| Agendado (cron) | ✅ Será Funcionando | 08:00 UTC diariamente |

---

**Dúvidas? Execute o script de diagnóstico e compartilhe a saída!**
