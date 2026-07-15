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
