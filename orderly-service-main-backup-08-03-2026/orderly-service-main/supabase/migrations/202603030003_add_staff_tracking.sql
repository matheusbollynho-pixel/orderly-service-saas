-- Add staff tracking columns to service_orders
-- created_by_staff_id: quem criou a OS
-- finalized_by_staff_id: quem finalizou o pagamento

ALTER TABLE public.service_orders
ADD COLUMN created_by_staff_id UUID REFERENCES public.staff_members(id) ON DELETE SET NULL,
ADD COLUMN finalized_by_staff_id UUID REFERENCES public.staff_members(id) ON DELETE SET NULL;

-- Create comments for documentation
COMMENT ON COLUMN public.service_orders.created_by_staff_id IS 'Staff member who created this service order';
COMMENT ON COLUMN public.service_orders.finalized_by_staff_id IS 'Staff member who finalized/received the payment';
