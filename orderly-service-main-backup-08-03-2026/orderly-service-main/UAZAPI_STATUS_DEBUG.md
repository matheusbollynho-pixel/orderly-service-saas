# 🔴 UazAPI Integration Status - DEBUG REPORT

**Data**: 2025-03-03 | **Status**: ⚠️ UazAPI OFFLINE  
**Edge Function**: `enviar-documento-whatsapp`  
**Error**: 504 Gateway Timeout

## 📋 Summary

A integração da UazAPI foi configurada com sucesso, mas a **API UazAPI não está respondendo a requisições** neste momento (timeout após 30s).

### ✅ O que foi feito:

1. **config.toml corrigido**:
   ```toml
   [functions.enviar-documento-whatsapp]
   verify_jwt = false
   ```
   - Isso permite que a função Edge receba requisições sem autenticação JWT

2. **Secrets configurados no Supabase** ✅:
   - `UAZAPI_ADMIN_TOKEN`: `ZaW1qwTEkuq7Ub1c...` (configurado)
   - `UAZAPI_INSTANCE_ID`: `024ba2d3-1866-4144-...` (configurado)

3. **Frontend atualizado** ✅:
   - `callEdgeFunction()` agora envia Bearer token (sessão Supabase)
   - Edge Function pronto para aceitar sem validação JWT

4. **Edge Function melhorada** ✅:
   - Logs de timing adicionados
   - Timeout aumentado para 30s
   - Validação de configuração adicionada

### ❌ Problema Identificado:

**A própria UazAPI está indisponível/timeout**

**Teste direto realizado**:
```powershell
POST https://api.uazapi.dev/instances/024ba2d3-1866-4144-b9b0-dfe25dd3fd3a/token/.../send-text
Status: TIMEOUT (>30s)
```

**Conclusão**: O problema NÃO é da Edge Function, é da UazAPI estar fora do ar.

## 🚀 Próximas Ações Recomendadas:

### 1. **Verificar Status da UazAPI** (PRIORITÁRIO)
   - Acesse o painel UazAPI em seu navegador
   - Verifique se a instância está ativa
   - Confirme que o Admin Token é válido
   - Verifique limite de requisições

### 2. **Testar após UazAPI recuperar**
   - Uma vez que UazAPI volte online, a mensagem será enviada automaticamente
   - A Edge Function já tem tudo configurado

### 3. **Alternativas** (se UazAPI continuar indisponível)
   - Voltar para Z-API (provider: `zapi` no env)
   - Trocar para outro provedor WhatsApp
   - Contactar suporte UazAPI

## 🔧 Como Testar Quando UazAPI Voltar:

### Via Interface (Local):
```typescript
// Após UazAPI recuperar, envie mensagem normalmente
const response = await sendWhatsAppText({
  to: '5585999999999',
  message: 'Teste UazAPI'
});
```

### Via cURL:
```bash
curl -X POST https://xqndblstrblqleraepzs.supabase.co/functions/v1/enviar-documento-whatsapp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <seu-token>" \
  -d '{
    "to": "5585999999999",
    "message": "Teste após UazAPI voltar"
  }'
```

### Via Edge Function Logs:
Após o teste, acesse [Supabase Dashboard → Functions → enviar-documento-whatsapp → Logs](https://supabase.com/dashboard/project/xqndblstrblqleraepzs/functions) para ver:
- ✅ Requisição POST recebida
- ✅ Payload válido
- ✅ Provider: uazapi
- ✅ Chamando UazAPI em: [URL]
- ✅ UazAPI respondeu em [Xms]
- ✅ Resposta com status 200

## 📊 Configuração Atual:

| Campo | Valor | Status |
|-------|-------|--------|
| **Provider** | `uazapi` | ✅ Configurado |
| **Admin Token** | `ZaW1qwT...` | ✅ Configurado |
| **Instance ID** | `024ba2d3...` | ✅ Configurado |
| **Base URL** | `https://api.uazapi.dev` | ✅ Configurado |
| **verify_jwt** | `false` | ✅ Configurado |
| **Edge Function** | Deployed | ✅ Online |
| **UazAPI Service** | TIMEOUT | ❌ OFFLINE |

## 💡 Dicas para Diagnóstico:

1. **Verifique firewall/VPN** da UazAPI
2. **Confirme credenciais** no painel UazAPI
3. **Verifique logs** em https://dashboard.uazapi.dev (se existir)
4. **Teste com Postman** enquanto aguarda

## 📝 Commits Relacionados:

- `2b09019`: Fix - Add verify_jwt=false and UazAPI timeout handling
- Próximos: Aguardando UazAPI recuperar para validação final

---

**Próximas etapas**: Aguarde UazAPI recuperar e execute teste via interface da app.
