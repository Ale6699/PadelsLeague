# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Cosa fa questa app

App web (in italiano) per organizzare tornei di padel in formato "baraonda" (doppio 2v2 a rotazione con punteggi individuali). Il repo root (`C:\Sviluppo\PadelsLeague`) contiene un solo progetto reale: `baraonda-padel/`. Le specifiche funzionali complete (modello dati, priorità del generatore, criteri di accettazione) sono in [baraonda-padel/CODEX_TASK.md](baraonda-padel/CODEX_TASK.md) — consultarlo prima di modificare il solver o il modello del torneo.

## Comandi

Tutti da eseguire dentro `baraonda-padel/`:

```bash
npm install
npm run dev            # Vite dev server
npm run build           # tsc (type-check) + vite build — deve terminare senza errori
npm run preview
npm test                # vitest run (tutti i test)
npx vitest run src/__tests__/solver.test.ts   # singolo file
npx vitest run -t "nome del test"             # singolo test per nome
```

Supabase (facoltativo, richiesto solo per sincronizzazione multi-dispositivo):

```bash
npm run supabase:start   # ambiente locale
npm run supabase:reset   # applica migrazioni + seed in locale
npm run supabase:test    # test pgTAP (richiede supabase:start)
npm run supabase:push    # push migrazioni su progetto collegato (supabase link prima)
npm run supabase:types   # rigenera src/types/supabase.ts
```

Non esiste `vite.config.ts`/`vitest.config.ts`: entrambi girano con i default di Vite/Vitest, quindi i test sono raccolti automaticamente da `src/__tests__/**`.

## Architettura

Nessun framework di routing: `src/main.tsx` fa da entrypoint e router (`AppRouter`, switch su `window.location.pathname` + `popstate`) e da componente applicativo principale (`OrganizerApp`, ~200 righe con tutto lo stato dell'organizzatore: tornei, tab attiva, autosave, realtime, form). Non introdurre React Router: lo stile del progetto è deliberatamente minimale.

**Local-first con provider intercambiabile (`src/data/provider.ts`)**
`dataProvider` è `localProvider` o `supabaseProvider` a seconda di `isLocalDemo` (`VITE_DATA_PROVIDER === 'local'` oppure assenza di credenziali Supabase). Ogni nuova funzionalità di persistenza deve passare da questa interfaccia (`DataProvider`), mai accedere a `localStorage` o al client Supabase direttamente dai componenti.
- Modalità locale: `src/storage.ts` (`LocalTournamentStore`) legge/scrive `localStorage` con versioning ottimistico (`version`, `updatedAt`) e normalizza i tornei salvati da versioni precedenti dell'app (retro-compatibilità dei dati, non del codice).
- Modalità Supabase: `src/data/tournaments.repository.ts` (`SupabaseTournamentRepository`) mappa il dominio in/da righe tramite `src/data/mappers/*.mapper.ts`, usa RPC atomiche (`import_tournament_snapshot`, `replace_tournament_schedule`, `delete_tournament`, `save_live_match_state`) per operazioni che devono restare transazionali, e applica controllo di concorrenza ottimistico via colonna `version` (conflitti → `AppError` con `code: 'conflict'`).
- Gli errori Supabase passano sempre da `mapSupabaseError` (`src/data/errors.ts`) per normalizzarli in `AppError`; i componenti controllano `isAppError(error)` invece di leggere errori Supabase grezzi.

**Autosave, debounce e riconciliazione realtime (`main.tsx`)**
Il salvataggio è deliberatamente non ingenuo: un `useEffect` osserva `tournaments` e fa debounce (600ms) prima di scrivere; `flushSave` serializza i salvataggi Supabase (mai due `save()` in volo, le richieste concorrenti vengono coalescate in un unico salvataggio successivo); `skipNextRemoteSaveRef` evita che uno stato appena arrivato da realtime/reload venga ri-salvato come se fosse una modifica locale; `localEditVersionRef` scarta reload realtime resi obsoleti da un edit locale nel frattempo. Se tocchi questa logica, leggi tutti i commenti in `main.tsx` prima di cambiare l'ordine delle operazioni: i bug qui sono sottili (partite che "ritornano" allo stato vecchio, salvataggi persi alla chiusura tab).

**Solver del calendario (`src/solver.ts`)**
`generateSchedule` è un motore euristico isolato deliberatamente (vedi commento in testa al file) per poter essere sostituito da CP-SAT/OR-Tools lato server in futuro — non aggiungere dipendenze da React o dal resto dell'app dentro questo file. Logica chiave:
- Prova candidati di "partite comuni per giocatore" da `targetMatchesPerPlayer` scendendo fino a 1, e ritorna solo la prima soluzione dove **tutti** i giocatori idonei raggiungono lo stesso totale (equità obbligatoria, non un obiettivo soft).
- Disponibilità, incompatibilità e partite protette (bloccate o già disputate) sono vincoli duri; varietà dei compagni, bilanciamento di livello, coppie miste e riposo sono penalità nella funzione di costo (vedi calcolo `quality` dentro il triplo/quadruplo ciclo).
- `protectedMatches` (bloccate o `isMatchCompleted`) non vengono mai rigenerate: la rigenerazione ricalcola solo gli slot liberi.
- `calendarQuality` calcola gli indicatori mostrati in dashboard (distribuzione partite, turni consecutivi, ripetizioni compagni, squilibrio di livello, % coppie miste, violazioni).
- `balanceScoreFromLevels` in `src/services/matchBalance.ts` è condivisa tra il solver e la UI (badge di equilibrio partita) apposta per non far divergere i due calcoli — non duplicarla.

**Punteggio live (`src/services/liveMatch.ts` + `MatchDashboard.tsx`)**
Stato punto-per-punto in stile tennis/padel (`0/15/30/40` + vantaggio) con timer, storico azioni per undo/redo, e persistenza tramite `save_live_match_state` RPC lato Supabase (per non salvare uno stato a metà). Le funzioni sono pure e testate isolatamente (`__tests__/liveMatch.test.ts`); non spostare questa logica dentro il componente React.

**Auth (`src/auth/`)**
`AuthProvider` avvolge tutta l'app; se Supabase non è configurato, `isAuthenticated` è sempre `true` (nessun login richiesto in modalità demo locale). `ProtectedRoute` fa da guardia per le pagine organizzatore/profilo. Le pagine pubbliche (`/public/:slug`, `/public/:slug/schedule`, `/public/:slug/standings`) restano accessibili senza login solo per tornei con `is_public = true` — la protezione reale è nelle RLS policy Supabase (vedi migrazioni), non nel frontend.

**Migrazioni Supabase (`supabase/migrations/`)**
Ordinate per timestamp, applicate per intero (schema, RLS, viste pubbliche, RPC, canali Realtime). Non modificare una migrazione già applicata in produzione: aggiungerne una nuova. `supabase/seed.sql` contiene solo dati demo locali, non va mai applicato in produzione.

## Convenzioni del progetto

- Stile denso e compatto: molte funzioni/componenti sono scritti su poche righe con arrow function concatenate; è lo stile esistente del repo, mantienilo nei file che segui questo pattern invece di espanderlo in stile verboso.
- Commenti solo dove il *perché* non è ovvio (vincoli nascosti, workaround, invarianti) — vedi gli esempi in `main.tsx` e `storage.ts`. Non aggiungere commenti che descrivono il *cosa*.
- Tutti i testi utente, messaggi di errore, nomi di campi e commit message sono in italiano.
- Non introdurre un service-role key o operazioni privilegiate lato client: il browser usa solo `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`/`VITE_SUPABASE_ANON_KEY`.
