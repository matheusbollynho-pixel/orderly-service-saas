import { useState } from 'react';
import { X, Lock, Zap, Star, Diamond, CreditCard, Copy, Loader2, ExternalLink, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useStore } from '@/contexts/StoreContext';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const PLAN_CONFIG = {
  pro: {
    id: 'pro',
    label: 'Profissional',
    price: 'R$ 149',
    period: '/mês',
    color: 'border-blue-500/50 bg-blue-500/5',
    badgeColor: 'bg-blue-500/20 text-blue-300',
    buttonClass: 'bg-blue-600 hover:bg-blue-700 text-white',
    icon: Star,
    popular: true,
    features: [
      'Balcão / PDV',
      'Estoque completo',
      'Fluxo de caixa e relatórios',
      'Pesquisa de satisfação',
      'WhatsApp automático completo',
      'Lembretes de manutenção',
      'Fiados e crédito de clientes',
      'Boletos e contas a pagar',
      'Usuários ilimitados',
    ],
  },
  premium: {
    id: 'premium',
    label: 'Premium',
    price: 'R$ 219',
    period: '/mês',
    color: 'border-amber-500/50 bg-amber-500/5',
    badgeColor: 'bg-amber-500/20 text-amber-300',
    buttonClass: 'bg-amber-600 hover:bg-amber-700 text-white',
    icon: Diamond,
    popular: false,
    features: [
      'Tudo do Profissional',
      'IA de atendimento 24h no WhatsApp',
      'IA de estoque inteligente',
      'Domínio próprio',
      'Logo personalizada no sistema',
      'Suporte prioritário',
      'Onboarding personalizado',
    ],
  },
} as const;

interface UpgradeModalProps {
  feature: string;
  requiredPlan: string;
  upgradeLink: string;
  onClose: () => void;
}

interface PixData {
  payment_id: string;
  invoice_url: string;
  pix_code: string | null;
  pix_image: string | null;
  amount: number;
  due_date: string;
  plan_label: string;
  plan: string;
}

export function UpgradeModal({ feature, requiredPlan, upgradeLink, onClose }: UpgradeModalProps) {
  const { storeId, plan: currentPlan } = useStore();
  const [generating, setGenerating] = useState<string | null>(null); // planId being generated
  const [pixData, setPixData] = useState<PixData | null>(null);

  const gerarPix = async (planId: 'pro' | 'premium') => {
    if (!storeId) {
      window.open(upgradeLink, '_blank');
      return;
    }
    setGenerating(planId);
    try {
      const { data, error } = await supabase.functions.invoke('gerar-cobranca', {
        body: { store_id: storeId, plan: planId },
      });
      if (error || !data?.success) {
        toast.error(data?.error || 'Erro ao gerar cobrança. Tente novamente.');
        return;
      }
      setPixData(data as PixData);
    } catch {
      toast.error('Erro inesperado. Tente novamente.');
    } finally {
      setGenerating(null);
    }
  };

  const copyPix = () => {
    if (!pixData?.pix_code) return;
    navigator.clipboard.writeText(pixData.pix_code);
    toast.success('Código PIX copiado!');
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-neutral-900 border border-border rounded-2xl w-full max-w-lg p-6 relative max-h-[90vh] overflow-y-auto">
        <button type="button" aria-label="Fechar" onClick={onClose} className="absolute top-4 right-4 text-muted-foreground hover:text-foreground">
          <X className="h-5 w-5" />
        </button>

        {!pixData ? (
          <>
            {/* Header */}
            <div className="flex flex-col items-center text-center mb-6">
              <div className="bg-primary/10 p-3 rounded-full mb-3">
                <Lock className="h-7 w-7 text-primary" />
              </div>
              <h2 className="text-xl font-bold text-foreground mb-1">Funcionalidade bloqueada</h2>
              <p className="text-muted-foreground text-sm">
                <span className="text-foreground font-medium">{feature}</span> requer upgrade de plano
              </p>
            </div>

            {/* Cards dos planos */}
            <div className="grid grid-cols-2 gap-3 mb-5">
              {(['pro', 'premium'] as const).map((planKey) => {
                const plan = PLAN_CONFIG[planKey];
                const Icon = plan.icon;
                const isGenerating = generating === planKey;
                const isCurrentPlan = currentPlan === planKey;

                return (
                  <div
                    key={planKey}
                    className={cn('rounded-xl border p-4 flex flex-col', plan.color, isCurrentPlan && 'opacity-60')}
                  >
                    {/* Badge popular */}
                    <div className="flex items-center justify-between mb-3">
                      <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full', plan.badgeColor)}>
                        {plan.label}
                      </span>
                      {isCurrentPlan ? (
                        <span className="text-xs bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-1.5 py-0.5 rounded-full font-medium">
                          Plano atual
                        </span>
                      ) : plan.popular && (
                        <span className="text-xs bg-primary/20 text-primary border border-primary/30 px-1.5 py-0.5 rounded-full font-medium">
                          Popular
                        </span>
                      )}
                    </div>

                    {/* Preço */}
                    <div className="mb-3">
                      <span className="text-2xl font-bold text-foreground">{plan.price}</span>
                      <span className="text-xs text-muted-foreground">{plan.period}</span>
                    </div>

                    {/* Features */}
                    <ul className="space-y-1.5 mb-4 flex-1">
                      {plan.features.map((f) => (
                        <li key={f} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                          <CheckCircle className="h-3 w-3 text-emerald-400 shrink-0 mt-0.5" />
                          {f}
                        </li>
                      ))}
                    </ul>

                    {/* Botão */}
                    <Button
                      size="sm"
                      className={cn('w-full gap-1.5 h-9 text-xs font-semibold', isCurrentPlan ? 'bg-emerald-600/40 text-emerald-300 cursor-default' : plan.buttonClass)}
                      onClick={() => !isCurrentPlan && gerarPix(planKey)}
                      disabled={!!generating || isCurrentPlan}
                    >
                      {isCurrentPlan
                        ? <><CheckCircle className="h-3.5 w-3.5" /> Plano atual</>
                        : isGenerating
                          ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Gerando...</>
                          : <><CreditCard className="h-3.5 w-3.5" /> Assinar via PIX</>
                      }
                    </Button>
                  </div>
                );
              })}
            </div>

            <p className="text-center text-xs text-muted-foreground">
              Após o pagamento o plano é atualizado automaticamente
            </p>
          </>
        ) : (
          <>
            {/* PIX gerado */}
            <div className="flex flex-col items-center text-center mb-4">
              <div className="bg-emerald-500/10 p-3 rounded-full mb-3">
                <CreditCard className="h-7 w-7 text-emerald-400" />
              </div>
              <h2 className="text-xl font-bold text-foreground mb-1">PIX gerado!</h2>
              <p className="text-sm text-muted-foreground">
                Plano <span className="text-foreground font-semibold">{pixData.plan_label}</span>
                {' — '}
                <span className="text-foreground font-semibold">
                  {pixData.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </span>
              </p>
            </div>

            {pixData.pix_image && (
              <div className="flex justify-center mb-4">
                <img
                  src={`data:image/png;base64,${pixData.pix_image}`}
                  alt="QR Code PIX"
                  className="w-44 h-44 rounded-xl"
                />
              </div>
            )}

            {pixData.pix_code && (
              <div className="space-y-2 mb-4">
                <p className="text-xs text-muted-foreground text-center">Pix Copia e Cola:</p>
                <div className="bg-neutral-800 rounded-lg p-2 text-xs font-mono text-foreground break-all max-h-16 overflow-auto">
                  {pixData.pix_code}
                </div>
                <Button size="sm" className="w-full gap-2 h-9" onClick={copyPix}>
                  <Copy className="h-3.5 w-3.5" /> Copiar código PIX
                </Button>
              </div>
            )}

            {pixData.invoice_url && (
              <Button
                size="sm"
                variant="ghost"
                className="w-full gap-2 h-8 text-xs text-muted-foreground"
                onClick={() => window.open(pixData.invoice_url, '_blank')}
              >
                <ExternalLink className="h-3.5 w-3.5" /> Ver fatura completa
              </Button>
            )}

            <button
              type="button"
              className="w-full text-xs text-muted-foreground hover:text-foreground mt-2 py-1"
              onClick={() => setPixData(null)}
            >
              ← Voltar para planos
            </button>

            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2 mt-2 space-y-1">
              <p className="text-xs text-emerald-400 font-medium text-center">✅ Após confirmar o pagamento:</p>
              <p className="text-xs text-muted-foreground text-center">Atualize a página e seu novo plano será liberado automaticamente.</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
