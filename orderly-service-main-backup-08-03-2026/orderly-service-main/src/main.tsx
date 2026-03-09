import "./polyfills";
import "./index.css";

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
// force rebuild
