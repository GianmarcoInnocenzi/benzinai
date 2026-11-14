/**
 * Scarica gli open data MIMIT (Osservaprezzi carburanti), li unisce e scrive
 * in public/data/ un meta.json e tante piccole "tessere" geografiche
 * (tiles/<ix>_<iy>.json), così il telefono scarica solo la zona che guarda.
 *
 * Uso: npm run data
 */
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Fuel, Meta, Prices, Station } from '../src/types';

const BASE = 'https://www.mimit.gov.it/images/exportCSV';
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data');
const TILE_SIZE = 0.2; // gradi (~22 km in latitudine)

const FUEL_NAMES: Record<string, Fuel> = {
  Benzina: 'benzina',
  Gasolio: 'gasolio',
  GPL: 'gpl',
  Metano: 'metano',
};

const BRANDS = ['Eni', 'Q8', 'IP', 'Esso', 'Tamoil', 'Shell', 'Pompe bianche', 'Altri'];

function brandOf(raw: string): string {
  const s = raw.toLowerCase();
  if (/agip|\beni\b/.test(s)) return 'Eni';
  if (/q8|kuwait/.test(s)) return 'Q8';
  if (/\bip\b|\bapi\b|italiana petroli/.test(s)) return 'IP';
  if (/esso/.test(s)) return 'Esso';
  if (/tamoil/.test(s)) return 'Tamoil';
  if (/shell/.test(s)) return 'Shell';
  if (/pompe\s*bianche|pompebianche/.test(s)) return 'Pompe bianche';
  return 'Altri';
}

interface Csv {
  date: string;
  rows: string[][];
}

async function download(name: string): Promise<Csv> {
  const res = await fetch(`${BASE}/${name}`, {
    headers: { 'user-agent': 'Mozilla/5.0' },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    text = new TextDecoder('windows-1252').decode(buf);
  }
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  const m = /(\d{4}-\d{2}-\d{2})/.exec(lines[0] ?? '');
  if (!m || !lines[1]?.startsWith('idImpianto')) {
    throw new Error(`${name}: formato inatteso (${lines[0]?.slice(0, 80)})`);
  }
  // lines[0] = "Estrazione del ...", lines[1] = intestazione
  return { date: m[1], rows: lines.slice(2).map((l) => l.split('|')) };
}

/** "11/11/2026 14:00:12" -> 20261111140012 (confrontabile) */
function stamp(s: string): number {
  const m = /(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})/.exec(s);
  return m ? Number(m[3] + m[2] + m[1] + m[4] + m[5] + m[6]) : 0;
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

async function main() {
  console.log('Scarico anagrafica e prezzi...');
  const [anag, prezzi] = await Promise.all([
    download('anagrafica_impianti_attivi.csv'),
    download('prezzo_alle_8.csv'),
  ]);

  // idImpianto -> carburante -> [self, servito] (con data per tenere il più recente)
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

  const tiles = new Map<string, Station[]>();
  let kept = 0;
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
      b: brandOf(r[2]),
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
    kept++;
  }

  await rm(OUT, { recursive: true, force: true });
  await mkdir(join(OUT, 'tiles'), { recursive: true });
  await Promise.all(
    [...tiles].map(([key, list]) =>
      writeFile(join(OUT, 'tiles', `${key}.json`), JSON.stringify(list)),
    ),
  );
  const meta: Meta = { updated: prezzi.date, tileSize: TILE_SIZE, brands: BRANDS };
  await writeFile(join(OUT, 'meta.json'), JSON.stringify(meta));

  const perBrand: Record<string, number> = {};
  for (const list of tiles.values()) for (const s of list) perBrand[s.b] = (perBrand[s.b] ?? 0) + 1;
  console.log(`Estrazione del ${prezzi.date}`);
  console.log(`Impianti: ${kept} in ${tiles.size} tessere`);
  console.log(
    `Scartati: ${badCoords} con coordinate errate, ${noPrices} senza prezzi, ${badPrices} prezzi anomali`,
  );
  console.log('Per marchio:', perBrand);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
