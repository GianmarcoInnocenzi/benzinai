import { button } from './filters';
import { FUELS, type Fuel, type Station } from './types';

export interface BestItem {
  station: Station;
  price: number;
}

/**
 * Pannello "★ Migliori": i 3 distributori col prezzo più basso tra quelli sulla mappa.
 * Il carburante si sceglie nel pannello stesso (parte da quello dei filtri, o Benzina).
 */
export function mountBest(handlers: {
  /** i migliori (già ordinati e limitati a 3) per il carburante, o null se la mappa è troppo lontana */
  getBest: (fuel: Fuel) => BestItem[] | null;
  /** carburante con cui aprire il pannello */
  defaultFuel: () => Fuel;
  onPick: (s: Station) => void;
  onOpen: () => void;
}): { close: () => void; refresh: () => void; isOpen: () => boolean } {
  const panel = document.getElementById('best-panel')!;
  const openBtn = document.getElementById('open-best') as HTMLButtonElement;
  const fuelsEl = document.getElementById('best-fuels')!;
  const list = document.getElementById('best-list')!;
  const empty = document.getElementById('best-empty')!;
  let fuel: Fuel = 'benzina';

  const show = (open: boolean) => {
    panel.hidden = !open;
    openBtn.setAttribute('aria-expanded', String(open));
  };

  const draw = () => {
    fuelsEl.replaceChildren(
      ...FUELS.map((f) =>
        button(f.label, fuel === f.id, () => {
          fuel = f.id;
          draw();
        }),
      ),
    );

    const unit = FUELS.find((f) => f.id === fuel)!.unit;
    const items = handlers.getBest(fuel);
    list.replaceChildren();
    empty.hidden = true;
    if (items === null) {
      empty.textContent = 'Avvicina la mappa per vedere i migliori prezzi.';
      empty.hidden = false;
      return;
    }
    if (items.length === 0) {
      empty.textContent = 'Nessun distributore con questo carburante sulla mappa: allontanala o premi "Cerca qui".';
      empty.hidden = false;
      return;
    }
    items.forEach(({ station: s, price }, i) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'best-item';

      const rank = document.createElement('span');
      rank.className = 'rank';
      rank.textContent = String(i + 1);

      const price_ = document.createElement('span');
      price_.className = 'price';
      price_.textContent = price.toFixed(3);
      const u = document.createElement('small');
      u.textContent = ` ${unit}`;
      price_.append(u);

      const what = document.createElement('span');
      what.className = 'what';
      const name = document.createElement('strong');
      name.textContent = `${s.b} · ${s.c}`;
      const addr = document.createElement('small');
      addr.textContent = s.a;
      what.append(name, addr);

      b.append(rank, price_, what);
      b.addEventListener('click', () => {
        show(false);
        handlers.onPick(s);
      });
      li.append(b);
      list.append(li);
    });
  };

  openBtn.addEventListener('click', () => {
    if (panel.hidden) {
      handlers.onOpen();
      fuel = handlers.defaultFuel();
      draw();
      show(true);
    } else {
      show(false);
    }
  });

  return {
    close: () => show(false),
    refresh: () => {
      if (!panel.hidden) draw();
    },
    isOpen: () => !panel.hidden,
  };
}
