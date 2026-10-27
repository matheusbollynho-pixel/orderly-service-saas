-- ============================================================
-- store_settings: visitante sem login não lê mais chave/token
-- ============================================================
-- A policy "store_settings: anon read" (active = true) liberava TODAS as
-- colunas pra qualquer um com a chave pública do site — inclusive
-- asaas_api_key e whatsapp_instance_token das lojas (achado 27/10/2026).
-- O app não lê store_settings sem login hoje; fica só o básico de vitrine.

revoke select on public.store_settings from anon;

grant select (
  id, company_name, logo_url, subdomain, custom_domain, active,
  vehicle_type, store_phone, store_address, store_instagram, instagram_url,
  google_maps_url, opening_hours
) on public.store_settings to anon;
