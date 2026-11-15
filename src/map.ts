import * as maplibregl from 'maplibre-gl';
import type { FeatureCollection } from 'geojson';
import 'maplibre-gl/dist/maplibre-gl.css';

const STYLE = 'https://tiles.openfreemap.org/styles/liberty';
const SOURCE = 'stazioni';
const SAT_SOURCE = 'satellite';
const SAT_TILES =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

// Il worker è servito da public/maplibre/ (vedi scripts/copy-worker.ts).
maplibregl.setWorkerUrl(new URL('maplibre/maplibre-gl-worker.mjs', document.baseURI).href);

export interface Pin {
  id: number;
  lng: number;
  lat: number;
  /** prezzo usato per colore e precedenza; null = non disponibile */
  price: number | null;
  /** posizione del prezzo nella zona: 0 = tra i più economici, 1 = tra i più cari, -1 = senza prezzo */
  t: number;
  /** prezzo scritto sopra la pallina (solo se è scelto un carburante) */
  label: string;
  /** marchio normalizzato (Eni, Q8, ...): decide l'icona che compare da vicino */
  brand: string;
  /** anteprima dei prezzi (una riga per carburante), mostrata da vicino quando non c'è un carburante scelto */
  preview: string;
}

/** Zoom da cui compare l'anteprima dei prezzi sopra le palline. */
export const PREVIEW_ZOOM = 13;
/** Zoom da cui compare l'icona del marchio sotto le palline: lo stesso da cui compaiono i distributori. */
export const BRAND_ZOOM = 10;
/** Raggio (in pixel) attorno al tocco entro cui si prende il distributore più vicino. */
const TAP_RADIUS = 24;

// Etichette stilizzate nei colori tipici di ogni marchio (non sono i loghi ufficiali).
const BRAND_BADGES: Record<string, { text: string; bg: string; fg: string }> = {
  Eni: { text: 'eni', bg: '#FFD500', fg: '#111111' },
  Q8: { text: 'Q8', bg: '#0B3D91', fg: '#FFC72C' },
  IP: { text: 'IP', bg: '#E30613', fg: '#FFFFFF' },
  Esso: { text: 'Esso', bg: '#0057B8', fg: '#FFFFFF' },
  Tamoil: { text: 'Tamoil', bg: '#003399', fg: '#FFFFFF' },
  Shell: { text: 'Shell', bg: '#FBCE07', fg: '#DD1D21' },
  'Pompe bianche': { text: 'P.B.', bg: '#E5E7EB', fg: '#111827' },
  Altri: { text: '⛽', bg: '#E5E7EB', fg: '#111827' },
};

/** Colori stabili per i marchi meno noti: la stessa parola dà sempre lo stesso colore. */
function colorsFor(name: string): { bg: string; fg: string } {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return { bg: `hsl(${h % 360} 55% 36%)`, fg: '#FFFFFF' };
}

/** Disegna una targhetta arrotondata con il nome del marchio (larga quanto serve). */
function brandBadge(text: string, bg: string, fg: string): ImageData {
  const H = 40;
  const font = (size: number) => `bold ${size}px -apple-system, "Helvetica Neue", Arial, sans-serif`;
  const probe = document.createElement('canvas').getContext('2d')!;
  probe.font = font(22);
  const W = Math.round(Math.min(168, Math.max(64, probe.measureText(text).width + 30)));
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const rounded = (x: number, y: number, w: number, h: number, r: number) => {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  };
  ctx.fillStyle = '#FFFFFF'; // bordo bianco: resta leggibile su mappa e satellite
  rounded(0, 0, W, H, 14);
  ctx.fill();
  ctx.fillStyle = bg;
  rounded(3, 3, W - 6, H - 6, 11);
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = font(22);
  ctx.fillText(text, W / 2, H / 2 + 1);
  return ctx.getImageData(0, 0, W, H);
}

/** Crea (una volta sola) la targhetta del marchio: colori noti per i principali, automatici per gli altri. */
function ensureBrandImage(map: maplibregl.Map, name: string): void {
  const id = `brand-${name}`;
  if (map.hasImage(id)) return;
  const known = BRAND_BADGES[name];
  const short = name.length > 15 ? `${name.slice(0, 14)}…` : name;
  const { text, bg, fg } = known ?? { text: short, ...colorsFor(name) };
  map.addImage(id, brandBadge(text, bg, fg), { pixelRatio: 2 });
}

const empty: FeatureCollection = { type: 'FeatureCollection', features: [] };

const ICON_LAYERS =
  '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2 2 7l10 5 10-5-10-5z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/></svg>';

/** Pulsante quadrato nello stesso gruppo dei controlli della mappa. */
export class IconControl implements maplibregl.IControl {
  private readonly el = document.createElement('div');
  private readonly button = document.createElement('button');

  constructor(icon: { text?: string; html?: string }, title: string, onClick: () => void) {
    this.el.className = 'maplibregl-ctrl maplibregl-ctrl-group icon-ctrl';
    this.button.type = 'button';
    if (icon.html) this.button.innerHTML = icon.html;
    else this.button.textContent = icon.text ?? '';
    this.button.title = title;
    this.button.setAttribute('aria-label', title);
    this.button.addEventListener('click', onClick);
    this.el.append(this.button);
  }

  setBusy(busy: boolean): void {
    this.button.disabled = busy;
    this.button.classList.toggle('busy', busy);
  }

  setActive(active: boolean): void {
    this.button.classList.toggle('active', active);
    this.button.setAttribute('aria-pressed', String(active));
  }

  onAdd(): HTMLElement {
    return this.el;
  }

  onRemove(): void {
    this.el.remove();
  }
}

export interface MapOptions {
  center: [number, number];
  zoom: number;
  satellite: boolean;
  onPinClick: (id: number) => void;
  onSatelliteChange: (on: boolean) => void;
  /** se assente il pulsante ↻ non compare */
  onRefresh?: () => void;
}

export function createMap(opts: MapOptions) {
  const map = new maplibregl.Map({
    container: 'map',
    style: STYLE,
    center: opts.center,
    zoom: opts.zoom,
    attributionControl: { compact: true },
  });

  const geolocate = new maplibregl.GeolocateControl({
    positionOptions: { enableHighAccuracy: true, timeout: 20000, maximumAge: 2000 },
    fitBoundsOptions: { maxZoom: 15 },
    // Segue la posizione in continuo: il pallino blu si muove mentre guidi e la mappa lo segue.
    // Se sposti la mappa a mano smette di seguirti; un tocco sul pulsante ricomincia.
    trackUserLocation: true,
    showAccuracyCircle: false,
  });
  map.addControl(geolocate, 'bottom-right');

  let refresh: IconControl | null = null;
  if (opts.onRefresh) {
    refresh = new IconControl({ text: '↻' }, 'Aggiorna i prezzi', opts.onRefresh);
    map.addControl(refresh, 'bottom-right');
  }

  // Vista satellitare: un livello raster che copre la mappa, sotto i pin.
  let satellite = opts.satellite;
  const satButton = new IconControl({ html: ICON_LAYERS }, 'Vista satellitare', () => {
    satellite = !satellite;
    applySatellite();
    opts.onSatelliteChange(satellite);
  });
  map.addControl(satButton, 'bottom-right');
  satButton.setActive(satellite);

  const applySatellite = () => {
    satButton.setActive(satellite);
    if (map.getLayer('satellite')) {
      map.setLayoutProperty('satellite', 'visibility', satellite ? 'visible' : 'none');
    }
    // i controlli e i testi restano leggibili sia su mappa chiara sia su satellite
    document.body.classList.toggle('satellite', satellite);
  };
  document.body.classList.toggle('satellite', satellite);

  const ready = new Promise<void>((resolve) => {
    map.on('load', () => {
      map.addSource(SAT_SOURCE, {
        type: 'raster',
        tiles: [SAT_TILES],
        tileSize: 256,
        maxzoom: 19,
        attribution: 'Immagini © Esri, Maxar, Earthstar Geographics',
      });
      map.addLayer({
        id: 'satellite',
        type: 'raster',
        source: SAT_SOURCE,
        layout: { visibility: satellite ? 'visible' : 'none' },
      });

      for (const name of Object.keys(BRAND_BADGES)) ensureBrandImage(map, name);

      map.addSource(SOURCE, { type: 'geojson', data: empty });

      map.addLayer({
        id: 'pin',
        type: 'circle',
        source: SOURCE,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 5, 13, 9, 16, 12],
          // verde = tra i più economici della zona, arancione = nella media, rosso = tra i più cari
          'circle-color': [
            'case',
            ['<', ['get', 't'], 0],
            '#6b7280', // prezzo non disponibile
            ['step', ['get', 't'], '#16a34a', 0.34, '#f97316', 0.67, '#dc2626'],
          ],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
        },
      });

      map.addLayer({
        id: 'pin-label',
        type: 'symbol',
        source: SOURCE,
        minzoom: 10.5,
        layout: {
          'text-field': ['get', 'label'],
          'text-font': ['Noto Sans Bold'],
          'text-size': 13,
          'text-offset': [0, -1.5],
          'text-anchor': 'bottom',
          // i più economici hanno la precedenza quando le etichette si sovrappongono
          'symbol-sort-key': ['get', 'price'],
        },
        paint: {
          'text-color': '#111827',
          'text-halo-color': '#ffffff',
          'text-halo-width': 2,
        },
      });

      // Anteprima dei prezzi (benzina/gasolio) quando non è scelto un carburante e si è abbastanza vicini.
      map.addLayer({
        id: 'pin-preview',
        type: 'symbol',
        source: SOURCE,
        minzoom: PREVIEW_ZOOM,
        layout: {
          'text-field': ['get', 'preview'],
          'text-font': ['Noto Sans Bold'],
          'text-size': 11,
          'text-offset': [0, -1.1],
          'text-anchor': 'bottom',
          'text-line-height': 1.15,
          'symbol-sort-key': ['get', 'price'],
        },
        paint: {
          'text-color': '#111827',
          'text-halo-color': '#ffffff',
          'text-halo-width': 2,
        },
      });

      // Da molto vicino: targhetta del marchio sotto la pallina.
      map.addLayer({
        id: 'pin-brand',
        type: 'symbol',
        source: SOURCE,
        minzoom: BRAND_ZOOM,
        layout: {
          'icon-image': [
            'coalesce',
            ['image', ['concat', 'brand-', ['get', 'brand']]],
            ['image', 'brand-Altri'],
          ],
          'icon-anchor': 'top',
          'icon-offset': [0, 15],
          'icon-size': ['interpolate', ['linear'], ['zoom'], 10, 0.42, 12.5, 0.55, 15, 0.8, 17, 1],
          'symbol-sort-key': ['get', 'price'],
        },
      });

      // Il dito è molto più largo di una pallina: si cerca il distributore più vicino al tocco
      // entro TAP_RADIUS pixel (pallina, prezzo o targhetta del marchio), non solo sotto il punto toccato.
      const pinLayers = ['pin', 'pin-label', 'pin-preview', 'pin-brand'];
      const nearestPin = (point: maplibregl.Point): number | null => {
        const r = TAP_RADIUS;
        const found = map.queryRenderedFeatures(
          [
            [point.x - r, point.y - r],
            [point.x + r, point.y + r],
          ],
          { layers: pinLayers },
        );
        let bestId: number | null = null;
        let bestDist = Infinity;
        for (const f of found) {
          const id = f.properties?.id;
          if (typeof id !== 'number' || f.geometry.type !== 'Point') continue;
          const [lng, lat] = f.geometry.coordinates as [number, number];
          const p = map.project([lng, lat]);
          const d = Math.hypot(p.x - point.x, p.y - point.y);
          if (d < bestDist) {
            bestDist = d;
            bestId = id;
          }
        }
        return bestId;
      };
      map.on('click', (e: maplibregl.MapMouseEvent) => {
        const id = nearestPin(e.point);
        if (id !== null) opts.onPinClick(id);
      });
      map.on('mousemove', (e: maplibregl.MapMouseEvent) => {
        map.getCanvas().style.cursor = nearestPin(e.point) !== null ? 'pointer' : '';
      });
      resolve();
    });
  });

  return { map, geolocate, refresh, ready };
}

export function setPins(map: maplibregl.Map, pins: Pin[]): void {
  // una targhetta per ogni marchio presente (i meno diffusi hanno colori automatici)
  for (const brand of new Set(pins.map((p) => p.brand))) ensureBrandImage(map, brand);
  const src = map.getSource(SOURCE) as maplibregl.GeoJSONSource | undefined;
  src?.setData({
    type: 'FeatureCollection',
    features: pins.map((p) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
      properties: {
        id: p.id,
        price: p.price ?? 0,
        t: p.t,
        label: p.label,
        preview: p.preview,
        brand: p.brand,
      },
    })),
  });
}

export { maplibregl };
