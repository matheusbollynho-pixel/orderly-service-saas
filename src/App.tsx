import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AdminMenu } from "@/components/AdminMenu";
import { ThemeProvider } from "@/hooks/useTheme";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import { LoginPage } from "./pages/LoginPage";
import AfterSalesPage from "./pages/AfterSalesPage";
import { CashFlowPage } from "./pages/CashFlowPage";
import PublicSatisfactionPage from "./pages/PublicSatisfactionPage";
import PublicStoreSatisfactionPage from "./pages/PublicStoreSatisfactionPage";
import PublicSatisfactionFeedPage from "./pages/PublicSatisfactionFeedPage";
import { PrintOrderPage } from "./pages/PrintOrderPage";
import { DebugOrderPage } from "./pages/DebugOrderPage";
import ConfigToolsPage from "./pages/ConfigToolsPage";
import { useAuth } from "./hooks/useAuth";
import { useEffect } from "react";
import { cleanupOldPhotos } from "./lib/photoService";
import { useLocalSync } from "./hooks/useLocalSync";
import { useRealtimeSync } from "./hooks/useRealtimeSync";
import { useStoreSettings } from "./hooks/useStoreSettings";

console.log('📦 App.tsx importado');

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: true, // Sincroniza ao voltar para a aba
      staleTime: 2 * 60 * 1000, // 2 minutos - balanceado para sync
      gcTime: 10 * 60 * 1000, // 10 minutos - mantém cache em memória
    },
  },
});

function AppRoutes() {
  const location = useLocation();
  const isPublicSatisfaction = location.pathname.startsWith('/avaliar/');
  const isPublicFeed = location.pathname.startsWith('/avaliacoes/');

  if (isPublicFeed) {
    return (
      <Routes>
        <Route path="/avaliacoes/feed" element={<PublicSatisfactionFeedPage />} />
      </Routes>
    );
  }

  if (isPublicSatisfaction) {
    // IMPORTANTE: A rota mais específica (/loja) DEVE vir ANTES da genérica (/:token)
    // para evitar que :token faça match com a palavra "loja"
    return (
      <Routes>
        <Route path="/avaliar/loja" element={<PublicStoreSatisfactionPage />} />
        <Route path="/avaliar/:token" element={<PublicSatisfactionPage />} />
      </Routes>
    );
  }

  return (
    <>
      <AdminMenu />
      <AuthenticatedApp />
    </>
  );
}

function AuthenticatedApp() {
  const { user, loading } = useAuth();

  // Limpar fotos antigas uma vez por dia (100+ dias)
  useEffect(() => {
    const lastCleanup = localStorage.getItem('lastPhotoCleanup');
    const today = new Date().toDateString();

    if (lastCleanup !== today) {
      cleanupOldPhotos(100); // Limpar fotos com 100+ dias
      localStorage.setItem('lastPhotoCleanup', today);
    }
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return (
    <Routes>
      <Route path="/" element={<Index />} />
      <Route path="/config" element={<ConfigToolsPage />} />
      <Route path="/pos-venda" element={<AfterSalesPage />} />
      <Route path="/fluxo-caixa" element={<CashFlowPage />} />
      <Route path="/debug-os/:id" element={<DebugOrderPage />} />
      <Route path="/print/:id" element={<PrintOrderPage />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

function AppContent() {
  // Inicializar sistema de sincronização local (dentro do QueryClientProvider)
  const { status: syncStatus } = useLocalSync();
  useRealtimeSync();
  const { settings: storeSettings } = useStoreSettings();

  // Atualiza título globalmente pelo nome da empresa
  useEffect(() => {
    if (storeSettings?.company_name) {
      document.title = storeSettings.company_name;
    }
  }, [storeSettings?.company_name]);

  useEffect(() => {
    if (syncStatus.isReady) {
      console.log('✅ Sistema de sincronização local ativo');
      console.log('📡 Broadcast Channel:', syncStatus.broadcastChannelActive ? 'Ativo' : 'Inativo');
      console.log('⚙️ Service Worker:', syncStatus.serviceWorkerActive ? 'Ativo' : 'Inativo');
    }
  }, [syncStatus]);

  return <AppRoutes />;
}

const App = () => {
  console.log('🎨 App renderizando');
  return (
    <ThemeProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <AppContent />
            </BrowserRouter>
          </TooltipProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </ThemeProvider>
  );
};

console.log('✅ App definido');

export default App;
