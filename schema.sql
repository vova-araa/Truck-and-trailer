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

-- Bedrijven worden NIET meer vrij aangemaakt: alleen via een geldige
-- 12-cijferige abonnementscode (zie redeem_company_code hieronder). Daarom
-- géén open insert-policy meer voor clients.
drop policy if exists "authenticated can create company" on public.companies;

-- PROFILES
drop policy if exists "read profiles in my company" on public.profiles;
create policy "read profiles in my company" on public.profiles
  for select using ( company_id = public.current_company_id() or public.is_superadmin() or id = auth.uid() );

-- helper: is de huidige gebruiker BEHEERDER (van zijn eigen bedrijf)?
create or replace function public.is_company_admin()
returns boolean language sql stable security definer as $$
  select exists(select 1 from public.profiles where id = auth.uid() and rol = 'admin')
$$;

-- Je mag alleen je EIGEN profiel-rij aanmaken (id = jij). Medewerker-accounts
-- worden server-side (service_role) of via de join-code-functie aangemaakt.
drop policy if exists "insert own profile" on public.profiles;
create policy "insert own profile" on public.profiles
  for insert with check ( id = auth.uid() );

-- Profielen bijwerken mag alleen de BEHEERDER van hetzelfde bedrijf (of de
-- platform-superadmin). Zo kan een chauffeur/werkplaats niemand aanpassen.
drop policy if exists "update profiles in my company" on public.profiles;
drop policy if exists "admins update profiles in my company" on public.profiles;
create policy "admins update profiles in my company" on public.profiles
  for update using ( (company_id = public.current_company_id() and public.is_company_admin()) or public.is_superadmin() )
  with check ( (company_id = public.current_company_id() and public.is_company_admin()) or public.is_superadmin() );

-- Verwijderen mag alleen de beheerder (of superadmin), en nooit zichzelf.
drop policy if exists "delete profiles in my company" on public.profiles;
drop policy if exists "admins delete profiles in my company" on public.profiles;
create policy "admins delete profiles in my company" on public.profiles
  for delete using ( ((company_id = public.current_company_id() and public.is_company_admin()) or public.is_superadmin()) and id <> auth.uid() );

-- Extra slot: niemand kan zichzelf tot platform-superadmin promoveren via de
-- app. Alleen jij, met de SQL Editor / service_role (auth.uid() is dan null).
create or replace function public.guard_superadmin_flag()
returns trigger language plpgsql security definer as $$
begin
  if (new.is_superadmin is distinct from old.is_superadmin)
     and auth.uid() is not null
     and not public.is_superadmin() then
    raise exception 'Niet toegestaan: is_superadmin kan alleen door de platformbeheerder gezet worden.';
  end if;
  return new;
end $$;
drop trigger if exists trg_guard_superadmin on public.profiles;
create trigger trg_guard_superadmin before update on public.profiles
  for each row execute function public.guard_superadmin_flag();

-- COMPANY STATE
drop policy if exists "state of my company" on public.company_state;
create policy "state of my company" on public.company_state
  for all using ( company_id = public.current_company_id() or public.is_superadmin() )
  with check ( company_id = public.current_company_id() or public.is_superadmin() );

-- ---------- ABONNEMENTSCODE: een nieuw bedrijf activeren ----------
-- Jij (platformbeheerder) geeft bij een abonnement een 12-cijferige code uit.
-- Alleen met een geldige, ongebruikte code kan iemand een bedrijf + hoofd-admin
-- aanmaken. Een code is eenmalig.

create table if not exists public.activation_codes (
  code text primary key,
  status text not null default 'unused' check (status in ('unused','used')),
  company_id uuid references public.companies(id) on delete set null,
  note text default '',
  -- Gegevens die bij het afsluiten van het abonnement al zijn ingevuld, zodat het
  -- bedrijf ze bij "Bedrijf activeren" niet nóg een keer hoeft in te tikken.
  company_name text default '',
  admin_naam text default '',
  admin_email text default '',
  admin_telefoon text default '',
  paid boolean not null default true, -- codes die JIJ zelf aanmaakt zijn gratis (paid = false)
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  used_at timestamptz
);
alter table public.activation_codes enable row level security;
-- Geen directe toegang voor clients; alles loopt via de functies hieronder.

-- Bestond de tabel al van een eerdere versie? Voeg de nieuwe kolommen alsnog toe.
alter table public.activation_codes
  add column if not exists company_name text default '',
  add column if not exists admin_naam text default '',
  add column if not exists admin_email text default '',
  add column if not exists admin_telefoon text default '',
  add column if not exists paid boolean not null default true,
  add column if not exists created_by uuid references auth.users(id) on delete set null;

-- Snelle check of een code geldig/ongebruikt is (voor nette foutmeldingen vooraf).
create or replace function public.activation_code_valid(p_code text)
returns boolean language sql stable security definer as $$
  select exists(
    select 1 from public.activation_codes
    where code = regexp_replace(coalesce(p_code,''), '\D', '', 'g') and status = 'unused'
  )
$$;
grant execute on function public.activation_code_valid(text) to anon, authenticated;

-- Haal de vooraf-ingevulde gegevens bij een geldige code op, zodat "Bedrijf
-- activeren" die alvast kan tonen en het bedrijf ze niet opnieuw hoeft in te
-- tikken. Geeft alleen niet-gevoelige velden terug (geen wachtwoord).
create or replace function public.activation_code_info(p_code text)
returns table(company_name text, admin_naam text, admin_email text, admin_telefoon text)
language sql stable security definer as $$
  select company_name, admin_naam, admin_email, admin_telefoon
  from public.activation_codes
  where code = regexp_replace(coalesce(p_code,''), '\D', '', 'g') and status = 'unused'
  limit 1
$$;
grant execute on function public.activation_code_info(text) to anon, authenticated;

-- Wissel een geldige code in: maak in ÉÉN transactie het bedrijf, het
-- hoofd-admin-profiel én een lege state aan, en markeer de code als gebruikt.
-- Atomair (FOR UPDATE): mislukt er iets, dan wordt niets bewaard en blijft de
-- code bruikbaar — geen verweesde bedrijven of "verbrande" codes meer.
-- De aan de code gekoppelde gegevens (bedrijfsnaam/naam/e-mail/telefoon) hebben
-- voorrang; wat de gebruiker meegeeft is alleen een terugval.
create or replace function public.redeem_company_code(
  p_code text, p_name text, p_slug text, p_accent text,
  p_naam text default null, p_email text default null, p_telefoon text default null
) returns uuid language plpgsql security definer as $$
declare cid uuid; clean text; rec public.activation_codes;
        v_name text; v_naam text; v_email text; v_telefoon text;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  clean := regexp_replace(coalesce(p_code,''), '\D', '', 'g');
  select * into rec from public.activation_codes where code = clean and status = 'unused' for update;
  if not found then raise exception 'INVALID_CODE'; end if;

  -- Code-gegevens hebben voorrang; nullif('') zodat lege velden terugvallen op input.
  v_name     := coalesce(nullif(rec.company_name, ''), p_name);
  v_naam     := coalesce(nullif(rec.admin_naam, ''), p_naam);
  v_email    := coalesce(nullif(rec.admin_email, ''), p_email);
  v_telefoon := coalesce(nullif(rec.admin_telefoon, ''), p_telefoon);

  insert into public.companies (name, slug, accent)
    values (v_name, p_slug, coalesce(p_accent, '#3B82F6')) returning id into cid;

  -- Hoofd-admin-profiel koppelen (alleen als naam/e-mail bekend zijn).
  if v_naam is not null and v_email is not null then
    insert into public.profiles (id, company_id, naam, email, telefoon, rol, status)
      values (auth.uid(), cid, v_naam, v_email, coalesce(v_telefoon, ''), 'admin', 'actief');
    insert into public.company_state (company_id, data) values (cid, '{}'::jsonb)
      on conflict (company_id) do nothing;
  end if;

  update public.activation_codes set status = 'used', company_id = cid, used_at = now() where code = clean;
  return cid;
end $$;
grant execute on function public.redeem_company_code(text, text, text, text, text, text, text) to authenticated;

-- ---------- ABONNEMENTSCODES BEHEREN (alleen platform-superadmin) ----------
-- Jij kunt vanuit je eigen account codes aanmaken en bekijken. Codes die JIJ
-- aanmaakt zijn gratis (paid = false); voor de rest geldt paid = true.

create or replace function public.create_activation_code(
  p_company_name text default '', p_admin_naam text default '',
  p_admin_email text default '', p_admin_telefoon text default '',
  p_note text default '', p_paid boolean default true
) returns text language plpgsql security definer as $$
declare new_code text; tries int := 0;
begin
  if not public.is_superadmin() then raise exception 'NOT_ALLOWED'; end if;
  loop
    new_code := lpad((floor(random()*1e12))::bigint::text, 12, '0');
    exit when not exists(select 1 from public.activation_codes where code = new_code);
    tries := tries + 1;
    if tries > 10 then raise exception 'CODE_GEN_FAILED'; end if;
  end loop;
  insert into public.activation_codes
    (code, company_name, admin_naam, admin_email, admin_telefoon, note, paid, created_by)
    values (new_code, coalesce(p_company_name,''), coalesce(p_admin_naam,''),
            coalesce(p_admin_email,''), coalesce(p_admin_telefoon,''),
            coalesce(p_note,''), coalesce(p_paid, true), auth.uid());
  return new_code;
end $$;
grant execute on function public.create_activation_code(text, text, text, text, text, boolean) to authenticated;

-- Alle uitgegeven codes bekijken (alleen superadmin). Retourneert de volledige rij.
create or replace function public.list_activation_codes()
returns setof public.activation_codes language plpgsql stable security definer as $$
begin
  if not public.is_superadmin() then raise exception 'NOT_ALLOWED'; end if;
  return query select * from public.activation_codes order by created_at desc;
end $$;
grant execute on function public.list_activation_codes() to authenticated;

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
