import {
  DEFAULT_SETTINGS,
  QUALITY_PRESETS,
  clearStoredSettings,
  loadSettings,
  saveSettings,
  type QualityPreset,
  type Settings,
} from './settings';

export interface UiOptions {
  apply: (settings: Settings) => void;
  onOpenChange?: (open: boolean) => void;
}

export interface Ui {
  settings: Settings;
  isOpen: () => boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  tick: (dt: number) => void;
}

type Formatter = (value: number) => string;

const FORMATTERS: Record<string, Formatter> = {
  pct: (v) => `${Math.round(v)}%`,
  pctOfOne: (v) => `${Math.round(v * 100)}%`,
  x: (v) => `${v.toFixed(2)}×`,
  int: (v) => `${Math.round(v)}`,
  f2: (v) => v.toFixed(2),
  f3: (v) => v.toFixed(3),
  f4: (v) => v.toFixed(4),
  shutter: (v) => (v >= 1 ? `1/${Math.round(v)}s` : `${(1 / v).toFixed(1)}s`),
  fstop: (v) => `f/${v.toFixed(1)}`,
  ev: (v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)} EV`,
  deg: (v) => `${Math.round(v)}°`,
  rad: (v) => `${Math.round((v * 180) / Math.PI)}°`,
  chunks: (v) => `${Math.round(v)} chunks`,
  speed: (v) => `${v.toFixed(1)} m/s`,
  meters: (v) => `${v.toFixed(2)} m`,
};

const TAB_KEY = 'touch-grass.tab';

type SettingsRecord = Record<string, Record<string, number | boolean | string>>;

function readPath(settings: Settings, path: string): number | boolean | string {
  const [section, key] = path.split('.');
  return (settings as unknown as SettingsRecord)[section][key];
}

function writePath(settings: Settings, path: string, value: number | boolean) {
  const [section, key] = path.split('.');
  (settings as unknown as SettingsRecord)[section][key] = value;
}

function el<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

function evalCondition(rawExpr: string, settings: Settings): boolean {
  return rawExpr.split('||').some((orClause) => {
    return orClause.split('&&').every((term) => {
      const trimmed = term.trim();
      if(!trimmed)
          return true;

      const negated = trimmed.startsWith('!');
      const path = negated ? trimmed.slice(1).trim() : trimmed;
      const val = Boolean(readPath(settings, path));

      return negated ? !val : val;
    });
  });
}

export function createUi(options: UiOptions): Ui {
  const settings = loadSettings();

  const menuEl = el<HTMLDivElement>('menu');
  const hudEl = el<HTMLDivElement>('hud');
  const railEl = el<HTMLElement>('menuRail');
  const pagesEl = el<HTMLDivElement>('menuPages');

  const syncers: Array<() => void> = [];

  function commit() {
    for (const sync of syncers) sync();
    options.apply(settings);
    saveSettings(settings);
  }

  // Sliders and switches are declared in the markup; everything here is generic.
  const rangeInputs = Array.from(
    menuEl.querySelectorAll<HTMLInputElement>('input[type="range"][data-setting]'),
  );
  for (const input of rangeInputs) {
    const path = input.dataset.setting as string;
    const format = FORMATTERS[input.dataset.format ?? 'f2'] ?? FORMATTERS.f2;
    const label = input.closest('.row')?.querySelector<HTMLElement>('.name small') ?? null;

    const sync = () => {
      const value = Number(readPath(settings, path));
      if (document.activeElement !== input || input.value === '') input.value = String(value);
      const min = Number(input.min || 0);
      const max = Number(input.max || 1);
      const fill = max > min ? ((value - min) / (max - min)) * 100 : 0;
      input.style.setProperty('--fill', `${fill.toFixed(2)}%`);
      if (label) label.textContent = format(value);
    };
    syncers.push(sync);

    input.addEventListener('input', () => {
      writePath(settings, path, Number(input.value));
      commit();
    });
  }

  const toggleInputs = Array.from(
    menuEl.querySelectorAll<HTMLInputElement>('input[type="checkbox"][data-setting]'),
  );
  for (const input of toggleInputs) {
    const path = input.dataset.setting as string;
    syncers.push(() => {
      input.checked = Boolean(readPath(settings, path));
    });
    input.addEventListener('change', () => {
      writePath(settings, path, input.checked);
      commit();
    });
  }

  // Rows that only make sense while another setting is on, e.g. manual exposure.
  /*const gatedRows = Array.from(menuEl.querySelectorAll<HTMLElement>('[data-enabled-by]'));
  for (const row of gatedRows) {
    const raw = row.dataset.enabledBy as string;
    const negated = raw.startsWith('!');
    const path = negated ? raw.slice(1) : raw;
    syncers.push(() => {
      const on = Boolean(readPath(settings, path)) !== negated;
      row.classList.toggle('dimmed', !on);
    });
  }*/
  
  const gatedRows = Array.from(menuEl.querySelectorAll<HTMLElement>('[data-enabled-by]'));
  for(const row of gatedRows){
      const raw = row.dataset.enabledBy as string;
      syncers.push(() => {
          const on = evalCondition(raw, settings);
          row.classList.toggle('dimmed', !on);
      });
  }

  const presetSeg = el<HTMLDivElement>('qualityPreset');
  const presetOut = el<HTMLElement>('presetOut');
  const presetButtons = Array.from(presetSeg.querySelectorAll<HTMLButtonElement>('button[data-value]'));

  function detectPreset(): Settings['graphics']['preset'] {
    for (const [name, fields] of Object.entries(QUALITY_PRESETS)) {
      const match = Object.entries(fields).every(
        ([key, value]) => (settings.graphics as unknown as Record<string, unknown>)[key] === value,
      );
      if (match) return name as QualityPreset;
    }
    return 'custom';
  }

  syncers.push(() => {
    const preset = detectPreset();
    settings.graphics.preset = preset;
    presetOut.textContent = preset === 'custom' ? 'Custom' : preset[0].toUpperCase() + preset.slice(1);
    for (const button of presetButtons) button.classList.toggle('on', button.dataset.value === preset);
  });

  for (const button of presetButtons) {
    button.addEventListener('click', () => {
      Object.assign(settings.graphics, QUALITY_PRESETS[button.dataset.value as QualityPreset]);
      commit();
    });
  }

  el<HTMLButtonElement>('resetGraphics').addEventListener('click', () => {
    Object.assign(settings.graphics, DEFAULT_SETTINGS.graphics);
    commit();
  });

  el<HTMLButtonElement>('resetAll').addEventListener('click', () => {
    for (const section of Object.keys(settings) as Array<keyof Settings>) {
      Object.assign(settings[section], DEFAULT_SETTINGS[section]);
    }
    clearStoredSettings();
    commit();
  });

  const tabs = Array.from(railEl.querySelectorAll<HTMLButtonElement>('.tab[data-tab]'));
  const pages = Array.from(pagesEl.querySelectorAll<HTMLElement>('.page[data-page]'));

  function selectTab(name: string) {
    let matched = false;
    for (const tab of tabs) {
      const on = tab.dataset.tab === name;
      tab.classList.toggle('active', on);
      matched = matched || on;
    }
    if (!matched) return;
    for (const page of pages) page.classList.toggle('active', page.dataset.page === name);
    pagesEl.scrollTop = 0;
    try {
      localStorage.setItem(TAB_KEY, name);
    } catch {
    }
  }

  for (const tab of tabs) {
    tab.addEventListener('click', () => selectTab(tab.dataset.tab as string));
  }

  let storedTab: string | null = null;
  try {
    storedTab = localStorage.getItem(TAB_KEY);
  } catch {
  }
  selectTab(storedTab ?? 'graphics');

  const hud = {
    fps: el<HTMLElement>('hudFps'),
    frame: el<HTMLElement>('hudFrame'),
  };

  let open = false;
  let fps = 60;
  let frameMs = 16.7;
  let readoutTimer = 0;

  function setOpen(next: boolean) {
    if (open === next) return;
    open = next;
    menuEl.classList.toggle('open', open);
    options.onOpenChange?.(open);
  }

  function tick(dt: number) {
    if (dt > 0) {
      const k = 1 - Math.exp(-dt / 0.35);
      fps += (1 / dt - fps) * k;
      frameMs += (dt * 1000 - frameMs) * k;
    }

    readoutTimer -= dt;
    if (readoutTimer > 0) return;
    readoutTimer = 0.2;

    const hudOn = settings.debug.hud;
    hudEl.classList.toggle('on', hudOn);
    if (!hudOn) return;

    hud.fps.textContent = fps.toFixed(0);
    hud.frame.textContent = `${frameMs.toFixed(1)} ms`;
  }

  commit();

  return {
    settings,
    isOpen: () => open,
    setOpen,
    toggle: () => setOpen(!open),
    tick,
  };
}
