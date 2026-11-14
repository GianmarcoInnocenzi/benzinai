# Benzinai

PWA monoschermata: mappa con i distributori vicino a te, prezzi di benzina, gasolio, GPL e metano, filtri per marchio e per self/servito.
Dati: open data MIMIT (Osservaprezzi carburanti), aggiornati una volta al giorno.

## Comandi

```bash
npm install        # una tantum
npm run data       # scarica i prezzi MIMIT e genera public/data (rifarlo ogni giorno)
npm run dev        # sviluppo su http://localhost:5173
npm run dev:phone  # come dev, ma in HTTPS sulla rete locale (per provare il GPS dall'iPhone)
npm run worker:dev    # proxy MIMIT in locale (http://localhost:8787), serve al pulsante ↻ in `npm run dev`
npm run worker:deploy # pubblica il proxy su Cloudflare Workers (account gratuito)
npm run build      # controllo tipi + build di produzione in dist/
npm run preview    # serve dist/ come in produzione
```

## Struttura

- `scripts/build-data.ts` — CSV MIMIT → `public/data/meta.json` + tessere `tiles/<x>_<y>.json`
- `src/data.ts` — carica le tessere intorno al centro della mappa
- `src/filters.ts` — stato e UI dei filtri (salvati in localStorage)
- `src/map.ts` — MapLibre, pin colorati per prezzo
- `src/main.ts` — collegamento di tutto, popup, geolocalizzazione
- `scripts/copy-worker.ts`, `scripts/make-icons.ts` — utilità di build

## Aggiornare i prezzi dal telefono

I file del MIMIT non sono leggibili dal browser (manca CORS) e i server di GitHub non li raggiungono.
Per questo c'è un piccolo proxy (`worker/`) da pubblicare su Cloudflare Workers: inoltra i due CSV aggiungendo
l'intestazione CORS. Il pulsante ↻ dell'app li scarica, li elabora (`src/mimit.ts`) e li salva sul telefono
(IndexedDB, `src/store.ts`). L'indirizzo del proxy si imposta in `.env.production` (`VITE_PROXY_URL`).
