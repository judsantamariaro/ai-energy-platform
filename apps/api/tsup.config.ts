import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server.ts'],
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  clean: true,
  // Los paquetes internos exportan TypeScript fuente: se empaquetan dentro del bundle.
  noExternal: [/^@aiem\//],
});
