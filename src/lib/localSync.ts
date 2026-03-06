/**
 * Sistema de Sincronização Local para Bandara Motos
 * 
 * Funcionalidades:
 * 1. Broadcast Channel - Sincroniza entre abas/dispositivos na mesma origem
 * 2. LocalStorage - Cache de dados para acesso rápido
 * 3. IndexedDB - Armazenamento persistente para dados grandes
 * 4. Network Detection - Detecta se está na rede local da loja
 * 5. Service Worker - Background sync quando voltar online
 */

// Broadcast Channel para comunicação entre abas
let broadcastChannel: BroadcastChannel | null = null;

// Inicializar Broadcast Channel (funciona apenas em mesma origem)
export function initBroadcastChannel() {
  if (typeof BroadcastChannel === 'undefined') {
    console.log('⚠️ BroadcastChannel não suportado neste navegador');
    return null;
  }

  try {
    broadcastChannel = new BroadcastChannel('bandara-motos-sync');
    
    broadcastChannel.onmessage = (event) => {
      console.log('📡 Broadcast recebido:', event.data);
      
      // Disparar evento customizado para o React capturar
      window.dispatchEvent(
        new CustomEvent('local-data-update', {
          detail: event.data,
        })
      );
    };

    console.log('✅ Broadcast Channel inicializado');
    return broadcastChannel;
  } catch (error) {
    console.error('❌ Erro ao inicializar Broadcast Channel:', error);
    return null;
  }
}

// Enviar atualização via Broadcast
export function broadcastUpdate(type: string, data: any) {
  if (!broadcastChannel) {
    console.log('⚠️ Broadcast Channel não disponível');
    return;
  }

  try {
    broadcastChannel.postMessage({
      type,
      data,
      timestamp: Date.now(),
      source: 'bandara-motos-app',
    });
    console.log('📤 Broadcast enviado:', type);
  } catch (error) {
    console.error('❌ Erro ao enviar broadcast:', error);
  }
}

// Detectar se está na rede local (WiFi da loja)
export async function isLocalNetwork(): Promise<boolean> {
  try {
    // Verifica latência para o Supabase
    const startTime = performance.now();
    const response = await fetch('https://your-supabase-url.supabase.co/rest/v1/', {
      method: 'HEAD',
      mode: 'no-cors',
    });
    const latency = performance.now() - startTime;

    // Se latência < 100ms, provavelmente está em rede rápida/local
    const isLocal = latency < 100;
    console.log(`🌐 Latência: ${latency.toFixed(0)}ms - ${isLocal ? 'Rede Local' : 'Internet'}`);
    
    return isLocal;
  } catch (error) {
    console.error('❌ Erro ao detectar rede:', error);
    return false;
  }
}

// Cache em LocalStorage (para dados pequenos)
export function cacheInLocalStorage<T>(key: string, data: T, ttl: number = 5 * 60 * 1000): void {
  try {
    const item = {
      data,
      timestamp: Date.now(),
      ttl,
    };
    localStorage.setItem(`bandara_${key}`, JSON.stringify(item));
  } catch (error) {
    console.error('❌ Erro ao salvar no LocalStorage:', error);
  }
}

export function getFromLocalStorage<T>(key: string): T | null {
  try {
    const item = localStorage.getItem(`bandara_${key}`);
    if (!item) return null;

    const parsed = JSON.parse(item);
    const now = Date.now();

    // Verificar se expirou
    if (now - parsed.timestamp > parsed.ttl) {
      localStorage.removeItem(`bandara_${key}`);
      return null;
    }

    return parsed.data as T;
  } catch (error) {
    console.error('❌ Erro ao ler do LocalStorage:', error);
    return null;
  }
}

// IndexedDB para dados grandes (OSs, fotos, etc)
let db: IDBDatabase | null = null;

export async function initIndexedDB(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') {
    console.log('⚠️ IndexedDB não suportado');
    return null;
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open('BandaraMotosDB', 1);

    request.onerror = () => {
      console.error('❌ Erro ao abrir IndexedDB');
      reject(null);
    };

    request.onsuccess = () => {
      db = request.result;
      console.log('✅ IndexedDB inicializado');
      resolve(db);
    };

    request.onupgradeneeded = (event: any) => {
      const db = event.target.result;

      // Object Store para Ordens de Serviço
      if (!db.objectStoreNames.contains('orders')) {
        const ordersStore = db.createObjectStore('orders', { keyPath: 'id' });
        ordersStore.createIndex('status', 'status', { unique: false });
        ordersStore.createIndex('created_at', 'created_at', { unique: false });
      }

      // Object Store para sincronização pendente
      if (!db.objectStoreNames.contains('pending_sync')) {
        db.createObjectStore('pending_sync', { keyPath: 'id', autoIncrement: true });
      }

      console.log('📦 IndexedDB structure criada');
    };
  });
}

// Salvar no IndexedDB
export async function saveToIndexedDB(storeName: string, data: any): Promise<boolean> {
  if (!db) {
    db = await initIndexedDB();
    if (!db) return false;
  }

  return new Promise((resolve) => {
    try {
      const transaction = db!.createObjectStore(storeName, { keyPath: 'write' });
      const store = transaction.objectStore(storeName);
      const request = store.put(data);

      request.onsuccess = () => {
        console.log('✅ Salvo no IndexedDB:', storeName);
        resolve(true);
      };

      request.onerror = () => {
        console.error('❌ Erro ao salvar no IndexedDB');
        resolve(false);
      };
    } catch (error) {
      console.error('❌ Erro na transação IndexedDB:', error);
      resolve(false);
    }
  });
}

// Monitorar status da rede
export function monitorNetworkStatus(callback: (online: boolean) => void) {
  const handleOnline = () => {
    console.log('✅ Online');
    callback(true);
  };

  const handleOffline = () => {
    console.log('❌ Offline');
    callback(false);
  };

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  // Retornar função de cleanup
  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
}

// Registrar Service Worker
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) {
    console.log('⚠️ Service Worker não suportado');
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
    });

    console.log('✅ Service Worker registrado:', registration.scope);

    // Escutar atualizações do Service Worker
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      console.log('🔄 Nova versão do Service Worker disponível');

      newWorker?.addEventListener('statechange', () => {
        if (newWorker.state === 'activated') {
          console.log('✅ Nova versão ativada');
          // Recarregar página para usar nova versão
          window.location.reload();
        }
      });
    });

    return registration;
  } catch (error) {
    console.error('❌ Erro ao registrar Service Worker:', error);
    return null;
  }
}

// Hook para inicializar tudo
export async function initLocalSync() {
  console.log('🚀 Inicializando sistema de sincronização local...');

  // 1. Registrar Service Worker (PWA + offline)
  const swRegistration = await registerServiceWorker();

  // 2. Inicializar Broadcast Channel (sync entre abas)
  const channel = initBroadcastChannel();

  // 3. Inicializar IndexedDB (armazenamento local)
  const database = await initIndexedDB();

  // 4. Monitorar status da rede
  monitorNetworkStatus((online) => {
    if (online) {
      // Tentar sincronizar dados pendentes
      console.log('🔄 Rede disponível, sincronizando...');
      broadcastUpdate('network-online', { timestamp: Date.now() });
    } else {
      console.log('⚠️ Modo offline ativado');
      broadcastUpdate('network-offline', { timestamp: Date.now() });
    }
  });

  return {
    serviceWorker: swRegistration,
    broadcastChannel: channel,
    indexedDB: database,
    isReady: !!(swRegistration || channel || database),
  };
}
