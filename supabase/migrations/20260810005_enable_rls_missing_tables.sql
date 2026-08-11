-- ============================================================
-- CRÍTICO: essas 4 tabelas tinham policy escrita (ou nem isso)
-- mas RLS nunca foi ligado — qualquer tenant conseguia ler os
-- dados de qualquer outro tenant (nomes/telefones reais de
-- clientes vazando entre lojas). Achado ao testar conta demo.
-- ============================================================

ALTER TABLE service_orders               ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_items              ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_reminder_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers                    ENABLE ROW LEVEL SECURITY;
