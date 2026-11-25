-- Tipos de cliente: onde o preço vale além do balcão (configurável por tipo).
-- vale_pecas_os: peças do estoque na OS saem com o preço do tipo (ligado por padrão).
-- vale_servico_os: serviço/mão de obra na OS sai com o desconto % do tipo (desligado por padrão).
ALTER TABLE public.tipos_cliente ADD COLUMN IF NOT EXISTS vale_pecas_os boolean NOT NULL DEFAULT true;
ALTER TABLE public.tipos_cliente ADD COLUMN IF NOT EXISTS vale_servico_os boolean NOT NULL DEFAULT false;
