import { ChecklistItem } from '@/types/service-order';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';

interface ChecklistProps {
  items: ChecklistItem[];
  onItemToggle: (id: string, completed: boolean) => void;
  disabled?: boolean;
}

export function Checklist({ items, onItemToggle, disabled }: ChecklistProps) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-foreground">
        Checklist de Serviço
      </label>
      <div className="space-y-2">
        {items.map((item, index) => (
          <div 
            key={item.id}
            className={cn(
              "flex items-center gap-3 p-3 rounded-lg border transition-all animate-fade-in",
              item.completed 
                ? "bg-status-done/5 border-status-done/20" 
                : "bg-card border-border hover:border-primary/30"
            )}
            style={{ animationDelay: `${index * 50}ms` }}
          >
            <Checkbox
              id={item.id}
              checked={item.completed}
              onCheckedChange={(checked) => onItemToggle(item.id, checked as boolean)}
              disabled={disabled}
              className="data-[state=checked]:bg-status-done data-[state=checked]:border-status-done"
            />
            <label 
              htmlFor={item.id}
              className={cn(
                "flex-1 text-sm cursor-pointer transition-colors",
                item.completed ? "text-muted-foreground line-through" : "text-foreground"
              )}
            >
              {item.label}
            </label>
            {item.completed && (
              <span className="text-xs text-status-done font-medium">✓</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
