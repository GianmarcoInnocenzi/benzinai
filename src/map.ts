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
  /** null = nessun carburante scelto: il pin non mostra il prezzo */
  price: number | null;
  /** 0 = il più economico visibile, 1 = il più caro, -1 = senza prezzo */
  t: number;
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
    positionOptions: { enableHighAccuracy: true, timeout: 15000 },
    fitBoundsOptions: { maxZoom: 13 },
    trackUserLocation: false,
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

      map.addSource(SOURCE, { type: 'geojson', data: empty });

      map.addLayer({
        id: 'pin',
        type: 'circle',
        source: SOURCE,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 4, 13, 8, 16, 11],
          'circle-color': [
            'case',
            ['<', ['get', 't'], 0],
            '#0f766e', // senza prezzo: colore dell'app
            [
              'interpolate',
              ['linear'],
              ['get', 't'],
              0,
              '#16a34a',
              0.5,
              '#eab308',
              1,
              '#dc2626',
            ],
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

      map.on('click', 'pin', (e: maplibregl.MapLayerMouseEvent) => {
        const id = e.features?.[0]?.properties?.id;
        if (typeof id === 'number') opts.onPinClick(id);
      });
      map.on('mouseenter', 'pin', () => (map.getCanvas().style.cursor = 'pointer'));
      map.on('mouseleave', 'pin', () => (map.getCanvas().style.cursor = ''));
      resolve();
    });
  });

  return { map, geolocate, refresh, ready };
}

export function setPins(map: maplibregl.Map, pins: Pin[]): void {
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
        label: p.price === null ? '' : p.price.toFixed(3),
      },
    })),
  });
}

export { maplibregl };
