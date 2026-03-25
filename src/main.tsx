import "./polyfills";
import "./index.css";

// Título e favicon dinâmicos por tenant
const logoPath = import.meta.env.VITE_LOGO_PATH || '/bandara-logo.png';
const appTitle = import.meta.env.VITE_APP_TITLE || 'Bandara Motos';

document.title = appTitle;

const faviconLink = document.querySelector("link[rel*='icon']") as HTMLLinkElement || document.createElement('link');
faviconLink.rel = 'icon';
faviconLink.href = logoPath;
document.head.appendChild(faviconLink);

setTimeout(async () => {
  try {
    const React = await import('react');
    const ReactDOM = await import('react-dom/client');
    const AppModule = await import('./App');

    const root = document.getElementById('root');
    if (!root) {
      throw new Error('ROOT ELEMENT NOT FOUND');
    }

    const reactRoot = ReactDOM.createRoot(root);
    reactRoot.render(React.createElement(AppModule.default));
  } catch (error) {
    console.error('❌ ERRO ao carregar app:', error);
  }
}, 100);
// build: 2026-03-24
