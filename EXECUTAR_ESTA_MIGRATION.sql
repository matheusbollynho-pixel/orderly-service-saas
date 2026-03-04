-- ========================================
-- MIGRATION: Staff Tracking
-- ========================================
-- Este SQL adiciona as colunas para rastrear:
-- - Quem criou a OS
-- - Quem finalizou o pagamento
-- ========================================

-- Adicionar colunas em service_orders
ALTER TABLE public.service_orders
ADD COLUMN IF NOT EXISTS created_by_staff_id UUID REFERENCES public.staff_members(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS finalized_by_staff_id UUID REFERENCES public.staff_members(id) ON DELETE SET NULL;

-- Adicionar coluna em payments
ALTER TABLE public.payments
ADD COLUMN IF NOT EXISTS finalized_by_staff_id UUID REFERENCES public.staff_members(id) ON DELETE SET NULL;

-- Adicionar comentários explicativos
COMMENT ON COLUMN public.service_orders.created_by_staff_id IS 'Funcionário que criou esta ordem de serviço';
COMMENT ON COLUMN public.service_orders.finalized_by_staff_id IS 'Funcionário que finalizou/recebeu o pagamento';
COMMENT ON COLUMN public.payments.finalized_by_staff_id IS 'Funcionário que finalizou este pagamento';

-- Verificar se foi criado
SELECT 
    column_name, 
    data_type 
FROM information_schema.columns 
WHERE table_name IN ('service_orders', 'payments') 
  AND column_name LIKE '%staff%'
ORDER BY table_name, column_name;
