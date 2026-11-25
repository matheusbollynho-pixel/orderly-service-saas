-- Texto do aviso de preço especial vencendo fica junto das outras mensagens (Engrenagem > Mensagens).
-- Vazio = texto padrão. (tipos_cliente.aviso_texto fica só como reserva; a tela não usa mais.)
ALTER TABLE public.store_settings ADD COLUMN IF NOT EXISTS whatsapp_lojista_aviso_template text;
