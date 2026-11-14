# Benzinai

PWA monoschermata: mappa con i distributori vicino a te, prezzi di benzina, gasolio, GPL e metano, filtri per marchio e per self/servito.
Dati: open data MIMIT (Osservaprezzi carburanti), aggiornati una volta al giorno.

## Comandi

```bash
npm install        # una tantum
npm run data       # scarica i prezzi MIMIT e genera public/data (rifarlo ogni giorno)
npm run dev        # sviluppo su http://localhost:5173
npm run dev:phone  # come dev, ma in HTTPS sulla rete locale (per provare il GPS dall'iPhone)
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
