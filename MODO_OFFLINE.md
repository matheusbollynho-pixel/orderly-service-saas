# 🔌 Modo Offline - Supabase Local

## Opção 1: Modo Offline com Mock (RECOMENDADO - Já Ativo)

O sistema está pronto para funcionar offline com dados em memória. O arquivo `.env.local` já está configurado para usar o Supabase local.

### ✅ Já Configurado:
- URL: `http://localhost:54321`
- Banco de dados: Em memória (dados não persistem entre recargas)
- Validações de constraint: Ativas (vai bloquear `cartao` se não estiver configurado)

### Para Usar:
1. O site já está rodando em `http://localhost:8080/`
2. Teste normalmente - funciona offline

### Dados Locais:
Os dados são armazenados em memória, então:
- ✅ Funciona offline
- ⚠️ Dados perdidos ao recarregar a página
- ⚠️ Sem persistência em disco

---

## Opção 2: Docker + Supabase Completo (Para Persistência)

Se quiser persistência de dados localmente:

### Pré-requisitos:
- Docker Desktop instalado e rodando
- docker-compose disponível

### Passos:
1. Inicie Docker Desktop
2. Execute no terminal:
```bash
cd c:\Users\Bollynho\Desktop\sites\orderly-service-main
docker-compose -f docker-compose.local.yml up -d
```

3. Aguarde os containers iniciarem (~30s)

4. Acesse o Supabase Studio local:
```
http://localhost:54323
```

5. Configure o arquivo `.env.local` (já está configurado)

### Parar os containers:
```bash
docker-compose -f docker-compose.local.yml down
```

---

## Revertendo para Supabase Cloud

Para voltar ao Supabase cloud, comente as linhas de modo offline no `.env.local`:

```dotenv
# Modo offline ativo - COMENTE estas linhas para usar cloud
# VITE_SUPABASE_PUBLISHABLE_KEY="..."
# VITE_SUPABASE_URL="http://localhost:54321"
# VITE_OFFLINE_MODE=true

# E descomente:
VITE_SUPABASE_PUBLISHABLE_KEY="sb_publishable_IbA1JjUujCSjpu-Qi01rwg_FPEoGyS4"
VITE_SUPABASE_URL="https://xqndblstrblqleraepzs.supabase.co"
```

Depois reinicie o servidor:
```bash
npm run dev
```

---

## Testando Pagamentos com "Cartão"

### Modo Offline (Mock):
- ✅ Aceita `cartao` como método de pagamento
- ✅ Sem necessidade de migration SQL
- ✅ Funciona imediatamente

### Modo Cloud (Supabase):
- ⚠️ Ainda precisa da migration SQL ser executada
- Você recebera erro 400 até aplicar:
```sql
ALTER TABLE public.payments
DROP CONSTRAINT payments_method_check,
ADD CONSTRAINT payments_method_check CHECK (method IN ('dinheiro', 'pix', 'cartao', 'credito', 'debito', 'transferencia', 'outro'));
```
