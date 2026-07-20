# Task Codex — Baraonda Padel Sistemi Tre

Realizza e rifinisci una web app locale, in italiano, per gestire più tornei di padel in formato baraonda. L'app è usata da un solo organizzatore, senza autenticazione, e deve funzionare in locale con strumenti gratuiti.

## Stack richiesto

- React + TypeScript + Vite.
- Persistenza locale nel browser; predisporre un'astrazione sostituibile in futuro con SQLite/Supabase.
- Nessun backend obbligatorio per l'MVP.
- Esportazione PDF di calendario e classifica.
- UI sportiva, vivace, leggibile anche su uno schermo grande.

## Modello del torneo

Ogni torneo deve avere:

- nome e titolo pubblico;
- data;
- un solo campo;
- ora di inizio e fine configurabili;
- durata effettiva della partita configurabile, default 12 minuti;
- durata cambio/riscaldamento configurabile, default 3 minuti;
- zero o più pause con intervallo inizio/fine;
- numero massimo di partite per giocatore, default 8;
- più tornei salvabili e riapribili.

## Giocatori

Campi:

- nome;
- cognome;
- livello: Principiante, Intermedio, Avanzato;
- genere: Uomo, Donna, Altro;
- note;
- stato: attivo, in ritardo, assente, infortunato, ritirato;
- una o più finestre di disponibilità nella giornata;
- elenco di persone con cui non può essere compagno.

Non servono riserve o partecipanti non confermati.

## Formato delle partite

- Sempre doppio 2 contro 2.
- Le coppie cambiano a ogni turno.
- Ogni giocatore ha un punteggio individuale.
- Sono consentiti turni consecutivi, ma il generatore deve privilegiare il riposo.
- Lasciare inutilizzati gli slot eccedenti quando serve a mantenere lo stesso numero di partite per tutti.

## Priorità del generatore

In ordine:

1. privilegiare il riposo ed evitare, quando possibile, turni consecutivi;
2. massimizzare la varietà dei compagni e ridurre al minimo le coppie ripetute;
3. rispettare la disponibilità oraria;
4. rendere obbligatorio lo stesso numero di partite per tutti, senza superare il massimo configurato;
5. chi lascia prima deve ricevere lo stesso numero di partite, concentrate prima;
6. bilanciare le squadre per livello;
7. evitare assolutamente due forti contro due deboli;
8. prediligere coppie miste;
9. evitare due donne contro due uomini;
10. rispettare le incompatibilità tra compagni.

Disponibilità e incompatibilità sono vincoli duri. Quando l'insieme dei dati rende impossibile rispettare tutto, generare comunque la soluzione migliore e mostrare chiaramente ogni violazione.

## Algoritmo

Per l'MVP è accettabile un algoritmo euristico con funzione di costo. Organizzare il codice affinché il motore possa essere sostituito con OR-Tools CP-SAT.

La funzione obiettivo deve penalizzare:

- differenza nel numero totale di partite;
- turni consecutivi;
- ripetizione dello stesso compagno;
- squilibrio di livello tra le due coppie;
- coppie non miste, quando evitabili;
- confronto 2 donne contro 2 uomini;
- incompatibilità di coppia;
- mancato rispetto delle disponibilità.

Aggiungere test automatici almeno per:

- giocatore disponibile solo fino alle 13:00;
- giocatore che arriva dopo le 12:00;
- indisponibilità durante la pausa pranzo;
- due giocatori incompatibili come compagni;
- 19 giocatori, 36 slot, obiettivo 8 partite ciascuno;
- rigenerazione con alcune partite bloccate.

## Modifica e rigenerazione

- Generazione automatica dell'intero calendario.
- Possibilità di bloccare singole partite.
- Rigenerazione delle sole partite non bloccate.
- In caso di ritiro o assenza improvvisa, ricalcolare solo le partite future con il minor numero possibile di spostamenti.
- Non modificare le partite già disputate.
- Consentire modifiche manuali alle partite future e segnalare eventuali violazioni.

## Risultati

Per ogni partita salvare:

- vittoria coppia A, vittoria coppia B oppure pareggio;
- game della coppia A;
- game della coppia B;
- massimo tipico 6 game, senza impedire una correzione manuale;
- possibilità di correggere o annullare il risultato.

Punteggio individuale:

- vittoria: 3 punti a ciascun componente della coppia vincente;
- pareggio: 1 punto a tutti;
- sconfitta: 0 punti.

Ordinamento classifica:

1. punti;
2. numero di partite/set disputati secondo la terminologia configurata;
3. game/set vinti;
4. game/set persi, in ordine crescente;
5. parità residua indicata come “monetina necessaria”, senza assegnare casualmente un vincitore nell'app.

## Schermate

- Dashboard con indicatori di qualità del calendario.
- Elenco tornei.
- Giocatori.
- Configurazione.
- Disponibilità.
- Incompatibilità tra compagni.
- Generazione calendario.
- Calendario giornaliero.
- Inserimento risultati.
- Classifica.
- Statistiche.
- Pagina pubblica da mostrare su TV/tablet con prossima partita e classifica live.

## Indicatori di qualità

Mostrare almeno:

- distribuzione del numero di partite;
- numero di turni consecutivi;
- numero massimo e medio di ripetizioni dello stesso compagno;
- squilibrio medio di livello;
- numero di violazioni;
- percentuale di coppie miste quando applicabile.

## PDF

Generare un PDF stampabile contenente:

- informazioni del torneo;
- calendario completo;
- risultati inseriti;
- classifica;
- eventuali violazioni evidenziate.

## Criteri di accettazione

- L'app parte con `npm install` e `npm run dev`.
- La build `npm run build` termina senza errori.
- Tutti i dati persistono dopo il refresh.
- Si possono creare e gestire più tornei.
- La generazione non assegna mai un giocatore fuori disponibilità, salvo impossibilità esplicitamente segnalata.
- Le incompatibilità non vengono violate senza una segnalazione visibile.
- Le partite bloccate restano identiche dopo la rigenerazione.
- Le partite già disputate non cambiano dopo un ricalcolo.
- La classifica assegna correttamente 3/1/0 punti individuali.
- L'esportazione PDF funziona senza servizi a pagamento.

## Migliorie richieste rispetto all'MVP iniziale

1. Separare componenti, modelli, storage, solver e servizi PDF in file distinti.
2. Aggiungere test con Vitest.
3. Aggiungere import/export JSON del torneo.
4. Aggiungere undo dell'ultima rigenerazione.
5. Aggiungere editor manuale drag-and-drop delle quattro posizioni.
6. Calcolare e mostrare una spiegazione per ogni violazione.
7. Migliorare la gestione matematica dell'equità con 19 giocatori e numero di presenze non perfettamente divisibile per 4.
