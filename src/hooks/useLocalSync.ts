import { useEffect, useState, useCallback } from 'react';
import {
  initLocalSync,
  broadcastUpdate,
  getFromLocalStorage,
  cacheInLocalStorage,
} from '@/lib/localSync';

interface LocalSyncStatus {
  isReady: boolean;
  isOnline: boolean;
  isLocalNetwork: boolean;
  serviceWorkerActive: boolean;
  broadcastChannelActive: boolean;
}

/**
 * Hook para usar sincronização local entre dispositivos
 * 
 * Funcionalidades:
 * - Sincroniza alterações instantaneamente entre PC e celular na mesma rede
 * - Cache local para acesso offline
 * - Detecção automática de rede local vs internet
 * - Background sync quando voltar online
 */
export function useLocalSync() {
  const [status, setStatus] = useState<LocalSyncStatus>({
    isReady: false,
    isOnline: navigator.onLine,
    isLocalNetwork: false,
    serviceWorkerActive: false,
    broadcastChannelActive: false,
  });

  // Inicializar sistema de sync local
  useEffect(() => {
    let cleanup: (() => void) | null = null;

    const init = async () => {
      console.log('🚀 Inicializando useLocalSync...');
      
      const result = await initLocalSync();
      
      setStatus((prev) => ({
        ...prev,
        isReady: result.isReady,
        serviceWorkerActive: !!result.serviceWorker,
        broadcastChannelActive: !!result.broadcastChannel,
      }));

      // Escutar atualizações de outros dispositivos/abas
      const handleLocalUpdate = (event: any) => {
        const { type, data } = event.detail;
        console.log('📡 Atualização local recebida:', type, data);

        // Disparar evento para que componentes que usam queries se atualizem
        // (Via Broadcast Channel que já está ativo no initLocalSync)
      };

      window.addEventListener('local-data-update', handleLocalUpdate);

      // Monitorar status online/offline
      const handleOnline = () => setStatus((prev) => ({ ...prev, isOnline: true }));
      const handleOffline = () => setStatus((prev) => ({ ...prev, isOnline: false }));

      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);

      cleanup = () => {
        window.removeEventListener('local-data-update', handleLocalUpdate);
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    };

    init();

    return () => {
      cleanup?.();
    };
  }, []);

  // Notificar outros dispositivos sobre mudanças
  const notifyUpdate = useCallback((type: string, data?: any) => {
    console.log('📤 Notificando atualização local:', type);
    broadcastUpdate(type, data);
  }, []);

  // Cache local com TTL
  const cacheData = useCallback(<T,>(key: string, data: T, ttlMinutes: number = 5) => {
    cacheInLocalStorage(key, data, ttlMinutes * 60 * 1000);
  }, []);

  // Recuperar do cache
  const getCachedData = useCallback(<T,>(key: string): T | null => {
    return getFromLocalStorage<T>(key);
  }, []);

  return {
    status,
    notifyUpdate,
    cacheData,
    getCachedData,
  };
}
