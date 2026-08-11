-- ============================================================
-- store_members.permissions: override de permissões por membro
-- (null = usa o default ALL_PERMISSIONS no frontend)
-- ============================================================

ALTER TABLE store_members
  ADD COLUMN IF NOT EXISTS permissions JSONB;

NOTIFY pgrst, 'reload schema';
