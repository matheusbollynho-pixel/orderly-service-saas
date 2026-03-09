-- Payments table to track client payments per order
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.service_orders(id) on delete cascade,
  amount numeric(12,2) not null check (amount >= 0),
  method text not null check (method in ('dinheiro','pix','credito','debito','transferencia','outro')),
  reference text,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists payments_order_id_idx on public.payments(order_id);
