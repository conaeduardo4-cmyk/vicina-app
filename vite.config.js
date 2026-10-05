import { defineConfig } from 'vite';
export default defineConfig({
  build: { outDir: 'dist', target: ['es2020', 'safari15', 'chrome90'] },
  define: { 'import.meta.env.VITE_APP_VERSION': JSON.stringify(process.env.APP_VERSION || process.env.npm_package_version || '') }
});
