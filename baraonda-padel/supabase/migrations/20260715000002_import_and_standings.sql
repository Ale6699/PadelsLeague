-- Transactional import used only for the one-time browser localStorage migration.
create or replace function public.import_tournament_snapshot(p_snapshot jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid := coalesce(nullif(p_snapshot->>'id','')::uuid, gen_random_uuid());
begin
  insert into tournaments(id,name,public_title,tournament_date,start_time,end_time,match_duration_minutes,transition_duration_minutes,max_games_per_match,scoring_mode,public_slug)
  values (v_id,coalesce(p_snapshot->>'name','Torneo importato'),coalesce(p_snapshot->'settings'->>'title',''),(p_snapshot->'settings'->>'date')::date,coalesce((p_snapshot->'settings'->>'start')::time,'10:00'),coalesce((p_snapshot->'settings'->>'end')::time,'19:00'),coalesce((p_snapshot->'settings'->>'playMinutes')::int,12),coalesce((p_snapshot->'settings'->>'warmupMinutes')::int,3),coalesce((p_snapshot->'settings'->>'maxGamesPerMatch')::int,6),coalesce(p_snapshot->'settings'->>'gameScoringMode','golden_point'),concat('import-',replace(v_id::text,'-','')))
  on conflict (id) do update set name=excluded.name, public_title=excluded.public_title, tournament_date=excluded.tournament_date, start_time=excluded.start_time, end_time=excluded.end_time;

  insert into players(id,tournament_id,first_name,last_name,level,gender,notes,status,sort_order)
  select (x->>'id')::uuid,v_id,coalesce(x->>'firstName','Giocatore'),coalesce(x->>'lastName',''),case x->>'level' when 'Principiante' then 'beginner' when 'Avanzato' then 'advanced' else 'intermediate' end,case x->>'gender' when 'Uomo' then 'male' when 'Donna' then 'female' else 'other' end,nullif(x->>'notes',''),case x->>'status' when 'ritardo' then 'late' when 'assente' then 'absent' when 'infortunato' then 'injured' when 'ritirato' then 'withdrawn' else 'active' end,ord::int
  from jsonb_array_elements(coalesce(p_snapshot->'players','[]'::jsonb)) with ordinality as p(x,ord)
  on conflict (id) do update set first_name=excluded.first_name,last_name=excluded.last_name,level=excluded.level,gender=excluded.gender,notes=excluded.notes,status=excluded.status,sort_order=excluded.sort_order;

  insert into player_availability(player_id,available_from,available_until)
  select (p->>'id')::uuid,concat(p_snapshot->'settings'->>'date','T',a->>'from',':00')::timestamptz,concat(p_snapshot->'settings'->>'date','T',a->>'to',':00')::timestamptz
  from jsonb_array_elements(coalesce(p_snapshot->'players','[]'::jsonb)) p cross join lateral jsonb_array_elements(coalesce(p->'availability','[]'::jsonb)) a;

  insert into player_constraints(tournament_id,player_a_id,player_b_id)
  select distinct v_id,least((p->>'id')::uuid,(partner #>> '{}')::uuid),greatest((p->>'id')::uuid,(partner #>> '{}')::uuid)
  from jsonb_array_elements(coalesce(p_snapshot->'players','[]'::jsonb)) p cross join lateral jsonb_array_elements(coalesce(p->'avoidPartners','[]'::jsonb)) partner
  on conflict do nothing;

  insert into tournament_breaks(tournament_id,title,starts_at,ends_at)
  select v_id,'Pausa',concat(p_snapshot->'settings'->>'date','T',b->>'from',':00')::timestamptz,concat(p_snapshot->'settings'->>'date','T',b->>'to',':00')::timestamptz from jsonb_array_elements(coalesce(p_snapshot->'settings'->'pauses','[]'::jsonb)) b;

  insert into matches(id,tournament_id,sequence_number,starts_at,ends_at,team_a_player_1_id,team_a_player_2_id,team_b_player_1_id,team_b_player_2_id,team_a_games,team_b_games,status,is_locked,live_state)
  select (m->>'id')::uuid,v_id,ord::int,concat(p_snapshot->'settings'->>'date','T',m->>'start',':00')::timestamptz,concat(p_snapshot->'settings'->>'date','T',m->>'end',':00')::timestamptz,nullif(m->'players'->>0,'')::uuid,nullif(m->'players'->>1,'')::uuid,nullif(m->'players'->>2,'')::uuid,nullif(m->'players'->>3,'')::uuid,nullif(m->'result'->>'aGames','')::int,nullif(m->'result'->>'bGames','')::int,coalesce(m->>'status','scheduled'),coalesce((m->>'locked')::boolean,false),m->'liveState'
  from jsonb_array_elements(coalesce(p_snapshot->'matches','[]'::jsonb)) with ordinality as q(m,ord)
  on conflict (id) do update set starts_at=excluded.starts_at,ends_at=excluded.ends_at,team_a_games=excluded.team_a_games,team_b_games=excluded.team_b_games,status=excluded.status,is_locked=excluded.is_locked,live_state=excluded.live_state;
  return v_id;
end; $$;

create or replace view public.tournament_standings with (security_invoker = true) as
select p.tournament_id,p.id player_id,p.first_name,p.last_name,
  count(m.id) filter(where m.status='completed') played,
  count(m.id) filter(where m.status='completed' and ((p.id in (m.team_a_player_1_id,m.team_a_player_2_id) and m.team_a_games>m.team_b_games) or (p.id in (m.team_b_player_1_id,m.team_b_player_2_id) and m.team_b_games>m.team_a_games))) wins,
  count(m.id) filter(where m.status='completed' and m.team_a_games=m.team_b_games) draws,
  count(m.id) filter(where m.status='completed') - count(m.id) filter(where m.status='completed' and m.team_a_games=m.team_b_games) - count(m.id) filter(where m.status='completed' and ((p.id in (m.team_a_player_1_id,m.team_a_player_2_id) and m.team_a_games>m.team_b_games) or (p.id in (m.team_b_player_1_id,m.team_b_player_2_id) and m.team_b_games>m.team_a_games))) losses,
  coalesce(sum(case when p.id in (m.team_a_player_1_id,m.team_a_player_2_id) then m.team_a_games else m.team_b_games end) filter(where m.status='completed'),0) games_for,
  coalesce(sum(case when p.id in (m.team_a_player_1_id,m.team_a_player_2_id) then m.team_b_games else m.team_a_games end) filter(where m.status='completed'),0) games_against,
  coalesce(sum(case when m.status <> 'completed' then 0 when m.team_a_games=m.team_b_games then t.draw_points when (p.id in (m.team_a_player_1_id,m.team_a_player_2_id) and m.team_a_games>m.team_b_games) or (p.id in (m.team_b_player_1_id,m.team_b_player_2_id) and m.team_b_games>m.team_a_games) then t.victory_points else t.defeat_points end),0) points
from players p join tournaments t on t.id=p.tournament_id left join matches m on m.tournament_id=p.tournament_id and p.id in (m.team_a_player_1_id,m.team_a_player_2_id,m.team_b_player_1_id,m.team_b_player_2_id)
group by p.tournament_id,p.id,p.first_name,p.last_name,t.draw_points,t.victory_points,t.defeat_points;

alter publication supabase_realtime add table public.player_availability, public.player_constraints, public.match_score_actions;
