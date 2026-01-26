-- ================================================================
-- MIGRAÇÃO: Sistema de Clientes e Motos para Busca Automática
-- Data: 26/01/2026
-- Descrição: Cria tabelas de clientes e motos para preencher
--            automaticamente as ordens de serviço
-- ================================================================

-- ====================
-- 1. TABELA DE CLIENTES
-- ====================
CREATE TABLE IF NOT EXISTS public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  cpf TEXT UNIQUE NOT NULL,
  phone TEXT,
  email TEXT,
  whatsapp TEXT,
  apelido TEXT,
  instagram TEXT,
  autoriza_instagram BOOLEAN NOT NULL DEFAULT false,
  endereco TEXT,
  cidade TEXT,
  state TEXT,
  notes TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ====================
-- 2. TABELA DE MOTOS
-- ====================
CREATE TABLE IF NOT EXISTS public.motorcycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  placa TEXT UNIQUE NOT NULL,
  marca TEXT NOT NULL,
  modelo TEXT NOT NULL,
  ano INTEGER,
  cilindrada TEXT,
  cor TEXT,
  motor TEXT,
  chassi TEXT UNIQUE,
  notes TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ====================
-- 3. HABILITAR RLS (Row Level Security)
-- ====================
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.motorcycles ENABLE ROW LEVEL SECURITY;

-- ====================
-- 4. POLÍTICAS DE ACESSO
-- ====================
-- Remover políticas antigas se existirem
DROP POLICY IF EXISTS clients_all ON public.clients;
DROP POLICY IF EXISTS motorcycles_all ON public.motorcycles;

-- Permitir todas as operações (mesma política das outras tabelas)
CREATE POLICY clients_all ON public.clients 
  FOR ALL 
  USING (true) 
  WITH CHECK (true);

CREATE POLICY motorcycles_all ON public.motorcycles 
  FOR ALL 
  USING (true) 
  WITH CHECK (true);

-- ====================
-- 5. ÍNDICES PARA BUSCA RÁPIDA
-- ====================
-- Índices para clientes
CREATE INDEX IF NOT EXISTS clients_cpf_idx ON public.clients(cpf);
CREATE INDEX IF NOT EXISTS clients_name_idx ON public.clients(name);
CREATE INDEX IF NOT EXISTS clients_phone_idx ON public.clients(phone);
CREATE INDEX IF NOT EXISTS clients_active_idx ON public.clients(active);

-- Índices para motos
CREATE INDEX IF NOT EXISTS motorcycles_placa_idx ON public.motorcycles(placa);
CREATE INDEX IF NOT EXISTS motorcycles_client_id_idx ON public.motorcycles(client_id);
CREATE INDEX IF NOT EXISTS motorcycles_active_idx ON public.motorcycles(active);

-- ====================
-- 6. TRIGGERS PARA ATUALIZAR updated_at
-- ====================
-- Remover triggers antigos se existirem
DROP TRIGGER IF EXISTS update_clients_updated_at ON public.clients;
DROP TRIGGER IF EXISTS update_motorcycles_updated_at ON public.motorcycles;

-- Criar triggers (assumindo que a função update_updated_at_column já existe)
CREATE TRIGGER update_clients_updated_at
  BEFORE UPDATE ON public.clients
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_motorcycles_updated_at
  BEFORE UPDATE ON public.motorcycles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ====================
-- 7. VINCULAR COM ORDENS DE SERVIÇO
-- ====================
-- Adicionar colunas de referência na tabela service_orders
ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.clients(id);

ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS motorcycle_id UUID REFERENCES public.motorcycles(id);

-- Data de nascimento do cliente na OS (para relatórios e impressão)
ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS client_birth_date DATE;

-- Data de nascimento armazenada também no cadastro do cliente
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS birth_date DATE;

-- Criar índices para as novas colunas
CREATE INDEX IF NOT EXISTS service_orders_client_id_idx ON public.service_orders(client_id);
CREATE INDEX IF NOT EXISTS service_orders_motorcycle_id_idx ON public.service_orders(motorcycle_id);

-- ====================
-- 8. COMENTÁRIOS PARA DOCUMENTAÇÃO
-- ====================
COMMENT ON TABLE public.clients IS 'Cadastro de clientes da oficina';
COMMENT ON TABLE public.motorcycles IS 'Cadastro de motos vinculadas aos clientes';

COMMENT ON COLUMN public.clients.cpf IS 'CPF único do cliente (apenas números)';
COMMENT ON COLUMN public.clients.autoriza_instagram IS 'Autorização para criar conteúdo e marcar no Instagram';
COMMENT ON COLUMN public.motorcycles.placa IS 'Placa única da moto';
COMMENT ON COLUMN public.motorcycles.client_id IS 'Referência ao proprietário da moto';

-- ====================
-- 9. FUNÇÃO PARA MIGRAR DADOS EXISTENTES (OPCIONAL)
-- ====================
-- Esta função pode ser usada para migrar clientes existentes das ordens de serviço
-- Execute manualmente se necessário:

/*
CREATE OR REPLACE FUNCTION migrate_existing_clients()
RETURNS void AS $$
DECLARE
  r RECORD;
  v_client_id UUID;
BEGIN
  FOR r IN 
    SELECT DISTINCT 
      client_name,
      client_cpf,
      client_phone,
      client_address
    FROM public.service_orders
    WHERE client_cpf IS NOT NULL 
      AND client_cpf != ''
      AND NOT EXISTS (
        SELECT 1 FROM public.clients WHERE cpf = client_cpf
      )
  LOOP
    INSERT INTO public.clients (name, cpf, phone, endereco)
    VALUES (r.client_name, r.client_cpf, r.client_phone, r.client_address)
    ON CONFLICT (cpf) DO NOTHING;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Para executar a migração, descomente e execute:
-- SELECT migrate_existing_clients();
*/

-- ====================
-- ✅ MIGRAÇÃO CONCLUÍDA
-- ====================
-- Agora você pode:
-- 1. Buscar clientes por CPF, telefone ou nome
-- 2. Preencher automaticamente os dados nas ordens de serviço
-- 3. Cadastrar motos vinculadas aos clientes
-- 4. Manter histórico de clientes e motos
