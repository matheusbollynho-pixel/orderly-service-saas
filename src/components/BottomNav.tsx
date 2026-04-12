import { LayoutDashboard, Plus, ClipboardList, ChartBar, Users, LogOut, Heart, Wallet, Bolt, Circle, Star, Package, ShoppingCart, Gauge, CalendarDays, FileText, HandCoins, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useStore } from '@/contexts/StoreContext';
import { usePlanFeatures } from '@/hooks/usePlanFeatures';
import { UpgradeModal } from '@/components/UpgradeModal';
import { toast } from 'sonner';
import { useState } from 'react';

type View = 'dashboard' | 'new' | 'express' | 'orders' | 'reports' | 'mechanics' | 'pos-venda' | 'fluxo-caixa' | 'satisfacao' | 'estoque' | 'balcao' | 'quadro' | 'agenda' | 'boletos' | 'fiados';

interface BottomNavProps {
  activeView: View;
  onViewChange: (view: View) => void;
  isAdmin?: boolean;
}

export function BottomNav({ activeView, onViewChange, isAdmin }: BottomNavProps) {
  const { signOut } = useAuth();
  const { permissions } = useStore();
  const { canAccess, getUpgradeLink, getRequiredPlan } = usePlanFeatures();
  const [upgradeModal, setUpgradeModal] = useState<{ feature: string; label: string; requiredPlan: string; upgradeLink: string } | null>(null);

  const handleLogout = async () => {
    await signOut();
    toast.success('Logout realizado com sucesso');
  };

  const handleNavClick = (id: View, label: string) => {
    if (!canAccess(id)) {
      setUpgradeModal({
        feature: label,
        label,
        requiredPlan: getRequiredPlan(id),
        upgradeLink: getUpgradeLink(id),
      });
      return;
    }
    onViewChange(id);
  };

  const allNavItems = [
    { id: 'dashboard' as const, label: 'Dashboard', icon: LayoutDashboard, show: true },
    { id: 'new' as const, label: 'Nova OS', icon: Plus, show: permissions.nova_os },
    { id: 'express' as const, label: 'Express', icon: Bolt, show: permissions.express },
    { id: 'orders' as const, label: 'Ordens', icon: ClipboardList, show: permissions.orders },
    { id: 'agenda' as const, label: 'Agenda', icon: CalendarDays, show: permissions.agenda },
    { id: 'quadro' as const, label: 'Oficina', icon: Gauge, show: permissions.quadro },
    { id: 'fluxo-caixa' as const, label: 'Caixa', icon: Wallet, show: permissions.caixa },
    { id: 'balcao' as const, label: 'Balcão', icon: ShoppingCart, show: permissions.balcao },
    { id: 'reports' as const, label: 'Relatórios', icon: ChartBar, show: permissions.relatorios },
    { id: 'boletos' as const, label: 'Boletos', icon: FileText, show: permissions.boletos },
    { id: 'fiados' as const, label: 'Fiados', icon: HandCoins, show: permissions.fiados },
    { id: 'estoque' as const, label: 'Estoque', icon: Package, show: permissions.estoque },
    { id: 'mechanics' as const, label: 'Equipe', icon: Users, show: permissions.equipe },
    { id: 'pos-venda' as const, label: 'Pós-Venda', icon: Heart, show: permissions.pos_venda },
    { id: 'satisfacao' as const, label: 'Satisfação', icon: Star, show: permissions.satisfacao },
  ].filter(item => item.show);

  return (
    <>
      {upgradeModal && (
        <UpgradeModal
          feature={upgradeModal.feature}
          requiredPlan={upgradeModal.requiredPlan}
          upgradeLink={upgradeModal.upgradeLink}
          onClose={() => setUpgradeModal(null)}
        />
      )}

      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-neutral-900 text-white backdrop-blur-md supports-[backdrop-filter]:bg-neutral-900/95">
        <div className="overflow-x-auto scrollbar-hide pt-1 pb-safe">
          <div className="flex items-center justify-around md:justify-around gap-2 px-2 min-w-max md:min-w-0">
            {allNavItems.map((item) => {
              const Icon = item.icon ?? Circle;
              const isActive = activeView === item.id;
              const locked = !canAccess(item.id);

              return (
                <button
                  key={item.id}
                  onClick={() => handleNavClick(item.id, item.label)}
                  className={cn(
                    "appearance-none border-0 bg-transparent flex flex-col items-center gap-1 px-3 py-1.5 rounded-lg transition-all flex-shrink-0",
                    isActive
                      ? "text-primary bg-white/10"
                      : locked
                        ? "text-gray-600 hover:text-gray-500"
                        : "text-gray-300 hover:text-white"
                  )}
                >
                  <div className={cn(
                    "relative p-3 rounded-xl transition-all bg-transparent",
                    isActive && "bg-primary/20"
                  )}>
                    <Icon className={cn(
                      item.id === 'dashboard' ? "h-10 w-10 transition-transform" : "h-9 w-9 transition-transform",
                      isActive && "scale-110",
                      locked && "opacity-40"
                    )} />
                    {locked && (
                      <div className="absolute -top-1 -right-1 bg-neutral-700 rounded-full p-0.5">
                        <Lock className="h-3 w-3 text-yellow-400" />
                      </div>
                    )}
                  </div>
                  <span className={cn("text-[11px] font-semibold whitespace-nowrap", locked && "opacity-40")}>{item.label}</span>
                </button>
              );
            })}
            <button
              onClick={handleLogout}
              className="appearance-none border-0 bg-transparent flex flex-col items-center gap-1 px-3 py-1.5 rounded-lg transition-all text-muted-foreground hover:text-destructive flex-shrink-0"
            >
              <div className="p-3 rounded-xl transition-all hover:bg-destructive/10">
                <LogOut className="h-9 w-9" />
              </div>
              <span className="text-[11px] font-semibold whitespace-nowrap">Sair</span>
            </button>
          </div>
        </div>
      </nav>
    </>
  );
}
