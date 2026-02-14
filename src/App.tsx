import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import { LoginPage } from "./pages/LoginPage";
import AfterSalesPage from "./pages/AfterSalesPage";
import { CashFlowPage } from "./pages/CashFlowPage";
import { useAuth } from "./hooks/useAuth";
import { useEffect } from "react";
import { cleanupOldChecklistPhotos } from "./lib/cleanupService";

console.log('📦 App.tsx importado');

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function AuthenticatedApp() {
  const { user, loading } = useAuth();

  // Limpar fotos antigas uma vez por dia
  useEffect(() => {
    const lastCleanup = localStorage.getItem('lastPhotoCleanup');
    const today = new Date().toDateString();

    if (lastCleanup !== today) {
      cleanupOldChecklistPhotos();
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
      <Route path="/pos-venda" element={<AfterSalesPage />} />
      <Route path="/fluxo-caixa" element={<CashFlowPage />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => {
  console.log('🎨 App renderizando');
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <AuthenticatedApp />
          </BrowserRouter>
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
};

console.log('✅ App definido');

export default App;
