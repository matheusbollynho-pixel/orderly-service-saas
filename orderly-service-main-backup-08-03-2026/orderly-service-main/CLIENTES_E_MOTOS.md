# Guia de Implementação - Clientes e Motos

## 📋 Estrutura do Banco de Dados

### Tabela: `clients`
Armazena informações dos clientes

| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | UUID | ID único do cliente |
| name | TEXT | Nome completo do cliente |
| cpf | TEXT | CPF (único) |
| phone | TEXT | Telefone |
| email | TEXT | Email |
| whatsapp | TEXT | WhatsApp |
| apelido | TEXT | Apelido |
| instagram | TEXT | Usuário Instagram |
| autoriza_instagram | BOOLEAN | Autoriza compartilhar no Instagram |
| endereco | TEXT | Endereço completo |
| cidade | TEXT | Cidade |
| state | TEXT | Estado |
| notes | TEXT | Anotações |
| active | BOOLEAN | Status ativo/inativo |
| created_at | TIMESTAMPTZ | Data de criação |
| updated_at | TIMESTAMPTZ | Última atualização |

### Tabela: `motorcycles`
Armazena dados das motos

| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | UUID | ID único da moto |
| client_id | UUID | ID do cliente proprietário |
| placa | TEXT | Placa da moto (única) |
| marca | TEXT | Marca (Honda, Yamaha, etc) |
| modelo | TEXT | Modelo |
| ano | INTEGER | Ano de fabricação |
| cilindrada | TEXT | Cilindrada (125cc, 150cc, etc) |
| cor | TEXT | Cor da moto |
| motor | TEXT | Número do motor |
| chassi | TEXT | Número do chassi |
| notes | TEXT | Anotações |
| active | BOOLEAN | Status ativo/inativo |
| created_at | TIMESTAMPTZ | Data de criação |
| updated_at | TIMESTAMPTZ | Última atualização |

---

## 🔍 Buscas Otimizadas

As buscas por **CPF**, **nome**, **placa** e **telefone** são ultrarrápidas graças aos índices criados.

### Exemplos de Queries

#### 1. Buscar cliente por CPF
```javascript
const { data, error } = await supabase
  .from('clients')
  .select('*')
  .eq('cpf', '12345678910')
  .single();
```

#### 2. Buscar cliente por nome
```javascript
const { data, error } = await supabase
  .from('clients')
  .select('*')
  .ilike('name', '%João%');
```

#### 3. Buscar motos de um cliente
```javascript
const { data, error } = await supabase
  .from('motorcycles')
  .select('*')
  .eq('client_id', clientId);
```

#### 4. Buscar moto por placa
```javascript
const { data, error } = await supabase
  .from('motorcycles')
  .select('*')
  .eq('placa', 'ABC1234')
  .single();
```

#### 5. Buscar cliente com todas as motos
```javascript
const { data, error } = await supabase
  .from('clients')
  .select(`
    *,
    motorcycles (*)
  `)
  .eq('cpf', '12345678910')
  .single();
```

---

## 💡 Fluxo Sugerido para Sua Aplicação

### Ao criar uma Ordem de Serviço (OS):

1. **Usuário insere CPF ou nome do cliente**
2. **Sistema busca no banco**
   - Se encontrar → preenche dados automaticamente
   - Se não encontrar → mostra formulário para criar novo cliente
3. **Cliente selecionado → mostra lista de motos cadastradas**
4. **Usuário seleciona a moto (ou cria nova)**
5. **Formulário preenchido automaticamente com dados da moto**

---

## 🔧 Exemplo de Implementação (JavaScript/React)

### Buscar Cliente por CPF e Preencher
```javascript
async function buscarClientePorCPF(cpf) {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('cpf', cpf.replace(/\D/g, '')) // Remove caracteres não-numéricos
    .single();

  if (error) {
    console.error('Cliente não encontrado');
    return null;
  }

  return data;
}
```

### Buscar Motos do Cliente
```javascript
async function buscarMotosDoCliente(clientId) {
  const { data, error } = await supabase
    .from('motorcycles')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Erro ao buscar motos');
    return [];
  }

  return data;
}
```

### Criar Novo Cliente
```javascript
async function criarCliente(clienteData) {
  const { data, error } = await supabase
    .from('clients')
    .insert([
      {
        name: clienteData.nome,
        cpf: clienteData.cpf.replace(/\D/g, ''),
        phone: clienteData.telefone,
        whatsapp: clienteData.whatsapp,
        email: clienteData.email,
        apelido: clienteData.apelido,
        instagram: clienteData.instagram,
        autoriza_instagram: clienteData.autoriza_instagram || false,
        endereco: clienteData.endereco,
        cidade: clienteData.cidade,
        state: clienteData.estado,
      }
    ])
    .select()
    .single();

  if (error) {
    console.error('Erro ao criar cliente:', error);
    return null;
  }

  return data;
}
```

### Criar Nova Moto para um Cliente
```javascript
async function criarMoto(clientId, motoData) {
  const { data, error } = await supabase
    .from('motorcycles')
    .insert([
      {
        client_id: clientId,
        placa: motoData.placa.toUpperCase(),
        marca: motoData.marca,
        modelo: motoData.modelo,
        ano: motoData.ano,
        cilindrada: motoData.cilindrada,
        cor: motoData.cor,
        motor: motoData.motor,
        chassi: motoData.chassi,
      }
    ])
    .select()
    .single();

  if (error) {
    console.error('Erro ao criar moto:', error);
    return null;
  }

  return data;
}
```

---

## 🚀 Próximos Passos

1. **Execute a migração** no Supabase:
   - Vá ao SQL Editor
   - Copie o conteúdo de `202601260835_create_clients_and_motorcycles.sql`
   - Execute

2. **Integre no seu frontend**:
   - Adicione campos de busca por CPF/Placa
   - Implemente auto-preenchimento
   - Crie formulários para novo cliente/moto

3. **Vincule com Service Orders**:
   - Adicione `client_id` e `motorcycle_id` às suas OS
   - Mantenha referência para rastreabilidade

---

## ✅ Benefícios

✅ Histórico completo de cada cliente e moto  
✅ Busca rápida e eficiente  
✅ Evita digitação repetida  
✅ Dados sempre sincronizados  
✅ Relatórios mais fáceis de gerar  
