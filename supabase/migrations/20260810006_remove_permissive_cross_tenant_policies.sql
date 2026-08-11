-- ============================================================
-- CRÍTICO: várias tabelas tinham uma política extra "aberta"
-- (qual = true, às vezes pra role public/anon) coexistindo com
-- a política correta por loja. RLS é permissivo (OR entre
-- policies), então a política aberta anulava o isolamento —
-- qualquer tenant (inclusive um trial recém-criado) conseguia
-- ler/escrever caixa, boletos, fiados e fiado_messages de
-- QUALQUER outra loja. fiados/fiado_payments/fiado_messages
-- estavam abertos até pra usuário não-logado (role public).
--
-- satisfaction_ratings: anon select expunha avaliações (nome +
-- comentário) de todas as lojas pra qualquer visitante — usado
-- só pela página /avaliacoes/feed, que ainda precisa ganhar
-- filtro por loja pra voltar a funcionar (hoje fica vazia).
--
-- maintenance_keywords tinha store_id mas as policies antigas
-- ignoravam — corrigido pra usar só a policy "store" existente.
--
-- pericias e webhook_message_log: tabelas sem nenhum uso no
-- código atual, com policy pública "true" (a de
-- webhook_message_log estava com o nome enganoso
-- "service_role full access" mas valia pra role public).
-- Travadas — pericias sem policy nenhuma (nega tudo exceto
-- service_role), webhook_message_log com policy correta
-- restrita a service_role.
-- ============================================================

DROP POLICY IF EXISTS "boletos: authenticated only" ON boletos;
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON cash_flow;
DROP POLICY IF EXISTS "fiado_messages_all" ON fiado_messages;
DROP POLICY IF EXISTS "fiado_payments_all" ON fiado_payments;
DROP POLICY IF EXISTS "fiados_all" ON fiados;
DROP POLICY IF EXISTS "satisfaction_ratings: anon select" ON satisfaction_ratings;

DROP POLICY IF EXISTS "Allow authenticated to insert keywords" ON maintenance_keywords;
DROP POLICY IF EXISTS "Allow authenticated to read keywords" ON maintenance_keywords;
DROP POLICY IF EXISTS "Allow authenticated to update keywords" ON maintenance_keywords;

DROP POLICY IF EXISTS "Allow all for authenticated users" ON pericias;

DROP POLICY IF EXISTS "service_role full access" ON webhook_message_log;
CREATE POLICY "webhook_message_log: service_role"
  ON webhook_message_log FOR ALL TO service_role
  USING (true) WITH CHECK (true);
