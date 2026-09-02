import libSky from './shaders/sky/lib_sky.glsl?raw';
import libLight from './shaders/terrain/lib_light.glsl?raw';

const CHUNKS: Record<string, string> = {
  sky: libSky,
  light: libLight,
};

export function resolveIncludes(source: string): string {
  return source.replace(/^[ \t]*\/\/#include <(\w+)>[ \t]*$/gm, (whole, name: string) => {
    const chunk = CHUNKS[name];
    if (chunk === undefined) throw new Error(`unknown shader chunk: ${name}`);
    return chunk;
  });
}