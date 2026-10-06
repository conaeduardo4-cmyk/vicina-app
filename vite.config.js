import { defineConfig, loadEnv } from 'vite';

// Versione e indirizzo degli aggiornamenti vengono scritti DENTRO l'app durante la compilazione.
// Su GitHub Actions si ricavano da soli (repository e numero della build), anche se il file .env non li contiene.
export default defineConfig(({ mode }) => {
  const e = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
  const repo = e.GITHUB_REPOSITORY || e.VICINA_REPO || '';
  const updateUrl = e.VITE_UPDATE_URL || (repo ? `https://github.com/${repo}/releases/latest/download/version.json` : '');
  return {
    build: { outDir: 'dist', target: ['es2020', 'safari15', 'chrome90'] },
    define: {
      'import.meta.env.VITE_APP_VERSION': JSON.stringify(e.VITE_APP_VERSION || e.APP_VERSION || e.npm_package_version || ''),
      'import.meta.env.VITE_APP_CODE': JSON.stringify(String(e.VITE_APP_CODE || e.GITHUB_RUN_NUMBER || '0')),
      'import.meta.env.VITE_UPDATE_URL': JSON.stringify(updateUrl)
    }
  };
});
