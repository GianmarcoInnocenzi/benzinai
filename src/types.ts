export type Fuel = 'benzina' | 'gasolio' | 'gpl' | 'metano';
export type Mode = 'self' | 'servito';

export const FUELS: { id: Fuel; label: string; unit: string }[] = [
  { id: 'benzina', label: 'Benzina', unit: '€/l' },
  { id: 'gasolio', label: 'Gasolio', unit: '€/l' },
  { id: 'gpl', label: 'GPL', unit: '€/l' },
  { id: 'metano', label: 'Metano', unit: '€/kg' },
];

export const MODES: { id: Mode; label: string }[] = [
  { id: 'self', label: 'Self' },
  { id: 'servito', label: 'Servito' },
];

/** Prezzi per carburante: [self, servito]; null se non disponibile. */
export type Prices = Partial<Record<Fuel, [number | null, number | null]>>;

export interface Station {
  id: number;
  /** marchio normalizzato (Eni, Q8, IP, ... Altri) */
  b: string;
  /** nome impianto */
  n: string;
  /** indirizzo */
  a: string;
  /** comune */
  c: string;
  /** provincia */
  pr: string;
  la: number;
  lo: number;
  p: Prices;
}

export interface Meta {
  /** data dell'estrazione MIMIT (YYYY-MM-DD) */
  updated: string;
  /** lato delle tessere in gradi */
  tileSize: number;
  /** marchi disponibili, in ordine di visualizzazione */
  brands: string[];
}
