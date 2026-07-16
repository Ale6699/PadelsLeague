alter table public.tournaments add column if not exists schedule_needs_regeneration boolean not null default false;
alter table public.tournaments add column if not exists timer_sound_enabled boolean not null default true;
alter table public.tournaments add column if not exists generator_preferences jsonb not null default '{"targetMatchesPerPlayer":8,"prioritizeMixed":true}'::jsonb;
alter table public.tournaments add column if not exists dashboard_settings jsonb not null default '{}'::jsonb;

drop policy if exists "Owners can manage tournaments" on public.tournaments;
drop policy if exists "Owners can read tournaments" on public.tournaments;
drop policy if exists "Owners can create tournaments" on public.tournaments;
drop policy if exists "Owners can update tournaments" on public.tournaments;
drop policy if exists "Owners can delete tournaments" on public.tournaments;
create policy "Owners can read tournaments" on public.tournaments for select to authenticated using (owner_id = (select auth.uid()));
create policy "Owners can create tournaments" on public.tournaments for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "Owners can update tournaments" on public.tournaments for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "Owners can delete tournaments" on public.tournaments for delete to authenticated using (owner_id = (select auth.uid()));

create or replace function public.delete_tournament(p_tournament_id uuid, p_expected_version bigint default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_version bigint;
begin
  if auth.uid() is null then raise exception 'PERMISSION_DENIED'; end if;
  select owner_id, version into v_owner, v_version from public.tournaments where id = p_tournament_id for update;
  if not found then return jsonb_build_object('deleted', false, 'conflict', false); end if;
  if v_owner is distinct from auth.uid() then raise exception 'PERMISSION_DENIED'; end if;
  if p_expected_version is not null and v_version <> p_expected_version then return jsonb_build_object('deleted', false, 'conflict', true); end if;
  delete from public.tournaments where id = p_tournament_id;
  return jsonb_build_object('deleted', true, 'conflict', false);
end;
$$;
revoke all on function public.delete_tournament(uuid, bigint) from public, anon;
grant execute on function public.delete_tournament(uuid, bigint) to authenticated;

create or replace function public.replace_tournament_schedule(p_tournament_id uuid, p_expected_version bigint, p_matches jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_version bigint;
  v_owner uuid;
  v_sequence integer;
begin
  select version, owner_id into v_version, v_owner from public.tournaments where id = p_tournament_id for update;
  if not found then raise exception 'TOURNAMENT_NOT_FOUND'; end if;
  if v_owner is distinct from auth.uid() then raise exception 'PERMISSION_DENIED'; end if;
  if v_version <> p_expected_version then raise exception 'VERSION_CONFLICT'; end if;

  delete from public.matches where tournament_id = p_tournament_id and is_locked = false and status <> 'completed';
  select coalesce(max(sequence_number), 0) into v_sequence from public.matches where tournament_id = p_tournament_id;
  insert into public.matches(tournament_id, sequence_number, starts_at, ends_at, team_a_player_1_id, team_a_player_2_id, team_b_player_1_id, team_b_player_2_id, is_locked, status)
  select p_tournament_id, v_sequence + x.ordinality::integer, (x.item->>'starts_at')::timestamptz, (x.item->>'ends_at')::timestamptz,
    nullif(x.item->>'team_a_player_1_id','')::uuid, nullif(x.item->>'team_a_player_2_id','')::uuid,
    nullif(x.item->>'team_b_player_1_id','')::uuid, nullif(x.item->>'team_b_player_2_id','')::uuid,
    coalesce((x.item->>'is_locked')::boolean,false), coalesce(x.item->>'status','scheduled')
  from jsonb_array_elements(p_matches) with ordinality as x(item, ordinality);
  update public.tournaments set schedule_needs_regeneration = false where id = p_tournament_id;
end;
$$;
revoke all on function public.replace_tournament_schedule(uuid, bigint, jsonb) from public, anon;
grant execute on function public.replace_tournament_schedule(uuid, bigint, jsonb) to authenticated;
