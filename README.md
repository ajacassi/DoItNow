# DoItNow

Un client desktop veloce e curato per **GitHub Projects (v2)** — pensato per andare oltre quello che offre l'interfaccia web di GitHub: viste dense, filtri con query, drag-and-drop tra stati, Gantt, e strumenti di manutenzione per progetti che vivono a lungo (es. roadmap di prodotto) e accumulano centinaia di issue.

Windows desktop app, costruita con **Tauri v2** (backend Rust) + **React 19** + **TypeScript** + **Tailwind CSS v4**.

## Funzionalità

- **Autenticazione** con Personal Access Token GitHub, selezione organizzazione/progetto.
- **Tre viste** sullo stesso progetto:
  - **Tabella** — raggruppata per stato, colonne configurabili, drag-and-drop tra stati, colonne "Assegnatario/Creata/Aggiornata/Chiusa" oltre ai campi custom.
  - **Board** — kanban classico, drag-and-drop tra colonne di stato.
  - **Gantt** — rileva automaticamente i campi data (start/target/due) del progetto, zoom giorno/settimana, marcatore "oggi"; le issue senza date restano visibili (senza barra) per capire cosa va aggiornato.
  - In Tabella e Gantt gli stati senza issue vengono nascosti, e l'ordine con cui compaiono può essere invertito (Board mostra sempre tutte le colonne, nell'ordine di GitHub).
- **Pannello di dettaglio issue** — titolo, descrizione (markdown con editor), stato, assegnatari, label, milestone, campi custom del progetto (inclusi i campi "Issue Fields" a livello di organizzazione), commenti, upload immagini via drag/incolla.
- **Creazione issue** dall'app, con impostazione dei campi del progetto già in fase di creazione ed eventuale creazione come sub-issue.
- **Sub-issue** — creazione, collegamento, elenco con indicatore di completamento sulla issue padre (le sub-issue non compaiono come righe proprie in Tabella/Board).
- **Progetti collegati** — nel pannello di dettaglio si vede in quali altri progetti è presente una issue, con possibilità di scollegarla da uno specifico progetto.
- **Filtri**:
  - Sidebar per filtrare per label, con cartelle organizzabili dall'utente (persistite in locale).
  - Query bar in stile ricerca GitHub (`label:bug or assignee:mario -status:"Done"`), con autocomplete su campo e valore.
  - **Viste salvate** con nome, per progetto, con sincronizzazione live mentre la vista è attiva (nessun salvataggio manuale).
- **@mention e #issue** nei campi di testo (descrizione/commenti), con autocomplete e riferimenti `#123` cliccabili che aprono la issue citata direttamente nell'app.
- **Pulizia progetto** (🧹, accesso volontario e separato dalle viste) — query dedicata per selezionare in blocco un sottoinsieme di issue e scollegarle dal progetto o eliminarle definitivamente dalla repository (con conferma esplicita per l'eliminazione).
- **Conteggio issue del repo** — badge accanto al titolo del progetto con il totale delle issue nel/i repository effettivamente collegati al progetto (da Settings → Repositories), non dedotto dagli item.
- **Due temi**, scelta ricordata: scuro (default originale) e chiaro in stile ZenHub, con pillola pastello per label/stati. Pulsante di switch sempre visibile in basso a destra.
- **Paginazione** automatica sul recupero degli item del progetto (nessun troncamento oltre i 100 elementi).

## Requisiti

- [Node.js](https://nodejs.org/) e npm
- [Rust](https://www.rust-lang.org/tools/install) (toolchain stabile) + [prerequisiti Tauri v2 per Windows](https://v2.tauri.app/start/prerequisites/)
- Un **Personal Access Token GitHub**:
  - classic: scope `repo` (per creare/modificare issue, label, commenti) + `project` (o `read:project` se serve solo lettura)
  - fine-grained: permessi `Issues: Read and write`, `Contents: Read` e `Projects: Read and write` sull'organizzazione/repository interessati

Il token resta salvato solo in locale (file di configurazione dell'app), non viene mai inviato altrove se non a `api.github.com`.

## Sviluppo

```bash
npm install
npm run tauri dev
```

Altri comandi utili:

```bash
npm run dev        # solo frontend (Vite), senza la finestra Tauri
npx tsc --noEmit   # typecheck
npm run tauri build  # build di produzione (installer NSIS)
```

## Release

Il numero di versione è mantenuto sincronizzato in `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` e `package.json`. Quando viene rilevato un bump della versione **major** su `master`, il workflow `.github/workflows/release.yml` crea automaticamente il tag e pubblica una draft release su GitHub con l'installer Windows (NSIS) allegato.
