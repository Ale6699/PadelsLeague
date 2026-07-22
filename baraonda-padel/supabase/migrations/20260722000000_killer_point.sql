-- Punto killer: regola opzionale sopra lo scoring a vantaggi. Non tocca scoring_mode né il trigger
-- tournaments_force_advantages_scoring. Due colonne per torneo: abilitazione e numero di parità (40-40)
-- giocate a vantaggio prima del punto decisivo (0 = golden point dal primo 40-40, 1 = dopo il primo vantaggio).
-- Rispecchia Settings.killerPoint / Settings.killerPointAfterDeuces in src/models.ts.

alter table public.tournaments add column if not exists killer_point_enabled boolean not null default false;
alter table public.tournaments add column if not exists killer_point_after_deuces integer not null default 1 check (killer_point_after_deuces >= 0);
