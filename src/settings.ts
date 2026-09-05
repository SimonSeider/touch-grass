export interface GraphicsSettings {
  preset: 'low' | 'medium' | 'high' | 'ultra' | 'custom';
  resolutionScale: number;
  viewDistance: number;
  grassDensity: number;
  particles: boolean;
  ssao: boolean;

  bloom: number;
  fogDensity: number;
  haze: number;
  cloudCoverage: number;
  cloudDensity: number;

  saturation: number;
  contrast: number;
  warmth: number;
  vignette: number;
  chroma: number;
}

export interface CameraSettings {
  fov: number;
  focusDistance: number;
  autoExposure: boolean;
  autoISO: boolean;
  autoFocus: boolean;
  exposureCompensation: number;
  shutterDenominator: number;
  aperture: number;
  iso: number;
}

export interface GameplaySettings {
  sensitivity: number;
  invertY: boolean;
  walkSpeed: number;
  runSpeed: number;
  jumpHeight: number;
  sprintToggle: boolean;
  acceleration: number;
  friction: number;
  airControl: number;
  slopeLimit: number;
  slide: boolean;
  momentum: boolean;
}

export interface AudioSettings {
  master: number;
  music: number;
  sfx: number;
  muteUnfocused: boolean;
}

export interface DebugSettings {
  hud: boolean;
  wireframe: boolean;
  freezeSun: boolean;
  sunElevation: number;
  pauseBlur: boolean;
}

export interface Settings {
  graphics: GraphicsSettings;
  camera: CameraSettings;
  gameplay: GameplaySettings;
  audio: AudioSettings;
  debug: DebugSettings;
}

export const DEFAULT_SETTINGS: Settings = {
  graphics: {
    preset: 'high',
    resolutionScale: 1.0,
    viewDistance: 5,
    grassDensity: 1.0,
    particles: true,
    ssao: true,

    bloom: 0.24,
    fogDensity: 0.075,
    haze: 0.65,
    cloudCoverage: 0.72,
    cloudDensity: 1.9,

    saturation: 1.06,
    contrast: 1.06,
    warmth: 0.1,
    vignette: 0.3,
    chroma: 0.0035,
  },
  camera: {
    fov: 72,
    focusDistance: 50,
    autoExposure: true,
    autoISO: false,
    autoFocus: true,
    exposureCompensation: 0,
    shutterDenominator: 125,
    aperture: 16,
    iso: 100,
  },
  gameplay: {
    sensitivity: 1.0,
    invertY: false,
    walkSpeed: 3.4,
    runSpeed: 6.2,
    jumpHeight: 1.4,
    sprintToggle: false,
    acceleration: 14,
    friction: 10,
    airControl: 0.15,
    slopeLimit: 22,
    slide: true,
    momentum: false,
  },
  audio: {
    master: 100,
    music: 50,
    sfx: 50,
    muteUnfocused: true,
  },
  debug: {
    hud: false,
    wireframe: false,
    freezeSun: false,
    sunElevation: 0.4,
    pauseBlur: true,
  },
};

export type QualityPreset = Exclude<GraphicsSettings['preset'], 'custom'>;

type PresetFields = Pick<
  GraphicsSettings,
  'resolutionScale' | 'viewDistance' | 'grassDensity' | 'particles' | 'ssao' | 'bloom'
>;

export const QUALITY_PRESETS: Record<QualityPreset, PresetFields> = {
  low: { resolutionScale: 0.65, viewDistance: 3, grassDensity: 0.5, particles: false, ssao: false, bloom: 0.16 },
  medium: { resolutionScale: 0.85, viewDistance: 4, grassDensity: 0.75, particles: true, ssao: false, bloom: 0.2 },
  high: { resolutionScale: 1.0, viewDistance: 5, grassDensity: 1.0, particles: true, ssao: true, bloom: 0.24 },
  ultra: { resolutionScale: 1.25, viewDistance: 7, grassDensity: 1.35, particles: true, ssao: true, bloom: 0.3 },
};

const STORAGE_KEY = 'touch-grass.settings.v1';

export function cloneSettings(source: Settings): Settings {
  return {
    graphics: { ...source.graphics },
    camera: { ...source.camera },
    gameplay: { ...source.gameplay },
    audio: { ...source.audio },
    debug: { ...source.debug },
  };
}

function merge(target: Settings, stored: unknown): Settings {
  if (!stored || typeof stored !== 'object') return target;
  for (const section of Object.keys(target) as Array<keyof Settings>) {
    const incoming = (stored as Record<string, unknown>)[section];
    if (!incoming || typeof incoming !== 'object') continue;
    const dest = target[section] as unknown as Record<string, unknown>;
    for (const key of Object.keys(dest)) {
      const value = (incoming as Record<string, unknown>)[key];
      if (typeof value === typeof dest[key]) dest[key] = value;
    }
  }
  return target;
}

export function loadSettings(): Settings {
  const settings = cloneSettings(DEFAULT_SETTINGS);
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) merge(settings, JSON.parse(raw));
  } catch {
  }
  return settings;
}

let saveTimer = 0;
export function saveSettings(settings: Settings) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
    }
  }, 250) as unknown as number;
}

export function clearStoredSettings() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
  }
}
