import { LayoutDashboard, Plus, ClipboardList, ChartBar, Users, LogOut, Heart } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

type View = 'dashboard' | 'new' | 'orders' | 'reports' | 'mechanics' | 'pos-venda';

interface BottomNavProps {
  activeView: View;
  onViewChange: (view: View) => void;
  isAdmin?: boolean;
}

export function BottomNav({ activeView, onViewChange, isAdmin }: BottomNavProps) {
  const { signOut } = useAuth();

  const handleLogout = async () => {
    await signOut();
    toast.success('Logout realizado com sucesso');
  };

  const navItems = [
    { id: 'dashboard' as const, label: 'Dashboard', icon: LayoutDashboard },
    { id: 'new' as const, label: 'Nova OS', icon: Plus },
    { id: 'orders' as const, label: 'Ordens', icon: ClipboardList },
    ...(isAdmin ? [{ id: 'reports' as const, label: 'Relatórios', icon: ChartBar }] : []),
    { id: 'mechanics' as const, label: 'Mecânicos', icon: Users },
    { id: 'pos-venda' as const, label: 'Pós-Venda', icon: Heart },
  ];

  return (
    <nav className="bottom-nav">
      <div className="flex items-center justify-around py-2 pb-safe">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeView === item.id;
          
          return (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id)}
              className={cn(
                "flex flex-col items-center gap-1 px-4 py-2 rounded-lg transition-all",
                isActive 
                  ? "text-primary" 
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <div className={cn(
                "p-2 rounded-xl transition-all",
                isActive && "bg-primary/10"
              )}>
                <Icon className={cn(
                  "h-5 w-5 transition-transform",
                  isActive && "scale-110"
                )} />
              </div>
              <span className="text-xs font-medium">{item.label}</span>
            </button>
          );
        })}
        <button
          onClick={handleLogout}
          className="flex flex-col items-center gap-1 px-4 py-2 rounded-lg transition-all text-muted-foreground hover:text-destructive"
        >
          <div className="p-2 rounded-xl transition-all hover:bg-destructive/10">
            <LogOut className="h-5 w-5" />
          </div>
          <span className="text-xs font-medium">Sair</span>
        </button>
      </div>
    </nav>
  );
}
