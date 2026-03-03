# 📊 WhatsApp Provider Status - Diagnóstico Completo

**Data**: 3 de Março de 2026 | **Hora**: ~14:00

## 🔴 Problema Identificado

Edge Function retorna **502 Bad Gateway + 405 Method Not Allowed**

```
POST /functions/v1/enviar-documento-whatsapp
→ 502 (Bad Gateway)
→ z_api_status: 405 "Method Not Allowed"
```

## 📋 Diagnóstico

### 1️⃣ UazAPI (Nova Provider)
- **URL**: `https://free.uazapi.com`
- **Admin Token**: `ZaW1qwTEkuq7Ub1c...` ✅ Configurado
- **Instance ID**: `024ba2d3-1866-4144-b9b0-dfe25dd3fd3a` ✅ Configurado
- **Status**: ❌ INOPERÁVEL
  - Todos os endpoints retornam 404 ou 405
  - Parece ser um serviço que **recebe webhooks**, não envia mensagens
  - Pode ser um plano gratuito limitado

### 2️⃣ Z-API (Provider Legado)
- **URL**: `https://api.z-api.io`
- **Token**: `4cad6450cc0516100619cb3736689560a61b6893369d60ebb6d8059ac5a3f96d`
- **Instance ID**: `810143c12dabb1df7a735e7d88d5d3435bfdde6fdc36826d95de75d0274fc679`
- **Status**: ❌ INVÁLIDO
  - Retorna **200 OK** mas com erro interno:
  ```json
  {
    "error": "NOT_FOUND",
    "message": "Unable to find matching target resource method"
  }
  ```
  - Indica que as credenciais estão **expiradas ou não autorizam envio**

## 🎯 Causas Possíveis

### UazAPI:
- [ ] Plano gratuito não suporta envio imperativo, só recebe webhooks
- [ ] Service está realmente offline/parado
- [ ] Necessário configuração adicional no painel

### Z-API:
- [ ] Token expirou
- [ ] Instância foi removida/desconectada
- [ ] Plano não permite mais envio de mensagens
- [ ] Precisa renovação de inscrição

## ✅ Soluções Recomendadas

### Opção 1: Verificar UazAPI (Recomendado)
1. Acesse **painel UazAPI** em seu navegador
2. Verifique se **instância está "connected"**
3. Verifique se há **limite de requisições** atingido
4. Tente enviar uma mensagem **diretamente via painel**
5. Se funcionar no painel, o problema é na API

### Opção 2: Renovar Z-API (Fallback)
1. Se você não quer gastar com Z-API novo, **use UazAPI**
2. Se UazAPI não servir para envio, busque alternativa (Twilio, MessageBird, etc.)

### Opção 3: Usar Backend com Webhook (Temporário)
Se UazAPI só recebe webhooks:
1. Configure um webhook em UazAPI para sua app
2. Quando houver mensagem de entrada, processe
3. Para **enviar**, implemente um sistema de fila com webhooks externo

## 🔧 Próximas Ações

### URGENTE:
1. **Verificar credenciais UazAPI no painel dele**
   - Instância está online?
   - Token admin é válido?
   - Há limite atingido?

2. **Se Z-API é fallback, renovar subscription** (se quiser manter)

3. **Considerar novo provedor** se ambos não funcionarem

## 📝 Código Atual

**Edge Function**: Deployado com fallback Z-API por padrão
- Provider: `'zapi'` (padrão)
- Paths ajustados para query string (`?apikey=`)
- Configurado com `verify_jwt=false`

**Próximo Deploy**: Aguarda resolução dos tokens

---

**Status**: 🔴 BLOQUEADO - Aguardando validação de credenciais
