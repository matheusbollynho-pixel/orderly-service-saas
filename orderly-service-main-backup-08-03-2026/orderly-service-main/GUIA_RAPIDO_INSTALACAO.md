# 🚀 Guia Rápido - Sistema de Busca de Clientes

## ✅ PASSO 1: Executar SQL no Supabase

1. Abra o Supabase: https://supabase.com/dashboard
2. Selecione seu projeto **orderly-service-main**
3. No menu lateral, clique em **SQL Editor**
4. Clique em **+ New Query**
5. Abra o arquivo `CLIENTES_E_MOTOS_MIGRATION.sql` 
6. Copie **TODO** o conteúdo
7. Cole no editor SQL do Supabase
8. Clique em **Run** (botão verde) ou pressione `Ctrl + Enter`
9. Aguarde a mensagem ✅ **Success. No rows returned**

## ✅ PASSO 2: Testar o Sistema

1. No seu projeto, inicie o servidor de desenvolvimento:
   ```bash
   npm run dev
   ```

2. Abra a aplicação no navegador

3. Clique para criar uma **Nova OS**

4. Na aba **Cliente**, você verá o novo campo de busca no topo

## 🎯 Como funciona

### Primeira OS de um cliente (sem cadastro prévio)
1. Preencha os dados manualmente como sempre fez
2. Os dados serão salvos automaticamente (próximo passo de desenvolvimento)

### Segunda OS do mesmo cliente
1. Digite o CPF, telefone ou nome no campo de busca
2. Clique em **Buscar** ou pressione Enter
3. ✅ Os dados são preenchidos automaticamente!
4. As motos do cliente aparecem na aba "Motos"
5. Edite qualquer campo se necessário

## 📁 Arquivos criados/modificados

### ✅ Criados:
- `CLIENTES_E_MOTOS_MIGRATION.sql` - SQL para executar no Supabase
- `SISTEMA_BUSCA_CLIENTES.md` - Documentação completa
- `src/hooks/useClients.ts` - Hook com funções de busca
- `src/components/ClientSearch.tsx` - Componente de busca
- `GUIA_RAPIDO_INSTALACAO.md` - Este arquivo

### ✅ Modificados:
- `src/integrations/supabase/types.ts` - Tipos das novas tabelas
- `src/components/OrderForm.tsx` - Integração com busca

## ⚠️ Importante

- Execute o SQL **apenas UMA VEZ** no Supabase
- Se já executou, não execute novamente
- Os dados existentes nas ordens de serviço **NÃO** serão afetados

## 🐛 Problemas?

### Erro: "relation clients does not exist"
❌ **Causa:** SQL não foi executado no Supabase  
✅ **Solução:** Execute o arquivo `CLIENTES_E_MOTOS_MIGRATION.sql`

### Busca não funciona
❌ **Causa:** Ainda não há clientes cadastrados  
✅ **Solução:** Crie uma OS manualmente primeiro, depois busque o cliente

### Campo de busca não aparece
❌ **Causa:** Código não foi salvo ou servidor não reiniciou  
✅ **Solução:** 
```bash
# Pare o servidor (Ctrl + C)
# Inicie novamente
npm run dev
```

## 📞 Precisa de ajuda?

- Leia a documentação completa: `SISTEMA_BUSCA_CLIENTES.md`
- Verifique se o SQL foi executado corretamente
- Confira se não há erros no console do navegador (F12)

---

**Próximo passo:** Implementar salvamento automático de clientes ao criar OS
