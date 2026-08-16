-- ============================================================
-- Binho Play — Painel administrativo e vendas (Supabase)
-- Execute este arquivo inteiro no SQL Editor do seu projeto
-- Supabase (https://supabase.com/dashboard -> seu projeto -> SQL Editor).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Administradores (emails autorizados a operar o painel)
-- ------------------------------------------------------------
create table if not exists public.admins (
  email text primary key,
  created_at timestamptz not null default now()
);

alter table public.admins enable row level security;

-- ------------------------------------------------------------
-- 2. Configurações do site (uma única linha, id = 1)
-- ------------------------------------------------------------
create table if not exists public.site_config (
  id integer primary key check (id = 1),
  config jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.site_config enable row level security;

-- ------------------------------------------------------------
-- 3. Vendedores
-- ------------------------------------------------------------
create table if not exists public.sellers (
  id text primary key,
  name text not null,
  phone text not null default '',
  email text not null default '',
  commission integer not null default 0,
  discount integer not null default 0,
  can_create_tests boolean not null default true,
  test_days integer not null default 3,
  active boolean not null default true,
  created_at bigint not null
);

alter table public.sellers enable row level security;

-- ------------------------------------------------------------
-- 4. Clientes
-- ------------------------------------------------------------
create table if not exists public.clients (
  id text primary key,
  auth_id uuid unique,
  name text not null,
  phone text not null default '',
  email text not null unique,
  plan_id text not null default '',
  price numeric(10, 2) not null default 0,
  discount integer not null default 0,
  account_type text not null default 'permanente' check (account_type in ('teste', 'permanente')),
  test_days integer not null default 0,
  test_expires_at bigint,
  status text not null default 'bloqueado' check (status in ('ativo', 'pendente', 'bloqueado', 'inativo')),
  seller_id text,
  access jsonb,
  notes text not null default '',
  created_at bigint not null
);

alter table public.clients enable row level security;

-- ------------------------------------------------------------
-- 5. Trigger: todo cadastro novo vira um cliente automaticamente
--    (status 'bloqueado' quando o painel exige aprovação/bloqueio)
-- ------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_approval boolean;
  v_status text;
begin
  select coalesce((config->>'requireApproval')::boolean, true)
    into v_approval
    from public.site_config
    where id = 1;

  v_status := case when v_approval then 'bloqueado' else 'ativo' end;

  insert into public.clients (id, auth_id, name, email, status, created_at)
  values (
    md5(new.email) || '-' || floor(extract(epoch from now()) * 1000)::bigint::text,
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    v_status,
    floor(extract(epoch from now()) * 1000)
  )
  on conflict (email) do update set auth_id = excluded.auth_id;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------
-- 6. RLS (row level security)
-- ------------------------------------------------------------

-- Verifica se o usuário logado é administrador
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admins
    where lower(email) = lower(coalesce(nullif(auth.jwt() ->> 'email', ''), ''))
  );
$$;

-- admins: qualquer pessoa autenticada pode conferir se um email é admin;
-- só admin altera a lista.
create policy "admins_select" on public.admins
  for select using (auth.role() = 'authenticated');
create policy "admins_admin_all" on public.admins
  for all using (public.is_admin()) with check (public.is_admin());

-- site_config: leitura pública (nome do site, categorias visíveis, etc.);
-- escrita apenas do administrador.
create policy "config_select" on public.site_config
  for select using (true);
create policy "config_admin_all" on public.site_config
  for all using (public.is_admin()) with check (public.is_admin());

-- sellers: apenas administrador.
create policy "sellers_admin_all" on public.sellers
  for all using (public.is_admin()) with check (public.is_admin());

-- clients: administrador gerencia tudo; o cliente vê apenas o próprio registro
-- (usado pela tela de aprovação/validade dentro do app).
create policy "clients_admin_all" on public.clients
  for all using (public.is_admin()) with check (public.is_admin());
create policy "clients_own_select" on public.clients
  for select using (auth.uid() = auth_id);

-- ------------------------------------------------------------
-- 7. IMPORTANTE: cadastre o e-mail do administrador
-- Troque pelo seu e-mail e execute:
-- ------------------------------------------------------------
-- insert into public.admins (email) values ('seu-email@exemplo.com')
--   on conflict (email) do nothing;
