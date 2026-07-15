# Baraonda Padel Sistemi Tre

Web app locale per organizzare tornei di padel in formato baraonda.

## Avvio

```bash
npm install
npm run dev
```

Aprire l'indirizzo mostrato da Vite.

## Verifica

```bash
npm run build
npm test
```

## Supabase e sincronizzazione multi-dispositivo

Supabase è il provider primario quando le credenziali sono configurate; senza
credenziali l'app rimane utilizzabile in modalità demo locale (`localStorage`).

```bash
cp .env.example .env.local
# inserire VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY
npm install
npm run supabase:start       # ambiente locale opzionale
npm run supabase:reset       # applica migrazioni e seed in locale
npm run supabase:types       # rigenera src/types/supabase.ts
npm run dev
```

Per un progetto ospitato, collega prima la CLI con `supabase link` e poi usa
`npm run supabase:push`. Le migrazioni creano schema, indici, view pubbliche,
versionamento, funzioni RPC atomiche e canali Realtime per tornei, giocatori,
partite e pause. Alla prima connessione a un database vuoto, i tornei locali
vengono importati in una transazione e gli identificativi legacy sono convertiti
in UUID.

Non inserire mai `SUPABASE_SERVICE_ROLE_KEY` nel client. L'URL e la
publishable/anon key sono le sole variabili esposte da Vite.

## Accesso organizzatore (Supabase Auth)

Con le migrazioni Auth applicate, le pagine di gestione richiedono un account
Supabase; le pagine `/public/:slug`, `/public/:slug/schedule` e
`/public/:slug/standings` restano leggibili senza login soltanto per tornei con
`is_public = true`. Non esiste registrazione pubblica nell'app.

1. In Supabase Dashboard apri **Authentication → Users → Add user** e crea il
   primo organizzatore, confermando l'email.
2. In **Authentication → URL Configuration** imposta la Site URL e aggiungi
   gli URL di redirect per lo sviluppo e la produzione, ad esempio
   `http://localhost:5173/reset-password`. Non inserire URL di produzione nel
   codice: opzionalmente configura `VITE_APP_URL` in `.env.local`.
3. Dopo il primo login su un progetto che contiene dati precedenti ad Auth,
   esegui dalla SQL editor autenticata `select public.claim_unowned_tournaments();`.
   La funzione assegna solo i tornei senza proprietario all'utente corrente.
   Dopo il controllo puoi rendere `owner_id` obbligatorio con il comando
   commentato nella migrazione Auth.

Le policy RLS bloccano ogni scrittura al ruolo `anon` e limitano i dati
amministrativi al proprietario del torneo. Le viste pubbliche escludono note,
disponibilità, vincoli, stato dei giocatori, proprietario e campi di audit.
Il browser usa esclusivamente la publishable/anon key; non esporre mai una
service-role key. Il flusso **Password dimenticata** usa il redirect configurato
per `/reset-password`, dove è possibile impostare una password di almeno otto
caratteri.

## Funzioni incluse

- più tornei salvati nel browser;
- configurazione orari, durata partita, riscaldamento e pause;
- anagrafica giocatori, livello, genere, note e più fasce di disponibilità;
- incompatibilità tra compagni;
- generazione automatica del calendario;
- blocco di partite e rigenerazione delle altre;
- bilanciamento per livello, varietà dei compagni, riposo e coppie miste;
- gestione assente, ritardo, infortunato e ritirato;
- risultati individuali e classifica;
- pagina pubblica da proiettare;
- esportazione PDF di calendario e classifica.
- importazione/esportazione JSON e annullamento dell'ultima rigenerazione;
- editor delle quattro posizioni con trascinamento;
- indicatori di equità e spiegazioni per le violazioni.

## Nota sull'algoritmo

Il generatore è euristico: cerca una soluzione di buona qualità e segnala i vincoli non rispettati. Per tornei molto complessi, la versione successiva può sostituire il motore con OR-Tools o un solver CP-SAT eseguito lato server.
