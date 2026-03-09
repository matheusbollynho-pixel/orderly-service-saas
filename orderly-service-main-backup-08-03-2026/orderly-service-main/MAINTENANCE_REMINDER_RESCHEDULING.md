# Sistema de Reprogramação de Lembretes de Manutenção

## Visão Geral

O sistema agora implementa a lógica de **cancelamento e reprogramação automática** de lembretes de manutenção quando um cliente retorna antes do prazo esperado.

## Como Funciona

### Cenário 1: Cliente Retorna Antes do Prazo

```
1. Cliente realiza serviço de "Troca de Óleo"
   └─ Sistema cria lembrete para: DATA_SERVIÇO + 10.000 KM (ou X dias)

2. Cliente retorna ANTES do prazo com novo serviço
   └─ Sistema detecta novo serviço com mesma palavra-chave
   └─ Sistema cancela lembrete anterior (automaticamente)
   └─ Sistema cria novo lembrete com base na NOVA data de serviço
   └─ Usuário recebe notificação: "✅ Lembrete anterior cancelado. Novo agendado..."
```

### Cenário 2: Cliente Retorna Após o Prazo

```
1. Cliente realiza serviço de "Troca de Óleo"
   └─ Sistema cria lembrete para: DATA_SERVIÇO + 10.000 KM

2. Lembrete é enviado ("Notificação de Troca de Óleo")

3. Cliente retorna APÓS o prazo com novo serviço
   └─ Sistema detecta novo serviço com mesma palavra-chave
   └─ Lembrete anterior já foi enviado (não há o que cancelar)
   └─ Sistema cria novo lembrete com base na NOVA data de serviço
```

## Funções Principais

### `rescheduleMaintenanceReminder()`

**Propósito:** Cancelar lembretes pendentes e criar novo lembrete para o mesmo cliente/palavra-chave

```typescript
async function rescheduleMaintenanceReminder(
  orderId: string,
  clientId: string | null,
  clientPhone: string,
  keywordId: string,
  newServiceDate: Date
): Promise<{ cancelled: number; created: MaintenanceReminder | null }>
```

**Retorno:**
- `cancelled`: Quantidade de lembretes anteriores cancelados (0 ou 1)
- `created`: Novo lembrete criado (ou null se falhar)

**Exemplo de uso:**
```typescript
const result = await rescheduleMaintenanceReminder(
  orderId: "order-123",
  clientId: "client-456",
  clientPhone: "11999999999",
  keywordId: "keyword-oleo",
  newServiceDate: new Date()
);

if (result.created) {
  console.log(`Lembretes cancelados: ${result.cancelled}`);
  console.log(`Novo lembrete criado: ${result.created.id}`);
}
```

### `cancelPendingRemindersForKeyword()`

**Propósito:** Cancelar lembretes pendentes para um cliente/palavra-chave específica

```typescript
async function cancelPendingRemindersForKeyword(
  clientId: string | null,
  clientPhone: string,
  keywordId: string,
  reason?: string
): Promise<number>
```

**Retorno:** Número de lembretes cancelados

**Razões suportadas:**
- `"Cliente retornou antes do prazo - remarcação de lembrete"` (padrão)
- `"Cliente retornou para serviço - remarcação automática"`
- Custom reason string

### `getReminderCancellationHistory()`

**Propósito:** Recuperar histórico de cancelamentos para um cliente

```typescript
async function getReminderCancellationHistory(
  clientId: string | null,
  clientPhone: string
): Promise<any[]>
```

## Integração no Fluxo de Criação de Materiais

Quando um material é adicionado a uma ordem de serviço:

1. **Detecção de palavra-chave:** O sistema verifica se a descrição do material contém alguma palavra-chave de manutenção
2. **Reprogramação automática:** Se encontrada, `rescheduleMaintenanceReminder()` é chamada
3. **Feedback visual:** O usuário recebe uma notificação informando:
   - Se um lembrete anterior foi cancelado
   - A nova data programada do lembrete
   - O número de dias até o próximo agendamento

**Arquivo:** `src/pages/Index.tsx` (função `handleAddMaterial`)

```typescript
const result = await rescheduleMaintenanceReminder(
  selectedOrder.id,
  selectedOrder.client_id,
  selectedOrder.client_phone || '',
  detectedKeyword.id,
  serviceDate
);

if (result.created) {
  const message = result.cancelled > 0 
    ? `✅ Lembrete anterior cancelado. Novo agendado para "${detectedKeyword.keyword}" em ${detectedKeyword.reminder_days} dias! 🔔`
    : `✅ Lembrete criado para "${detectedKeyword.keyword}" em ${detectedKeyword.reminder_days} dias! 🔔`;
  toast.success(message);
}
```

## Schema SQL (Opcional)

Se desejar manter histórico detalhado de cancelamentos, crie a tabela:

```sql
CREATE TABLE maintenance_reminder_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid,
  client_phone text,
  keyword_id uuid NOT NULL REFERENCES maintenance_keywords(id),
  action text NOT NULL, -- 'cancelled', 'created', 'sent'
  reason text,
  original_due_date timestamp,
  original_service_date timestamp,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE INDEX idx_reminder_history_client_id ON maintenance_reminder_history(client_id);
CREATE INDEX idx_reminder_history_keyword_id ON maintenance_reminder_history(keyword_id);
CREATE INDEX idx_reminder_history_action ON maintenance_reminder_history(action);
```

## Casos de Uso Suportados

### ✅ Troca de Óleo
- Cliente retorna 2 meses depois (antes do prazo de 3 meses)
- Sistema cancela lembrete anterior
- Sistema agenda novo lembrete para 3 meses depois

### ✅ Revisão
- Regra especial: "Revisão" cancela TODOS os outros lembretes do mesmo dia
- Se cliente retorna para revisão, outros lembretes são automaticamente cancelados

### ✅ Manutenções Preventivas
- Cliente retorna com novo serviço dentro do prazo
- Lembretes anteriores são automaticamente cancelados
- Novo lembrete é criado com base na nova data

### ✅ Serviços Recorrentes
- Cada novo serviço reprograma o lembrete
- Histórico é mantido para auditoria
- Usuário é notificado de cada reprogramação

## Testes

Para testar o sistema:

1. **Criar um serviço com palavra-chave:**
   - Adicionar material com descrição "Troca de Óleo"
   - Sistema cria lembrete com data + 10 dias

2. **Retorno antecipado:**
   - Adicionar novo material "Revisão de óleo" antes dos 10 dias
   - Sistema cancela primeiro lembrete
   - Sistema cria novo lembrete com nova data

3. **Verificar notificações:**
   - Toast deve mostrar "Lembrete anterior cancelado..."
   - Dashboard de manutenção deve atualizar contadores

## Logs

O sistema registra as seguintes ações:

```
✅ N lembrete(s) cancelado(s) para reprogramação
📅 Lembrete reprogramado: X cancelado(s), 1 novo criado
```

## Limitações e Notas

- ✅ Apenas lembretes **não enviados** são cancelados
- ✅ Se lembrete já foi enviado, um novo é criado (não cancelado)
- ✅ Histórico é opcional (requer tabela `maintenance_reminder_history`)
- ✅ Sistema respeita flag `autoriza_lembretes` do cliente
- ⚠️ Palavra-chave "Revisão" tem comportamento especial (cancela outros lembretes)

## Futuras Melhorias

- [ ] Dashboard de histórico de reprogramações por cliente
- [ ] Relatório de taxa de reprogramação (clientes que retornam cedo)
- [ ] Predicção de padrões de manutenção por cliente
- [ ] Notificação ao cliente sobre cancelamento de lembrete
