-- 1) Indices por OS: a lista de OS buscava pecas, pagamentos e checklist de cada OS
--    lendo a tabela inteira (574 milhoes de leituras completas cada desde junho).
create index if not exists idx_materials_order_id on public.materials (order_id);
create index if not exists idx_payments_order_id on public.payments (order_id);
create index if not exists idx_checklist_items_order_id on public.checklist_items (order_id);

-- 2) saldo_os era chamavel por qualquer usuario logado (via API), de qualquer loja.
--    So a trava de entrega (trigger, roda como dono da funcao) precisa dela.
revoke execute on function public.saldo_os(uuid) from authenticated, anon, public;

select indexname from pg_indexes
 where schemaname = 'public' and indexname in ('idx_materials_order_id', 'idx_payments_order_id', 'idx_checklist_items_order_id')
 order by 1;
