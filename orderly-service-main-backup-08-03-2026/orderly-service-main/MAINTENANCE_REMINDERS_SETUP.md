# 🔔 Sistema de Lembretes Automáticos de Manutenção

## Como executar as migrações

Você deve executar as seguintes SQLs no **Supabase SQL Editor**:

### 1️⃣ Criar tabelas de keywords e reminders
Copie e execute esta SQL no Supabase Dashboard > SQL Editor:

```sql
-- Create maintenance keywords table
CREATE TABLE IF NOT EXISTS maintenance_keywords (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  keyword varchar(255) NOT NULL UNIQUE,
  description text,
  reminder_days integer NOT NULL DEFAULT 90,
  reminder_message text,
  enabled boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create maintenance reminders table
CREATE TABLE IF NOT EXISTS maintenance_reminders (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES service_orders(id) ON DELETE CASCADE,
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE,
  keyword_id uuid NOT NULL REFERENCES maintenance_keywords(id) ON DELETE CASCADE,
  service_date timestamptz NOT NULL,
  reminder_due_date timestamptz NOT NULL,
  reminder_sent_at timestamptz,
  client_phone varchar(20),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_maintenance_reminders_due_date ON maintenance_reminders(reminder_due_date);
CREATE INDEX IF NOT EXISTS idx_maintenance_reminders_sent_at ON maintenance_reminders(reminder_sent_at);
CREATE INDEX IF NOT EXISTS idx_maintenance_reminders_client ON maintenance_reminders(client_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_keywords_enabled ON maintenance_keywords(enabled);

-- Enable RLS
ALTER TABLE maintenance_keywords ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_reminders ENABLE ROW LEVEL SECURITY;

-- RLS Policies for maintenance_keywords
CREATE POLICY "Allow authenticated to read keywords"
  ON maintenance_keywords
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated to insert keywords"
  ON maintenance_keywords
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated to update keywords"
  ON maintenance_keywords
  FOR UPDATE
  TO authenticated
  USING (true);

-- RLS Policies for maintenance_reminders
CREATE POLICY "Allow authenticated to read reminders"
  ON maintenance_reminders
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated to insert reminders"
  ON maintenance_reminders
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated to update reminders"
  ON maintenance_reminders
  FOR UPDATE
  TO authenticated
  USING (true);

-- Insert default keywords
INSERT INTO maintenance_keywords (keyword, description, reminder_days, reminder_message, enabled)
VALUES
  ('Óleo', 'Troca de óleo do motor', 90, 'Olá! Já se passaram {days} dias desde que você trocou o óleo. É hora de fazer a manutenção! 🛢️', true),
  ('Revisão', 'Revisão preventiva da moto', 180, 'Olá! Sua moto está no prazo para revisão preventiva. Agende agora! 🔧', true),
  ('Pneu', 'Troca/Verificação de pneu', 365, 'Olá! É hora de verificar a pressão e condição dos seus pneus. 🛞', true),
  ('Bateria', 'Verificação/Troca de bateria', 365, 'Olá! Faça uma revisão na bateria da sua moto. 🔋', true),
  ('Corrente', 'Limpeza e lubricação da corrente', 90, 'Olá! É hora de limpar e lubrificar a corrente da sua moto. ⛓️', true),
  ('Filtro de Ar', 'Troca de filtro de ar', 180, 'Olá! Seu filtro de ar pode estar saturado. Venha fazer a troca! 💨', true)
ON CONFLICT (keyword) DO NOTHING;
```

### 2️⃣ Agendar verificação diária via cron

Execute esta SQL para agendar a verificação automática de lembretes:

```sql
SELECT cron.schedule(
  'check_maintenance_reminders_daily',
  '0 8 * * *',
  'SELECT net.http_post(
    url := ''https://xqndblstrblqleraepzs.supabase.co/functions/v1/check-maintenance-reminders'',
    headers := jsonb_build_object(
      ''Content-Type'', ''application/json'',
      ''Authorization'', ''Bearer '' || current_setting(''app.settings.supabase_key'', true)
    ),
    body := jsonb_build_object()::text
  ) as request_id;'
);
```

## ✨ Como funciona

### 📋 Palavras-chave Cadastradas (ATUALIZÁVEL)

| Keyword | Descrição | Período | Mensagem | Status |
|---------|-----------|---------|----------|--------|
| Óleo | Troca de óleo do motor | 90 dias | Olá! Já se passaram {days} dias desde que você trocou o óleo. É hora de fazer a manutenção! 🛢️ | ✅ Ativa |
| Revisão | Revisão preventiva da moto | 180 dias | Olá! Sua moto está no prazo para revisão preventiva. Agende agora! 🔧 | ✅ Ativa |
| Pneu | Troca/Verificação de pneu | 365 dias | Olá! É hora de verificar a pressão e condição dos seus pneus. 🛞 | ✅ Ativa |
| Bateria | Verificação/Troca de bateria | 365 dias | Olá! Faça uma revisão na bateria da sua moto. 🔋 | ✅ Ativa |
| Corrente | Limpeza e lubricação da corrente | 90 dias | Olá! É hora de limpar e lubrificar a corrente da sua moto. ⛓️ | ✅ Ativa |
| Filtro de Ar | Troca de filtro de ar | 180 dias | Olá! Seu filtro de ar pode estar saturado. Venha fazer a troca! 💨 | ✅ Ativa |

**ATUALIZE ESTA TABELA QUANDO ADICIONAR/MODIFICAR KEYWORDS NO SISTEMA!**

### 🎯 Como Gerenciar Keywords

#### ➕ Adicionar Nova Keyword
1. Vá em: **Pós-Venda → Manutenção**
2. Clique em **"Adicionar Keyword"** (botão verde)
3. Preencha:
   - **Palavra-chave**: Ex: "Correia"
   - **Descrição**: Ex: "Troca de correia dentada"
   - **Dias para Lembrete**: Ex: 180
   - **Mensagem**: Use `{days}` e `{keyword}` como variáveis
4. Clique em **"Adicionar"**
5. **ATUALIZE A TABELA ACIMA** com a nova keyword

#### ✏️ Editar Keyword Existente
1. Vá em: **Pós-Venda → Manutenção**
2. Clique em **"Editar"** na keyword desejada
3. Modifique os dados (período, mensagem, status)
4. Clique em **"Salvar"**
5. **ATUALIZE A TABELA ACIMA** com as mudanças

#### 🔴 Desativar Keyword
1. Clique em **"Editar"** na keyword
2. Desabilite ou delete conforme necessário
3. **ATUALIZE A TABELA ACIMA** (mude Status para ❌ Inativa)

### 1. Criação de OS com Keywords
- Quando você cria uma OS e adiciona descrição com palavras-chave como "Óleo", "Revisão", etc.
- O sistema **automaticamente detecta** e exibe um alerta
- Um **lembrete automático** é criado no banco de dados

### 2. Lembretes Automáticos
- Diariamente às **8:00 UTC**, a função `check-maintenance-reminders` executa
- Busca por lembretes que já venceram (data_vencimento ≤ hoje)
- Envia mensagem WhatsApp ao cliente: _"Já se passaram X dias desde que você trocou o óleo..."_
- Marca como enviado para não enviar duplicado

### 3. Palavras-chave Configuráveis
- Você pode gerenciar keywords no AdminMenu
- Editar período de cada uma
- Desativar/ativar conforme necessário
- Personalizar a mensagem

## 🎯 Exemplo de Fluxo

```
1. 15/02: Cliente traz moto para trocar óleo
   └─ OS criada com "Troca de óleo" na descrição
   └─ Sistema detecta "Óleo" → cria lembrete para 15/05 (90 dias depois)

2. 15/05: Diariamente às 8:00 UTC
   └─ Função cron verifica: "Tem lembrete vencido?"
   └─ SIM! Envia WhatsApp: "Já se passaram 90 dias desde que você trocou o óleo. É hora de fazer a manutenção! 🛢️"
   └─ Cliente recebe e pode responder para agendar

3. Cliente marca como enviado
   └─ Próximo lembrete será quando ele fizer o próximo serviço
```

## 🛠️ Gerenciar Keywords

No AdminMenu (⚙️ no canto superior direito), você pode:

- ✏️ **Editar** keywords existentes
- ➕ **Adicionar** novas keywords
- 🔄 **Alterar** o período de dias
- 📝 **Personalizar** a mensagem com variáveis: `{days}` e `{keyword}`

## 📱 Variáveis de Mensagem

Use estas variáveis na mensagem:
- `{days}` = dias decorridos desde o serviço
- `{keyword}` = nome da palavra-chave (ex: "Óleo")

Exemplo:
```
"Olá! Já se passaram {days} dias desde seu {keyword}. É hora de agendar! 🔧"
```

## ⚠️ Importante

- Edge Function `check-maintenance-reminders` deve ser implantada no Supabase
- pg_cron deve estar ativo no seu plano Supabase
- Z-API deve estar configurada com credenciais corretas para enviar WhatsApp

Se encontrar erros, verifique os logs da Edge Function em: Supabase Dashboard > Edge Functions > check-maintenance-reminders
