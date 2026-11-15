import { FUELS, type Fuel, type Station } from './types';

export interface FilterState {
  /** null = nessun carburante scelto: si vedono tutti i distributori */
  fuel: Fuel | null;
  /** marchi selezionati; vuoto = tutti */
  brands: string[];
}

/** Stato di partenza: nessun filtro. */
export const emptyState = (): FilterState => ({ fuel: null, brands: [] });

export function activeCount(state: FilterState): number {
  return (state.fuel ? 1 : 0) + state.brands.length;
}

/** Prezzo più basso del carburante (self o servito, quello che costa meno). */
export function priceOf(s: Station, fuel: Fuel): number | null {
  const pair = s.p[fuel];
  if (!pair) return null;
  const values = pair.filter((v): v is number => v !== null);
  return values.length > 0 ? Math.min(...values) : null;
}

export function matches(s: Station, state: FilterState): boolean {
  if (state.brands.length > 0 && !state.brands.includes(s.b)) return false;
  return state.fuel ? priceOf(s, state.fuel) !== null : true;
}

export function button(label: string, active: boolean, onClick: () => void): HTMLButtonElement {
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
  allBrands: string[],
  handlers: {
    onChange: (s: FilterState) => void;
    /** chiamata quando l'utente chiude il pannello */
    onClose: () => void;
    /** chiamata quando l'utente apre il pannello */
    onOpen: () => void;
  },
): { close: () => void } {
  const panel = document.getElementById('filters-panel')!;
  const openBtn = document.getElementById('open-filters') as HTMLButtonElement;
  const closeBtn = document.getElementById('close-filters')!;
  const resetBtn = document.getElementById('reset-filters') as HTMLButtonElement;
  const badge = document.getElementById('filter-count')!;
  const fuels = document.getElementById('fuels')!;
  const chips = document.getElementById('brands')!;
  const search = document.getElementById('brand-search') as HTMLInputElement;
  const brandList = document.getElementById('brand-list')!;
  brandList.replaceChildren(
    ...allBrands.map((b) => {
      const o = document.createElement('option');
      o.value = b;
      return o;
    }),
  );

  /** Apre o chiude il pannello senza chiamare i gestori (uso interno e dall'esterno). */
  const show = (open: boolean) => {
    panel.hidden = !open;
    openBtn.setAttribute('aria-expanded', String(open));
  };

  const userToggle = (open: boolean) => {
    const wasOpen = !panel.hidden;
    if (open === wasOpen) return;
    if (open) handlers.onOpen();
    show(open);
    if (!open) handlers.onClose();
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
    // i pulsanti dei marchi più diffusi, più quelli scelti con la ricerca (per poterli togliere)
    const shown = [...brands, ...state.brands.filter((b) => !brands.includes(b))];
    chips.replaceChildren(
      ...shown.map((b) =>
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
    handlers.onChange(state);
  };

  // Ricerca di un marchio meno diffuso: si scrive il nome (o parte) e si sceglie dall'elenco.
  search.addEventListener('change', () => {
    const q = search.value.trim().toLowerCase();
    search.value = '';
    if (q === '') return;
    const matches = allBrands.filter((b) => b.toLowerCase() === q);
    const found = matches.length > 0 ? matches : allBrands.filter((b) => b.toLowerCase().startsWith(q));
    if (found.length === 1 && !state.brands.includes(found[0])) {
      state.brands = [...state.brands, found[0]];
      change();
    }
  });

  openBtn.addEventListener('click', () => userToggle(Boolean(panel.hidden)));
  closeBtn.addEventListener('click', () => userToggle(false));
  resetBtn.addEventListener('click', () => {
    state.fuel = null;
    state.brands = [];
    change();
  });

  draw();
  return { close: () => show(false) };
}
