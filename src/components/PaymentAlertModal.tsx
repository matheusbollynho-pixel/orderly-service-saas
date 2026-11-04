import { useEffect, useRef, useState } from 'react';
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
  const { storeId, isOwner } = useStore();
  const [subInfo, setSubInfo] = useState<SubInfo | null>(null);
  // Loja em teste grátis: data em que o teste acaba (null = não é teste)
  const [trialEndsAt, setTrialEndsAt] = useState<string | null>(null);
  const [precisaDocumento, setPrecisaDocumento] = useState(false);
  const [documento, setDocumento] = useState('');
  const [show, setShow] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [motivo, setMotivo] = useState<string | null>(null);
  const [pixData, setPixData] = useState<PixData | null>(null);
  const [generating, setGenerating] = useState(false);
  const [checking, setChecking] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const envPlan = import.meta.env.VITE_PLAN as string | undefined;
  // Só a env de demo libera. (O hostname não serve: o deploy de produção
  // também se chama speedseekos-demo.vercel.app.) Contas demo são liberadas
  // pelo trial_ends_at longo no banco.
  const isDemo = import.meta.env.VITE_DEMO === 'true';

  useEffect(() => {
    if (!storeId || envPlan === 'enterprise' || isDemo) return;
    checkSubscription();
    // Quem deixa a aba aberta o dia todo também precisa ser conferido
    const timer = setInterval(checkSubscription, 30 * 60 * 1000);
    const onFocus = () => checkSubscription();
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(timer); window.removeEventListener('focus', onFocus); };
  }, [storeId]);

  // A regra mora no banco (situacao_loja) — a mesma que o SuperAdmin mostra.
  const checkSubscription = async () => {
    const { data, error } = await (supabase as any).rpc('situacao_loja', { p_store_id: storeId });
    // Falha de rede/banco não trava ninguém
    if (error || !data) return;

    if (data.situacao === 'liberada') {
      setShow(false);
      setBlocked(false);
      return;
    }

    setMotivo(data.motivo);
    setTrialEndsAt(data.eh_teste ? data.vencimento : null);
    setSubInfo({ status: data.motivo, due_date: data.vencimento ?? null, amount: data.valor ?? null, plan: data.plano });
    setBlocked(data.situacao === 'bloqueada');
    if (data.situacao === 'bloqueada') setDismissed(false);
    setShow(true);
  };

  // Inicia polling quando PIX é exibido
  // Bloqueado: aguarda status virar 'active'
  // Aviso (vence em breve): aguarda due_date mudar para data futura (>5 dias)
  useEffect(() => {
    if (!pixData || !storeId) return;
    const initialDueDate = subInfo?.due_date;
    pollRef.current = setInterval(async () => {
      setChecking(true);
      try {
        const { data } = await (supabase as any).rpc('situacao_loja', { p_store_id: storeId });
        if (!data) return;
        // Pagou = saiu do bloqueio, ou o vencimento andou pra frente
        const paid = blocked
          ? data.situacao !== 'bloqueada'
          : data.situacao === 'liberada' || data.vencimento !== initialDueDate;
        if (paid) {
          clearInterval(pollRef.current!);
          toast.success('Pagamento confirmado! 🎉');
          setShow(false);
          setDismissed(true);
        }
      } finally {
        setChecking(false);
      }
    }, 15000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [pixData, storeId]);

  const gerarPix = async () => {
    if (!storeId) return;
    setGenerating(true);
    setPixData(null);
    try {
      const { data, error } = await supabase.functions.invoke('gerar-cobranca', {
        body: { store_id: storeId, ...(documento ? { cpf_cnpj: documento } : {}) },
      });
      if (data?.precisa_documento) {
        // Antes só aparecia o campo, sem aviso — parecia que o botão não fazia nada
        setPrecisaDocumento(true);
        toast.error(documento ? data.error : 'Digite o CPF ou CNPJ do responsável no campo acima e clique de novo');
        setTimeout(() => document.getElementById('pix-documento')?.focus(), 50);
        return;
      }
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

  const trialDaysLeft = trialEndsAt
    ? Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / 86400000)
    : null;

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
                {trialEndsAt
                  ? (blocked ? 'Seu teste grátis acabou' : 'Seu teste grátis está acabando')
                  : motivo === 'desativada' ? 'Acesso suspenso'
                  : motivo === 'cancelada' ? 'Assinatura cancelada'
                  : (blocked ? 'Assinatura vencida' : 'Pagamento próximo do vencimento')}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {trialEndsAt
                  ? (blocked
                    ? 'Assine para continuar usando o sistema'
                    : trialDaysLeft !== null && trialDaysLeft <= 1
                      ? 'Último dia do teste — assine para não perder o acesso'
                      : `Termina em ${trialDaysLeft} dias — ${fmtDate(trialEndsAt)}`)
                  : blocked
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
                  <span>{trialEndsAt ? 'Fim do teste' : 'Vencimento'}</span>
                  <span className={`font-medium ${blocked ? 'text-red-400' : 'text-amber-400'}`}>{fmtDate(subInfo?.due_date ?? null)}</span>
                </div>
              </div>

              {!isOwner ? (
                <p className="text-sm text-center text-muted-foreground">
                  Peça ao dono da loja para entrar no sistema e fazer o pagamento.
                </p>
              ) : (
                <>
                  {precisaDocumento && (
                    <div className="space-y-1">
                      <label htmlFor="pix-documento" className="text-xs text-muted-foreground">CPF ou CNPJ do responsável</label>
                      <input
                        id="pix-documento"
                        inputMode="numeric"
                        value={documento}
                        onChange={e => setDocumento(e.target.value)}
                        placeholder="Somente números"
                        className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm"
                      />
                    </div>
                  )}
                  <Button
                    className="w-full gap-2"
                    onClick={gerarPix}
                    disabled={generating || (precisaDocumento && documento.replace(/\D/g, '').length < 11)}
                  >
                    {generating
                      ? <><Loader2 className="h-4 w-4 animate-spin" /> Gerando PIX...</>
                      : <><CreditCard className="h-4 w-4" /> {trialEndsAt ? 'Assinar com PIX' : 'Gerar PIX para pagar'}</>
                    }
                  </Button>
                </>
              )}
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
                {checking
                  ? <p className="text-xs text-emerald-400 font-medium flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" /> Verificando pagamento...</p>
                  : <p className="text-xs text-emerald-400 font-medium">✅ Verificação automática a cada 15s</p>
                }
                <p className="text-xs text-muted-foreground">Seu acesso será liberado automaticamente após o pagamento.</p>
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
