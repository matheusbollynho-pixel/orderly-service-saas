import { LayoutDashboard, Plus, ClipboardList, ChartBar, Users, LogOut, Heart, Wallet, Bolt, Circle, Star, Package, ShoppingCart, Gauge, CalendarDays, FileText, HandCoins } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useStore } from '@/contexts/StoreContext';
import { toast } from 'sonner';

type View = 'dashboard' | 'new' | 'express' | 'orders' | 'reports' | 'mechanics' | 'pos-venda' | 'fluxo-caixa' | 'satisfacao' | 'estoque' | 'balcao' | 'quadro' | 'agenda' | 'boletos' | 'fiados';

interface BottomNavProps {
  activeView: View;
  onViewChange: (view: View) => void;
  isAdmin?: boolean;
}

export function BottomNav({ activeView, onViewChange, isAdmin }: BottomNavProps) {
  const { signOut } = useAuth();
  const { permissions } = useStore();

  const handleLogout = async () => {
    await signOut();
    toast.success('Logout realizado com sucesso');
  };

  const navItems = [
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
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-neutral-900 text-white backdrop-blur-md supports-[backdrop-filter]:bg-neutral-900/95">
      <div className="overflow-x-auto scrollbar-hide pt-1 pb-safe">
        <div className="flex items-center justify-around md:justify-around gap-2 px-2 min-w-max md:min-w-0">
          {navItems.map((item) => {
            const Icon = item.icon ?? Circle;
            const isActive = activeView === item.id;
            
            return (
              <button
                key={item.id}
                onClick={() => onViewChange(item.id)}
                className={cn(
                  "appearance-none border-0 bg-transparent flex flex-col items-center gap-1 px-3 py-1.5 rounded-lg transition-all flex-shrink-0",
                  isActive 
                    ? "text-primary bg-white/10" 
                    : "text-gray-300 hover:text-white"
                )}
              >
                <div className={cn(
                  "p-3 rounded-xl transition-all bg-transparent",
                  isActive && "bg-primary/20"
                )}>
                  <Icon className={cn(
                    item.id === 'dashboard' ? "h-10 w-10 transition-transform" : "h-9 w-9 transition-transform",
                    isActive && "scale-110"
                  )} />
                </div>
                <span className="text-[11px] font-semibold whitespace-nowrap">{item.label}</span>
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
  );
}
