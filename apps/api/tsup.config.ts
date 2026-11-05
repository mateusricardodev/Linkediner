import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/main.ts'],
  format: ['esm'],
  target: 'node24',
  platform: 'node',
  sourcemap: true,
  clean: true,
  // Pacotes do monorepo são TypeScript puro: entram no bundle.
  noExternal: [/^@linkediner\//],
});
