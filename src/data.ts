import { loadLocalMeta, loadLocalTile, saveSnapshot } from './store';
import type { Meta, Station } from './types';

/** Tessere già caricate in memoria. */
const tiles = new Map<string, Station[]>();
const inflight = new Map<string, Promise<void>>();
let tileSize = 0.2;

/**
 * Da dove arrivano le tessere:
 * - dati pubblicati con l'app (cartella data/), di default;
 * - archivio locale del telefono, se i prezzi sono stati aggiornati con ↻ e sono più recenti;
 * - `snapshot` in memoria, subito dopo un aggiornamento (anche se il salvataggio locale fallisce).
 */
let useLocal = false;
let snapshot: Map<string, Station[]> | null = null;

function isJson(r: Response): boolean {
  return r.ok && (r.headers.get('content-type') ?? '').includes('json');
}

export async function loadMeta(): Promise<Meta> {
  let remote: Meta | null = null;
  try {
    const r = await fetch('data/meta.json');
    if (isJson(r)) remote = await r.json();
  } catch {
    /* offline: si prova con i dati locali */
  }
  let local: Meta | null = null;
  try {
    local = await loadLocalMeta();
  } catch {
    /* archivio locale non disponibile */
  }

  if (local && (!remote || local.updated > remote.updated)) {
    useLocal = true;
    tileSize = local.tileSize;
    return local;
  }
  if (!remote) throw new Error('Dati non trovati: esegui "npm run data"');
  tileSize = remote.tileSize;
  return remote;
}

/**
 * Adotta i prezzi appena scaricati dal telefono. Restituisce true se sono stati
 * salvati anche sul telefono (altrimenti valgono solo finché l'app resta aperta).
 */
export async function applySnapshot(meta: Meta, fresh: Map<string, Station[]>): Promise<boolean> {
  snapshot = fresh;
  tileSize = meta.tileSize;
  tiles.clear();
  try {
    await saveSnapshot(meta, fresh);
    useLocal = true;
    return true;
  } catch {
    return false;
  }
}

async function fetchTile(key: string): Promise<void> {
  if (snapshot) {
    tiles.set(key, snapshot.get(key) ?? []);
    return;
  }
  if (useLocal) {
    try {
      tiles.set(key, (await loadLocalTile(key)) ?? []);
    } catch {
      /* ritenterà al prossimo movimento */
    }
    return;
  }
  try {
    const r = await fetch(`data/tiles/${key}.json`);
    // Tessera assente = nessun impianto in quella cella.
    tiles.set(key, isJson(r) ? await r.json() : []);
  } catch {
    // Rete assente: non memorizzo nulla, così ritenterà al prossimo movimento.
  }
}

export interface Box {
  west: number;
  south: number;
  east: number;
  north: number;
}

const MAX_TILES = 120; // protezione se la mappa è molto ampia

/** Chiavi di tutte le tessere che toccano il riquadro (con un margine in gradi). */
function keysFor(box: Box, pad = 0): string[] {
  const x0 = Math.floor((box.west - pad) / tileSize);
  const x1 = Math.floor((box.east + pad) / tileSize);
  const y0 = Math.floor((box.south - pad) / tileSize);
  const y1 = Math.floor((box.north + pad) / tileSize);
  const keys: string[] = [];
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) keys.push(`${x}_${y}`);
  }
  return keys.length > MAX_TILES ? [] : keys;
}

/** true se tutta la zona visibile è già stata caricata. */
export function hasTiles(box: Box): boolean {
  return keysFor(box).every((k) => tiles.has(k));
}

/**
 * Carica le tessere della zona visibile più un margine di una tessera.
 * Restituisce false se qualche tessera non è stata raggiunta (rete assente).
 */
export async function ensureTiles(box: Box): Promise<boolean> {
  const keys = keysFor(box, tileSize);
  const jobs: Promise<void>[] = [];
  for (const key of keys) {
    if (tiles.has(key)) continue;
    let job = inflight.get(key);
    if (!job) {
      job = fetchTile(key).finally(() => inflight.delete(key));
      inflight.set(key, job);
    }
    jobs.push(job);
  }
  await Promise.all(jobs);
  return keys.every((k) => tiles.has(k));
}

export function allStations(): Station[] {
  return [...tiles.values()].flat();
}
