import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three/examples')) return undefined;
          if (id.includes('node_modules/three')) return 'vendor-three-core';
          if (id.includes('node_modules')) return 'vendor';
        },
      },
    },
  },
});
