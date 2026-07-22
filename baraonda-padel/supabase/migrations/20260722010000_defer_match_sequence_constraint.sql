-- Il vincolo unique(tournament_id, sequence_number) su matches è controllato riga per riga
-- DURANTE la singola istruzione di upsert (comportamento di default di Postgres per i vincoli
-- non deferrable). Quando il calendario viene rigenerato/compattato, molte partite cambiano
-- sequence_number nello stesso salvataggio: se due righe "si scambiano" il numero (una prende il
-- valore appena lasciato libero dall'altra), Postgres può rifiutare la scrittura con
-- "duplicate key value violates unique constraint" anche se lo stato finale è perfettamente
-- univoco, solo perché l'ordine con cui applica le righe nell'istruzione crea una collisione
-- temporanea. Rendere il vincolo deferrable (controllato a fine istruzione/transazione, non riga
-- per riga) risolve il problema senza cambiare la logica applicativa.
alter table public.matches drop constraint if exists matches_tournament_id_sequence_number_key;
alter table public.matches add constraint matches_tournament_id_sequence_number_key unique (tournament_id, sequence_number) deferrable initially deferred;
