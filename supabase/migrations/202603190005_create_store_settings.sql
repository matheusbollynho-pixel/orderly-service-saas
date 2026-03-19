CREATE TABLE IF NOT EXISTS store_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL DEFAULT 'Minha Oficina',
  whatsapp_confirmation_template TEXT NOT NULL DEFAULT
    'Olá{{nome}}! 👋

Seu agendamento na *{{empresa}}* foi confirmado! ✅

📅 *Data:* {{data}}
🕐 *Turno:* {{turno}}
🏍️ *Moto:* {{moto}}
🔧 *Serviço:* {{servico}}

Qualquer dúvida, é só chamar. Te esperamos! 😊

*{{empresa}}* 🏍️🔧',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Garante apenas uma linha por projeto
CREATE UNIQUE INDEX IF NOT EXISTS store_settings_single_row ON store_settings ((true));

-- RLS
ALTER TABLE store_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated can read settings"
  ON store_settings FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated can upsert settings"
  ON store_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Linha padrão
INSERT INTO store_settings (company_name) VALUES ('Minha Oficina')
ON CONFLICT DO NOTHING;
