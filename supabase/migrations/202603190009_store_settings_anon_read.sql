-- Permite que usuários não autenticados (páginas públicas e tela de login)
-- possam ler as configurações da loja (logo, nome da empresa).
CREATE POLICY IF NOT EXISTS "anon can read settings"
  ON store_settings FOR SELECT TO anon USING (true);
