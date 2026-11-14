/**
 * Scarica gli open data MIMIT (Osservaprezzi carburanti), li unisce e scrive
 * in public/data/ un meta.json e tante piccole "tessere" geografiche
 * (tiles/<ix>_<iy>.json), così il telefono scarica solo la zona che guarda.
 * Sono i dati "di partenza" dell'app; il pulsante ↻ li aggiorna dal telefono.
 *
 * Uso: npm run data
 */
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTiles, decodeCsv, parseCsv } from '../src/mimit';

const BASE = 'https://www.mimit.gov.it/images/exportCSV';
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data');

async function download(name: string) {
  const res = await fetch(`${BASE}/${name}`, {
    headers: { 'user-agent': 'Mozilla/5.0' },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  return parseCsv(decodeCsv(await res.arrayBuffer()), name);
}

async function main() {
  console.log('Scarico anagrafica e prezzi...');
  const [anag, prezzi] = await Promise.all([
    download('anagrafica_impianti_attivi.csv'),
    download('prezzo_alle_8.csv'),
  ]);
  const { meta, tiles, stats } = buildTiles(anag, prezzi);

  await rm(OUT, { recursive: true, force: true });
  await mkdir(join(OUT, 'tiles'), { recursive: true });
  await Promise.all(
    [...tiles].map(([key, list]) =>
      writeFile(join(OUT, 'tiles', `${key}.json`), JSON.stringify(list)),
    ),
  );
  await writeFile(join(OUT, 'meta.json'), JSON.stringify(meta));

  console.log(`Estrazione del ${meta.updated}`);
  console.log(`Impianti: ${stats.stations} in ${tiles.size} tessere`);
  console.log(
    `Scartati: ${stats.badCoords} con coordinate errate, ${stats.noPrices} senza prezzi, ${stats.badPrices} prezzi anomali`,
  );
  console.log('Per marchio:', stats.perBrand);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
