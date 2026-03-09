-- Clients table
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

-- Motorcycles table
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

-- Enable RLS
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.motorcycles ENABLE ROW LEVEL SECURITY;

-- Allow all operations (same as other tables in your schema)
DROP POLICY IF EXISTS clients_all ON public.clients;
DROP POLICY IF EXISTS motorcycles_all ON public.motorcycles;

CREATE POLICY clients_all ON public.clients FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY motorcycles_all ON public.motorcycles FOR ALL USING (true) WITH CHECK (true);

-- Create indexes for fast searches
CREATE INDEX IF NOT EXISTS clients_cpf_idx ON public.clients(cpf);
CREATE INDEX IF NOT EXISTS clients_name_idx ON public.clients(name);
CREATE INDEX IF NOT EXISTS clients_phone_idx ON public.clients(phone);
CREATE INDEX IF NOT EXISTS motorcycles_placa_idx ON public.motorcycles(placa);
CREATE INDEX IF NOT EXISTS motorcycles_client_id_idx ON public.motorcycles(client_id);

-- Trigger to update the updated_at column
DROP TRIGGER IF EXISTS update_clients_updated_at ON public.clients;
DROP TRIGGER IF EXISTS update_motorcycles_updated_at ON public.motorcycles;

CREATE TRIGGER update_clients_updated_at
BEFORE UPDATE ON public.clients
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_motorcycles_updated_at
BEFORE UPDATE ON public.motorcycles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
