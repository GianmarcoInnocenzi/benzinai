import { PROXY_URL } from './config';
import { buildTiles, decodeCsv, parseCsv, type Built } from './mimit';

async function get(path: string) {
  const res = await fetch(`${PROXY_URL}/${path}`);
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 120);
    throw new Error(`${path}: ${res.status} ${detail}`.trim());
  }
  return parseCsv(decodeCsv(await res.arrayBuffer()), path);
}

/** Scarica prezzi e anagrafica dal MIMIT (tramite il proxy) e ricostruisce le tessere. */
export async function downloadPrices(): Promise<Built> {
  if (!PROXY_URL) throw new Error('servizio di aggiornamento non configurato');
  const [anagrafica, prezzi] = await Promise.all([get('anagrafica'), get('prezzi')]);
  const built = buildTiles(anagrafica, prezzi);
  // Un'estrazione normale ha ~20.000 impianti: meno vuol dire file troncati o cambiati.
  if (built.stats.stations < 5000) {
    throw new Error(`dati incompleti (${built.stats.stations} impianti)`);
  }
  return built;
}
