import { useState } from 'react';
import { X, Lock, Zap, Star, CreditCard, Copy, Loader2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useStore } from '@/contexts/StoreContext';
import { toast } from 'sonner';

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

interface PixData {
  payment_id: string;
  invoice_url: string;
  pix_code: string | null;
  pix_image: string | null;
  amount: number;
  due_date: string;
  plan_label: string;
}

export function UpgradeModal({ feature, requiredPlan, upgradeLink, onClose }: UpgradeModalProps) {
  const { storeId } = useStore();
  const [generating, setGenerating] = useState(false);
  const [pixData, setPixData] = useState<PixData | null>(null);

  const gerarPix = async () => {
    if (!storeId) {
      // Sem store_id (ex: demo), abre link estático
      window.open(upgradeLink, '_blank');
      return;
    }
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('gerar-cobranca', {
        body: { store_id: storeId, plan: 'pro' },
      });
      if (error || !data?.success) {
        toast.error(data?.error || 'Erro ao gerar cobrança. Tente pelo link.');
        window.open(upgradeLink, '_blank');
        return;
      }
      setPixData(data as PixData);
    } catch {
      window.open(upgradeLink, '_blank');
    } finally {
      setGenerating(false);
    }
  };

  const copyPix = () => {
    if (!pixData?.pix_code) return;
    navigator.clipboard.writeText(pixData.pix_code);
    toast.success('Código PIX copiado!');
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-neutral-900 border border-border rounded-2xl w-full max-w-md p-6 relative max-h-[90vh] overflow-y-auto">
        <button type="button" aria-label="Fechar" onClick={onClose} className="absolute top-4 right-4 text-muted-foreground hover:text-foreground">
          <X className="h-5 w-5" />
        </button>

        {!pixData ? (
          <>
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
              className="w-full bg-primary hover:bg-primary/90 text-white font-bold text-base py-6 gap-2"
              onClick={gerarPix}
              disabled={generating}
            >
              {generating
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Gerando PIX...</>
                : <><CreditCard className="h-4 w-4" /> Fazer upgrade via PIX</>
              }
            </Button>

            <p className="text-center text-xs text-muted-foreground mt-3">
              Após o pagamento o plano é atualizado automaticamente
            </p>
          </>
        ) : (
          <>
            <div className="flex flex-col items-center text-center mb-4">
              <div className="bg-emerald-500/10 p-4 rounded-full mb-3">
                <CreditCard className="h-8 w-8 text-emerald-400" />
              </div>
              <h2 className="text-xl font-bold text-foreground mb-1">PIX gerado!</h2>
              <p className="text-sm text-muted-foreground">
                Plano {pixData.plan_label} —{' '}
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
                  className="w-48 h-48 rounded-xl"
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

            <p className="text-center text-xs text-muted-foreground mt-3">
              Após o pagamento seu plano é atualizado automaticamente 🚀
            </p>
          </>
        )}
      </div>
    </div>
  );
}
