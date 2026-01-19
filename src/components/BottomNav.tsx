import { LayoutDashboard, Plus, ClipboardList } from 'lucide-react';
import { cn } from '@/lib/utils';

type View = 'dashboard' | 'new' | 'orders';

interface BottomNavProps {
  activeView: View;
  onViewChange: (view: View) => void;
}

export function BottomNav({ activeView, onViewChange }: BottomNavProps) {
  const navItems = [
    { id: 'dashboard' as const, label: 'Dashboard', icon: LayoutDashboard },
    { id: 'new' as const, label: 'Nova OS', icon: Plus },
    { id: 'orders' as const, label: 'Ordens', icon: ClipboardList },
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
      </div>
    </nav>
  );
}
