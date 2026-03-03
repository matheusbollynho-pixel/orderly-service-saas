# 🚀 Solução: Deploy no Vercel não funciona

## 🔍 Possíveis Causas e Soluções

### 1️⃣ **Variáveis de Ambiente Faltando**

No Vercel Dashboard:

```
Project Settings → Environment Variables
```

**Adicione estas variáveis:**

```
VITE_SUPABASE_URL=https://xqndblstrblqleraepzs.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

⚠️ **IMPORTANTE:** Prefixe com `VITE_` para variables que devem estar disponíveis no frontend!

---

### 2️⃣ **Verificar Logs do Vercel**

1. Abra: https://vercel.com/dashboard
2. Selecione **orderly-service**
3. Clique em **Deployments**
4. Clique no deployment que falhou
5. Procure por:
   - ❌ Build errors
   - ❌ Missing environment variables
   - ❌ Dependencies issues

---

### 3️⃣ **Forçar novo Deploy**

Opção 1: Fazer commit vazio
```powershell
git commit --allow-empty -m "Trigger Vercel deploy"
git push origin main
```

Opção 2: Redeploy pelo Vercel Dashboard
1. Vá para **Deployments**
2. Clique em **⋮ (mais opções)** no último deploy
3. Clique **Redeploy**

---

### 4️⃣ **Se ainda não funcionar:**

Tente remover o cache:

```powershell
cd c:\Users\Bollynho\Desktop\sites\orderly-service-main

# Limpar dist
Remove-Item -Recurse -Force dist

# Reinstalar dependências
Remove-Item -Recurse -Force node_modules
npm install

# Build novamente
npm run build

# Push com --force-with-lease (apenas se souber o que está fazendo!)
git push origin main
```

---

### 5️⃣ **Checklist de Deployment**

- [ ] ✅ Variáveis de ambiente configuradas no Vercel
- [ ] ✅ Build funciona localmente (`npm run build`)
- [ ] ✅ Repositório sincronizado (`git push`)
- [ ] ✅ Branch `main` selecionado no Vercel
- [ ] ✅ Node version: v18 ou superior
- [ ] ✅ Build command: `npm run build`
- [ ] ✅ Output directory: `dist`
- [ ] ✅ Install command: `npm install`

---

### 6️⃣ **Erro específico? Veja:**

**"Cannot find module"**
- Rodar: `npm install` localmente
- Depois: `npm run build`
- Depois: `git add package-lock.json && git commit -m "Update dependencies" && git push`

**"Build timeout"**
- Aumentar timeout no Vercel Dashboard
- Otimizar build (remover console.logs, etc)

**"Memory exceeded"**
- Supabase types podem estar grandes
- Limpar cache: Delete node_modules e reinstalar

---

## 📋 Próximos Passos

1. **Verificar variáveis de ambiente**
2. **Checar logs do Vercel**
3. **Executar checklist acima**
4. **Se ainda não funcionar, compartilhe o erro!**

---

**Status:** 🔧 Troubleshooting ativo
