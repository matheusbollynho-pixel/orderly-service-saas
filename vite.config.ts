import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
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
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
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
}));
