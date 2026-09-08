# Touch Grass

**Touch Grass simulates your dream of touching grass**

Because apparently going outside is too much work, so we made a browser-based simulation instead

**[Try it live →](https://touchgrass.exil.dev/)**

## Features

* Procedural grass and terrain
* Real-time local day and night cycle with warm twilight, moonlight, stars, mist, fireflies, and nighttime insect ambience
* Volumetric fog
* Wind and grass movement
* Particle effects
* Custom GLSL shaders
* exposure adaptation
* Chunk-based terrain generation

Built with **TypeScript, Three.js, Vite, and WebGL**

## Development

```bash
git clone https://github.com/SimonSeider/touch-grass.git
cd touch-grass
npm install
npm run dev
```

For a production build:

```bash
npm run build
```

## Day and night

The world follows your device's local clock at 1:1 speed and resynchronizes immediately after sleep or returning to the tab. Sunrise is at 06:00 and sunset at 18:00, with gradual twilight on either side. These are fixed local times, not seasonal or location-based astronomical sunrise and sunset. No location permission is needed.

Use **Debug → Day & Night → Override Local Time** and the sun elevation slider to preview the atmosphere. Disable the override to return to real time. Audio begins after the first interaction; the recorded nighttime ambience follows the sound-effects and mute controls. Day and night recordings crossfade with the cycle. See [sound credits](src/audio/sounds/CREDITS.md) for the Freesound source, CC0 license, and loop edits.

Run the clock and transition checks with `node --test tests/daynight.test.mjs`.

## Things you need to know

Touch grass can make your **GPU scream**

## Contributing

Feel free to improve the grass, add more cursed graphics features, or finally figure out how to make people touch actual grass
