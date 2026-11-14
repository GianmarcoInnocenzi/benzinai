/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  /** indirizzo del proxy Cloudflare (vedi src/config.ts) */
  readonly VITE_PROXY_URL?: string;
}
