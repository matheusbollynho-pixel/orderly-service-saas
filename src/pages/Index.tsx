import { useState } from 'react';
import { useServiceOrders } from '@/hooks/useServiceOrders';
import { ServiceOrder, OrderStatus } from '@/types/service-order';
import { DashboardStats } from '@/components/DashboardStats';
import { OrderCard } from '@/components/OrderCard';
import { OrderForm } from '@/components/OrderForm';
import { OrderDetails } from '@/components/OrderDetails';
import { BottomNav } from '@/components/BottomNav';
import { EmptyState } from '@/components/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import { Wrench } from 'lucide-react';

type View = 'dashboard' | 'new' | 'orders' | 'details';

export default function Index() {
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [selectedOrder, setSelectedOrder] = useState<ServiceOrder | null>(null);
  
  const {
    orders,
    isLoading,
    createOrder,
    updateOrder,
    updateChecklistItem,
    deleteOrder,
    isCreating,
    isUpdating,
  } = useServiceOrders();

  const handleCreateOrder = (data: Parameters<typeof createOrder>[0]) => {
    createOrder(data, {
      onSuccess: () => setCurrentView('orders'),
    });
  };

  const handleOrderClick = (order: ServiceOrder) => {
    setSelectedOrder(order);
    setCurrentView('details');
  };

  const handleBackFromDetails = () => {
    setSelectedOrder(null);
    setCurrentView('orders');
  };

  const handleStatusChange = (status: OrderStatus) => {
    if (selectedOrder) {
      updateOrder({ id: selectedOrder.id, status });
      setSelectedOrder(prev => prev ? { ...prev, status } : null);
    }
  };

  const handleChecklistToggle = (id: string, completed: boolean) => {
    updateChecklistItem({ id, completed });
    setSelectedOrder(prev => {
      if (!prev) return null;
      return {
        ...prev,
        checklist_items: prev.checklist_items?.map(item =>
          item.id === id ? { ...item, completed } : item
        ),
      };
    });
  };

  const handleSignatureSave = (signature: string) => {
    if (selectedOrder) {
      updateOrder({ id: selectedOrder.id, signature_data: signature });
      setSelectedOrder(prev => prev ? { ...prev, signature_data: signature } : null);
    }
  };

  const handleDeleteOrder = () => {
    if (selectedOrder) {
      deleteOrder(selectedOrder.id);
      setSelectedOrder(null);
      setCurrentView('orders');
    }
  };

  const navView = currentView === 'details' ? 'orders' : currentView;

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur-lg border-b border-border">
        <div className="container max-w-lg mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary">
              <Wrench className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground">OS Manager</h1>
              <p className="text-xs text-muted-foreground">Gestão de Ordens de Serviço</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container max-w-lg mx-auto px-4 py-5">
        {currentView === 'dashboard' && (
          <div className="space-y-5 animate-fade-in">
            <div>
              <h2 className="text-lg font-semibold text-foreground mb-4">Dashboard</h2>
              {isLoading ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[...Array(4)].map((_, i) => (
                    <Skeleton key={i} className="h-24 rounded-xl" />
                  ))}
                </div>
              ) : (
                <DashboardStats orders={orders} />
              )}
            </div>

            {orders.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-3">Recentes</h3>
                <div className="space-y-3">
                  {orders.slice(0, 3).map((order) => (
                    <OrderCard
                      key={order.id}
                      order={order}
                      onClick={() => handleOrderClick(order)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {currentView === 'new' && (
          <OrderForm
            onSubmit={handleCreateOrder}
            onCancel={() => setCurrentView('dashboard')}
            isSubmitting={isCreating}
          />
        )}

        {currentView === 'orders' && (
          <div className="space-y-4 animate-fade-in">
            <h2 className="text-lg font-semibold text-foreground">Ordens de Serviço</h2>
            
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-32 rounded-xl" />
                ))}
              </div>
            ) : orders.length === 0 ? (
              <EmptyState onCreateNew={() => setCurrentView('new')} />
            ) : (
              <div className="space-y-3">
                {orders.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    onClick={() => handleOrderClick(order)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {currentView === 'details' && selectedOrder && (
          <OrderDetails
            order={selectedOrder}
            onBack={handleBackFromDetails}
            onStatusChange={handleStatusChange}
            onChecklistItemToggle={handleChecklistToggle}
            onSignatureSave={handleSignatureSave}
            onDelete={handleDeleteOrder}
            isUpdating={isUpdating}
          />
        )}
      </main>

      {/* Bottom Navigation */}
      {currentView !== 'details' && (
        <BottomNav
          activeView={navView}
          onViewChange={(view) => setCurrentView(view)}
        />
      )}
    </div>
  );
}
