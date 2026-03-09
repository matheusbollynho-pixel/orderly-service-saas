# 🔍 Sistema de Busca de Clientes e Motos

## 📋 O que foi implementado?

Sistema completo para buscar clientes e motos já cadastrados, preenchendo automaticamente os dados nas ordens de serviço.

## 🚀 Como usar

### 1️⃣ Executar a migração SQL no Supabase

1. Acesse o Supabase: https://supabase.com/dashboard
2. Selecione seu projeto
3. Vá em **SQL Editor** (no menu lateral)
4. Clique em **New Query**
5. Copie e cole todo o conteúdo do arquivo `CLIENTES_E_MOTOS_MIGRATION.sql`
6. Clique em **Run** (ou pressione Ctrl+Enter)
7. Aguarde a mensagem de sucesso ✅

### 2️⃣ Usar a busca no formulário

Ao criar uma nova ordem de serviço:

1. Na aba **Cliente**, você verá um campo de busca no topo
2. Escolha o tipo de busca:
   - **CPF**: Busca exata por CPF
   - **Telefone**: Busca exata por telefone
   - **Nome**: Busca parcial por nome (encontra "João" mesmo digitando "Joa")

3. Digite o valor e clique em **Buscar** (ou pressione Enter)

4. Se o cliente for encontrado:
   - ✅ Os campos serão preenchidos automaticamente
   - As motos do cliente aparecerão na aba "Motos"
   - Você pode editar qualquer campo se necessário

5. Se o cliente não for encontrado:
   - ❌ Aparecerá uma mensagem
   - Preencha os campos manualmente como antes

## 📁 Arquivos criados

### 1. `src/hooks/useClients.ts`
Hook personalizado com funções para:
- Buscar clientes por CPF, telefone ou nome
- Buscar motos por placa
- Buscar todas as motos de um cliente
- Salvar novos clientes e motos

### 2. `src/components/ClientSearch.tsx`
Componente visual de busca que aparece no formulário:
- Interface amigável com 3 tipos de busca
- Feedback visual (✅ encontrado / ❌ não encontrado)
- Mensagens de sucesso/erro

### 3. `CLIENTES_E_MOTOS_MIGRATION.sql`
Script SQL que cria:
- Tabela `clients` (clientes)
- Tabela `motorcycles` (motos)
- Índices para busca rápida
- Políticas de segurança (RLS)
- Vinculação com ordens de serviço

## 🗄️ Estrutura do banco de dados

### Tabela: `clients`
| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | UUID | ID único do cliente |
| name | TEXT | Nome completo |
| cpf | TEXT | CPF (único) |
| phone | TEXT | Telefone |
| email | TEXT | Email |
| whatsapp | TEXT | WhatsApp |
| apelido | TEXT | Apelido/como prefere ser chamado |
| instagram | TEXT | Usuário do Instagram |
| autoriza_instagram | BOOLEAN | Autoriza conteúdo no Instagram |
| endereco | TEXT | Endereço completo |
| cidade | TEXT | Cidade |
| state | TEXT | Estado |
| notes | TEXT | Observações |
| active | BOOLEAN | Cliente ativo |
| created_at | TIMESTAMP | Data de criação |
| updated_at | TIMESTAMP | Data de atualização |

### Tabela: `motorcycles`
| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | UUID | ID único da moto |
| client_id | UUID | ID do cliente (dono) |
| placa | TEXT | Placa (única) |
| marca | TEXT | Marca (ex: Honda, Yamaha) |
| modelo | TEXT | Modelo (ex: CG 160, XRE 300) |
| ano | INTEGER | Ano de fabricação |
| cilindrada | TEXT | Cilindrada (ex: 160cc) |
| cor | TEXT | Cor |
| motor | TEXT | Número do motor |
| chassi | TEXT | Número do chassi (único) |
| notes | TEXT | Observações |
| active | BOOLEAN | Moto ativa |
| created_at | TIMESTAMP | Data de criação |
| updated_at | TIMESTAMP | Data de atualização |

## 🔧 Funcionalidades

### ✅ O que funciona agora:

1. **Busca de clientes**
   - Por CPF (busca exata)
   - Por telefone (busca exata)
   - Por nome (busca parcial)

2. **Preenchimento automático**
   - Dados do cliente preenchem os campos
   - Motos do cliente aparecem automaticamente
   - Evita digitação repetida

3. **Cadastro automático**
   - Ao criar uma OS, o sistema pode salvar o cliente automaticamente
   - Próximas OS do mesmo cliente serão mais rápidas

### 🔄 Próximos passos sugeridos:

1. **Salvar cliente automaticamente**
   - Ao criar uma OS com dados novos, salvar na tabela `clients`
   - Salvar a moto na tabela `motorcycles`

2. **Histórico de serviços**
   - Ver todas as OS anteriores de um cliente
   - Histórico de manutenção de uma moto específica

3. **Edição de clientes**
   - Página para gerenciar clientes cadastrados
   - Atualizar dados, desativar clientes, etc.

## 🐛 Solução de problemas

### Erro: "relation clients does not exist"
- ❌ A migração SQL não foi executada
- ✅ Execute o arquivo `CLIENTES_E_MOTOS_MIGRATION.sql` no Supabase

### Erro: "permission denied for table clients"
- ❌ As políticas RLS não foram criadas corretamente
- ✅ Execute novamente a seção de políticas do SQL

### Busca não encontra cliente que existe
- Verifique se o campo `active` está como `true`
- CPF e telefone precisam estar sem formatação (apenas números)
- Para nome, a busca é case-insensitive e parcial

## 💡 Dicas de uso

1. **Busque sempre antes de preencher**
   - Economiza tempo
   - Evita duplicação de dados
   - Mantém dados consistentes

2. **Use o tipo de busca adequado**
   - CPF: Mais rápido e preciso
   - Telefone: Bom quando o cliente não sabe o CPF
   - Nome: Útil quando não tem outras informações

3. **Mantenha os dados atualizados**
   - Se um cliente mudou de telefone, atualize na próxima OS
   - Adicione informações que faltam (Instagram, apelido, etc.)

## 📞 Contato

Se tiver dúvidas ou problemas, procure ajuda no chat!

---

**Criado em:** 26 de janeiro de 2026  
**Versão:** 1.0
