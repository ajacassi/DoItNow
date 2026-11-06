# DoItNow

Un client desktop veloce e curato per **GitHub Projects (v2)** — pensato per andare oltre quello che offre l'interfaccia web di GitHub: viste dense, filtri con query, drag-and-drop tra stati, Gantt, e strumenti di manutenzione per progetti che vivono a lungo (es. roadmap di prodotto) e accumulano centinaia di issue.

Windows desktop app, costruita con **Tauri v2** (backend Rust) + **React 19** + **TypeScript** + **Tailwind CSS v4**.

## Funzionalità

- **Autenticazione** con Personal Access Token GitHub (salvato nel Gestore credenziali di Windows), selezione organizzazione/progetto.
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
- Un **Personal Access Token GitHub** con i permessi minimi descritti in [Creare il token GitHub](#creare-il-token-github).

## Creare il token GitHub

DoItNow parla con GitHub tramite un Personal Access Token (PAT). Conviene crearne uno **dedicato all'app**, con solo i permessi che servono e una scadenza: se va perso, lo revochi senza toccare nient'altro.

Il token viene salvato nel **Gestore credenziali di Windows** (cifrato con il tuo account, voce `github_token.com.doitnow.app`), non in un file. Viene inviato solo a GitHub (`api.github.com`, e `uploads.github.com` per gli allegati) e non viene mai incluso nell'export delle impostazioni.

### Quale tipo di token

| | Token **classic** (consigliato) | Token **fine-grained** |
|---|---|---|
| Tutte le funzionalità | ✅ | ❌ niente notifiche, allegati non garantiti |
| Limitato a repository specifici | ❌ tutti i repo a cui hai accesso | ✅ |
| Approvazione dell'organizzazione | di solito no (solo autorizzazione SSO se attiva) | può servire, se l'organizzazione la richiede |

Il token **classic** è l'unico con cui funziona tutto: l'API delle notifiche di GitHub non accetta i token fine-grained. Il **fine-grained** è più restrittivo (solo l'organizzazione e i repository che scegli) ed è una buona scelta se le notifiche nell'app non ti servono.

### Token classic (consigliato)

1. Su GitHub: foto profilo → **Settings** → **Developer settings** → **Personal access tokens** → **Tokens (classic)** → **Generate new token (classic)** ([link diretto](https://github.com/settings/tokens/new)).
2. **Note**: un nome riconoscibile, es. `DoItNow`.
3. **Expiration**: una scadenza (es. 90 giorni). Alla scadenza l'app ti richiede un token nuovo.
4. Seleziona **solo** questi scope:

   | Scope | A cosa serve in DoItNow |
   |---|---|
   | `repo` | Leggere e modificare issue e pull request dei repository (anche privati): titolo, descrizione, stato, assegnatari, label, milestone, tipo, commenti, sub-issue, relazioni "bloccata da", creazione ed eliminazione issue. Copre anche le **notifiche**. |
   | `project` | Leggere e modificare i Projects dell'organizzazione: elenco progetti, item, stato e campi custom, aggiungere/scollegare issue, gestire le opzioni dei campi. |
   | `read:org` | Sola lettura dei dati dell'organizzazione: tipi di issue e "Issue Fields" definiti a livello di organizzazione, elenco dei repository. |

   Se l'organizzazione usa **solo repository pubblici** puoi sostituire `repo` con `public_repo` + `notifications`.

   **Non servono** (lasciali deselezionati): `workflow`, `write:packages`, `delete_repo`, `admin:org`, `admin:repo_hook`, `user`, `gist`, `codespace`, `copilot` e tutti gli altri.
5. **Generate token** e copia subito il valore (`ghp_…`): GitHub non lo mostra più.
6. Se l'organizzazione usa il **SAML SSO**: nella lista dei token, accanto al nuovo token, **Configure SSO** → **Authorize** sull'organizzazione. Senza questo passaggio l'app non vede i progetti.
7. Incolla il token nella schermata iniziale di DoItNow.

### Token fine-grained (alternativa più restrittiva)

1. Su GitHub: **Settings** → **Developer settings** → **Personal access tokens** → **Fine-grained tokens** → **Generate new token** ([link diretto](https://github.com/settings/personal-access-tokens/new)).
2. **Token name** ed **Expiration** come sopra.
3. **Resource owner**: l'**organizzazione** (non il tuo utente). I Projects di un account personale non sono raggiungibili con token fine-grained.
4. **Repository access**: **Only select repositories** → i repository collegati ai progetti che usi.
5. **Repository permissions**:

   | Permesso | Livello | A cosa serve |
   |---|---|---|
   | Issues | Read and write | Leggere e modificare le issue (campi, label, milestone, commenti, sub-issue, relazioni di blocco), crearle |
   | Pull requests | Read-only | Mostrare le pull request presenti nei progetti |
   | Contents | Read-only | Allegati (caricamento immagini) |
   | Metadata | Read-only | Obbligatorio, viene impostato da GitHub |

6. **Organization permissions**:

   | Permesso | Livello | A cosa serve |
   |---|---|---|
   | Projects | Read and write | Leggere e modificare i Projects e i loro campi |
   | Issue Types | Read-only | Leggere i tipi di issue (Bug, Feature, Task…) definiti dall'organizzazione |

7. **Generate token**. Se l'organizzazione richiede l'approvazione dei token fine-grained, il token resta "pending" finché un owner non lo approva.

Limitazioni note con il token fine-grained:

- **Notifiche**: non funzionano (GitHub accetta solo token classic per quell'API).
- **Allegati**: il caricamento immagini usa un endpoint GitHub non ufficiale, che potrebbe non accettare i token fine-grained.
- **Issue Fields** di organizzazione: GitHub non documenta un permesso dedicato; se non compaiono, usa il token classic.

### Indipendentemente dal tipo di token

- Il token non può fare più di quello che puoi fare tu: se nel repository o nel progetto hai solo accesso in lettura, l'app potrà solo leggere.
- **Eliminare issue** (🧹 Pulizia progetto) richiede che il tuo utente sia **admin** del repository: con un ruolo inferiore GitHub rifiuta l'operazione, qualunque sia lo scope del token. Scollegare issue dal progetto invece funziona con i permessi normali.
- Per cambiare token: nella schermata dei progetti, **Cambia token** (il token viene cancellato dal Gestore credenziali) e inserisci quello nuovo. Il vecchio va revocato su GitHub, dalla stessa pagina dove l'hai creato.

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
