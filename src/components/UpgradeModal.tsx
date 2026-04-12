import { X, Lock, Zap, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { UPGRADE_LINKS } from '@/hooks/usePlanFeatures';

const PRO_FEATURES = [
  'Balcão / PDV',
  'Estoque completo',
  'Fluxo de caixa e relatórios',
  'Pesquisa de satisfação',
  'WhatsApp automático completo',
  'Lembretes de manutenção e aniversário',
  'Fiados e crédito de clientes',
  'Boletos e contas a pagar',
  'Usuários ilimitados',
];

interface UpgradeModalProps {
  feature: string;
  requiredPlan: string;
  upgradeLink: string;
  onClose: () => void;
}

export function UpgradeModal({ feature, requiredPlan, upgradeLink, onClose }: UpgradeModalProps) {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-neutral-900 border border-border rounded-2xl w-full max-w-md p-6 relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-muted-foreground hover:text-foreground">
          <X className="h-5 w-5" />
        </button>

        <div className="flex flex-col items-center text-center mb-6">
          <div className="bg-primary/10 p-4 rounded-full mb-4">
            <Lock className="h-8 w-8 text-primary" />
          </div>
          <h2 className="text-xl font-bold text-foreground mb-1">Funcionalidade bloqueada</h2>
          <p className="text-muted-foreground text-sm">
            <span className="text-foreground font-medium">{feature}</span> está disponível no plano{' '}
            <span className="text-primary font-semibold">{requiredPlan}</span>
          </p>
        </div>

        <div className="bg-neutral-800 rounded-xl p-4 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Star className="h-4 w-4 text-yellow-400" />
            <span className="text-sm font-semibold text-foreground">Plano Profissional — R$ 149/mês</span>
          </div>
          <ul className="space-y-1.5">
            {PRO_FEATURES.map((f) => (
              <li key={f} className="flex items-center gap-2 text-xs text-muted-foreground">
                <Zap className="h-3 w-3 text-primary flex-shrink-0" />
                {f}
              </li>
            ))}
          </ul>
        </div>

        <Button
          className="w-full bg-primary hover:bg-primary/90 text-white font-bold text-base py-6"
          onClick={() => window.open(upgradeLink, '_blank')}
        >
          🚀 Fazer upgrade agora
        </Button>

        <p className="text-center text-xs text-muted-foreground mt-3">
          Seus dados são preservados ao trocar de plano
        </p>
      </div>
    </div>
  );
}
