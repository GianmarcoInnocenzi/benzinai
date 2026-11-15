import './style.css';
import { PROXY_URL } from './config';
import { allStations, applySnapshot, ensureTiles, hasTiles, loadMeta, type Box } from './data';
import { downloadPrices } from './update';
import { mountBest, type BestItem } from './best';
import { activeCount, emptyState, matches, mountFilters, priceOf } from './filters';
import { createMap, maplibregl, setPins, type Pin } from './map';
import { FUELS, type Fuel, type Meta, type Station } from './types';

const MIN_ZOOM = 10; // sotto questo zoom non si caricano/mostrano i distributori
const LAST_POS = 'benzinai.lastPos';
const SATELLITE = 'benzinai.satellite';

// ── Avvisi: compaiono in alto sotto la barra e spariscono da soli ──────────
const toastEl = document.getElementById('toast') as HTMLButtonElement;
let toastTimer: number | undefined;
function toast(text: string, ms = 5000): void {
  toastEl.textContent = text;
  toastEl.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (toastEl.hidden = true), ms);
}

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

/** Anteprima sul pin quando non c'è un carburante scelto: benzina e gasolio, una riga ciascuno. */
function previewOf(s: Station): string {
  const lines: string[] = [];
  for (const [fuel, label] of [
    ['benzina', 'Benz'],
    ['gasolio', 'Gas'],
  ] as const) {
    const p = priceOf(s, fuel);
    if (p !== null) lines.push(`${label} ${p.toFixed(3)}`);
  }
  return lines.join('\n');
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
    const name = row.insertCell();
    name.append(f.label + ' ');
    const unit = document.createElement('small');
    unit.textContent = f.unit;
    name.append(unit);
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
  const state = emptyState(); // si parte sempre senza filtri
  let meta: Meta | undefined;
  try {
    meta = await loadMeta();
  } catch (e) {
    toast(e instanceof Error ? e.message : 'Errore nel caricamento dei dati', 10000);
  }

  const byId = new Map<number, Station>();
  let cheapest: Station | null = null;

  const readSatellite = () => {
    try {
      return localStorage.getItem(SATELLITE) === '1';
    } catch {
      return false;
    }
  };

  const { map, geolocate, refresh, ready } = createMap({
    ...lastPosition(),
    satellite: readSatellite(),
    onPinClick: (id) => {
      const s = byId.get(id);
      if (s) showStation(s);
    },
    onSatelliteChange: (on) => {
      try {
        localStorage.setItem(SATELLITE, on ? '1' : '0');
      } catch {
        /* ignora */
      }
    },
    // Il pulsante ↻ compare solo se è configurato il proxy per scaricare dal MIMIT.
    onRefresh: PROXY_URL ? () => void refreshPrices() : undefined,
  });

  const showStation = (s: Station) => {
    new maplibregl.Popup({ offset: 14, maxWidth: '280px' })
      .setLngLat([s.lo, s.la])
      .setDOMContent(popupContent(s))
      .addTo(map);
  };

  /** Ridisegna i pin; con `announce` mostra anche il riepilogo in un avviso. */
  const render = (announce = false) => {
    if (!meta) return;
    if (map.getZoom() < MIN_ZOOM) {
      setPins(map, []);
      cheapest = null;
      if (announce) toast('Avvicina la mappa per vedere i distributori');
      return;
    }

    // Il colore dei pin segue il prezzo del carburante scelto; se non ce n'è uno, quello della benzina.
    const colorFuel: Fuel = state.fuel ?? 'benzina';
    const pins: Pin[] = [];
    byId.clear();
    for (const s of allStations()) {
      if (!matches(s, state)) continue;
      byId.set(s.id, s);
      const price = priceOf(s, colorFuel);
      pins.push({
        id: s.id,
        lng: s.lo,
        lat: s.la,
        price,
        t: -1,
        label: state.fuel && price !== null ? price.toFixed(3) : '',
        preview: state.fuel ? '' : previewOf(s),
        brand: s.b,
      });
    }

    // Fasce di colore: un terzo più economico = verde, un terzo centrale = arancione, un terzo più caro = rosso.
    // Il confronto è con i distributori della ZONA attorno al centro della mappa (circa 40 km), non con quelli
    // visibili a schermo: così il colore di un distributore non cambia zoomando. Se i prezzi della zona
    // differiscono di meno di 3 centesimi sono tutti verdi.
    const bounds = map.getBounds();
    const inView = pins.filter((p) => bounds.contains([p.lng, p.lat]));
    const c = map.getCenter();
    const priced = pins.filter((p) => p.price !== null);
    const near = priced.filter((p) => Math.abs(p.lng - c.lng) < 0.35 && Math.abs(p.lat - c.lat) < 0.35);
    const sample = (near.length >= 8 ? near : priced).map((p) => p.price!).sort((a, z) => a - z);
    const flat = sample.length < 2 || sample[sample.length - 1] - sample[0] < 0.03;
    const rank = (price: number): number => {
      let below = 0;
      while (below < sample.length && sample[below] < price) below++;
      let upTo = below;
      while (upTo < sample.length && sample[upTo] === price) upTo++;
      return Math.min(1, (below + (upTo - below - 1) / 2) / (sample.length - 1));
    };
    for (const p of pins) {
      if (p.price !== null) p.t = flat ? 0 : rank(p.price);
    }
    setPins(map, pins);

    const best = inView.reduce<Pin | null>(
      (a, p) => (p.price !== null && (!a || p.price < a.price!) ? p : a),
      null,
    );
    cheapest = best ? (byId.get(best.id) ?? null) : null;

    if (!announce) return;
    if (inView.length === 0) {
      toast(
        activeCount(state) > 0
          ? 'Nessun distributore in questa zona con questi filtri'
          : 'Nessun distributore qui: allontana la mappa o spostati',
      );
    } else if (state.fuel && best && cheapest) {
      const unit = FUELS.find((f) => f.id === state.fuel)!.unit;
      toast(
        `${inView.length} distributori · migliore ${best.price!.toFixed(3)} ${unit} (${cheapest.b}, ${cheapest.c}) · prezzi del ${formatDate(meta.updated)}`,
      );
    } else {
      toast(`${inView.length} distributori in zona · scegli un carburante in Filtri per i prezzi`);
    }
  };

  if (import.meta.env.DEV) (window as unknown as { __map: unknown }).__map = map; // per debug

  // "Cerca qui": sempre visibile, a qualsiasi zoom. Carica la zona che stai guardando.
  const searchBtn = document.getElementById('search') as HTMLButtonElement;
  const viewBox = (): Box => {
    const b = map.getBounds();
    return { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() };
  };
  const search = async (box: Box = viewBox(), announce = true) => {
    if (!meta) return;
    searchBtn.disabled = true;
    searchBtn.textContent = 'Cerco…';
    const ok = await ensureTiles(box);
    searchBtn.disabled = false;
    searchBtn.textContent = 'Cerca qui';
    if (ok) render(announce);
    else toast('Impossibile caricare i dati: controlla la connessione e riprova', 8000);
  };

  // Avviso (una volta sola) quando la mappa è troppo lontana per mostrare i distributori.
  let wasFar = map.getZoom() < MIN_ZOOM;
  const onMove = () => {
    const far = map.getZoom() < MIN_ZOOM;
    if (far && !wasFar) toast('Avvicina la mappa per vedere i distributori', 3500);
    wasFar = far;
    render();
    best?.refresh();
  };

  // La barra in alto può cambiare altezza: avvisi e pannello la seguono.
  const bar = document.getElementById('bar')!;
  const syncBarHeight = () =>
    document.documentElement.style.setProperty('--bar-h', `${bar.offsetHeight}px`);
  new ResizeObserver(syncBarHeight).observe(bar);
  syncBarHeight();

  // I 3 distributori col prezzo più basso tra quelli visibili sulla mappa.
  const getBest = (fuel: Fuel): BestItem[] | null => {
    if (map.getZoom() < MIN_ZOOM) return null;
    const b = map.getBounds();
    const items: BestItem[] = [];
    for (const s of allStations()) {
      if (state.brands.length > 0 && !state.brands.includes(s.b)) continue;
      if (!b.contains([s.lo, s.la])) continue;
      const price = priceOf(s, fuel);
      if (price !== null) items.push({ station: s, price });
    }
    return items.sort((a, z) => a.price - z.price).slice(0, 3);
  };

  let best: ReturnType<typeof mountBest> | undefined;
  let filters: ReturnType<typeof mountFilters> | undefined;
  const openBestBtn = document.getElementById('open-best') as HTMLButtonElement;
  const mountPanelsOnce = () => {
    if (!meta || filters) return;
    // L'avviso con il riepilogo compare alla chiusura del pannello dei filtri, non mentre è aperto.
    filters = mountFilters(state, meta.brands, {
      onChange: () => {
        render();
        best?.refresh();
      },
      onClose: () => render(true),
      onOpen: () => best?.close(),
    });
    best = mountBest({
      getBest,
      defaultFuel: () => state.fuel ?? 'benzina',
      onOpen: () => filters?.close(),
      onPick: (s) => {
        map.flyTo({ center: [s.lo, s.la], zoom: Math.max(map.getZoom(), 15) });
        showStation(s);
      },
    });
    openBestBtn.hidden = false;
  };
  mountPanelsOnce();
  searchBtn.hidden = !meta;

  // Pulsante ↻: scarica i prezzi nuovi dal MIMIT (via proxy), li salva sul telefono
  // e ricarica la zona visibile.
  const refreshPrices = async () => {
    refresh?.setBusy(true);
    toast('Aggiorno i prezzi… (circa 8 MB)', 30000);
    let note: string;
    let ms = 7000;
    try {
      const built = await downloadPrices();
      if (meta && built.meta.updated < meta.updated) {
        throw new Error(`il MIMIT ha dati più vecchi (${formatDate(built.meta.updated)})`);
      }
      const saved = await applySnapshot(built.meta, built.tiles);
      meta = built.meta;
      mountPanelsOnce();
      searchBtn.hidden = false;
      await search(viewBox(), false);
      note = `✓ Prezzi aggiornati al ${formatDate(meta.updated)}${saved ? '' : ' (non salvati sul telefono)'}`;
    } catch (e) {
      note = `⚠ Aggiornamento non riuscito: ${e instanceof Error ? e.message : e}`;
      ms = 10000;
      render();
    } finally {
      refresh?.setBusy(false);
    }
    toast(note, ms);
  };

  // Toccando l'avviso si va al distributore più economico (se c'è); poi sparisce.
  toastEl.addEventListener('click', () => {
    if (cheapest) {
      map.flyTo({ center: [cheapest.lo, cheapest.la], zoom: Math.max(map.getZoom(), 14) });
    }
    toastEl.hidden = true;
  });

  // La posizione arriva di continuo (il pallino blu si muove mentre guidi). Si cerca subito alla
  // prima posizione e poi solo quando si entra in una zona non ancora caricata.
  let firstFix = true;
  let lastSaved = 0;
  geolocate.on('geolocate', (e: { coords: GeolocationCoordinates }) => {
    const { longitude: x, latitude: y } = e.coords;
    const box: Box = { west: x - 0.2, east: x + 0.2, south: y - 0.2, north: y + 0.2 };
    if (firstFix || !hasTiles(box)) void search(box, firstFix);
    firstFix = false;
    const now = Date.now();
    if (now - lastSaved > 15000) {
      lastSaved = now;
      try {
        localStorage.setItem(LAST_POS, JSON.stringify({ lng: x, lat: y }));
      } catch {
        /* ignora */
      }
    }
  });
  geolocate.on('error', () => toast('Posizione non disponibile: muovi la mappa a mano', 6000));

  searchBtn.addEventListener('click', async () => {
    if (map.getZoom() < MIN_ZOOM) {
      // Mappa troppo lontana per mostrare i distributori: avvicina sul centro, poi cerca.
      searchBtn.disabled = true;
      searchBtn.textContent = 'Cerco…';
      const moved = new Promise<void>((resolve) => map.once('moveend', () => resolve()));
      map.easeTo({ zoom: 12, duration: 600 });
      await moved;
    }
    await search();
  });

  await ready;
  map.on('moveend', onMove);
  // Prima si caricano i distributori della zona dove si trova la mappa, poi parte la posizione:
  // un errore del GPS non deve mai bloccare la ricerca.
  if (map.getZoom() >= MIN_ZOOM) {
    await search();
  } else {
    render();
    toast('Attiva la posizione o avvicina la mappa e premi "Cerca qui"', 6000);
  }
  try {
    geolocate.trigger();
  } catch (e) {
    console.warn('Posizione non avviata', e);
  }
}

void start();

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true }));
}
