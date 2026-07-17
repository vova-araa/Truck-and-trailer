-- ============================================================
--  TRUCK & TRAILER — Supabase schema
--  Run this in Supabase: SQL Editor -> paste -> Run
-- ============================================================

-- ---------- TABLES ----------

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  accent text not null default '#3B82F6',
  join_code text not null default upper(substr(md5(random()::text), 1, 6)),
  created_at timestamptz not null default now()
);

-- Bestaat de tabel al van een eerdere versie? Voeg de kolom dan alsnog toe
-- (bestaande rijen krijgen elk een eigen willekeurige code) en borg uniekheid.
alter table public.companies
  add column if not exists join_code text not null default upper(substr(md5(random()::text), 1, 6));
create unique index if not exists companies_join_code_key on public.companies (upper(join_code));

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  naam text not null,
  email text not null,
  telefoon text default '',
  rol text not null default 'admin' check (rol in ('admin','garage','chauffeur')),
  status text not null default 'actief',
  is_superadmin boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.company_state (
  company_id uuid primary key references public.companies(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- helper: current user's company
create or replace function public.current_company_id()
returns uuid language sql stable security definer as $$
  select company_id from public.profiles where id = auth.uid()
$$;

-- helper: is the current user a platform super-admin
create or replace function public.is_superadmin()
returns boolean language sql stable security definer as $$
  select coalesce((select is_superadmin from public.profiles where id = auth.uid()), false)
$$;

-- ---------- ROW LEVEL SECURITY ----------

alter table public.companies      enable row level security;
alter table public.profiles       enable row level security;
alter table public.company_state  enable row level security;

-- COMPANIES
drop policy if exists "own company or superadmin" on public.companies;
create policy "own company or superadmin" on public.companies
  for select using ( id = public.current_company_id() or public.is_superadmin() );

drop policy if exists "authenticated can create company" on public.companies;
create policy "authenticated can create company" on public.companies
  for insert with check ( auth.role() = 'authenticated' );

-- PROFILES
drop policy if exists "read profiles in my company" on public.profiles;
create policy "read profiles in my company" on public.profiles
  for select using ( company_id = public.current_company_id() or public.is_superadmin() or id = auth.uid() );

drop policy if exists "insert own profile" on public.profiles;
create policy "insert own profile" on public.profiles
  for insert with check ( id = auth.uid() or company_id = public.current_company_id() );

drop policy if exists "update profiles in my company" on public.profiles;
create policy "update profiles in my company" on public.profiles
  for update using ( company_id = public.current_company_id() or public.is_superadmin() );

drop policy if exists "delete profiles in my company" on public.profiles;
create policy "delete profiles in my company" on public.profiles
  for delete using ( company_id = public.current_company_id() and id <> auth.uid() );

-- COMPANY STATE
drop policy if exists "state of my company" on public.company_state;
create policy "state of my company" on public.company_state
  for all using ( company_id = public.current_company_id() or public.is_superadmin() )
  with check ( company_id = public.current_company_id() or public.is_superadmin() );

-- ---------- JOIN-CODE: medewerkers laten meedoen ----------
-- Een bedrijf deelt zijn 6-tekens code. Een medewerker maakt een account en
-- koppelt zichzelf via de code aan het bedrijf. Beide functies draaien met
-- SECURITY DEFINER zodat een nieuwe gebruiker (nog zonder profiel) het bedrijf
-- kan vinden zonder de hele companies-tabel te mogen lezen.

-- Zoek een bedrijf op code (alleen naam/kleur terug — niet de hele rij).
create or replace function public.company_by_join_code(code text)
returns table(id uuid, name text, accent text)
language sql stable security definer as $$
  select id, name, accent from public.companies
  where upper(join_code) = upper(trim(code))
  limit 1
$$;
grant execute on function public.company_by_join_code(text) to anon, authenticated;

-- Koppel de ingelogde gebruiker als medewerker aan het bedrijf van de code.
-- Rol wordt afgedwongen op 'chauffeur' of 'garage' (nooit 'admin' via de code).
create or replace function public.join_company_with_code(
  code text, p_naam text, p_email text, p_telefoon text, p_rol text
) returns uuid language plpgsql security definer as $$
declare cid uuid;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select id into cid from public.companies where upper(join_code) = upper(trim(code)) limit 1;
  if cid is null then raise exception 'INVALID_CODE'; end if;
  if p_rol is null or p_rol not in ('chauffeur','garage') then p_rol := 'chauffeur'; end if;
  insert into public.profiles (id, company_id, naam, email, telefoon, rol, status)
    values (auth.uid(), cid, p_naam, p_email, coalesce(p_telefoon, ''), p_rol, 'actief')
  on conflict (id) do update set company_id = excluded.company_id, naam = excluded.naam,
    email = excluded.email, telefoon = excluded.telefoon, rol = excluded.rol, status = 'actief';
  return cid;
end $$;
grant execute on function public.join_company_with_code(text, text, text, text, text) to authenticated;

-- ---------- OPTIONAL: mark a platform super-admin ----------
-- After you have signed up your own account, run this once with your email:
-- update public.profiles set is_superadmin = true where email = 'jij@truckandtrailer.nl';
