import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import fs from "fs";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const companyName = env.VITE_COMPANY_NAME || 'SpeedSeek OS';

  // Gera manifest.json dinâmico com o nome da empresa
  const manifestPlugin = {
    name: 'dynamic-manifest',
    buildStart() {
      const manifest = {
        name: `${companyName} - Sistema de OS`,
        short_name: companyName,
        description: `Sistema de Ordem de Serviço para ${companyName}`,
        start_url: '/',
        display: 'standalone',
        background_color: '#0a0a0a',
        theme_color: '#C1272D',
        orientation: 'portrait-primary',
        icons: [
          { src: '/favicon.ico', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: '/favicon.ico', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ],
        categories: ['business', 'productivity'],
        shortcuts: [
          { name: 'Nova OS', url: '/?action=new-order', description: 'Criar nova ordem de servico' },
          { name: 'Fluxo de Caixa', url: '/cash-flow', description: 'Acessar fluxo de caixa' }
        ],
        prefer_related_applications: false
      };
      fs.writeFileSync('public/manifest.json', JSON.stringify(manifest, null, 2));
    }
  };

return ({
  define: {
    __BUILD_TIME__: JSON.stringify(Date.now()),
  },
  server: {
    host: "0.0.0.0",
    port: 8080,
    strictPort: true,
    hmr: {
      overlay: false,
      clientPort: 8080,
    },
    cors: {
      origin: '*',
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['*'],
    },
  },
  plugins: [react(), manifestPlugin, mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    target: ['es2015', 'safari11'],
    cssTarget: 'safari11',
    minify: 'esbuild',
    sourcemap: mode === 'development',
    // Melhorias para Safari
    rollupOptions: {
      output: {
        // Evitar template literals problemáticos no Safari antigo
        format: 'es',
        entryFileNames: `assets/[name]-[hash:9].js`,
        chunkFileNames: `assets/[name]-[hash:9].js`,
        assetFileNames: `assets/[name]-[hash:9].[ext]`,
      },
    },
  },
  optimizeDeps: {
    esbuildOptions: {
      target: 'es2015',
    },
  },
  esbuild: {
    supported: {
      'top-level-await': false,
      'dynamic-import': true,
    },
    // Garantir compatibilidade com Safari
    logLevel: 'silent',
  },
});
}
