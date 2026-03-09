# Deploy do Orderly Service

## ✅ Pré-requisitos
- Conta no GitHub
- Conta na Vercel (grátis)

## 🚀 Passo a passo para deploy na Vercel

### 1. Criar repositório no GitHub (se ainda não tiver)
```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/orderly-service.git
git push -u origin main
```

### 2. Deploy na Vercel

#### Opção A: Via CLI (Recomendado - mais rápido)
```bash
npm install -g vercel
vercel login
vercel
```

#### Opção B: Via Dashboard
1. Acesse https://vercel.com
2. Clique em "Add New" → "Project"
3. Importe seu repositório do GitHub
4. Configure as variáveis de ambiente:
   - `VITE_SUPABASE_URL` = https://xqndblstrblqleraepzs.supabase.co
   - `VITE_SUPABASE_PUBLISHABLE_KEY` = sb_publishable_IbA1JjUujCSjpu-Qi01rwg_FPEoGyS4
5. Clique em "Deploy"

### 3. Configurar domínio customizado (opcional)
- Na Vercel, vá em Settings → Domains
- Adicione seu domínio personalizado

## 🔧 Build local (testar antes do deploy)
```bash
npm run build
npm run preview
```

## 📝 Notas importantes
- O arquivo `.env` não vai para o Git (está no .gitignore)
- Configure as variáveis de ambiente diretamente na Vercel
- O site ficará disponível em: `https://seu-projeto.vercel.app`

## 🆘 Problemas comuns
- **Erro 404 nas rotas**: Já configurado em `vercel.json` (rewrites)
- **Variáveis de ambiente não funcionam**: Adicione na dashboard da Vercel, não no código
- **Build falha**: Execute `npm run build` localmente primeiro para verificar erros
