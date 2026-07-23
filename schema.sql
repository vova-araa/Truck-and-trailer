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
  -- gen_random_uuid() als bron: cryptografisch sterk (random() is dat niet).
  join_code text not null default upper(substr(md5(gen_random_uuid()::text), 1, 10)),
  created_at timestamptz not null default now()
);

-- Revisieteller: elke wijziging aan company_state "tikt" deze kolom aan (zie
-- trigger verderop). De app luistert via Realtime op de companies-rij; zonder
-- deze tik zou er nooit een event komen en ververst de werkvloer niet vanzelf.
alter table public.companies add column if not exists state_rev bigint not null default 0;

-- Bestaat de tabel al van een eerdere versie? Voeg de kolom dan alsnog toe
-- (bestaande rijen krijgen elk een eigen willekeurige code) en borg uniekheid.
alter table public.companies
  add column if not exists join_code text not null default upper(substr(md5(gen_random_uuid()::text), 1, 10));
create unique index if not exists companies_join_code_key on public.companies (upper(join_code));

-- Abonnement-velden per bedrijf. plan_paid = betaalt het bedrijf (true) of is het
-- een gratis account dat de platformbeheerder heeft geactiveerd (false).
-- renews_at = wanneer het (automatisch) verlengt/betaald wordt. Bij opzeggen zet
-- cancelled=true en cancel_at op de verlengdatum: tot die datum blijft alles werken.
alter table public.companies
  add column if not exists plan_paid boolean not null default true,
  add column if not exists sub_created_at timestamptz,
  add column if not exists renews_at timestamptz,
  add column if not exists cancelled boolean not null default false,
  add column if not exists cancel_at timestamptz;

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

-- Je mag alleen je EIGEN profiel-rij aanmaken (id = jij) EN nooit als
-- superadmin, EN alleen binnen je eigen bedrijf. Nieuwe gebruikers hebben nog
-- geen bedrijf (current_company_id() = null): die worden via de SECURITY
-- DEFINER-functies (redeem_company_code / join_company_with_code) of server-side
-- (service_role) aangemaakt — die omzeilen RLS als tabel-eigenaar. Zonder deze
-- inperking kon iedereen met een sessie zichzelf als admin van een ander bedrijf
-- of zelfs als platform-superadmin invoegen. Belangrijk: de client voegt zelf
-- NOOIT direct een profielrij toe, dus dit breekt geen enkele bestaande flow.
drop policy if exists "insert own profile" on public.profiles;
create policy "insert own profile" on public.profiles
  for insert with check (
    id = auth.uid()
    and coalesce(is_superadmin, false) = false
    and company_id = public.current_company_id()
  );

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
  -- Bij wijzigen: alleen een bestaande superadmin (of service_role, waar
  -- auth.uid() null is) mag de vlag aanpassen.
  if tg_op = 'UPDATE' then
    if (new.is_superadmin is distinct from old.is_superadmin)
       and auth.uid() is not null
       and not public.is_superadmin() then
      raise exception 'Niet toegestaan: is_superadmin kan alleen door de platformbeheerder gezet worden.';
    end if;
  -- Bij invoegen: een nieuw profiel kan zichzelf nooit tot superadmin maken.
  elsif tg_op = 'INSERT' then
    if coalesce(new.is_superadmin, false)
       and auth.uid() is not null
       and not public.is_superadmin() then
      raise exception 'Niet toegestaan: is_superadmin kan alleen door de platformbeheerder gezet worden.';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_guard_superadmin on public.profiles;
create trigger trg_guard_superadmin before insert or update on public.profiles
  for each row execute function public.guard_superadmin_flag();

-- De primary key van een profiel (gekoppeld aan auth.users) mag nooit wijzigen;
-- de UPDATE-policy kan dat zelf niet afdwingen, dus een kleine trigger-guard.
create or replace function public.guard_profile_id()
returns trigger language plpgsql as $$
begin
  if new.id is distinct from old.id then
    raise exception 'Niet toegestaan: profiel-id kan niet gewijzigd worden.';
  end if;
  return new;
end $$;
drop trigger if exists trg_guard_profile_id on public.profiles;
create trigger trg_guard_profile_id before update on public.profiles
  for each row execute function public.guard_profile_id();

-- COMPANY STATE
-- De volledige dataset (jsonb) is alleen direct te lezen/schrijven door de
-- BEHEERDER van het bedrijf (of de platform-superadmin). Werkplaats en chauffeur
-- krijgen géén directe tabeltoegang — zij gaan via de rol-gescheiden functies
-- hieronder, die gevoelige delen (kosten, andermans gegevens) weglaten. Zo staat
-- financiële/PII-data niet zomaar in de browser van een chauffeur of monteur.
drop policy if exists "state of my company" on public.company_state;
drop policy if exists "state admin of my company" on public.company_state;
create policy "state admin of my company" on public.company_state
  for all using ( (company_id = public.current_company_id() and public.is_company_admin()) or public.is_superadmin() )
  with check ( (company_id = public.current_company_id() and public.is_company_admin()) or public.is_superadmin() );

-- ---------- ROL-GESCHEIDEN TOEGANG TOT DE BEDRIJFSDATASET ----------

-- Werkplaats laadt de dataset ZONDER financiële data (kosten).
create or replace function public.load_company_state()
returns jsonb language plpgsql stable security definer as $$
declare cid uuid; v_rol text; d jsonb;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select company_id, rol into cid, v_rol from public.profiles where id = auth.uid();
  if cid is null then raise exception 'NO_COMPANY'; end if;
  -- Chauffeurs mogen deze functie NIET gebruiken (zij hebben driver_bootstrap);
  -- anders zouden ze via een directe RPC-aanroep alsnog de hele dataset zien.
  if v_rol not in ('admin','garage') then raise exception 'NOT_ALLOWED'; end if;
  select data into d from public.company_state where company_id = cid;
  d := coalesce(d, '{}'::jsonb);
  if v_rol = 'garage' then
    d := d - 'costs'; -- werkplaats ziet geen kosten
    d := d - 'uren';  -- en geen uren-registraties (loon-gerelateerd)
    -- Privacy: de werkplaats hoeft de persoonlijke contactgegevens van
    -- collega's/chauffeurs niet te zien. We strippen e-mail, telefoon en
    -- (voor de zekerheid) wachtwoord uit de medewerkerslijst. Naam en rol
    -- blijven staan zodat de werkvloer nog weet wie welke wagen rijdt.
    if d ? 'users' and jsonb_typeof(d->'users') = 'array' then
      d := jsonb_set(d, '{users}', coalesce((
        select jsonb_agg(u - 'email' - 'telefoon' - 'wachtwoord')
        from jsonb_array_elements(d->'users') as u
      ), '[]'::jsonb));
    end if;
  end if;
  return d;
end $$;
grant execute on function public.load_company_state() to authenticated;

-- Werkplaats/beheerder slaat op. Om te voorkomen dat gelijktijdig toegevoegde
-- gegevens verloren gaan (bv. een chauffeur die net een melding maakt terwijl de
-- werkplaats iets sleept), worden MELDINGEN en KOSTEN samengevoegd i.p.v. blind
-- overschreven: server-rijen die de client niet meestuurt én die 'ie bij het
-- laden niet kende (dus nieuw sinds dan), blijven behouden. Verwijderen werkt nog
-- steeds: een rij die de client wél kende (base) maar niet meestuurt, verdwijnt.
-- Zo blijft financiële data ook voor de werkplaats bewaard (die kreeg 'm niet).
-- Oudere 1-argument versie opruimen (voorkomt overload-conflict).
drop function if exists public.save_company_state(jsonb);
-- Oudere 3-argument versie opruimen (voorkomt PostgREST overload-conflict).
drop function if exists public.save_company_state(jsonb, text[], text[]);
create or replace function public.save_company_state(
  p_data jsonb, p_base_report_ids text[] default '{}', p_base_cost_ids text[] default '{}',
  p_base_ride_ids text[] default '{}'
) returns void language plpgsql security definer as $$
declare cid uuid; v_rol text; existing jsonb;
        ex_reports jsonb; ex_costs jsonb; in_reports jsonb; in_costs jsonb;
        cli_report_ids text[]; cli_cost_ids text[]; final jsonb;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select company_id, rol into cid, v_rol from public.profiles where id = auth.uid();
  if cid is null then raise exception 'NO_COMPANY'; end if;
  if v_rol not in ('admin','garage') then raise exception 'NOT_ALLOWED'; end if;

  select data into existing from public.company_state where company_id = cid for update;
  existing := coalesce(existing, '{}'::jsonb);
  final := coalesce(p_data, '{}'::jsonb);

  -- Normaliseer alle arrays (vang jsonb 'null' / scalair netjes af).
  ex_reports := case when jsonb_typeof(existing -> 'reports') = 'array' then existing -> 'reports' else '[]'::jsonb end;
  ex_costs   := case when jsonb_typeof(existing -> 'costs')   = 'array' then existing -> 'costs'   else '[]'::jsonb end;
  in_reports := case when jsonb_typeof(final -> 'reports') = 'array' then final -> 'reports' else '[]'::jsonb end;
  in_costs   := case when jsonb_typeof(final -> 'costs')   = 'array' then final -> 'costs'   else '[]'::jsonb end;

  select coalesce(array_agg(e ->> 'id'), '{}') into cli_report_ids from jsonb_array_elements(in_reports) e where (e ->> 'id') is not null;
  select coalesce(array_agg(e ->> 'id'), '{}') into cli_cost_ids   from jsonb_array_elements(in_costs)   e where (e ->> 'id') is not null;

  final := final
    || jsonb_build_object('reports', in_reports || coalesce((
         select jsonb_agg(r) from jsonb_array_elements(ex_reports) r
         where (r ->> 'id') is not null
           and not (r ->> 'id' = any(cli_report_ids))
           and not (r ->> 'id' = any(p_base_report_ids))
       ), '[]'::jsonb))
    || jsonb_build_object('costs', in_costs || coalesce((
         select jsonb_agg(c) from jsonb_array_elements(ex_costs) c
         where (c ->> 'id') is not null
           and not (c ->> 'id' = any(cli_cost_ids))
           and not (c ->> 'id' = any(p_base_cost_ids))
       ), '[]'::jsonb));

  -- De werkplaats (garage) krijgt de medewerkerslijst ZONDER contactgegevens
  -- (PII-afscherming in load_company_state) en mag gebruikers niet beheren.
  -- Zou een garage-opslag de gestripte lijst terugschrijven, dan raakten
  -- e-mail/telefoon van iedereen permanent kwijt. Daarom: voor garage behouden
  -- we de bestaande users-lijst uit de database ongewijzigd.
  if v_rol = 'garage' then
    final := final || jsonb_build_object('users', coalesce(existing -> 'users', '[]'::jsonb));
    -- De werkplaats ziet geen kosten (load stript ze) en mag ze dus ook niet
    -- wijzigen of verwijderen — alleen NIEUWE toevoegen (werkbon). Bestaande
    -- kosten winnen altijd; door de client meegestuurde "bekende" ids negeren
    -- we, zodat een garage-save nooit financiële data kan wissen of vervangen.
    final := final || jsonb_build_object('costs', ex_costs || coalesce((
      select jsonb_agg(c) from jsonb_array_elements(in_costs) c
      where (c ->> 'id') is not null
        and not exists (select 1 from jsonb_array_elements(ex_costs) e where e ->> 'id' = c ->> 'id')
    ), '[]'::jsonb));
  end if;

  -- Dagelijkse voertuigchecks zijn server-authoritatief: ze komen alleen via
  -- driver_add_check binnen en een client-snapshot mag ze nooit wegvagen.
  final := final || jsonb_build_object('checks', coalesce(existing -> 'checks', '[]'::jsonb));

  -- Uren-registraties idem: alleen via driver_save_hours/driver_delete_hours.
  final := final || jsonb_build_object('uren', coalesce(existing -> 'uren', '[]'::jsonb));

  -- Afgetekende ritten (Proof of Delivery) mogen door een client-snapshot nooit
  -- terug naar "gepland": de bestaande pod/status van een afgeleverde rit wint.
  -- Stuurt een (oudere) client de sleutel helemaal niet mee, dan blijven de
  -- bestaande ritten integraal staan.
  if jsonb_typeof(final -> 'rides') is distinct from 'array' then
    final := final || jsonb_build_object('rides', coalesce(existing -> 'rides', '[]'::jsonb));
  end if;
  if jsonb_typeof(final -> 'rides') = 'array' then
    final := jsonb_set(final, '{rides}', coalesce((
      select jsonb_agg(
        case when exr.val is not null and exr.val ->> 'status' = 'afgeleverd'
             then cl.val || jsonb_build_object('status', 'afgeleverd', 'pod', exr.val -> 'pod')
             else cl.val end)
      from jsonb_array_elements(final -> 'rides') as cl(val)
      left join lateral (
        select e.val from jsonb_array_elements(
          case when jsonb_typeof(existing -> 'rides') = 'array' then existing -> 'rides' else '[]'::jsonb end
        ) as e(val)
        where e.val ->> 'id' = cl.val ->> 'id'
        limit 1
      ) exr on true
    ), '[]'::jsonb));
    -- Zelfde merge-bescherming als meldingen/kosten: ritten die op de server
    -- staan maar die de client niet kent (nieuw sinds z'n laatste laad-moment,
    -- bv. door een collega gepland) blijven behouden. Bewust verwijderen werkt
    -- nog steeds: een rit die de client wél kende (base) en weglaat, verdwijnt.
    final := jsonb_set(final, '{rides}', (final -> 'rides') || coalesce((
      select jsonb_agg(e.val) from jsonb_array_elements(
        case when jsonb_typeof(existing -> 'rides') = 'array' then existing -> 'rides' else '[]'::jsonb end
      ) as e(val)
      where (e.val ->> 'id') is not null
        and not exists (select 1 from jsonb_array_elements(final -> 'rides') c(val) where c.val ->> 'id' = e.val ->> 'id')
        and not (e.val ->> 'id' = any(p_base_ride_ids))
    ), '[]'::jsonb));
  end if;

  insert into public.company_state (company_id, data, updated_at) values (cid, final, now())
    on conflict (company_id) do update set data = excluded.data, updated_at = now();
end $$;
grant execute on function public.save_company_state(jsonb, text[], text[], text[]) to authenticated;

-- Superadmin-variant: de platformbeheerder bewerkt vaak een ÁNDER bedrijf dan
-- z'n eigen. Een kale upsert zou de merge-bescherming omzeilen en bv. een
-- chauffeursmelding wegvagen die tijdens het meekijken binnenkwam. Daarom:
-- dezelfde meldingen/kosten-merge, maar gescopeerd op een expliciet bedrijf.
drop function if exists public.save_company_state_scoped(uuid, jsonb, text[], text[]);
create or replace function public.save_company_state_scoped(
  p_company_id uuid, p_data jsonb,
  p_base_report_ids text[] default '{}', p_base_cost_ids text[] default '{}',
  p_base_ride_ids text[] default '{}'
) returns void language plpgsql security definer as $$
declare existing jsonb; ex_reports jsonb; ex_costs jsonb; in_reports jsonb; in_costs jsonb;
        cli_report_ids text[]; cli_cost_ids text[]; final jsonb;
begin
  if not public.is_superadmin() then raise exception 'NOT_ALLOWED'; end if;
  if p_company_id is null then raise exception 'NO_COMPANY'; end if;

  select data into existing from public.company_state where company_id = p_company_id for update;
  existing := coalesce(existing, '{}'::jsonb);
  final := coalesce(p_data, '{}'::jsonb);

  ex_reports := case when jsonb_typeof(existing -> 'reports') = 'array' then existing -> 'reports' else '[]'::jsonb end;
  ex_costs   := case when jsonb_typeof(existing -> 'costs')   = 'array' then existing -> 'costs'   else '[]'::jsonb end;
  in_reports := case when jsonb_typeof(final -> 'reports') = 'array' then final -> 'reports' else '[]'::jsonb end;
  in_costs   := case when jsonb_typeof(final -> 'costs')   = 'array' then final -> 'costs'   else '[]'::jsonb end;

  select coalesce(array_agg(e ->> 'id'), '{}') into cli_report_ids from jsonb_array_elements(in_reports) e where (e ->> 'id') is not null;
  select coalesce(array_agg(e ->> 'id'), '{}') into cli_cost_ids   from jsonb_array_elements(in_costs)   e where (e ->> 'id') is not null;

  final := final
    || jsonb_build_object('reports', in_reports || coalesce((
         select jsonb_agg(r) from jsonb_array_elements(ex_reports) r
         where (r ->> 'id') is not null
           and not (r ->> 'id' = any(cli_report_ids))
           and not (r ->> 'id' = any(p_base_report_ids))
       ), '[]'::jsonb))
    || jsonb_build_object('costs', in_costs || coalesce((
         select jsonb_agg(c) from jsonb_array_elements(ex_costs) c
         where (c ->> 'id') is not null
           and not (c ->> 'id' = any(cli_cost_ids))
           and not (c ->> 'id' = any(p_base_cost_ids))
       ), '[]'::jsonb));

  -- Checks en uren blijven ook hier server-authoritatief.
  final := final || jsonb_build_object('checks', coalesce(existing -> 'checks', '[]'::jsonb));
  final := final || jsonb_build_object('uren', coalesce(existing -> 'uren', '[]'::jsonb));

  -- En ook hier: afgeleverde ritten behouden hun pod/status, en een client
  -- zonder rides-sleutel kan de bestaande ritten niet wegvagen.
  if jsonb_typeof(final -> 'rides') is distinct from 'array' then
    final := final || jsonb_build_object('rides', coalesce(existing -> 'rides', '[]'::jsonb));
  end if;
  if jsonb_typeof(final -> 'rides') = 'array' then
    final := jsonb_set(final, '{rides}', coalesce((
      select jsonb_agg(
        case when exr.val is not null and exr.val ->> 'status' = 'afgeleverd'
             then cl.val || jsonb_build_object('status', 'afgeleverd', 'pod', exr.val -> 'pod')
             else cl.val end)
      from jsonb_array_elements(final -> 'rides') as cl(val)
      left join lateral (
        select e.val from jsonb_array_elements(
          case when jsonb_typeof(existing -> 'rides') = 'array' then existing -> 'rides' else '[]'::jsonb end
        ) as e(val)
        where e.val ->> 'id' = cl.val ->> 'id'
        limit 1
      ) exr on true
    ), '[]'::jsonb));
    -- Nieuwe ritten van anderen behouden (zelfde merge als hierboven).
    final := jsonb_set(final, '{rides}', (final -> 'rides') || coalesce((
      select jsonb_agg(e.val) from jsonb_array_elements(
        case when jsonb_typeof(existing -> 'rides') = 'array' then existing -> 'rides' else '[]'::jsonb end
      ) as e(val)
      where (e.val ->> 'id') is not null
        and not exists (select 1 from jsonb_array_elements(final -> 'rides') c(val) where c.val ->> 'id' = e.val ->> 'id')
        and not (e.val ->> 'id' = any(p_base_ride_ids))
    ), '[]'::jsonb));
  end if;

  insert into public.company_state (company_id, data, updated_at) values (p_company_id, final, now())
    on conflict (company_id) do update set data = excluded.data, updated_at = now();
end $$;
grant execute on function public.save_company_state_scoped(uuid, jsonb, text[], text[], text[]) to authenticated;

-- Elke wijziging aan company_state tikt de companies-rij aan, zodat de
-- Realtime-luisteraar in de app (op tabel companies) daadwerkelijk vuurt.
create or replace function public.touch_company_rev()
returns trigger language plpgsql security definer as $$
begin
  update public.companies set state_rev = state_rev + 1 where id = new.company_id;
  return new;
end $$;
drop trigger if exists trg_touch_company_rev on public.company_state;
create trigger trg_touch_company_rev after insert or update on public.company_state
  for each row execute function public.touch_company_rev();

-- Chauffeur: alleen minimale voertuiggegevens (om uit te kiezen) + eigen meldingen.
create or replace function public.driver_bootstrap()
returns jsonb language plpgsql stable security definer as $$
declare cid uuid; d jsonb; vlist jsonb; rlist jsonb; clist jsonb;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select company_id into cid from public.profiles where id = auth.uid();
  if cid is null then raise exception 'NO_COMPANY'; end if;
  select data into d from public.company_state where company_id = cid;
  d := coalesce(d, '{}'::jsonb);
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', v->'id', 'kenteken', v->'kenteken', 'merk', v->'merk', 'type', v->'type')), '[]'::jsonb)
    into vlist from jsonb_array_elements(coalesce(d->'vehicles','[]'::jsonb)) v;
  select coalesce(jsonb_agg(r), '[]'::jsonb) into rlist
    from jsonb_array_elements(coalesce(d->'reports','[]'::jsonb)) r
    where r ->> 'chauffeurId' = auth.uid()::text;
  -- Eigen recente voertuigchecks (nieuwste eerst; driver_add_check prependt),
  -- zodat de app "vandaag al gecheckt" kan tonen.
  select coalesce(jsonb_agg(c), '[]'::jsonb) into clist
    from (
      select c from jsonb_array_elements(coalesce(d->'checks','[]'::jsonb)) c
      where c ->> 'chauffeurId' = auth.uid()::text
      limit 20
    ) sub;
  -- Eigen ritten (alleen de aan deze chauffeur toegewezen; klantadressen van
  -- andermans ritten blijven zo privé) + eigen uren-registraties (voor
  -- synchronisatie tussen toestellen).
  return jsonb_build_object('vehicles', vlist, 'reports', rlist, 'checks', clist,
    'rides', coalesce((
      select jsonb_agg(r) from (
        select r from jsonb_array_elements(coalesce(d->'rides','[]'::jsonb)) r
        where r ->> 'chauffeurId' = auth.uid()::text
        limit 100
      ) sub2
    ), '[]'::jsonb),
    'uren', coalesce((
      select jsonb_agg(u) from (
        select u from jsonb_array_elements(coalesce(d->'uren','[]'::jsonb)) u
        where u ->> 'chauffeurId' = auth.uid()::text
        limit 200
      ) sub3
    ), '[]'::jsonb));
end $$;
grant execute on function public.driver_bootstrap() to authenticated;

-- Chauffeur ziet de OPENSTAANDE meldingen voor één wagen (ook van collega's),
-- zodat hij niet per ongeluk iets dubbel meldt. Alleen veilige velden — geen
-- naam of andere persoonsgegevens van wie het meldde. Bedrijf-gescopeerd.
create or replace function public.driver_open_reports_for_vehicle(p_kenteken text)
returns jsonb language plpgsql stable security definer as $$
declare cid uuid; d jsonb; rlist jsonb;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select company_id into cid from public.profiles where id = auth.uid();
  if cid is null then raise exception 'NO_COMPANY'; end if;
  select data into d from public.company_state where company_id = cid;
  d := coalesce(d, '{}'::jsonb);
  select coalesce(jsonb_agg(jsonb_build_object(
      'omschrijving', r->'omschrijving', 'datum', r->'datum',
      'status', r->'status', 'prioriteit', r->'prioriteit')), '[]'::jsonb)
    into rlist
    from jsonb_array_elements(coalesce(d->'reports','[]'::jsonb)) r
    where r->>'vehicle' = p_kenteken
      and coalesce(r->>'status','nieuw') <> 'klaar';
  return rlist;
end $$;
grant execute on function public.driver_open_reports_for_vehicle(text) to authenticated;

-- Chauffeur voegt een melding toe (server dwingt de chauffeur-identiteit af).
-- Hardening: alleen bekende velden worden overgenomen (whitelist), de omvang is
-- begrensd, en dezelfde melding-id twee keer insturen is een no-op (idempotent —
-- de offline-wachtrij kan na een timeout opnieuw versturen terwijl de eerste
-- poging tóch was aangekomen).
create or replace function public.driver_add_report(p_report jsonb)
returns void language plpgsql security definer as $$
declare cid uuid; v_naam text; newrep jsonb; rep jsonb; rid text;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select company_id, naam into cid, v_naam from public.profiles where id = auth.uid();
  if cid is null then raise exception 'NO_COMPANY'; end if;
  rep := coalesce(p_report, '{}'::jsonb);
  if length(rep::text) > 65536 then raise exception 'REPORT_TOO_LARGE'; end if;
  -- Whitelist: onbekende/gevaarlijke velden (zoals een eigen 'status') vallen weg.
  select coalesce(jsonb_object_agg(k, rep -> k), '{}'::jsonb) into newrep
    from unnest(array['id','vehicle','omschrijving','prioriteit','datum','zone','wanneer','hoelang','veilig','media','mediaCount']) as k
    where rep ? k;
  newrep := newrep
    || jsonb_build_object('chauffeurId', auth.uid()::text, 'chauffeur', coalesce(v_naam, 'Onbekend'), 'status', 'nieuw');
  rid := newrep ->> 'id';
  insert into public.company_state (company_id, data) values (cid, '{}'::jsonb) on conflict (company_id) do nothing;
  -- Maximaal de 2000 nieuwste meldingen bewaren, zodat één account de
  -- bedrijfsrij niet onbeperkt kan laten groeien (insider-DoS).
  update public.company_state
    set data = jsonb_set(coalesce(data, '{}'::jsonb), '{reports}', (
          select coalesce(jsonb_agg(r), '[]'::jsonb) from (
            select r from jsonb_array_elements(jsonb_build_array(newrep) || coalesce(data -> 'reports', '[]'::jsonb)) r
            limit 2000
          ) sub
        )),
        updated_at = now()
    where company_id = cid
      and (rid is null or not exists (
        select 1 from jsonb_array_elements(coalesce(data -> 'reports', '[]'::jsonb)) r
        where r ->> 'id' = rid
      ));
end $$;
grant execute on function public.driver_add_report(jsonb) to authenticated;

-- Chauffeur slaat een dagelijkse voertuigcheck (DVIR) op. Zelfde hardening als
-- driver_add_report: identiteit afgedwongen, whitelist, groottelimiet en
-- idempotent op check-id. We bewaren maximaal de 1000 nieuwste checks per
-- bedrijf zodat de rij niet onbeperkt groeit.
create or replace function public.driver_add_check(p_check jsonb)
returns void language plpgsql security definer as $$
declare cid uuid; v_naam text; newchk jsonb; chk jsonb; kid text;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select company_id, naam into cid, v_naam from public.profiles where id = auth.uid();
  if cid is null then raise exception 'NO_COMPANY'; end if;
  chk := coalesce(p_check, '{}'::jsonb);
  if length(chk::text) > 32768 then raise exception 'CHECK_TOO_LARGE'; end if;
  select coalesce(jsonb_object_agg(k, chk -> k), '{}'::jsonb) into newchk
    from unnest(array['id','vehicle','datum','tijd','items','issues','opmerking']) as k
    where chk ? k;
  newchk := newchk
    || jsonb_build_object('chauffeurId', auth.uid()::text, 'chauffeur', coalesce(v_naam, 'Onbekend'));
  kid := newchk ->> 'id';
  insert into public.company_state (company_id, data) values (cid, '{}'::jsonb) on conflict (company_id) do nothing;
  update public.company_state
    set data = jsonb_set(coalesce(data, '{}'::jsonb), '{checks}', (
          select coalesce(jsonb_agg(c), '[]'::jsonb) from (
            select c from jsonb_array_elements(jsonb_build_array(newchk) || coalesce(data -> 'checks', '[]'::jsonb)) c
            limit 1000
          ) sub
        )),
        updated_at = now()
    where company_id = cid
      and (kid is null or not exists (
        select 1 from jsonb_array_elements(coalesce(data -> 'checks', '[]'::jsonb)) c
        where c ->> 'id' = kid
      ));
end $$;
grant execute on function public.driver_add_check(jsonb) to authenticated;

-- Chauffeur synchroniseert een uren-registratie (werkdag). De uren blijven
-- offline-first op het toestel staan; dit is de kopie voor de beheerder
-- (loonexport). Upsert op id, alleen eigen registraties, met limieten.
create or replace function public.driver_save_hours(p_entry jsonb)
returns void language plpgsql security definer as $$
declare cid uuid; v_naam text; entry jsonb; e jsonb; eid text;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select company_id, naam into cid, v_naam from public.profiles where id = auth.uid();
  if cid is null then raise exception 'NO_COMPANY'; end if;
  e := coalesce(p_entry, '{}'::jsonb);
  if length(e::text) > 4096 then raise exception 'ENTRY_TOO_LARGE'; end if;
  select coalesce(jsonb_object_agg(k, e -> k), '{}'::jsonb) into entry
    from unnest(array['id','datum','start','eind','pauze','note']) as k
    where e ? k;
  eid := entry ->> 'id';
  if eid is null or eid = '' then raise exception 'NO_ID'; end if;
  entry := entry || jsonb_build_object('chauffeurId', auth.uid()::text, 'chauffeur', coalesce(v_naam, 'Onbekend'));
  insert into public.company_state (company_id, data) values (cid, '{}'::jsonb) on conflict (company_id) do nothing;
  update public.company_state
    set data = jsonb_set(coalesce(data, '{}'::jsonb), '{uren}', (
          select coalesce(jsonb_agg(u), '[]'::jsonb) from (
            -- Nieuwe/bijgewerkte registratie voorop; een bestaande rij met
            -- hetzelfde id (van MIJZELF) valt weg. Andermans rij met dat id
            -- blijft staan — dan voegen we niets dubbel toe (no-op filter).
            select u from jsonb_array_elements(
              jsonb_build_array(entry)
              || coalesce((
                   select jsonb_agg(x) from jsonb_array_elements(coalesce(data -> 'uren', '[]'::jsonb)) x
                   where not (x ->> 'id' = eid and x ->> 'chauffeurId' = auth.uid()::text)
                 ), '[]'::jsonb)
            ) u
            limit 5000
          ) sub
        )),
        updated_at = now()
    where company_id = cid
      and not exists (
        select 1 from jsonb_array_elements(coalesce(data -> 'uren', '[]'::jsonb)) x
        where x ->> 'id' = eid and x ->> 'chauffeurId' is distinct from auth.uid()::text
      );
end $$;
grant execute on function public.driver_save_hours(jsonb) to authenticated;

-- Chauffeur verwijdert een eigen uren-registratie.
create or replace function public.driver_delete_hours(p_id text)
returns void language plpgsql security definer as $$
declare cid uuid;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select company_id into cid from public.profiles where id = auth.uid();
  if cid is null then raise exception 'NO_COMPANY'; end if;
  if p_id is null or length(p_id) > 100 then raise exception 'BAD_ID'; end if;
  update public.company_state
    set data = jsonb_set(data, '{uren}', coalesce((
          select jsonb_agg(u) from jsonb_array_elements(coalesce(data -> 'uren', '[]'::jsonb)) u
          where not (u ->> 'id' = p_id and u ->> 'chauffeurId' = auth.uid()::text)
        ), '[]'::jsonb)),
        updated_at = now()
    where company_id = cid and jsonb_typeof(data -> 'uren') = 'array';
end $$;
grant execute on function public.driver_delete_hours(text) to authenticated;

-- Chauffeur tekent een rit af (Proof of Delivery). Alleen een aan hém
-- toegewezen rit; de server stempelt de chauffeursnaam en het tijdstip.
-- De handtekening (data-URL) is begrensd zodat de rij niet ontploft.
create or replace function public.driver_complete_ride(p_ride_id text, p_pod jsonb)
returns void language plpgsql security definer as $$
declare cid uuid; v_naam text; pod jsonb; podc jsonb;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select company_id, naam into cid, v_naam from public.profiles where id = auth.uid();
  if cid is null then raise exception 'NO_COMPANY'; end if;
  if p_ride_id is null or length(p_ride_id) > 100 then raise exception 'BAD_RIDE_ID'; end if;
  pod := coalesce(p_pod, '{}'::jsonb);
  if length(pod::text) > 262144 then raise exception 'POD_TOO_LARGE'; end if;
  select coalesce(jsonb_object_agg(k, pod -> k), '{}'::jsonb) into podc
    from unnest(array['naam','opmerking','handtekening','tijd','datum']) as k
    where pod ? k;
  podc := podc || jsonb_build_object('door', coalesce(v_naam, 'Onbekend'), 'ts', now());
  -- Bestaat de rit niet (meer) of is hij niet aan déze chauffeur toegewezen?
  -- Dan hard falen i.p.v. stil niets doen — anders denkt de chauffeur dat de
  -- aflevering is vastgelegd terwijl de handtekening nergens staat.
  if not exists (
    select 1 from public.company_state cs,
      jsonb_array_elements(coalesce(cs.data -> 'rides', '[]'::jsonb)) r(val)
    where cs.company_id = cid
      and r.val ->> 'id' = p_ride_id
      and r.val ->> 'chauffeurId' = auth.uid()::text
  ) then
    raise exception 'RIDE_NOT_FOUND';
  end if;
  update public.company_state
    set data = jsonb_set(data, '{rides}', coalesce((
          select jsonb_agg(
            case when r.val ->> 'id' = p_ride_id and r.val ->> 'chauffeurId' = auth.uid()::text
                 then r.val || jsonb_build_object('status', 'afgeleverd', 'pod', podc)
                 else r.val end)
          from jsonb_array_elements(coalesce(data -> 'rides', '[]'::jsonb)) as r(val)
        ), '[]'::jsonb)),
        updated_at = now()
    where company_id = cid and jsonb_typeof(data -> 'rides') = 'array';
end $$;
grant execute on function public.driver_complete_ride(text, jsonb) to authenticated;

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
  add column if not exists period_months int not null default 1,
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
  -- Al een profiel? Dan hoort deze gebruiker niet nóg een bedrijf te starten
  -- (voorkomt een verweesd bedrijf + een verbruikte code bij een PK-botsing).
  if exists (select 1 from public.profiles where id = auth.uid()) then
    raise exception 'ALREADY_HAS_PROFILE';
  end if;
  select * into rec from public.activation_codes where code = clean and status = 'unused' for update;
  if not found then raise exception 'INVALID_CODE'; end if;

  -- Code-gegevens hebben voorrang; nullif('') zodat lege velden terugvallen op input.
  v_name     := coalesce(nullif(rec.company_name, ''), p_name);
  v_naam     := coalesce(nullif(rec.admin_naam, ''), p_naam);
  v_email    := coalesce(nullif(rec.admin_email, ''), p_email);
  v_telefoon := coalesce(nullif(rec.admin_telefoon, ''), p_telefoon);
  -- Zonder naam/e-mail kunnen we geen beheerder koppelen: dan niets aanmaken
  -- (geen verweesd bedrijf, code blijft bruikbaar).
  if v_naam is null or v_email is null then raise exception 'MISSING_ADMIN'; end if;

  insert into public.companies (name, slug, accent, plan_paid, sub_created_at, renews_at)
    values (v_name, p_slug, coalesce(p_accent, '#3B82F6'),
            coalesce(rec.paid, true), now(),
            case when coalesce(rec.paid, true)
                 then now() + (coalesce(rec.period_months, 1) || ' months')::interval
                 else null end)
    returning id into cid;

  insert into public.profiles (id, company_id, naam, email, telefoon, rol, status)
    values (auth.uid(), cid, v_naam, v_email, coalesce(v_telefoon, ''), 'admin', 'actief');
  insert into public.company_state (company_id, data) values (cid, '{}'::jsonb)
    on conflict (company_id) do nothing;

  update public.activation_codes set status = 'used', company_id = cid, used_at = now() where code = clean;
  return cid;
end $$;
grant execute on function public.redeem_company_code(text, text, text, text, text, text, text) to authenticated;

-- ---------- ABONNEMENTSCODES BEHEREN (alleen platform-superadmin) ----------
-- Jij kunt vanuit je eigen account codes aanmaken en bekijken. Codes die JIJ
-- aanmaakt zijn gratis (paid = false); voor de rest geldt paid = true.

-- Oudere versie zonder p_period_months opruimen, anders bestaan er twee
-- overloads en weet PostgREST niet welke te kiezen ("could not choose...").
drop function if exists public.create_activation_code(text, text, text, text, text, boolean);
create or replace function public.create_activation_code(
  p_company_name text default '', p_admin_naam text default '',
  p_admin_email text default '', p_admin_telefoon text default '',
  p_note text default '', p_paid boolean default true, p_period_months int default 1
) returns text language plpgsql security definer as $$
declare new_code text; tries int := 0;
begin
  if not public.is_superadmin() then raise exception 'NOT_ALLOWED'; end if;
  loop
    -- Afgeleid van gen_random_uuid(): cryptografisch sterke bron (random() niet).
    new_code := lpad(((('x' || substr(md5(gen_random_uuid()::text), 1, 12))::bit(48)::bigint) % 1000000000000)::text, 12, '0');
    exit when not exists(select 1 from public.activation_codes where code = new_code);
    tries := tries + 1;
    if tries > 10 then raise exception 'CODE_GEN_FAILED'; end if;
  end loop;
  insert into public.activation_codes
    (code, company_name, admin_naam, admin_email, admin_telefoon, note, paid, period_months, created_by)
    values (new_code, coalesce(p_company_name,''), coalesce(p_admin_naam,''),
            coalesce(p_admin_email,''), coalesce(p_admin_telefoon,''),
            coalesce(p_note,''), coalesce(p_paid, true),
            greatest(1, coalesce(p_period_months, 1)), auth.uid());
  return new_code;
end $$;
grant execute on function public.create_activation_code(text, text, text, text, text, boolean, int) to authenticated;

-- ---------- ABONNEMENT OPZEGGEN / HERACTIVEREN (beheerder van het bedrijf) ----------
-- Opzeggen stopt niet meteen: cancel_at wordt de eerstvolgende verlengdatum, dus
-- tot die datum blijft alles gewoon werken. Heractiveren draait het weer terug.
create or replace function public.cancel_subscription()
returns timestamptz language plpgsql security definer as $$
declare cid uuid; ca timestamptz;
begin
  if not public.is_company_admin() then raise exception 'NOT_ALLOWED'; end if;
  cid := public.current_company_id();
  update public.companies
    set cancelled = true, cancel_at = coalesce(renews_at, now())
    where id = cid
    returning cancel_at into ca;
  return ca;
end $$;
grant execute on function public.cancel_subscription() to authenticated;

create or replace function public.reactivate_subscription()
returns void language plpgsql security definer as $$
begin
  if not public.is_company_admin() then raise exception 'NOT_ALLOWED'; end if;
  update public.companies set cancelled = false, cancel_at = null
    where id = public.current_company_id();
end $$;
grant execute on function public.reactivate_subscription() to authenticated;

-- Alle uitgegeven codes bekijken (alleen superadmin). Retourneert de volledige rij.
create or replace function public.list_activation_codes()
returns setof public.activation_codes language plpgsql stable security definer as $$
begin
  if not public.is_superadmin() then raise exception 'NOT_ALLOWED'; end if;
  return query select * from public.activation_codes order by created_at desc;
end $$;
grant execute on function public.list_activation_codes() to authenticated;

-- ---------- SUPERADMIN-BEHEER: bedrijven/gebruikers verwijderen, superadmins ----------
-- Alleen de platform-superadmin. Alles draait SECURITY DEFINER; we proberen ook
-- het echte login-account (auth.users) op te ruimen — lukt dat niet (rechten),
-- dan verwijderen we in elk geval het profiel/bedrijf.

-- Alle profielen (voor het overzicht per bedrijf).
create or replace function public.admin_list_profiles()
returns setof public.profiles language plpgsql stable security definer as $$
begin
  if not public.is_superadmin() then raise exception 'NOT_ALLOWED'; end if;
  return query select * from public.profiles order by created_at;
end $$;
grant execute on function public.admin_list_profiles() to authenticated;

-- Een gebruiker verwijderen (nooit jezelf).
create or replace function public.admin_delete_user(p_id uuid)
returns void language plpgsql security definer as $$
begin
  if not public.is_superadmin() then raise exception 'NOT_ALLOWED'; end if;
  if p_id = auth.uid() then raise exception 'CANNOT_DELETE_SELF'; end if;
  begin
    delete from auth.users where id = p_id;   -- ruimt via cascade ook het profiel op
  exception when others then
    delete from public.profiles where id = p_id;  -- geen rechten op auth? dan alleen profiel
  end;
end $$;
grant execute on function public.admin_delete_user(uuid) to authenticated;

-- Een heel bedrijf verwijderen (nooit je eigen bedrijf). Profielen en state gaan
-- mee via cascade; we proberen ook de login-accounts te verwijderen.
create or replace function public.admin_delete_company(p_id uuid)
returns void language plpgsql security definer as $$
begin
  if not public.is_superadmin() then raise exception 'NOT_ALLOWED'; end if;
  if p_id = public.current_company_id() then raise exception 'CANNOT_DELETE_OWN'; end if;
  begin
    delete from auth.users u using public.profiles p where p.id = u.id and p.company_id = p_id;
  exception when others then null; end;
  delete from public.companies where id = p_id;  -- cascade: profielen + company_state
end $$;
grant execute on function public.admin_delete_company(uuid) to authenticated;

-- Iemand tot superadmin maken (of het weer afnemen). Nooit op jezelf.
create or replace function public.set_user_superadmin(p_id uuid, p_value boolean)
returns void language plpgsql security definer as $$
begin
  if not public.is_superadmin() then raise exception 'NOT_ALLOWED'; end if;
  if p_id = auth.uid() then raise exception 'CANNOT_CHANGE_SELF'; end if;
  update public.profiles set is_superadmin = coalesce(p_value, false) where id = p_id;
end $$;
grant execute on function public.set_user_superadmin(uuid, boolean) to authenticated;

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
  -- Een bedrijfscode geeft ALTIJD de chauffeur-rol. Werkplaats-/beheerders-
  -- accounts worden door de beheerder aangemaakt (server-side, service_role),
  -- zodat niemand zich via de gedeelde code werkplaats-toegang kan geven.
  p_rol := 'chauffeur';
  -- Al lid van een bedrijf? Dan niet stilzwijgend overzetten naar een ander
  -- bedrijf (met andermans join-code). Eén account = één bedrijf.
  if exists (select 1 from public.profiles where id = auth.uid()) then
    raise exception 'ALREADY_HAS_PROFILE';
  end if;
  insert into public.profiles (id, company_id, naam, email, telefoon, rol, status)
    values (auth.uid(), cid, p_naam, p_email, coalesce(p_telefoon, ''), p_rol, 'actief');
  return cid;
end $$;
grant execute on function public.join_company_with_code(text, text, text, text, text) to authenticated;

-- ---------- PROBLEEMMELDINGEN: bedrijf -> platformbeheerder ----------
-- Een bedrijf kan vanuit Instellingen een probleem/vraag melden. Alleen de
-- platform-superadmin (jij) ziet alle meldingen; een bedrijf ziet alleen zijn
-- eigen meldingen (en de status). Alles loopt via SECURITY DEFINER-functies.

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete set null,
  company_name text default '',
  reporter_id uuid references auth.users(id) on delete set null,
  reporter_naam text default '',
  reporter_email text default '',
  onderwerp text not null default '',
  bericht text not null,
  status text not null default 'open' check (status in ('open','in_behandeling','opgelost')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
alter table public.support_tickets enable row level security;
-- Geen directe client-toegang; alles via de functies hieronder.

-- Een bedrijf meldt een probleem. We koppelen automatisch bedrijf + melder.
create or replace function public.create_support_ticket(p_onderwerp text, p_bericht text)
returns uuid language plpgsql security definer as $$
declare cid uuid; new_id uuid; v_naam text; v_email text; v_cname text;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if coalesce(trim(p_bericht), '') = '' then raise exception 'EMPTY_MESSAGE'; end if;
  select company_id, naam, email into cid, v_naam, v_email from public.profiles where id = auth.uid();
  if cid is null then raise exception 'NO_COMPANY'; end if;
  select name into v_cname from public.companies where id = cid;
  insert into public.support_tickets (company_id, company_name, reporter_id, reporter_naam, reporter_email, onderwerp, bericht)
    values (cid, coalesce(v_cname,''), auth.uid(), coalesce(v_naam,''), coalesce(v_email,''),
            coalesce(nullif(trim(p_onderwerp), ''), 'Probleemmelding'), trim(p_bericht))
    returning id into new_id;
  return new_id;
end $$;
grant execute on function public.create_support_ticket(text, text) to authenticated;

-- Het bedrijf ziet zijn eigen meldingen (met status).
create or replace function public.my_support_tickets()
returns setof public.support_tickets language sql stable security definer as $$
  select * from public.support_tickets
  where company_id = public.current_company_id()
  order by created_at desc
$$;
grant execute on function public.my_support_tickets() to authenticated;

-- De platformbeheerder ziet alle meldingen.
create or replace function public.list_support_tickets()
returns setof public.support_tickets language plpgsql stable security definer as $$
begin
  if not public.is_superadmin() then raise exception 'NOT_ALLOWED'; end if;
  return query select * from public.support_tickets order by
    case status when 'open' then 0 when 'in_behandeling' then 1 else 2 end, created_at desc;
end $$;
grant execute on function public.list_support_tickets() to authenticated;

-- De platformbeheerder zet de status (open / in_behandeling / opgelost).
create or replace function public.set_support_ticket_status(p_id uuid, p_status text)
returns void language plpgsql security definer as $$
begin
  if not public.is_superadmin() then raise exception 'NOT_ALLOWED'; end if;
  if p_status not in ('open','in_behandeling','opgelost') then raise exception 'BAD_STATUS'; end if;
  update public.support_tickets
    set status = p_status, resolved_at = case when p_status = 'opgelost' then now() else null end
    where id = p_id;
end $$;
grant execute on function public.set_support_ticket_status(uuid, text) to authenticated;

-- ---------- MELDINGSFOTO'S: privé-bucket in Supabase Storage ----------
-- Chauffeurs kunnen bij een melding foto's uploaden. Die gaan naar een privé
-- bucket 'meldingen', in een map per bedrijf (eerste padsegment = company_id).
-- Alleen leden van hetzelfde bedrijf kunnen uploaden en bekijken; niets is
-- publiek. We tonen ze via tijdelijke (signed) links.

insert into storage.buckets (id, name, public)
  values ('meldingen', 'meldingen', false)
  on conflict (id) do nothing;

-- Uploaden mag alleen in de map van je eigen bedrijf.
drop policy if exists "meldingen upload eigen bedrijf" on storage.objects;
create policy "meldingen upload eigen bedrijf" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'meldingen'
    and (storage.foldername(name))[1] = public.current_company_id()::text
  );

-- Bekijken mag alleen binnen je eigen bedrijf (of als platform-superadmin).
drop policy if exists "meldingen lezen eigen bedrijf" on storage.objects;
create policy "meldingen lezen eigen bedrijf" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'meldingen'
    and ( (storage.foldername(name))[1] = public.current_company_id()::text or public.is_superadmin() )
  );

-- Verwijderen mag alleen de beheerder van hetzelfde bedrijf (of superadmin).
drop policy if exists "meldingen verwijderen beheerder" on storage.objects;
create policy "meldingen verwijderen beheerder" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'meldingen'
    and ( ((storage.foldername(name))[1] = public.current_company_id()::text and public.is_company_admin()) or public.is_superadmin() )
  );

-- ---------- VOERTUIGDOCUMENTEN: privé-bucket in Supabase Storage ----------
-- Beheer/werkplaats kan per voertuig documenten bewaren (kentekenbewijs,
-- verzekering, APK-rapport, ...). Privé bucket 'documenten', map per bedrijf
-- (eerste padsegment = company_id) en daarbinnen per voertuig. Alleen leden van
-- hetzelfde bedrijf kunnen uploaden/bekijken; getoond via tijdelijke links.

insert into storage.buckets (id, name, public)
  values ('documenten', 'documenten', false)
  on conflict (id) do nothing;

drop policy if exists "documenten upload eigen bedrijf" on storage.objects;
create policy "documenten upload eigen bedrijf" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'documenten'
    and (storage.foldername(name))[1] = public.current_company_id()::text
  );

drop policy if exists "documenten lezen eigen bedrijf" on storage.objects;
create policy "documenten lezen eigen bedrijf" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'documenten'
    and ( (storage.foldername(name))[1] = public.current_company_id()::text or public.is_superadmin() )
  );

-- Verwijderen alleen door de beheerder (zelfde regel als bij 'meldingen'):
-- een chauffeur/monteur moet niet alle kentekenbewijzen kunnen wissen.
drop policy if exists "documenten verwijderen eigen bedrijf" on storage.objects;
create policy "documenten verwijderen eigen bedrijf" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'documenten'
    and ( ((storage.foldername(name))[1] = public.current_company_id()::text and public.is_company_admin()) or public.is_superadmin() )
  );

-- ---------- HERINNERINGEN-LOG: voorkomt dubbele reminder-mails ----------
-- De cron-endpoint (server) logt hier welke mijlpaal-mail al verstuurd is, zodat
-- een retry van de cron-dienst (of een handmatige trigger) niet nóg een keer
-- dezelfde mail stuurt. Alleen de server (service_role) leest/schrijft dit.
create table if not exists public.reminder_log (
  company_id uuid not null references public.companies(id) on delete cascade,
  item_key   text not null,           -- bv. "84-BSX-2|apkTot|2026-11-14|14"
  sent_on    date not null default current_date,
  primary key (company_id, item_key, sent_on)
);
alter table public.reminder_log enable row level security;
-- (Geen policies: uitsluitend bereikbaar via de server met de service_role.)

-- ---------- WEB-PUSH: abonnementen voor pushmeldingen ----------
-- Beheer/werkplaats kan pushmeldingen aanzetten (bij een nieuwe melding). De
-- browser-subscription wordt hier bewaard. Alleen de server (service_role) leest
-- en schrijft; RLS staat aan zonder policies, dus de browser komt er niet bij.
create table if not exists public.push_subscriptions (
  endpoint    text primary key,
  user_id     uuid references auth.users(id) on delete cascade,
  company_id  uuid references public.companies(id) on delete cascade,
  rol         text,
  keys        jsonb not null,
  created_at  timestamptz default now()
);
create index if not exists push_subs_company_idx on public.push_subscriptions (company_id);
alter table public.push_subscriptions enable row level security;
-- (Geen policies: uitsluitend bereikbaar via de server met de service_role.)

-- ---------- OPTIONAL: mark a platform super-admin ----------
-- After you have signed up your own account, run this once with your email:
-- update public.profiles set is_superadmin = true where email = 'jij@truckandtrailer.nl';

-- ---------- REALTIME: live-updates op de werkvloer ----------
-- Laat de app live meeluisteren op wijzigingen van de bedrijfsrij (o.a. nieuwe
-- chauffeursmeldingen), zodat de werkvloer vanzelf ververst. Idempotent.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'companies'
  ) then
    alter publication supabase_realtime add table public.companies;
  end if;
end $$;
