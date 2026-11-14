/**
 * Copia il worker di MapLibre in public/maplibre/ così Vite lo serve in dev e
 * lo include nella build (e nella cache offline della PWA).
 * Viene eseguito in automatico prima di `npm run dev` e `npm run build`.
 */
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public', 'maplibre');
mkdirSync(out, { recursive: true });
copyFileSync(
  join(root, 'node_modules', 'maplibre-gl', 'dist', 'maplibre-gl-worker.mjs'),
  join(out, 'maplibre-gl-worker.mjs'),
);
