/**
 * Indirizzo del proxy Cloudflare che inoltra i file del MIMIT (vedi worker/).
 * Si imposta in .env.development (prove in locale) e .env.production (app pubblicata).
 * Se è vuoto il pulsante ↻ non compare e l'app usa solo i dati pubblicati.
 */
export const PROXY_URL: string = (import.meta.env.VITE_PROXY_URL ?? '').replace(/\/$/, '');
