-- Le policy "markets read for enabled tournament" e "selections read for enabled tournament"
-- referenziano public.tournaments con una subquery non security-definer: per un utente non
-- organizzatore la RLS di tournaments (solo owner_id = auth.uid()) nasconde la riga del torneo,
-- quindi l'exists() risulta sempre falso indipendentemente dal reale valore di betting_enabled.
-- Risultato: solo l'organizzatore (che passa dal ramo betting_is_owner, security definer) vede
-- i mercati aperti; ogni altro utente vede sempre "nessun mercato disponibile".
create or replace function public.betting_is_enabled(p_tournament uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.tournaments t where t.id = p_tournament and t.betting_enabled);
$$;

drop policy if exists "markets read for enabled tournament" on public.bet_markets;
create policy "markets read for enabled tournament" on public.bet_markets for select to authenticated
  using (public.betting_is_owner(tournament_id) or public.betting_is_enabled(tournament_id));

drop policy if exists "selections read for enabled tournament" on public.bet_selections;
create policy "selections read for enabled tournament" on public.bet_selections for select to authenticated
  using (exists (select 1 from public.bet_markets m where m.id = bet_selections.market_id
    and (public.betting_is_owner(m.tournament_id) or public.betting_is_enabled(m.tournament_id))));
