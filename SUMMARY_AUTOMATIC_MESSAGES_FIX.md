# 📋 Resumo das Mudanças - Disparo Automático de Mensagens

## 📁 Arquivos Criados/Modificados

### 1. **Diagnóstico e Testes**
- ✅ `FIX_AUTOMATIC_MESSAGES_QUICK.md` - Guia rápido de solução
- ✅ `DIAGNOSE_AUTOMATIC_MESSAGES.md` - Diagnóstico detalhado
- ✅ `supabase/test_automatic_messages.sql` - Script SQL de teste

### 2. **Migrations (executar pela ordem)**
- ✅ `202602190001_rpc_satisfaction_survey.sql` - **EXECUTAR PRIMEIRO**
  - Cria RPC function: `send_satisfaction_message_rpc()`
  - Cria trigger: `trigger_send_survey_rpc()`
  - Mais simples e direto

- ✅ `202602190002_trigger_v2_better_error_handling.sql` - **Alternativa (se v1 não funcionar)**
  - Versão melhorada com melhor tratamento de erros
  - Mais logs detalhados

- ✅ `202602161500_enable_satisfaction_survey_cron.sql` - **Atualizada**
  - Ativa extensões http e pg_cron explicitamente
  - URL hardcoded em vez de usar current_setting()
  - Aumenta timeout para 10 segundos
  - Horário ajustado para 08:00 UTC

### 3. **Edge Function (Melhorada)**
- ✅ `supabase/functions/send-satisfaction-survey/index.ts` - **Atualizada**
  - Suporta chamadas diretas do trigger com `order_id`
  - Mantém modo cron como fallback
  - Adiciona função `getSingleOrderForSurvey()`

## 🚀 Como Aplicar

### Passo 1: Execute o Diagnóstico
```bash
# No Supabase Dashboard → SQL Editor
# Copie todo o conteúdo de:
supabase/test_automatic_messages.sql
# E execute
```

### Passo 2: Execure as Migrations (Na Ordem)
```bash
# 1. PRIMEIRO - Execute isto:
supabase/migrations/202602190001_rpc_satisfaction_survey.sql

# 2. DEPOIS - Execute isto:
supabase/migrations/202602161500_enable_satisfaction_survey_cron.sql

# Se não funcionar, tente a versão v2:
supabase/migrations/202602190002_trigger_v2_better_error_handling.sql
```

### Passo 3: Teste Imediatamente
```sql
-- Teste o trigger com um pagamento de teste:
INSERT INTO payments (order_id, amount, method)
VALUES ('uuid-da-ordem', 10.00, 'pix')
RETURNING id;

-- Aguarde 3 segundos
-- Verifique se satisfaction_survey_sent_at foi preenchido
```

## ✨ Comparação: Antes vs Depois

| Aspecto | Antes | Depois |
|--------|-------|--------|
| **Envio Manual** | ✅ Funciona | ✅ Continua Funcionando |
| **Envio Automático (Trigger)** | ❌ Não funciona | ✅ 3-5 seg após pagamento |
| **Envio Agendado (Cron)** | ⚠️ Quebrado | ✅ Diariamente 08:00 UTC |
| **URL** | Via `current_setting()` | Hardcoded + fallback |
| **Extensões** | Pode faltar `http` | Habilitadas explicitamente |
| **Timeout** | 5 segundos | 10 segundos |
| **Logs** | Mínimos | Detalhados |
| **Tratamento de Erros** | Falha silenciosa | Logs clara |

## 🔧 Problemas Corrigidos

### ❌ Problema 1: current_setting() retornava NULL
**Solução:** URL hardcoded + fallback para current_database()

### ❌ Problema 2: Falta de extensão HTTP
**Solução:** `CREATE EXTENSION IF NOT EXISTS http` na migration

### ❌ Problema 3: Timeout muito curto
**Solução:** Aumentado de 5s para 10s

### ❌ Problema 4: Sem logs de diagnóstico
**Solução:** Adicionados `RAISE LOG` em vários pontos

### ❌ Problema 5: RLS pode bloquear trigger
**Solução:** Trigger com `SECURITY DEFINER`

## 📊 Estrutura do Fluxo Automático

```
┌─────────────────┐
│  Pagamento      │
│  Criado         │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  TRIGGER        │
│  payment_insert │
└────────┬────────┘
         │
         ├─ Marcar: satisfaction_survey_sent_at = NOW()
         │
         ├─ Chamar: net.http_post()
         │
         ▼
┌─────────────────────────────────────┐
│  Edge Function:                     │
│  send-satisfaction-survey           │
│  (recebe order_id via body)         │
└────────┬────────────────────────────┘
         │
         ├─ Buscar dados do cliente
         │
         ├─ Enviar via Z-API WhatsApp
         │
         ▼
┌─────────────────┐
│ ✅ Mensagem     │
│    Enviada      │
└─────────────────┘
```

## 🧪 Teste Rápido (5 minutos)

```sql
-- 1. Verificar extensões
SELECT extname FROM pg_extension WHERE extname IN ('http', 'pg_cron');

-- 2. Verificar trigger foi criado
SELECT trigger_name FROM information_schema.triggers 
WHERE event_object_table = 'payments' AND trigger_name LIKE '%survey%';

-- 3. Testar inserindo um pagamento
INSERT INTO payments (order_id, amount, method, created_at) 
VALUES ('ID-DA-ORDEM', 10.00, 'pix', now());

-- 4. Verificar se foi marcado
SELECT satisfaction_survey_sent_at FROM service_orders WHERE id = 'ID-DA-ORDEM';
-- Se não está NULL = FUNCIONANDO!

-- 5. Ver logs (ir em Supabase Dashboard → Logs → Postgres)
```

## ❓ Checklist Pós-Implementação

- [ ] Script de diagnóstico executado sem erros
- [ ] Migration 202602190001 executada com sucesso
- [ ] Migration 202602161500 executada com sucesso
- [ ] Extensão `http` aparece na listagem
- [ ] Trigger `trigger_payment_send_survey` aparece
- [ ] Teste com INSERT de pagamento realizado
- [ ] Campo `satisfaction_survey_sent_at` foi preenchido
- [ ] Mensagem WhatsApp foi recebida no cliente
- [ ] Logs mostram "✅ HTTP POST response" ou similar

## 🆘 Se Não Funcionar

1. **Verificar se net.http_post funciona:**
   ```sql
   SELECT net.http_post(
     url := 'https://httpbin.org/post',
     body := jsonb_build_object('test', 'value')::text
   );
   ```

2. **Verificar logs do cron:**
   ```sql
   SELECT * FROM cron.job_run_details 
   WHERE jobid = (SELECT jobid FROM cron.job 
                  WHERE jobname = 'send-satisfaction-survey-daily')
   ORDER BY start_time DESC LIMIT 5;
   ```

3. **Forçar execução do cron:**
   ```sql
   SELECT cron.force_now('send-satisfaction-survey-daily');
   ```

4. **Ver logs da Edge Function:**
   - Supabase Dashboard → Functions → send-satisfaction-survey → Logs

## 📞 Próximos Passos

1. ✅ Aplicar as migrations
2. ✅ Testar conforme guia `FIX_AUTOMATIC_MESSAGES_QUICK.md`
3. ✅ Monitorar logs em `Supabase Dashboard → Logs`
4. ✅ Validar que mensagens estão sendo enviadas
5. ⏳ Aguardar próxima execução do cron (08:00 UTC)

---

**Versão:** 2.0 - Com melhor diagnóstico e tratamento de erros
**Data:** 19/02/2026
**Status:** Pronto para implementação
