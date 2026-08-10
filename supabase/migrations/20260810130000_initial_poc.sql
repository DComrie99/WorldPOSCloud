-- WorldPOS Cloud proof-of-concept schema.
-- One Supabase project represents one client; site access remains database enforced.

create extension if not exists pgcrypto;

create type public.app_role as enum ('administrator', 'manager', 'viewer');

create table public.app_users (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(trim(display_name)) between 1 and 120),
  role public.app_role not null default 'viewer',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sites (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9_-]{2,20}$'),
  name text not null check (char_length(trim(name)) between 1 and 120),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.user_sites (
  user_id uuid not null references public.app_users(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, site_id)
);

create table public.staff_members (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete restrict,
  staff_number text not null check (char_length(trim(staff_number)) between 1 and 30),
  first_name text not null check (char_length(trim(first_name)) between 1 and 80),
  last_name text not null check (char_length(trim(last_name)) between 1 and 80),
  role_title text check (role_title is null or char_length(trim(role_title)) <= 100),
  email text check (email is null or char_length(trim(email)) <= 254),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_id, staff_number)
);

create table public.terminals (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete restrict,
  terminal_number integer not null check (terminal_number > 0),
  name text not null check (char_length(trim(name)) between 1 and 100),
  location text check (location is null or char_length(trim(location)) <= 120),
  terminal_type text not null default 'POS' check (terminal_type in ('POS', 'Back Office', 'Kiosk')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_id, terminal_number)
);

create index staff_members_site_name_idx on public.staff_members (site_id, last_name, first_name);
create index terminals_site_number_idx on public.terminals (site_id, terminal_number);

create or replace function public.current_user_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.app_users where id = auth.uid()
$$;

create or replace function public.user_can_access_site(requested_site_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_sites
    where user_id = auth.uid() and site_id = requested_site_id
  )
$$;

create or replace function public.user_can_manage_site(requested_site_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_user_role() in ('administrator', 'manager')
    and public.user_can_access_site(requested_site_id), false)
$$;

revoke all on function public.current_user_role() from public;
revoke all on function public.user_can_access_site(uuid) from public;
revoke all on function public.user_can_manage_site(uuid) from public;
grant execute on function public.current_user_role() to authenticated;
grant execute on function public.user_can_access_site(uuid) to authenticated;
grant execute on function public.user_can_manage_site(uuid) to authenticated;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.app_users (id, display_name, role)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1), 'WorldPOS user'),
    'viewer'
  );
  return new;
end;
$$;

revoke all on function public.handle_new_auth_user() from public;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

insert into public.sites (code, name) values ('DEMO', 'Demo Restaurant');

-- Bootstrap the oldest existing Auth user for this isolated POC project only.
-- Subsequent users are viewers until an administrator assigns their role and site.
insert into public.app_users (id, display_name, role)
select id,
       coalesce(nullif(trim(raw_user_meta_data ->> 'display_name'), ''), split_part(email, '@', 1), 'WorldPOS administrator'),
       case when row_number() over (order by created_at, id) = 1 then 'administrator'::public.app_role else 'viewer'::public.app_role end
from auth.users
on conflict (id) do nothing;

insert into public.user_sites (user_id, site_id)
select au.id, s.id
from auth.users au
cross join public.sites s
where s.code = 'DEMO'
order by au.created_at, au.id
limit 1
on conflict do nothing;

alter table public.app_users enable row level security;
alter table public.sites enable row level security;
alter table public.user_sites enable row level security;
alter table public.staff_members enable row level security;
alter table public.terminals enable row level security;

create policy app_users_select_self_or_admin on public.app_users
for select to authenticated
using (id = auth.uid() or public.current_user_role() = 'administrator');

create policy app_users_admin_update on public.app_users
for update to authenticated
using (public.current_user_role() = 'administrator')
with check (public.current_user_role() = 'administrator');

create policy sites_select_assigned on public.sites
for select to authenticated
using (public.user_can_access_site(id));

create policy user_sites_select_self_or_admin on public.user_sites
for select to authenticated
using (user_id = auth.uid() or public.current_user_role() = 'administrator');

create policy user_sites_admin_manage on public.user_sites
for all to authenticated
using (public.current_user_role() = 'administrator')
with check (public.current_user_role() = 'administrator');

create policy staff_select_assigned_site on public.staff_members
for select to authenticated
using (public.user_can_access_site(site_id));

create policy staff_manage_assigned_site on public.staff_members
for all to authenticated
using (public.user_can_manage_site(site_id))
with check (public.user_can_manage_site(site_id));

create policy terminals_select_assigned_site on public.terminals
for select to authenticated
using (public.user_can_access_site(site_id));

create policy terminals_manage_assigned_site on public.terminals
for all to authenticated
using (public.user_can_manage_site(site_id))
with check (public.user_can_manage_site(site_id));

grant usage on schema public to authenticated;
grant select on public.app_users, public.sites, public.user_sites, public.staff_members, public.terminals to authenticated;
grant insert, update, delete on public.user_sites, public.staff_members, public.terminals to authenticated;
grant update on public.app_users to authenticated;

insert into public.staff_members (site_id, staff_number, first_name, last_name, role_title, email)
select id, '001', 'Sarah', 'Naidoo', 'Site Manager', 'sarah@example.com' from public.sites where code = 'DEMO';
insert into public.staff_members (site_id, staff_number, first_name, last_name, role_title)
select id, '002', 'Thabo', 'Mokoena', 'Supervisor' from public.sites where code = 'DEMO';
insert into public.terminals (site_id, terminal_number, name, location)
select id, 1, 'Main Counter', 'Front of house' from public.sites where code = 'DEMO';
insert into public.terminals (site_id, terminal_number, name, location)
select id, 2, 'Bar Terminal', 'Bar' from public.sites where code = 'DEMO';
