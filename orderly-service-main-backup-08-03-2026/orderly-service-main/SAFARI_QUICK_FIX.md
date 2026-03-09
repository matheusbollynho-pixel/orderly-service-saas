# 🚀 Quick Start - Safari Debugging

Se o site não está carregando no Safari, siga estes passos:

## 1️⃣ Verificar se é Private Browsing

**No Safari Desktop:**
- Abra Safari
- Menu: Safari > Private Browsing
- Se estiver ativo, desative e tente novamente

**No Safari Mobile (iPhone/iPad):**
- Abra Safari
- Ícone de abas (inferior direita) > Abas Privadas
- Se estiver ativo, volte para abas normais

## 2️⃣ Limpar Cache

**Desktop:**
```
Safari > Preferences > Privacy > Remove All Website Data
```

**Mobile:**
```
Settings > Safari > Clear History and Website Data
```

## 3️⃣ Verificar Console

**Desktop:**
1. Safari > Develop > Show Web Inspector
2. Clique na aba "Console"
3. Procure por mensagens de erro (em vermelho)

Se vir `⚠️ localStorage indisponível`:
- ✅ Normal em Private Browsing
- ✅ App continua funcionando (sem persistência entre sessões)

## 4️⃣ Recarregar Página

- **Mac**: Cmd + R (ou Cmd + Shift + R para limpar cache)
- **iPhone**: Toque no endereço > Recarregar

## 5️⃣ Verificar Conectividade

```
✓ Conectado à Internet (WiFi ou dados móveis)
✓ Supabase acessível (https://xqndblstrblqleraepzs.supabase.co)
✓ Sem VPN bloqueando requisições
```

## 6️⃣ Se Ainda Não Funcionar

**Obtenha informações de diagnóstico:**
1. Abra o Console (veja passo 3)
2. Copie tudo que está escrito
3. Verifique os logs com:
   - 🚀 = Iniciando
   - ✓ = Sucesso
   - ❌ = Erro
   - ⚠️ = Aviso

**Teste em outro navegador:**
- Chrome no iPhone (usa Web Engine do Safari internamente, mas pode ter comportamento diferente)
- Firefox Mobile
- Edge Mobile

## Problemas Comuns

### Tela em branco
1. Recarregar (Cmd+R ou Ctrl+R)
2. Limpar cache (passo 2)
3. Verificar console (passo 3)

### Não faz login
1. Verifique se está em Private Browsing
2. Usuário/senha corretos?
3. Conexão com Supabase? (verifique no console)

### Aplicação lenta
1. Normal na primeira carga
2. Próximas cargas são mais rápidas (cache)
3. Se persistir, limpe cache

### Erro "ROOT element not found"
1. Raramente acontece
2. Limpe cache completamente
3. Tente em outro navegador

## Informações Úteis

- **Versão Safari**: Safari > About Safari
- **Sistema operacional**: Para iPhone -> Settings > General > About
- **URL da App**: `xqndblstrblqleraepzs.supabase.co`

## Suporte Técnico

Se o problema persistir:
1. Capture screenshot do console
2. Anote a versão do Safari
3. Descreva o que acontece (tela branca? erro? não carrega?)
4. Avise se está em Private Browsing

---

**Última atualização:** 28 de janeiro de 2026
**Versão da App:** 0.0.1
