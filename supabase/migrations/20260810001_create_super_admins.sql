-- ============================================================
-- super_admins: controla quem acessa o painel /superadmin
-- (dono da plataforma SpeedSeekOS, não confundir com store_members.role='admin')
-- ============================================================

CREATE TABLE IF NOT EXISTS super_admins (
  user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE super_admins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admins: self read"
  ON super_admins FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "super_admins: service_role all"
  ON super_admins FOR ALL TO service_role
  USING (true) WITH CHECK (true);
