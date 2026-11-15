/**
 * Lettura e unione degli open data MIMIT (Osservaprezzi carburanti).
 * Codice senza dipendenze da Node o dal browser: lo usano sia lo script
 * `npm run data` sia l'app (pulsante "Aggiorna prezzi").
 */
import type { Fuel, Meta, Prices, Station } from './types';

/** Lato delle tessere geografiche, in gradi (~22 km in latitudine). */
export const TILE_SIZE = 0.2;

/** Marchi sempre presenti tra i pulsanti dei filtri, nell'ordine in cui compaiono. */
export const MAIN_BRANDS = ['Eni', 'Q8', 'IP', 'Esso', 'Tamoil', 'Shell', 'Pompe bianche'];
/** Quanti pulsanti marchio mostrare in tutto nei filtri (gli altri si cercano per nome). */
const BRAND_CHIPS = 16;

const FUEL_NAMES: Record<string, Fuel> = {
  Benzina: 'benzina',
  Gasolio: 'gasolio',
  GPL: 'gpl',
  Metano: 'metano',
};

/** Nome leggibile: "KEROPETROL" -> "Keropetrol", le sigle corte (GNP, EOS) restano in maiuscolo. */
function prettyBrand(raw: string): string {
  const t = raw.replace(/\s+/g, ' ').trim();
  if (t === '') return 'Altri';
  const allCaps = /^[A-Z0-9 .&'’-]+$/.test(t) && /[A-Z]/.test(t);
  if (allCaps && t.length > 4) {
    return t.toLowerCase().replace(/(^|[\s.'’-])([a-zà-ù])/g, (_m, sep, ch) => sep + ch.toUpperCase());
  }
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Marchio dalla colonna "Bandiera": quelli principali accorpati, gli altri col loro nome. */
export function brandOf(raw: string): string {
  const s = raw.toLowerCase();
  if (/agip|\beni\b/.test(s)) return 'Eni';
  if (/\bq8\b|kuwait/.test(s)) return 'Q8';
  if (/\bip\b|\bapi\b|italiana petroli/.test(s)) return 'IP';
  if (/^esso\b/.test(s)) return 'Esso';
  if (/tamoil/.test(s)) return 'Tamoil';
  if (/^shell\b/.test(s)) return 'Shell';
  if (/pompe\s*bianche|pompebianche/.test(s)) return 'Pompe bianche';
  return prettyBrand(raw);
}

export interface Csv {
  /** data dell'estrazione (YYYY-MM-DD) */
  date: string;
  rows: string[][];
}

/** UTF-8, con ripiego su windows-1252 se il file non è UTF-8 valido. */
export function decodeCsv(buf: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('windows-1252').decode(buf);
  }
}

/** Formato MIMIT: riga "Estrazione del ...", intestazione, poi righe con "|". */
export function parseCsv(text: string, name: string): Csv {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  const m = /(\d{4}-\d{2}-\d{2})/.exec(lines[0] ?? '');
  if (!m || !lines[1]?.startsWith('idImpianto')) {
    throw new Error(`${name}: formato inatteso (${(lines[0] ?? '').slice(0, 60)})`);
  }
  return { date: m[1], rows: lines.slice(2).map((l) => l.split('|')) };
}

/** "11/11/2026 14:00:12" -> 20261111140012 (confrontabile come numero) */
function stamp(s: string): number {
  const m = /(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})/.exec(s);
  return m ? Number(m[3] + m[2] + m[1] + m[4] + m[5] + m[6]) : 0;
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

export interface Built {
  meta: Meta;
  tiles: Map<string, Station[]>;
  stats: {
    stations: number;
    badCoords: number;
    noPrices: number;
    badPrices: number;
    perBrand: Record<string, number>;
  };
}

/** Unisce anagrafica e prezzi e divide gli impianti in tessere geografiche. */
export function buildTiles(anag: Csv, prezzi: Csv): Built {
  // idImpianto -> carburante -> [self, servito] (si tiene il prezzo più recente)
  const prices = new Map<number, Prices>();
  const seen = new Map<string, number>();
  let badPrices = 0;
  for (const r of prezzi.rows) {
    if (r.length < 5) continue;
    const fuel = FUEL_NAMES[r[1]];
    if (!fuel) continue;
    const id = Number(r[0]);
    const price = Number(r[2]);
    if (!Number.isFinite(price) || price < 0.5 || price > 5) {
      badPrices++;
      continue;
    }
    const slot = r[3] === '1' ? 0 : 1;
    const when = stamp(r[4]);
    const k = `${id}|${fuel}|${slot}`;
    if ((seen.get(k) ?? -1) >= when) continue;
    seen.set(k, when);
    const p = prices.get(id) ?? {};
    const pair = p[fuel] ?? [null, null];
    pair[slot] = price;
    p[fuel] = pair;
    prices.set(id, p);
  }

  // Varianti dello stesso marchio (maiuscole, punteggiatura) vanno sotto un solo nome.
  const brandByKey = new Map<string, string>();
  const canonicalBrand = (raw: string): string => {
    const brand = brandOf(raw);
    const key = brand.toLowerCase().replace(/[^a-z0-9]/g, '');
    const known = brandByKey.get(key);
    if (known) return known;
    brandByKey.set(key, brand);
    return brand;
  };

  const tiles = new Map<string, Station[]>();
  const perBrand: Record<string, number> = {};
  let stations = 0;
  let badCoords = 0;
  let noPrices = 0;
  for (const r of anag.rows) {
    if (r.length < 10) continue;
    const id = Number(r[0]);
    const la = Number(r[8]);
    const lo = Number(r[9]);
    if (!(la > 35 && la < 48 && lo > 6 && lo < 19)) {
      badCoords++;
      continue;
    }
    const p = prices.get(id);
    if (!p) {
      noPrices++;
      continue;
    }
    const station: Station = {
      id,
      b: canonicalBrand(r[2]),
      n: clean(r[4]),
      a: clean(r[5]),
      c: clean(r[6]),
      pr: clean(r[7]),
      la: Math.round(la * 1e6) / 1e6,
      lo: Math.round(lo * 1e6) / 1e6,
      p,
    };
    const key = `${Math.floor(lo / TILE_SIZE)}_${Math.floor(la / TILE_SIZE)}`;
    const list = tiles.get(key);
    if (list) list.push(station);
    else tiles.set(key, [station]);
    perBrand[station.b] = (perBrand[station.b] ?? 0) + 1;
    stations++;
  }

  // Pulsanti dei filtri: i marchi principali più i più diffusi tra gli altri.
  const others = Object.entries(perBrand)
    .filter(([name]) => !MAIN_BRANDS.includes(name) && name !== 'Altri')
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name);
  const chips = [...MAIN_BRANDS, ...others].slice(0, BRAND_CHIPS);
  const allBrands = Object.keys(perBrand).sort((a, b) => a.localeCompare(b, 'it'));

  return {
    meta: { updated: prezzi.date, tileSize: TILE_SIZE, brands: chips, allBrands },
    tiles,
    stats: { stations, badCoords, noPrices, badPrices, perBrand },
  };
}
