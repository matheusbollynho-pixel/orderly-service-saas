# 🔧 Solução: Disparo Automático de Mensagens de Satisfação

## ❌ Problema Identificado

O disparo automático de mensagens de satisfação após pagamento não estava funcionando porque:

1. **Sem trigger de pagamento** - Não havia mecanismo que disparasse a mensagem imediatamente após um pagamento
2. **Dependência de cron lento** - O sistema só tentava enviar 1x por dia às 10:00 UTC
3. **Sem validação de variáveis de ambiente** - As credenciais de Z-API podem não estar configuradas

## ✅ Solução Implementada

### 1. Novo Trigger de Banco de Dados
Arquivo: `supabase/migrations/202602190000_trigger_payment_satisfaction_survey.sql`

- Cria função que dispara **imediatamente após cada pagamento**
- Marca a pesquisa como enviada (`satisfaction_survey_sent_at`)
- Chama a Edge Function `send-satisfaction-survey` de forma assíncrona
- Garante que a mensagem seja enviada em poucos segundos, não em horas

### 2. Melhorias na Edge Function
Arquivo: `supabase/functions/send-satisfaction-survey/index.ts`

Agora suporta dois modos:
- **Modo trigger** (direto): Quando chamada pelo trigger após pagamento com `order_id`
- **Modo cron** (fallback): Busca ordens com pagamento de 1 dia atrás para re-envios

## 🚀 Como Usar

### Pré-requisitos:
1. Certificar que as variáveis de ambiente estão configuradas no Supabase:
```
ZAPI_INSTANCE_ID
ZAPI_CLIENT_TOKEN
ZAPI_TOKEN
```

2. Executar a migration para criar o trigger:
```sql
-- No painel SQL do Supabase, cole o conteúdo de:
-- supabase/migrations/202602190000_trigger_payment_satisfaction_survey.sql
```

### Fluxo Automático (Depois):
```
1. Pagamento criado → INSERT em payments
   ↓
2. Trigger dispara automaticamente
   ↓
3. Edge Function envia mensagem WhatsApp
   ↓
4. Campo satisfaction_survey_sent_at é marcado
   ↓
5. Cliente recebe pesquisa de satisfação em segundos
```

## 🧪 Teste Manual

Para testar se está funcionando:

```bash
# Terminal da sua máquina
curl -X POST https://seu-supabase-url/functions/v1/send-satisfaction-survey \
  -H "Authorization: Bearer seu-key" \
  -H "Content-Type: application/json" \
  -d '{
    "order_id": "UUID-DA-ORDEM",
    "client_phone": "11999999999",
    "client_name": "Cliente Teste"
  }'
```

## 🐛 Verificar Logs

1. **Logs da Edge Function:**
   - Supabase Dashboard → Functions → send-satisfaction-survey → Logs
   - Procure por mensagens com ✅ ou ❌

2. **Logs do Trigger (PostgreSQL):**
   - Execute no SQL Editor:
   ```sql
   SELECT * FROM pg_stat_statements 
   WHERE query LIKE '%satisfaction%';
   ```

3. **Verificar se pesquisa foi enviada:**
   ```sql
   SELECT id, client_name, satisfaction_survey_sent_at 
   FROM service_orders 
   WHERE satisfaction_survey_sent_at IS NOT NULL 
   ORDER BY satisfaction_survey_sent_at DESC;
   ```

## ⚠️ Possíveis Problemas

### Mensagem não foi enviada?

1. **Verificar se pagamento foi criado:**
   ```sql
   SELECT * FROM payments 
   WHERE created_at > now() - interval '5 minutes'
   ORDER BY created_at DESC LIMIT 5;
   ```

2. **Verificar credenciais Z-API:**
   - Ir para Supabase → Project Settings → Edge Functions
   - Verificar se `ZAPI_*` estão preenchidas corretamente

3. **Verificar telefone do cliente:**
   ```sql
   SELECT id, client_name, client_phone 
   FROM service_orders 
   WHERE client_phone IS NULL;
   ```

4. **Executar teste manual:**
   ```typescript
   // No painel da função test-satisfaction-matheus
   // Clique em "Test" e veja a resposta de erro
   ```

## 📋 Resumo de Arquivos Modificados

- ✅ `supabase/migrations/202602190000_trigger_payment_satisfaction_survey.sql` (NOVO)
- ✅ `supabase/functions/send-satisfaction-survey/index.ts` (MELHORADO)
- ℹ️ `supabase/migrations/202602161500_enable_satisfaction_survey_cron.sql` (Mantém-se para fallback)

## 🎯 Resultado Esperado

Após aplicar as mudanças:

- ⏱️ Mensagens são enviadas em **3-5 segundos** após pagamento (antes era 24h)
- 📊 Redução de falhas por credenciais/timeout
- 🔄 Sistema de fallback mantém cron como backup
- 📱 Clientes recebem pesquisa enquanto o atendimento está fresco
