-- A tela de Colaboradores e o convite usam store_members.email, mas a coluna nao existia
-- (lista dava erro 400 e o convite falhava ao gravar). Cria e preenche com o e-mail do login.
alter table public.store_members add column if not exists email text;

update public.store_members sm
   set email = lower(u.email)
  from auth.users u
 where u.id = sm.user_id
   and sm.email is null;

select sm.role, sm.active, sm.email is not null as tem_email from public.store_members sm order by 1;
