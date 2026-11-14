import { FUELS, MODES, type Fuel, type Mode, type Station } from './types';

export interface FilterState {
  fuel: Fuel;
  mode: Mode;
  /** marchi selezionati; vuoto = tutti */
  brands: string[];
}

const KEY = 'benzinai.filters';

export function loadState(): FilterState {
  const fallback: FilterState = { fuel: 'benzina', mode: 'self', brands: [] };
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (!s) return fallback;
    return {
      fuel: FUELS.some((f) => f.id === s.fuel) ? s.fuel : fallback.fuel,
      mode: MODES.some((m) => m.id === s.mode) ? s.mode : fallback.mode,
      brands: Array.isArray(s.brands) ? s.brands.filter((b: unknown) => typeof b === 'string') : [],
    };
  } catch {
    return fallback;
  }
}

function save(state: FilterState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage non disponibile: pazienza */
  }
}

export function priceOf(s: Station, fuel: Fuel, mode: Mode): number | null {
  const pair = s.p[fuel];
  if (!pair) return null;
  return mode === 'self' ? pair[0] : pair[1];
}

export function matches(s: Station, state: FilterState): boolean {
  if (state.brands.length > 0 && !state.brands.includes(s.b)) return false;
  return priceOf(s, state.fuel, state.mode) !== null;
}

function button(label: string, active: boolean, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  b.setAttribute('aria-pressed', String(active));
  b.addEventListener('click', onClick);
  return b;
}

/** Disegna i controlli dei filtri e chiama onChange a ogni modifica. */
export function mountFilters(
  state: FilterState,
  brands: string[],
  onChange: (s: FilterState) => void,
): void {
  const fuels = document.getElementById('fuels')!;
  const modes = document.getElementById('modes')!;
  const chips = document.getElementById('brands')!;

  const draw = () => {
    fuels.replaceChildren(
      ...FUELS.map((f) =>
        button(f.label, state.fuel === f.id, () => {
          state.fuel = f.id;
          change();
        }),
      ),
    );
    modes.replaceChildren(
      ...MODES.map((m) =>
        button(m.label, state.mode === m.id, () => {
          state.mode = m.id;
          change();
        }),
      ),
    );
    chips.replaceChildren(
      button('Tutti', state.brands.length === 0, () => {
        state.brands = [];
        change();
      }),
      ...brands.map((b) =>
        button(b, state.brands.includes(b), () => {
          state.brands = state.brands.includes(b)
            ? state.brands.filter((x) => x !== b)
            : [...state.brands, b];
          change();
        }),
      ),
    );
  };

  const change = () => {
    save(state);
    draw();
    onChange(state);
  };

  draw();
}
