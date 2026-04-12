import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useStore } from '@/contexts/StoreContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, CreditCard, Calendar, CheckCircle, AlertTriangle, XCircle, Copy, ExternalLink, Loader2, RefreshCw, Zap } from 'lucide-react';
import { toast } from 'sonner';

interface Subscription {
  plan: string;
  status: 'active' | 'pending' | 'overdue' | 'cancelled';
  amount: number | null;
  due_date: string | null;
  paid_at: string | null;
}

const PLAN_LABELS: Record<string, string> = {
  basic: 'Básico',
  pro: 'Profissional',
  premium: 'Premium',
  enterprise: 'Enterprise',
  trial: 'Trial',
};

const PLAN_COLORS: Record<string, string> = {
  basic: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
  pro: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  premium: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  enterprise: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  trial: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  active:    { label: 'Ativa',      color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30', icon: CheckCircle },
  pending:   { label: 'Pendente',   color: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',   icon: AlertTriangle },
  overdue:   { label: 'Vencida',    color: 'bg-red-500/20 text-red-300 border-red-500/30',             icon: AlertTriangle },
  cancelled: { label: 'Cancelada',  color: 'bg-slate-500/20 text-slate-400 border-slate-500/30',       icon: XCircle },
};

function fmt(dateStr: string | null) {
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

export default function MinhaContaPage() {
  const navigate = useNavigate();
  const { storeId, plan } = useStore();
  const [sub, setSub] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [pixData, setPixData] = useState<PixData | null>(null);

  useEffect(() => {
    if (!storeId) return;
    loadSub();
  }, [storeId]);

  const loadSub = async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from('saas_subscriptions')
      .select('plan, status, amount, due_date, paid_at')
      .eq('store_id', storeId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    setSub(data ?? null);
    setLoading(false);
  };

  const gerarPagamento = async () => {
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
      toast.success('Cobrança PIX gerada!');
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

  const currentPlan = sub?.plan || plan || 'basic';
  const statusCfg = STATUS_CONFIG[sub?.status ?? 'pending'];
  const StatusIcon = statusCfg?.icon ?? AlertTriangle;

  const daysUntil = (dateStr: string | null) => {
    if (!dateStr) return null;
    return Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  };

  const days = daysUntil(sub?.due_date ?? null);

  return (
    <div className="min-h-screen bg-background p-4 max-w-lg mx-auto space-y-4 pb-24">
      <div className="flex items-center gap-3 pt-2">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="gap-2 px-2">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-xl font-bold text-foreground">Minha Conta</h1>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <>
          {/* Plano atual */}
          <Card className="glass-card border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Zap className="h-4 w-4 text-primary" /> Plano atual
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-3">
                <Badge className={`text-sm px-3 py-1 ${PLAN_COLORS[currentPlan]}`}>
                  {PLAN_LABELS[currentPlan] ?? currentPlan}
                </Badge>
                {sub && (
                  <Badge className={`text-xs ${statusCfg?.color}`}>
                    <StatusIcon className="h-3 w-3 mr-1" />
                    {statusCfg?.label}
                  </Badge>
                )}
              </div>

              {sub ? (
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Valor mensal</p>
                    <p className="text-foreground font-semibold">{fmtMoney(sub.amount)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Último pagamento</p>
                    <p className="text-foreground">{fmt(sub.paid_at)}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground">Próximo vencimento</p>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                      <p className="text-foreground">{fmt(sub.due_date)}</p>
                      {days !== null && (
                        <span className={`text-xs font-medium ${days < 0 ? 'text-red-400' : days <= 5 ? 'text-amber-400' : 'text-emerald-400'}`}>
                          {days < 0 ? `venceu há ${Math.abs(days)} dias` : days === 0 ? 'vence hoje' : `${days} dias`}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Nenhuma assinatura encontrada.</p>
              )}
            </CardContent>
          </Card>

          {/* Gerar pagamento */}
          <Card className="glass-card border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <CreditCard className="h-4 w-4" /> Pagar mensalidade
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {!pixData ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    Gere uma cobrança PIX instantânea para renovar sua assinatura.
                  </p>
                  <Button
                    className="w-full gap-2"
                    onClick={gerarPagamento}
                    disabled={generating}
                  >
                    {generating
                      ? <><Loader2 className="h-4 w-4 animate-spin" /> Gerando...</>
                      : <><CreditCard className="h-4 w-4" /> Gerar PIX</>
                    }
                  </Button>
                </>
              ) : (
                <div className="space-y-3">
                  <div className="bg-neutral-800 rounded-xl p-3 text-center space-y-2">
                    <p className="text-xs text-muted-foreground">Plano {pixData.plan_label} — {fmtMoney(pixData.amount)}</p>
                    <p className="text-xs text-muted-foreground">Vencimento: {fmt(pixData.due_date)}</p>

                    {pixData.pix_image && (
                      <img
                        src={`data:image/png;base64,${pixData.pix_image}`}
                        alt="QR Code PIX"
                        className="w-48 h-48 mx-auto rounded-lg"
                      />
                    )}

                    {pixData.pix_code && (
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">Ou copie o código Pix Copia e Cola:</p>
                        <div className="bg-neutral-700 rounded-lg p-2 text-xs font-mono text-foreground break-all max-h-16 overflow-auto">
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
                  </div>

                  <Button
                    size="sm"
                    variant="ghost"
                    className="w-full gap-2 h-8 text-xs"
                    onClick={() => { setPixData(null); }}
                  >
                    <RefreshCw className="h-3.5 w-3.5" /> Gerar nova cobrança
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Suporte */}
          <Card className="glass-card border-border/50">
            <CardContent className="pt-4">
              <p className="text-sm text-muted-foreground mb-3">Precisa de ajuda?</p>
              <Button
                variant="outline"
                className="w-full gap-2"
                onClick={() => window.open('https://wa.me/5575982396239?text=Olá,%20preciso%20de%20suporte%20SpeedSeek%20OS', '_blank')}
              >
                Falar com suporte via WhatsApp
              </Button>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
