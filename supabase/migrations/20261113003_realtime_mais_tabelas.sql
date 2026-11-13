-- Tempo real entre aparelhos (2 celulares + PC): antes so OS/pecas/pagamentos/caixa avisavam.
-- Agora Balcao, agenda, estoque, contas a pagar e fiado tambem. (Substitui o recarregar a cada 15s.)
do $$
declare t text;
begin
  foreach t in array array['balcao_orders','balcao_items','appointments','inventory_products',
                           'inventory_movements','boletos','fiados','fiado_payments']
  loop
    if not exists (select 1 from pg_publication_tables
                    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

select tablename from pg_publication_tables where pubname = 'supabase_realtime' order by 1;
