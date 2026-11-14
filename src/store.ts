/**
 * Archivio locale (IndexedDB) dei prezzi scaricati dal telefono con il pulsante ↻.
 * Una voce per tessera ("t:<x>_<y>") più la voce "meta", scritta insieme alle altre
 * in un'unica transazione: o c'è tutto o non c'è niente.
 */
import type { Meta, Station } from './types';

const DB_NAME = 'benzinai';
const STORE = 'kv';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function readOne<T>(key: string): Promise<T | undefined> {
  const db = await open();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result as T | undefined);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export async function loadLocalMeta(): Promise<Meta | null> {
  return (await readOne<Meta>('meta')) ?? null;
}

export function loadLocalTile(key: string): Promise<Station[] | undefined> {
  return readOne<Station[]>(`t:${key}`);
}

export async function saveSnapshot(meta: Meta, tiles: Map<string, Station[]>): Promise<void> {
  const db = await open();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      store.clear();
      for (const [key, list] of tiles) store.put(list, `t:${key}`);
      store.put(meta, 'meta');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
