// Polyfills para compatibilidade com Safari/iOS

console.log('📦 Carregando polyfills...');

// Polyfill para globalThis (deve rodar primeiro)
if (typeof globalThis === 'undefined') {
  (window as unknown as { globalThis: typeof window }).globalThis = window;
}

// ===== HELPER PARA STORAGE =====
// Criar um storage em memória como fallback
const createMemoryStorage = () => {
  const data: Record<string, string> = {};
  
  return {
    getItem: (key: string) => data[key] || null,
    setItem: (key: string, value: string) => { data[key] = value; },
    removeItem: (key: string) => { delete data[key]; },
    clear: () => { Object.keys(data).forEach(k => delete data[k]); },
    key: (index: number) => Object.keys(data)[index] || null,
    get length() { return Object.keys(data).length; }
  };
};

// Polyfill para window.matchMedia
if (typeof window !== 'undefined' && typeof window.matchMedia === 'undefined') {
  (window as unknown as { matchMedia: (query: string) => MediaQueryList }).matchMedia = function(query: string) {
    return {
      matches: false,
      media: query,
      onchange: null,
      addListener: function() {},
      removeListener: function() {},
      addEventListener: function() {},
      removeEventListener: function() {},
      dispatchEvent: function() { return true; },
    };
  };
}

// Polyfill para requestIdleCallback
if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'undefined') {
  (window as unknown as { requestIdleCallback: (callback: IdleRequestCallback) => number }).requestIdleCallback = function(callback: IdleRequestCallback) {
    const start = Date.now();
    return setTimeout(function() {
      callback({
        didTimeout: false,
        timeRemaining: function() {
          return Math.max(0, 50 - (Date.now() - start));
        }
      });
    }, 1) as unknown as number;
  };
  
  (window as unknown as { cancelIdleCallback: (id: number) => void }).cancelIdleCallback = function(id: number) {
    clearTimeout(id);
  };
}

console.log('✓ Polyfills carregados com sucesso');

export {};
