-- Cliente: dados para NF-e (nota grande, cliente com CNPJ). Tudo opcional; o "Buscar CNPJ" preenche quase tudo.
-- O endereço em texto livre (endereco/cidade/state) continua existindo; estes campos são o endereço "em partes".
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS razao_social text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS ie text;                       -- Inscrição Estadual (digitada à mão)
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS ie_indicador text
  CHECK (ie_indicador IS NULL OR ie_indicador IN ('contribuinte', 'isento', 'nao_contribuinte'));
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS cep text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS logradouro text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS numero text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS complemento text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS bairro text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS cidade_ibge text;              -- código IBGE do município (7 dígitos)
