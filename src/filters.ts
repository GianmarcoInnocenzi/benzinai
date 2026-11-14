import { FUELS, MODES, type Fuel, type Mode, type Station } from './types';

export interface FilterState {
  /** null = nessun carburante scelto: si vedono tutti i distributori, senza prezzo sul pin */
  fuel: Fuel | null;
  /** null = self o servito, vale il prezzo più basso */
  mode: Mode | null;
  /** marchi selezionati; vuoto = tutti */
  brands: string[];
}

/** Stato di partenza: nessun filtro. */
export const emptyState = (): FilterState => ({ fuel: null, mode: null, brands: [] });

export function activeCount(state: FilterState): number {
  return (state.fuel ? 1 : 0) + (state.mode ? 1 : 0) + state.brands.length;
}

export function priceOf(s: Station, fuel: Fuel | null, mode: Mode | null): number | null {
  if (!fuel) return null;
  const pair = s.p[fuel];
  if (!pair) return null;
  if (mode === 'self') return pair[0];
  if (mode === 'servito') return pair[1];
  const values = pair.filter((v): v is number => v !== null);
  return values.length > 0 ? Math.min(...values) : null;
}

export function matches(s: Station, state: FilterState): boolean {
  if (state.brands.length > 0 && !state.brands.includes(s.b)) return false;
  if (state.fuel) return priceOf(s, state.fuel, state.mode) !== null;
  if (state.mode) {
    // nessun carburante scelto ma self/servito sì: basta che offra quel servizio per qualche carburante
    const slot = state.mode === 'self' ? 0 : 1;
    return Object.values(s.p).some((pair) => pair[slot] !== null);
  }
  return true;
}

function button(label: string, active: boolean, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  b.setAttribute('aria-pressed', String(active));
  b.addEventListener('click', onClick);
  return b;
}

/** Disegna il pannello dei filtri e chiama onChange a ogni modifica. */
export function mountFilters(
  state: FilterState,
  brands: string[],
  onChange: (s: FilterState) => void,
  /** chiamata quando il pannello viene chiuso */
  onClose: () => void,
): void {
  const panel = document.getElementById('filters-panel')!;
  const openBtn = document.getElementById('open-filters') as HTMLButtonElement;
  const closeBtn = document.getElementById('close-filters')!;
  const resetBtn = document.getElementById('reset-filters') as HTMLButtonElement;
  const badge = document.getElementById('filter-count')!;
  const fuels = document.getElementById('fuels')!;
  const modes = document.getElementById('modes')!;
  const chips = document.getElementById('brands')!;

  const setOpen = (open: boolean) => {
    const wasOpen = !panel.hidden;
    panel.hidden = !open;
    openBtn.setAttribute('aria-expanded', String(open));
    if (wasOpen && !open) onClose();
  };

  const draw = () => {
    // toccando di nuovo la voce già scelta, la si toglie
    fuels.replaceChildren(
      ...FUELS.map((f) =>
        button(f.label, state.fuel === f.id, () => {
          state.fuel = state.fuel === f.id ? null : f.id;
          change();
        }),
      ),
    );
    modes.replaceChildren(
      ...MODES.map((m) =>
        button(m.label, state.mode === m.id, () => {
          state.mode = state.mode === m.id ? null : m.id;
          change();
        }),
      ),
    );
    chips.replaceChildren(
      ...brands.map((b) =>
        button(b, state.brands.includes(b), () => {
          state.brands = state.brands.includes(b)
            ? state.brands.filter((x) => x !== b)
            : [...state.brands, b];
          change();
        }),
      ),
    );
    const n = activeCount(state);
    badge.textContent = String(n);
    badge.hidden = n === 0;
    resetBtn.disabled = n === 0;
  };

  const change = () => {
    draw();
    onChange(state);
  };

  openBtn.addEventListener('click', () => setOpen(Boolean(panel.hidden)));
  closeBtn.addEventListener('click', () => setOpen(false));
  resetBtn.addEventListener('click', () => {
    state.fuel = null;
    state.mode = null;
    state.brands = [];
    change();
  });

  draw();
}
