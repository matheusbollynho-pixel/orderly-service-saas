# 🔧 EXECUTAR MIGRATION - Staff Tracking

## O que foi implementado?

Agora o sistema permite **selecionar** quem criou a OS e quem finalizou o pagamento!

### ✨ Novos recursos:

1. **Na criação de OS** (aba Serviços):
   - ✏️ Campo "Quem está criando essa OS?"
   - 💰 Campo "Quem vai finalizar o pagamento?"
   - 🎤 Campo "Quem atendeu no balcão?" (já existia)

2. **No pagamento** (OrderDetails):
   - 💰 Campo "Quem vai finalizar o pagamento?" antes de adicionar pagamento

## 📋 PASSO 1: Executar Migration no Banco

### Acesse o SQL Editor do Supabase:
**Link direto:** https://supabase.com/dashboard/project/xqndblstrblqleraepzs/sql/new

### Cole este SQL e execute:

```sql
-- Add staff tracking columns to service_orders
-- created_by_staff_id: quem criou a OS
-- finalized_by_staff_id: quem finalizou o pagamento

ALTER TABLE public.service_orders
ADD COLUMN IF NOT EXISTS created_by_staff_id UUID REFERENCES public.staff_members(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS finalized_by_staff_id UUID REFERENCES public.staff_members(id) ON DELETE SET NULL;

-- Create comments for documentation
COMMENT ON COLUMN public.service_orders.created_by_staff_id IS 'Staff member who created this service order';
COMMENT ON COLUMN public.service_orders.finalized_by_staff_id IS 'Staff member who finalized/received the payment';
```

### Clique em **RUN** ▶️

## ✅ PASSO 2: Verificar

Após executar a migration, acesse:
- https://os-bandara.vercel.app

### Teste:
1. Criar nova OS
2. Verificar se aparecem os 3 seletores na aba Serviços:
   - ✏️ Quem está criando essa OS?
   - 💰 Quem vai finalizar o pagamento?
   - 🎤 Quem atendeu no balcão?

3. Ao adicionar pagamento, verificar se aparece:
   - 💰 Quem vai finalizar o pagamento?

## 📊 Estrutura de Dados

### Tabela: `service_orders`
Novos campos:
- `created_by_staff_id` → FK para `staff_members` (quem criou)
- `finalized_by_staff_id` → FK para `staff_members` (quem finalizou)
- `atendimento_id` → FK para `staff_members` (quem atendeu no balcão)

### Tabela: `payments`
Campo atualizado:
- `finalized_by_staff_id` → FK para `staff_members` (quem finalizou o pagamento)

## 🔮 Próximos passos (futuro)

Quando cada pessoa tiver seu próprio login:
- Auto-popular `created_by_staff_id` com o usuário logado
- Auto-popular `finalized_by_staff_id` com quem processou o pagamento
- Remover os seletores manuais

## ⚠️ Observações

- Os campos são **opcionais** (podem ficar vazios)
- No futuro, serão preenchidos automaticamente baseado no login
- Por enquanto, selecione manualmente nos dropdowns
