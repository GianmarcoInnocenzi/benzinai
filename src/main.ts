import './style.css';
import { PROXY_URL } from './config';
import { allStations, applySnapshot, ensureTiles, hasTiles, loadMeta, type Box } from './data';
import { downloadPrices } from './update';
import { loadState, matches, mountFilters, priceOf } from './filters';
import { createMap, maplibregl, setPins, type Pin } from './map';
import { FUELS, type Meta, type Station } from './types';

const MIN_ZOOM = 10; // sotto questo zoom non si caricano/mostrano i distributori
const LAST_POS = 'benzinai.lastPos';

const statusEl = document.getElementById('status') as HTMLButtonElement;
const setStatus = (text: string) => (statusEl.textContent = text);

function lastPosition(): { center: [number, number]; zoom: number } {
  try {
    const p = JSON.parse(localStorage.getItem(LAST_POS) ?? 'null');
    if (p && Number.isFinite(p.lng) && Number.isFinite(p.lat)) {
      return { center: [p.lng, p.lat], zoom: 12 };
    }
  } catch {
    /* ignora */
  }
  return { center: [12.5, 42.0], zoom: 5.5 }; // Italia intera
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function popupContent(s: Station): HTMLElement {
  const root = document.createElement('div');
  root.className = 'popup';

  const title = document.createElement('strong');
  title.textContent = `${s.b} · ${s.c}`;
  const addr = document.createElement('div');
  addr.className = 'addr';
  addr.textContent = s.a ? `${s.a}, ${s.c} (${s.pr})` : `${s.c} (${s.pr})`;
  root.append(title, addr);

  const table = document.createElement('table');
  const head = table.insertRow();
  for (const h of ['', 'Self', 'Servito']) {
    const th = document.createElement('th');
    th.textContent = h;
    head.append(th);
  }
  for (const f of FUELS) {
    const pair = s.p[f.id];
    if (!pair) continue;
    const row = table.insertRow();
    row.insertCell().textContent = f.label;
    for (const v of pair) row.insertCell().textContent = v === null ? '–' : v.toFixed(3);
  }
  root.append(table);

  const nav = document.createElement('a');
  nav.href = `https://maps.apple.com/?daddr=${s.la},${s.lo}`;
  nav.target = '_blank';
  nav.rel = 'noopener';
  nav.textContent = 'Portami qui';
  root.append(nav);
  return root;
}

async function start() {
  const state = loadState();
  let meta: Meta | undefined;
  try {
    meta = await loadMeta();
  } catch (e) {
    setStatus(e instanceof Error ? e.message : 'Errore nel caricamento dei dati');
  }

  const byId = new Map<number, Station>();
  let cheapest: Station | null = null;

  const { map, geolocate, refresh, ready } = createMap(
    lastPosition().center,
    lastPosition().zoom,
    (id) => {
      const s = byId.get(id);
      if (!s) return;
      new maplibregl.Popup({ offset: 14, maxWidth: '280px' })
        .setLngLat([s.lo, s.la])
        .setDOMContent(popupContent(s))
        .addTo(map);
    },
    // Il pulsante ↻ compare solo se è configurato il proxy per scaricare dal MIMIT.
    PROXY_URL ? () => void refreshPrices() : undefined,
  );

  const render = () => {
    if (!meta) return;
    if (map.getZoom() < MIN_ZOOM) {
      setPins(map, []);
      cheapest = null;
      setStatus('Avvicina la mappa o attiva la posizione');
      return;
    }

    const pins: Pin[] = [];
    byId.clear();
    for (const s of allStations()) {
      if (!matches(s, state)) continue;
      byId.set(s.id, s);
      pins.push({
        id: s.id,
        lng: s.lo,
        lat: s.la,
        price: priceOf(s, state.fuel, state.mode)!,
        t: 0,
      });
    }

    // La scala dei colori si calcola sui distributori visibili a schermo.
    const bounds = map.getBounds();
    const inView = pins.filter((p) => bounds.contains([p.lng, p.lat]));
    const sample = inView.length > 0 ? inView : pins;
    const min = Math.min(...sample.map((p) => p.price));
    const max = Math.max(...sample.map((p) => p.price));
    for (const p of pins) {
      p.t = max > min ? Math.min(1, Math.max(0, (p.price - min) / (max - min))) : 0;
    }
    setPins(map, pins);

    const best = inView.reduce<Pin | null>((a, p) => (!a || p.price < a.price ? p : a), null);
    cheapest = best ? (byId.get(best.id) ?? null) : null;
    const unit = FUELS.find((f) => f.id === state.fuel)!.unit;
    setStatus(
      best && cheapest
        ? `${inView.length} distributori · migliore ${best.price.toFixed(3)} ${unit} (${cheapest.b}, ${cheapest.c}) · dati del ${formatDate(meta.updated)}`
        : `Nessun distributore con questi filtri · dati del ${formatDate(meta.updated)}`,
    );
  };

  if (import.meta.env.DEV) (window as unknown as { __map: unknown }).__map = map; // per debug

  // "Cerca qui": compare quando la mappa è stata spostata in una zona non ancora caricata.
  const searchBtn = document.getElementById('search') as HTMLButtonElement;
  const updateSearchBtn = () => {
    searchBtn.hidden = !meta || map.getZoom() < MIN_ZOOM || hasTiles(viewBox());
  };
  const viewBox = (): Box => {
    const b = map.getBounds();
    return { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() };
  };
  const search = async (box: Box = viewBox()) => {
    if (!meta) return;
    searchBtn.disabled = true;
    searchBtn.textContent = 'Cerco…';
    const ok = await ensureTiles(box);
    searchBtn.disabled = false;
    searchBtn.textContent = ok ? 'Cerca qui' : 'Riprova';
    if (ok) {
      render();
      updateSearchBtn();
    } else {
      setStatus('Impossibile caricare i dati: controlla la connessione e riprova');
      searchBtn.hidden = false;
    }
  };
  const onMove = () => {
    render();
    updateSearchBtn();
  };

  // Il pulsante sta sotto la barra dei filtri, di cui segue l'altezza.
  const bar = document.getElementById('bar')!;
  const syncBarHeight = () =>
    document.documentElement.style.setProperty('--bar-h', `${bar.offsetHeight}px`);
  new ResizeObserver(syncBarHeight).observe(bar);
  syncBarHeight();

  let filtersMounted = false;
  const mountFiltersOnce = () => {
    if (!meta || filtersMounted) return;
    mountFilters(state, meta.brands, render);
    filtersMounted = true;
  };
  mountFiltersOnce();

  // Pulsante ↻: scarica i prezzi nuovi dal MIMIT (via proxy), li salva sul telefono
  // e ricarica la zona visibile.
  const refreshPrices = async () => {
    refresh?.setBusy(true);
    setStatus('Aggiorno i prezzi… (circa 8 MB)');
    let note: string;
    try {
      const built = await downloadPrices();
      if (meta && built.meta.updated < meta.updated) {
        throw new Error(`il MIMIT ha dati più vecchi (${formatDate(built.meta.updated)})`);
      }
      const saved = await applySnapshot(built.meta, built.tiles);
      meta = built.meta;
      mountFiltersOnce();
      await search();
      note = `✓ Prezzi del ${formatDate(meta.updated)}${saved ? '' : ' (non salvati sul telefono)'}`;
    } catch (e) {
      note = `⚠ Aggiornamento non riuscito: ${e instanceof Error ? e.message : e}`;
      render();
    } finally {
      refresh?.setBusy(false);
    }
    statusEl.textContent = `${note} · ${statusEl.textContent}`;
  };

  statusEl.addEventListener('click', () => {
    if (cheapest) map.flyTo({ center: [cheapest.lo, cheapest.la], zoom: Math.max(map.getZoom(), 14) });
  });

  geolocate.on('geolocate', (e: { coords: GeolocationCoordinates }) => {
    // Posizione trovata: cerca subito lì, senza dover premere "Cerca qui".
    const { longitude: x, latitude: y } = e.coords;
    void search({ west: x - 0.2, east: x + 0.2, south: y - 0.2, north: y + 0.2 });
    try {
      localStorage.setItem(
        LAST_POS,
        JSON.stringify({ lng: e.coords.longitude, lat: e.coords.latitude }),
      );
    } catch {
      /* ignora */
    }
  });
  geolocate.on('error', () => setStatus('Posizione non disponibile: muovi la mappa a mano'));

  searchBtn.addEventListener('click', () => void search());
  await ready;
  map.on('moveend', onMove);
  geolocate.trigger();
  if (map.getZoom() >= MIN_ZOOM) await search();
  else onMove();
}

void start();

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true }));
}
