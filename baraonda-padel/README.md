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

## Accesso e registrazione organizzatori (Supabase Auth)

Con le migrazioni Auth applicate, le pagine di gestione richiedono un account
Supabase; le pagine `/public/:slug`, `/public/:slug/schedule` e
`/public/:slug/standings` restano leggibili senza login soltanto per tornei con
`is_public = true`. Un nuovo organizzatore può registrarsi da `/register`; Supabase
gestisce password, sessione e conferma email, mentre la migrazione crea il profilo
applicativo e limita profili e tornei al rispettivo proprietario.

### Configurazione richiesta

1. In **Authentication → Providers → Email** abilita il provider Email e, in
   **Authentication → Settings**, abilita le nuove registrazioni. Scegli se
   richiedere la conferma email: l'app supporta sia il flusso con email sia la
   sessione immediata.
2. In **Authentication → URL Configuration** imposta la Site URL e autorizza:
   `http://localhost:5173/auth/confirm` e
   `http://localhost:5173/reset-password`. Aggiungi gli equivalenti URL reali
   dell'ambiente pubblicato, senza inserirne uno fittizio nel codice.
3. Configura in `.env.local` le sole chiavi pubblicabili:

   ```env
   VITE_SUPABASE_URL=
   VITE_SUPABASE_PUBLISHABLE_KEY=
   VITE_APP_URL=http://localhost:5173
   VITE_TERMS_URL=
   VITE_PRIVACY_URL=
   VITE_TERMS_VERSION=1
   VITE_PRIVACY_VERSION=1
   ```

   Se gli URL legali sono vuoti, l'app usa `/terms` e `/privacy`. Sostituisci i
   testi provvisori con quelli approvati prima della pubblicazione.
4. Applica le migrazioni con `npm run supabase:push` (remoto) oppure
   `npm run supabase:reset` (locale). I test SQL pgTAP si eseguono con
   `npm run supabase:test` dopo `npm run supabase:start`. `supabase/seed.sql`
   contiene esclusivamente dati demo locali e non deve essere applicato in produzione.
5. In **Authentication → Email Templates → Confirm signup** personalizza il
   messaggio con il nome dell'app, il motivo dell'email e un pulsante che usa il
   link di conferma fornito da Supabase. Non mostrare password o token in chiaro.
6. Per la produzione configura un SMTP affidabile e controlla i limiti Auth.
   Il frontend applica un cooldown di 60 secondi al reinvio, ma i limiti del
   provider restano l'autorità finale.
7. Prima della pubblicazione abilita la protezione CAPTCHA in Supabase. Integra
   il widget del provider scelto e passa il token nel campo opzionale
   `captchaToken` di `SignUpInput`; la chiave segreta rimane nel provider e non
   deve mai essere inserita nel bundle frontend.
8. Dopo il primo login su un progetto che contiene dati precedenti ad Auth,
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
