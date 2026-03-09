import { OrderStatus, STATUS_LABELS } from '@/types/service-order';
import { Clock, Loader2, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatusBadgeProps {
  status: OrderStatus;
  className?: string;
}

const statusConfig = {
  aberta: {
    icon: Clock,
    className: 'status-badge-open',
  },
  em_andamento: {
    icon: Loader2,
    className: 'status-badge-progress',
  },
  concluida: {
    icon: CheckCircle2,
    className: 'status-badge-done',
  },
  concluida_entregue: {
    icon: CheckCircle2,
    className: 'status-badge-done',
  },
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status];
  if (!config) {
    return (
      <span className={cn('status-badge', className)}>
        {STATUS_LABELS[status] ?? 'Status'}
      </span>
    );
  }
  const Icon = config.icon;

  return (
    <span className={cn('status-badge', config.className, className)}>
      <Icon className={cn('h-3.5 w-3.5', status === 'em_andamento' && 'animate-spin')} />
      {STATUS_LABELS[status]}
    </span>
  );
}
