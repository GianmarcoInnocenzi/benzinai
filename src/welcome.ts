import { FUELS, type Fuel } from './types';

const KEY = 'benzinai.car';

const CAPTIONS: Record<Fuel, string> = {
  benzina: 'Auto a benzina',
  gasolio: 'Auto diesel',
  gpl: 'Auto a GPL',
  metano: 'Auto a metano',
};

function lastChoice(): Fuel | null {
  try {
    const v = localStorage.getItem(KEY);
    return FUELS.some((f) => f.id === v) ? (v as Fuel) : null;
  } catch {
    return null;
  }
}

function rememberChoice(fuel: Fuel): void {
  try {
    localStorage.setItem(KEY, fuel);
  } catch {
    /* storage non disponibile: pazienza */
  }
}

/**
 * Riquadro iniziale "Che macchina hai?": una scelta rapida del carburante per partire già
 * filtrati. Non è obbligatorio: si chiude con la X, con "Salta", toccando fuori o con Esc.
 */
export function showWelcome(onPick: (fuel: Fuel) => void): void {
  const root = document.getElementById('welcome')!;
  const grid = document.getElementById('welcome-fuels')!;
  const closeBtn = document.getElementById('welcome-close')!;
  const skipBtn = document.getElementById('welcome-skip')!;
  const previous = lastChoice();

  const close = () => {
    root.hidden = true;
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
  };

  grid.replaceChildren(
    ...FUELS.map((f) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'fuel-card';
      b.setAttribute('aria-pressed', String(previous === f.id));
      const name = document.createElement('strong');
      name.textContent = f.label;
      const caption = document.createElement('span');
      caption.textContent = CAPTIONS[f.id];
      b.append(name, caption);
      b.addEventListener('click', () => {
        rememberChoice(f.id);
        close();
        onPick(f.id);
      });
      return b;
    }),
  );

  closeBtn.addEventListener('click', close);
  skipBtn.addEventListener('click', close);
  // toccando fuori dalla scheda, sullo sfondo scuro, si chiude
  root.addEventListener('click', (e) => {
    if (e.target === root) close();
  });
  document.addEventListener('keydown', onKey);
  root.hidden = false;
}
