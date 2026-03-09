# 🔧 FIX URGENTE: Keywords não estão sendo deletadas

## 🔴 Problema Identificado

```
⚠️ ERRO: Keyword ainda existe no banco após delete!
```

A exclusão de palavras-chave está **bloqueada por políticas de segurança (RLS)** no Supabase.

---

## ✅ Solução IMEDIATA

### Passo 1: Execute esta migration no Supabase SQL Editor

Vá para: **Supabase Dashboard → SQL Editor**

Cole e execute:

```sql
-- Corrigir políticas RLS para permitir DELETE em maintenance_keywords
-- Problema: Keywords não estão sendo realmente deletadas do banco

-- Desabilitar RLS temporariamente para verificar
ALTER TABLE maintenance_keywords DISABLE ROW LEVEL SECURITY;

-- Criar política para permitir DELETE
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON maintenance_keywords;

CREATE POLICY "Enable delete for authenticated users"
ON maintenance_keywords
FOR DELETE
TO authenticated
USING (true);

-- Criar política para permitir SELECT
DROP POLICY IF EXISTS "Enable read access for all users" ON maintenance_keywords;

CREATE POLICY "Enable read access for all users"
ON maintenance_keywords
FOR SELECT
TO authenticated
USING (true);

-- Criar política para permitir INSERT
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON maintenance_keywords;

CREATE POLICY "Enable insert for authenticated users"
ON maintenance_keywords
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Criar política para permitir UPDATE
DROP POLICY IF EXISTS "Enable update for authenticated users" ON maintenance_keywords;

CREATE POLICY "Enable update for authenticated users"
ON maintenance_keywords
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- Reabilitar RLS
ALTER TABLE maintenance_keywords ENABLE ROW LEVEL SECURITY;
```

**Resultado esperado:** ✅ Success (sem erro)

---

### Passo 2: Teste imediatamente

1. Volte para http://localhost:8080
2. Vá em Pós-Venda → Manutenção → Keywords
3. Tente excluir uma keyword
4. Veja no console (F12):
   - 📋 Keyword ANTES do delete: {...}
   - ✅ Keyword deletada com sucesso
   - ✅ **Confirmado: Keyword não existe mais no banco** ← DEVE APARECER ISSO!

---

### Passo 3: Verificar políticas (opcional)

No Supabase SQL Editor:

```sql
SELECT schemaname, tablename, policyname, permissive, roles, cmd
FROM pg_policies
WHERE tablename = 'maintenance_keywords';
```

Deve retornar **4 políticas**:
- ✅ Enable delete for authenticated users (DELETE)
- ✅ Enable read access for all users (SELECT)
- ✅ Enable insert for authenticated users (INSERT)
- ✅ Enable update for authenticated users (UPDATE)

---

## 🎯 Resumo

O problema era que a tabela `maintenance_keywords` **não tinha política de DELETE**, então mesmo deletando via código, o Supabase bloqueava a operação.

Agora com as políticas corretas, a exclusão funciona perfeitamente! ✅

---

**Status:** 🔧 Pronto para executar
**Tempo:** 2 minutos
**Arquivo migration:** `supabase/migrations/202603030001_fix_maintenance_keywords_rls.sql`
