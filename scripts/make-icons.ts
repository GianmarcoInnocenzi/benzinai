/**
 * Genera le icone PNG della PWA (una pompa di benzina stilizzata) senza
 * dipendenze esterne. Uso: npm run icons
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');

type Rect = [number, number, number, number]; // x0, y0, x1, y1 in [0,1]
const TEAL: [number, number, number] = [15, 118, 110];
const WHITE: [number, number, number] = [255, 255, 255];

const pump: { rect: Rect; color: [number, number, number] }[] = [
  { rect: [0.3, 0.22, 0.62, 0.76], color: WHITE }, // corpo
  { rect: [0.36, 0.29, 0.56, 0.44], color: TEAL }, // display
  { rect: [0.25, 0.76, 0.67, 0.82], color: WHITE }, // base
  { rect: [0.62, 0.36, 0.72, 0.4], color: WHITE }, // braccio
  { rect: [0.68, 0.36, 0.72, 0.64], color: WHITE }, // tubo
  { rect: [0.66, 0.6, 0.76, 0.67], color: WHITE }, // pistola
];

function colorAt(x: number, y: number): [number, number, number] {
  let c = TEAL;
  for (const { rect: [x0, y0, x1, y1], color } of pump) {
    if (x >= x0 && x < x1 && y >= y0 && y < y1) c = color;
  }
  return c;
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size: number): Buffer {
  const SS = 3; // supersampling per bordi morbidi
  const raw = Buffer.alloc(size * (size * 3 + 1));
  let o = 0;
  for (let y = 0; y < size; y++) {
    raw[o++] = 0; // filtro: nessuno
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const [cr, cg, cb] = colorAt((x + (sx + 0.5) / SS) / size, (y + (sy + 0.5) / SS) / size);
          r += cr;
          g += cg;
          b += cb;
        }
      }
      const n = SS * SS;
      raw[o++] = Math.round(r / n);
      raw[o++] = Math.round(g / n);
      raw[o++] = Math.round(b / n);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(OUT, { recursive: true });
for (const [name, size] of [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-touch-icon.png', 180],
] as const) {
  writeFileSync(join(OUT, name), png(size));
  console.log('scritto', name);
}
