export interface RenderParams {
  exposure: number;
  autoExposure: boolean;
  autoISO: boolean;
  exposureCompensation: number;

  sunRadiance: number;
  grassSunRadiance: number;
  rim: number;
  fogDensity: number;
  fogHeightFalloff: number;
  fogBaseHeight: number;
  fogFloor: number;
  fogStart: number;
  fogFade: number;
  fogScatter: number;
  fogAmbient: number;
  fogAnisotropy: number;
  fogNoise: number;
  fogMaxDistance: number;

  haze: number;

  cloudCoverageLow: number;
  cloudCoverageHigh: number;
  cloudDensity: number;
  cloudErosion: number;
  cloudLightAbsorb: number;

  bloom: number;
  saturation: number;
  contrast: number;
  warmth: number;
  vignette: number;
  grain: number;
  chroma: number;
}

export const RENDER_PARAMS: RenderParams = {
  exposure: 0.26,
  autoExposure: true,
  autoISO: false,
  exposureCompensation: 0.0,

  sunRadiance: 3.0,
  grassSunRadiance: 2.8,
  rim: 0.3,
  fogDensity: 0.075,
  fogHeightFalloff: 0.045,
  fogBaseHeight: -6.0,
  fogFloor: 0.014,
  fogStart: 20.0,
  fogFade: 40.0,
  fogScatter: 2.2,
  fogAmbient: 1.0,
  fogAnisotropy: 0.6,
  fogNoise: 0.35,
  fogMaxDistance: 600.0,

  haze: 0.65,

  cloudCoverageLow: 0.72,
  cloudCoverageHigh: 0.92,
  cloudDensity: 1.9,
  cloudErosion: 0.42,
  cloudLightAbsorb: 0.004,

  bloom: 0.24,
  saturation: 1.06,
  contrast: 1.06,
  warmth: 0.1,
  vignette: 0.3,
  grain: 0.022,
  chroma: 0.0035,
};
