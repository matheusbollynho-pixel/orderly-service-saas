import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useStore } from '@/contexts/StoreContext';
import { Button } from '@/components/ui/button';
import { CreditCard, Copy, ExternalLink, Loader2, X, AlertTriangle, XCircle } from 'lucide-react';
import { toast } from 'sonner';

function fmtDate(dateStr: string | null) {
  if (!dateStr) return '—';
  const [year, month, day] = dateStr.split('T')[0].split('-');
  return `${day}/${month}/${year}`;
}

function fmtMoney(val: number | null) {
  if (!val) return '—';
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
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

interface SubInfo {
  status: string;
  due_date: string | null;
  amount: number | null;
  plan: string;
}

export function PaymentAlertModal() {
  const { storeId } = useStore();
  const [subInfo, setSubInfo] = useState<SubInfo | null>(null);
  const [show, setShow] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [pixData, setPixData] = useState<PixData | null>(null);
  const [generating, setGenerating] = useState(false);

  const envPlan = import.meta.env.VITE_PLAN as string | undefined;
  const isDemo = import.meta.env.VITE_DEMO === 'true' || window.location.hostname.includes('demo');

  useEffect(() => {
    if (!storeId || envPlan === 'enterprise' || isDemo) return;
    checkSubscription();
  }, [storeId]);

  const checkSubscription = async () => {
    const { data } = await (supabase as any)
      .from('saas_subscriptions')
      .select('status, due_date, amount, plan')
      .eq('store_id', storeId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!data) return;

    const status = data.status as string;
    const dueDate = data.due_date as string | null;

    // Já vencido/cancelado — bloqueia
    if (status === 'overdue' || status === 'cancelled') {
      setSubInfo(data);
      setBlocked(true);
      setShow(true);
      return;
    }

    // Verifica dias restantes
    if (dueDate) {
      const due = new Date(dueDate + 'T12:00:00');
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const diff = Math.floor((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

      if (diff <= 5) {
        setSubInfo(data);
        setBlocked(false);
        setShow(true);
      }
    }
  };

  const gerarPix = async () => {
    if (!storeId) return;
    setGenerating(true);
    setPixData(null);
    try {
      const { data, error } = await supabase.functions.invoke('gerar-cobranca', {
        body: { store_id: storeId },
      });
      if (error || !data?.success) {
        toast.error(data?.error || error?.message || 'Erro ao gerar cobrança');
        return;
      }
      setPixData(data as PixData);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setGenerating(false);
    }
  };

  const copyPix = () => {
    if (!pixData?.pix_code) return;
    navigator.clipboard.writeText(pixData.pix_code);
    toast.success('Código PIX copiado!');
  };

  if (!show || dismissed || envPlan === 'enterprise' || isDemo) return null;

  const daysLeft = subInfo?.due_date
    ? Math.floor((new Date(subInfo.due_date + 'T12:00:00').getTime() - new Date().setHours(0,0,0,0)) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/75">
      <div className="bg-background border border-border rounded-2xl w-full max-w-sm shadow-2xl">
        {/* Header */}
        <div className={`rounded-t-2xl px-5 py-4 flex items-start justify-between ${blocked ? 'bg-red-500/10 border-b border-red-500/20' : 'bg-amber-500/10 border-b border-amber-500/20'}`}>
          <div className="flex items-center gap-3">
            {blocked
              ? <XCircle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
              : <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
            }
            <div>
              <p className={`font-bold text-sm ${blocked ? 'text-red-300' : 'text-amber-300'}`}>
                {blocked ? 'Assinatura vencida' : 'Pagamento próximo do vencimento'}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {blocked
                  ? 'Renove para continuar usando o sistema'
                  : daysLeft === 0
                    ? 'Vence hoje!'
                    : daysLeft && daysLeft < 0
                      ? `Venceu há ${Math.abs(daysLeft)} dias`
                      : `Vence em ${daysLeft} dias — ${fmtDate(subInfo?.due_date ?? null)}`
                }
              </p>
            </div>
          </div>
          {!blocked && (
            <button type="button" aria-label="Fechar" onClick={() => setDismissed(true)} className="text-muted-foreground hover:text-foreground transition-colors">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {!pixData ? (
            <>
              <div className="text-sm text-muted-foreground space-y-1">
                <div className="flex justify-between">
                  <span>Plano</span>
                  <span className="text-foreground font-medium capitalize">{subInfo?.plan === 'pro' ? 'Profissional' : subInfo?.plan === 'premium' ? 'Premium' : 'Básico'}</span>
                </div>
                <div className="flex justify-between">
                  <span>Valor</span>
                  <span className="text-foreground font-medium">{fmtMoney(subInfo?.amount ?? null)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Vencimento</span>
                  <span className={`font-medium ${blocked ? 'text-red-400' : 'text-amber-400'}`}>{fmtDate(subInfo?.due_date ?? null)}</span>
                </div>
              </div>

              <Button
                className="w-full gap-2"
                onClick={gerarPix}
                disabled={generating}
              >
                {generating
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Gerando PIX...</>
                  : <><CreditCard className="h-4 w-4" /> Gerar PIX para pagar</>
                }
              </Button>
            </>
          ) : (
            <div className="space-y-3 text-center">
              <p className="text-xs text-muted-foreground">
                Plano {pixData.plan_label} — {fmtMoney(pixData.amount)} · vence {fmtDate(pixData.due_date)}
              </p>

              {pixData.pix_image && (
                <img
                  src={`data:image/png;base64,${pixData.pix_image}`}
                  alt="QR Code PIX"
                  className="w-44 h-44 mx-auto rounded-xl"
                />
              )}

              {pixData.pix_code && (
                <div className="space-y-2">
                  <div className="bg-neutral-800 rounded-lg p-2 text-xs font-mono text-foreground break-all max-h-16 overflow-auto text-left">
                    {pixData.pix_code}
                  </div>
                  <Button size="sm" variant="outline" className="w-full gap-2 h-8" onClick={copyPix}>
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

              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2 space-y-1">
                <p className="text-xs text-emerald-400 font-medium">✅ Após confirmar o pagamento:</p>
                <p className="text-xs text-muted-foreground">Atualize a página e seu acesso será liberado automaticamente.</p>
              </div>

              <Button
                size="sm"
                variant="ghost"
                className="w-full text-xs text-muted-foreground h-7"
                onClick={() => setPixData(null)}
              >
                Gerar novo PIX
              </Button>
            </div>
          )}
        </div>

        {!blocked && (
          <div className="px-5 pb-4">
            <button
              type="button"
              onClick={() => setDismissed(true)}
              className="w-full text-xs text-muted-foreground hover:text-foreground text-center transition-colors"
            >
              Lembrar mais tarde
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
