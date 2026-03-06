// Service Worker para PWA e Sync Local
const CACHE_NAME = 'bandara-motos-v1';
const OFFLINE_URL = '/offline.html';

// Recursos essenciais para funcionar offline
const ESSENTIAL_RESOURCES = [
  '/',
  '/offline.html',
  '/manifest.json',
];

// Instalação do Service Worker
self.addEventListener('install', (event) => {
  console.log('🔧 Service Worker instalando...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('📦 Cache aberto');
      return cache.addAll(ESSENTIAL_RESOURCES);
    })
  );
  self.skipWaiting();
});

// Ativação do Service Worker
self.addEventListener('activate', (event) => {
  console.log('✅ Service Worker ativado');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('🗑️ Removendo cache antigo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Estratégia: Network First, fallback para Cache
self.addEventListener('fetch', (event) => {
  // Ignorar requisições que não são GET
  if (event.request.method !== 'GET') return;

  // Ignorar requisições do Supabase (usar network sempre)
  if (event.request.url.includes('supabase.co')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Clone a resposta para armazenar no cache
        const responseClone = response.clone();
        
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseClone);
        });

        return response;
      })
      .catch(() => {
        // Se falhar, tenta buscar do cache
        return caches.match(event.request).then((response) => {
          if (response) {
            return response;
          }

          // Se for navegação, retorna página offline
          if (event.request.mode === 'navigate') {
            return caches.match(OFFLINE_URL);
          }

          return new Response('Offline', {
            status: 503,
            statusText: 'Service Unavailable',
          });
        });
      })
  );
});

// Background Sync - sincronizar quando voltar online
self.addEventListener('sync', (event) => {
  console.log('🔄 Background Sync:', event.tag);
  
  if (event.tag === 'sync-orders') {
    event.waitUntil(syncPendingOrders());
  }
});

async function syncPendingOrders() {
  // Recuperar dados pendentes do IndexedDB
  // Enviar para o Supabase quando voltar online
  console.log('📤 Sincronizando ordens pendentes...');
}

// Mensagens entre Service Worker e App
self.addEventListener('message', (event) => {
  console.log('📨 Mensagem recebida:', event.data);
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data && event.data.type === 'BROADCAST_UPDATE') {
    // Rebroadcast para todas as abas/dispositivos
    self.clients.matchAll().then((clients) => {
      clients.forEach((client) => {
        client.postMessage({
          type: 'DATA_UPDATE',
          data: event.data.payload,
        });
      });
    });
  }
});
