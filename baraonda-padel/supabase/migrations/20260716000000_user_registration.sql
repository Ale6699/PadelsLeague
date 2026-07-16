-- Task 9: self-service organizer registration, application profiles and strict ownership.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text not null check (char_length(first_name) between 2 and 80),
  last_name text not null check (char_length(last_name) between 2 and 80),
  accepted_terms_at timestamptz,
  marketing_consent boolean not null default false,
  terms_version text,
  privacy_version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, first_name, last_name, accepted_terms_at, marketing_consent, terms_version, privacy_version)
  values (
    new.id,
    case when char_length(trim(coalesce(new.raw_user_meta_data ->> 'first_name', ''))) >= 2 then left(trim(new.raw_user_meta_data ->> 'first_name'), 80) else 'Utente' end,
    case when char_length(trim(coalesce(new.raw_user_meta_data ->> 'last_name', ''))) >= 2 then left(trim(new.raw_user_meta_data ->> 'last_name'), 80) else 'Organizzatore' end,
    case when lower(coalesce(new.raw_user_meta_data ->> 'accepted_terms', 'false')) in ('true', '1', 'yes') then now() else null end,
    lower(coalesce(new.raw_user_meta_data ->> 'marketing_consent', 'false')) in ('true', '1', 'yes'),
    nullif(new.raw_user_meta_data ->> 'terms_version', ''),
    nullif(new.raw_user_meta_data ->> 'privacy_version', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

create or replace function public.ensure_own_profile()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then raise exception 'AUTH_REQUIRED'; end if;
  insert into public.profiles (id, first_name, last_name, accepted_terms_at, marketing_consent, terms_version, privacy_version)
  select u.id,
    case when char_length(trim(coalesce(u.raw_user_meta_data ->> 'first_name', ''))) >= 2 then left(trim(u.raw_user_meta_data ->> 'first_name'), 80) else 'Utente' end,
    case when char_length(trim(coalesce(u.raw_user_meta_data ->> 'last_name', ''))) >= 2 then left(trim(u.raw_user_meta_data ->> 'last_name'), 80) else 'Organizzatore' end,
    case when lower(coalesce(u.raw_user_meta_data ->> 'accepted_terms', 'false')) in ('true', '1', 'yes') then u.created_at else null end,
    lower(coalesce(u.raw_user_meta_data ->> 'marketing_consent', 'false')) in ('true', '1', 'yes'),
    nullif(u.raw_user_meta_data ->> 'terms_version', ''), nullif(u.raw_user_meta_data ->> 'privacy_version', '')
  from auth.users u where u.id = (select auth.uid())
  on conflict (id) do nothing;
end;
$$;

create or replace function public.touch_profile_updated_at()
returns trigger language plpgsql set search_path = '' as $$ begin new.updated_at = now(); return new; end; $$;
drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at before update on public.profiles for each row execute procedure public.touch_profile_updated_at();

drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile" on public.profiles for select to authenticated using (id = (select auth.uid()));
drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile" on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (first_name, last_name, marketing_consent) on public.profiles to authenticated;
grant execute on function public.ensure_own_profile() to authenticated;

-- Never trust an owner supplied by the browser: new rows always belong to auth.uid().
create or replace function public.assign_tournament_owner()
returns trigger language plpgsql security definer set search_path = '' as $$
declare authenticated_user_id uuid := (select auth.uid());
begin
  if authenticated_user_id is not null then
    new.owner_id = authenticated_user_id;
  elsif session_user not in ('postgres', 'supabase_admin') or new.owner_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  return new;
end;
$$;

drop policy if exists "Owners can manage tournaments" on public.tournaments;
create policy "Owners can manage tournaments" on public.tournaments for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

-- Fresh installations become NOT NULL immediately. Existing installations must first
-- run claim_unowned_tournaments() so no historical data is assigned implicitly.
do $$ begin
  if not exists (select 1 from public.tournaments where owner_id is null) then
    alter table public.tournaments alter column owner_id set not null;
  end if;
end $$;
