-- 1️⃣ Criar a coluna (permitindo NULL inicialmente)
ALTER TABLE public.service_orders
ADD COLUMN client_cpf TEXT;

-- 2️⃣ Preencher registros antigos
UPDATE public.service_orders
SET client_cpf = ''
WHERE client_cpf IS NULL;

-- 3️⃣ Definir valor padrão para novos registros
ALTER TABLE public.service_orders
ALTER COLUMN client_cpf SET DEFAULT '';

-- 4️⃣ Tornar NOT NULL
ALTER TABLE public.service_orders
ALTER COLUMN client_cpf SET NOT NULL;
