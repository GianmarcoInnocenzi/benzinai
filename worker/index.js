// Proxy per gli open data MIMIT, da pubblicare su Cloudflare Workers (piano gratuito).
//
// Il sito del MIMIT non permette ai browser di leggere i suoi file (manca l'intestazione
// CORS): questo worker li scarica e li rigira all'app aggiungendola. Non elabora nulla,
// quindi consuma pochissima CPU. Serve solo i due file elencati qui sotto.

const UPSTREAM = 'https://www.mimit.gov.it/images/exportCSV';
const FILES = {
  '/prezzi': 'prezzo_alle_8.csv',
  '/anagrafica': 'anagrafica_impianti_attivi.csv',
};

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
};

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }
    if (request.method !== 'GET') {
      return new Response('Metodo non consentito', { status: 405, headers: CORS });
    }

    const name = FILES[new URL(request.url).pathname];
    if (!name) {
      return new Response('Usa /prezzi oppure /anagrafica', { status: 404, headers: CORS });
    }

    let upstream;
    try {
      upstream = await fetch(`${UPSTREAM}/${name}`, {
        headers: { 'user-agent': 'Mozilla/5.0' },
        redirect: 'follow',
        // i file cambiano una volta al giorno: la cache di Cloudflare li tiene per un'ora
        cf: { cacheEverything: true, cacheTtl: 3600 },
      });
    } catch (e) {
      return new Response(`MIMIT non raggiungibile: ${e}`, { status: 502, headers: CORS });
    }
    if (!upstream.ok) {
      return new Response(`MIMIT ha risposto ${upstream.status}`, { status: 502, headers: CORS });
    }

    return new Response(upstream.body, {
      headers: {
        ...CORS,
        'content-type': 'text/csv; charset=utf-8',
        'cache-control': 'public, max-age=1800',
      },
    });
  },
};
