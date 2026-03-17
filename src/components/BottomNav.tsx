import { LayoutDashboard, Plus, ClipboardList, ChartBar, Users, LogOut, Heart, Wallet, Bolt, Circle, Star, Package } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

type View = 'dashboard' | 'new' | 'express' | 'orders' | 'reports' | 'mechanics' | 'pos-venda' | 'fluxo-caixa' | 'satisfacao' | 'estoque';

interface BottomNavProps {
  activeView: View;
  onViewChange: (view: View) => void;
  isAdmin?: boolean;
}

export function BottomNav({ activeView, onViewChange, isAdmin }: BottomNavProps) {
  const { signOut, canAccessReports, canAccessCashFlow } = useAuth();

  const handleLogout = async () => {
    await signOut();
    toast.success('Logout realizado com sucesso');
  };

  const navItems = [
    { id: 'dashboard' as const, label: 'Dashboard', icon: LayoutDashboard },
    { id: 'new' as const, label: 'Nova OS', icon: Plus },
    { id: 'express' as const, label: 'Express', icon: Bolt },
    { id: 'orders' as const, label: 'Ordens', icon: ClipboardList },
    ...(canAccessReports ? [
      { id: 'reports' as const, label: 'Relatórios', icon: ChartBar }
    ] : []),
    ...(canAccessCashFlow ? [
      { id: 'fluxo-caixa' as const, label: 'Caixa', icon: Wallet },
      { id: 'estoque' as const, label: 'Estoque', icon: Package },
    ] : []),
    { id: 'mechanics' as const, label: 'Equipe', icon: Users },
    { id: 'pos-venda' as const, label: 'Pós-Venda', icon: Heart },
    { id: 'satisfacao' as const, label: 'Satisfação', icon: Star },
  ];

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
