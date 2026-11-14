import * as maplibregl from 'maplibre-gl';
import type { FeatureCollection } from 'geojson';
import 'maplibre-gl/dist/maplibre-gl.css';

const STYLE = 'https://tiles.openfreemap.org/styles/liberty';
const SOURCE = 'stazioni';

// Il worker è servito da public/maplibre/ (vedi scripts/copy-worker.ts).
maplibregl.setWorkerUrl(new URL('maplibre/maplibre-gl-worker.mjs', document.baseURI).href);

export interface Pin {
  id: number;
  lng: number;
  lat: number;
  price: number;
  /** 0 = il più economico visibile, 1 = il più caro */
  t: number;
}

const empty: FeatureCollection = { type: 'FeatureCollection', features: [] };

/** Pulsante ↻ "Aggiorna prezzi", nello stesso gruppo del pulsante della posizione. */
export class RefreshControl implements maplibregl.IControl {
  private readonly el = document.createElement('div');
  private readonly button = document.createElement('button');

  constructor(onClick: () => void) {
    this.el.className = 'maplibregl-ctrl maplibregl-ctrl-group refresh-ctrl';
    this.button.type = 'button';
    this.button.textContent = '↻';
    this.button.title = 'Aggiorna i prezzi';
    this.button.setAttribute('aria-label', 'Aggiorna i prezzi');
    this.button.addEventListener('click', onClick);
    this.el.append(this.button);
  }

  setBusy(busy: boolean): void {
    this.button.disabled = busy;
    this.button.classList.toggle('busy', busy);
  }

  onAdd(): HTMLElement {
    return this.el;
  }

  onRemove(): void {
    this.el.remove();
  }
}

export function createMap(
  center: [number, number],
  zoom: number,
  onPinClick: (id: number) => void,
  onRefresh?: () => void,
) {
  const map = new maplibregl.Map({
    container: 'map',
    style: STYLE,
    center,
    zoom,
    attributionControl: { compact: true },
  });

  const geolocate = new maplibregl.GeolocateControl({
    positionOptions: { enableHighAccuracy: true, timeout: 15000 },
    fitBoundsOptions: { maxZoom: 13 },
    trackUserLocation: false,
    showAccuracyCircle: false,
  });
  map.addControl(geolocate, 'bottom-right');

  let refresh: RefreshControl | null = null;
  if (onRefresh) {
    refresh = new RefreshControl(onRefresh);
    map.addControl(refresh, 'bottom-right');
  }

  const ready = new Promise<void>((resolve) => {
    map.on('load', () => {
      map.addSource(SOURCE, { type: 'geojson', data: empty });

      map.addLayer({
        id: 'pin',
        type: 'circle',
        source: SOURCE,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 4, 13, 8, 16, 11],
          'circle-color': [
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
        if (typeof id === 'number') onPinClick(id);
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
      properties: { id: p.id, price: p.price, t: p.t, label: p.price.toFixed(3) },
    })),
  });
}

export { maplibregl };
