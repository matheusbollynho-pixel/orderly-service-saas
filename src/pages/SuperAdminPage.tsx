import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useSuperAdmin } from '@/hooks/useSuperAdmin';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  Loader2, Users, CheckCircle, XCircle, ChevronRight, ArrowLeft, Plus,
  Wifi, WifiOff, Pencil, Save, Calendar, DollarSign, AlertTriangle,
  Ban, RefreshCw, Phone, Building2, CreditCard, FlaskConical, Bolt
} from 'lucide-react';
import { toast } from 'sonner';

interface Subscription {
  id: string;
  asaas_payment_id: string | null;
  asaas_customer_id: string | null;
  plan: string;
  status: 'pending' | 'active' | 'overdue' | 'cancelled';
  owner_name: string;
  owner_email: string;
  owner_phone: string | null;
  amount: number | null;
  due_date: string | null;
  paid_at: string | null;
  created_at: string;
}

interface StoreClient {
  store_id: string;
  company_name: string | null;
  store_phone: string | null;
  plan: string | null;
  active: boolean | null;
  created_at: string;
  whatsapp_instance_url: string | null;
  whatsapp_instance_token: string | null;
  whatsapp_provider: string | null;
  subscription: Subscription | null;
  custom_features: string[] | null;
}

const ALL_FEATURES = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'new', label: 'Nova OS' },
  { id: 'express', label: 'Express' },
  { id: 'orders', label: 'Ordens' },
  { id: 'agenda', label: 'Agenda' },
  { id: 'quadro', label: 'Oficina' },
  { id: 'fluxo-caixa', label: 'Caixa' },
  { id: 'balcao', label: 'Balcão' },
  { id: 'reports', label: 'Relatórios' },
  { id: 'boletos', label: 'Boletos' },
  { id: 'fiados', label: 'Fiados' },
  { id: 'estoque', label: 'Estoque' },
  { id: 'mechanics', label: 'Equipe' },
  { id: 'pos-venda', label: 'Pós-Venda' },
  { id: 'satisfacao', label: 'Satisfação' },
];

const BASIC_FEATURES = ['dashboard', 'new', 'express', 'orders', 'agenda', 'quadro', 'mechanics'];
const ALL_FEATURE_IDS = ALL_FEATURES.map(f => f.id);
const PLAN_FEATURES_BY_PLAN: Record<string, string[]> = {
  trial: BASIC_FEATURES,
  basic: BASIC_FEATURES,
  pro: ALL_FEATURE_IDS,
  premium: ALL_FEATURE_IDS,
  enterprise: ALL_FEATURE_IDS,
};

const PLAN_LABELS: Record<string, string> = {
  basic: 'Básico',
  pro: 'Profissional',
  premium: 'Premium',
};

const PLAN_COLORS: Record<string, string> = {
  basic: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
  pro: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  premium: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  active:    { label: 'Ativo',      color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30', icon: CheckCircle },
  pending:   { label: 'Pendente',   color: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',   icon: AlertTriangle },
  overdue:   { label: 'Vencido',    color: 'bg-red-500/20 text-red-300 border-red-500/30',             icon: AlertTriangle },
  cancelled: { label: 'Cancelado',  color: 'bg-slate-500/20 text-slate-400 border-slate-500/30',       icon: XCircle },
};

function fmt(dateStr: string | null) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('pt-BR');
}

function fmtMoney(val: number | null) {
  if (!val) return '—';
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export default function SuperAdminPage() {
  const navigate = useNavigate();
  const { isSuperAdmin, loading: authLoading } = useSuperAdmin();
  const [clients, setClients] = useState<StoreClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<StoreClient | null>(null);
  const [testingWpp, setTestingWpp] = useState(false);
  const [wppStatus, setWppStatus] = useState<string | null>(null);
  const [showNewClient, setShowNewClient] = useState(false);
  const [showDemo, setShowDemo] = useState(false);
  const [creating, setCreating] = useState(false);
  const [creatingDemo, setCreatingDemo] = useState(false);
  const [demoClient, setDemoClient] = useState({ company_name: '', owner_email: '', owner_password: '', store_phone: '' });
  const [saving, setSaving] = useState(false);
  const [editWpp, setEditWpp] = useState(false);
  const [editPlan, setEditPlan] = useState(false);
  const [editSub, setEditSub] = useState(false);
  const [editFeatures, setEditFeatures] = useState(false);
  const [customFeatures, setCustomFeatures] = useState<string[] | null>(null);
  const [wppUrl, setWppUrl] = useState('');
  const [wppToken, setWppToken] = useState('');
  const [wppProvider, setWppProvider] = useState('uazapi');
  const [newPlan, setNewPlan] = useState('basic');
  const [subDueDate, setSubDueDate] = useState('');
  const [subStatus, setSubStatus] = useState('active');
  const [subAmount, setSubAmount] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const [newClient, setNewClient] = useState({
    company_name: '',
    store_phone: '',
    owner_name: '',
    owner_email: '',
    owner_password: '',
    plan: 'basic',
    amount: '',
    due_date: '',
    whatsapp_instance_url: '',
    whatsapp_instance_token: '',
  });

  useEffect(() => {
    if (!authLoading && !isSuperAdmin) navigate('/');
  }, [authLoading, isSuperAdmin]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    loadClients();
  }, [isSuperAdmin]);

  useEffect(() => {
    if (selected) {
      setWppUrl(selected.whatsapp_instance_url || '');
      setWppToken(selected.whatsapp_instance_token || '');
      setWppProvider(selected.whatsapp_provider || 'uazapi');
      setNewPlan(selected.plan || 'basic');
      setSubStatus(selected.subscription?.status || 'active');
      setSubAmount(selected.subscription?.amount?.toString() || '');
      setCustomFeatures(selected.custom_features ?? null);
      // Se não tem due_date, defaulta para o dia 10 do próximo mês
      const existingDue = selected.subscription?.due_date;
      if (!existingDue) {
        const now = new Date();
        const year = now.getDate() < 10 ? now.getFullYear() : (now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear());
        const month = now.getDate() < 10 ? now.getMonth() : (now.getMonth() === 11 ? 0 : now.getMonth() + 1);
        setSubDueDate(`${year}-${String(month + 1).padStart(2, '0')}-10`);
      } else {
        setSubDueDate(existingDue);
      }
      setWppStatus(null);
      setEditWpp(false);
      setEditPlan(false);
      setEditSub(false);
      setEditFeatures(false);
    }
  }, [selected]);

  const loadClients = async () => {
    setLoading(true);
    const sb = supabase as any;

    const { data: stores } = await sb
      .from('store_settings')
      .select('id, company_name, store_phone, plan, active, created_at, whatsapp_instance_url, whatsapp_instance_token, whatsapp_provider, custom_features')
      .order('created_at', { ascending: false });

    if (!stores) { setLoading(false); return; }

    const { data: subs } = await sb
      .from('saas_subscriptions')
      .select('*')
      .order('created_at', { ascending: false });

    const subsByStore: Record<string, Subscription> = {};
    (subs || []).forEach((s: any) => {
      if (s.store_id && !subsByStore[s.store_id]) subsByStore[s.store_id] = s;
    });

    const result: StoreClient[] = stores.map((s: any) => ({
      store_id: s.id,
      company_name: s.company_name,
      store_phone: s.store_phone,
      plan: s.plan,
      active: s.active,
      created_at: s.created_at,
      whatsapp_instance_url: s.whatsapp_instance_url,
      whatsapp_instance_token: s.whatsapp_instance_token,
      whatsapp_provider: s.whatsapp_provider,
      custom_features: s.custom_features ?? null,
      subscription: subsByStore[s.id] ?? null,
    }));

    setClients(result);
    setLoading(false);
  };

  const toggleActive = async (storeId: string, current: boolean | null) => {
    await (supabase as any).from('store_settings').update({ active: !current }).eq('id', storeId);
    toast.success(`Loja ${!current ? 'ativada' : 'desativada'}`);
    setClients(prev => prev.map(c => c.store_id === storeId ? { ...c, active: !current } : c));
    if (selected?.store_id === storeId) setSelected(prev => prev ? { ...prev, active: !current } : null);
  };

  const cancelSubscription = async () => {
    if (!selected?.subscription) return;
    if (!confirm('Cancelar assinatura? O cliente perderá acesso.')) return;
    const sb = supabase as any;
    await sb.from('saas_subscriptions').update({ status: 'cancelled' }).eq('id', selected.subscription.id);
    await sb.from('store_settings').update({ active: false }).eq('id', selected.store_id);
    toast.success('Assinatura cancelada');
    loadClients();
    setSelected(null);
  };

  const testWhatsApp = async () => {
    if (!wppUrl || !wppToken) return;
    setTestingWpp(true);
    setWppStatus(null);
    try {
      const base = wppUrl.replace(/\/$/, '');
      const headers = { token: wppToken, 'Content-Type': 'application/json' };

      const res = await fetch(`${base}/instance/status`, { headers }).catch(() => null);

      if (!res || res.status === 404) {
        toast.error('Endpoint não encontrado — verifique a URL');
        setWppStatus('erro');
        return;
      }

      const raw = await res.text().catch(() => '{}');
      let data: any = {};
      try { data = JSON.parse(raw); } catch { /* ignore */ }

      // UazAPI pode retornar data.state como objeto {connected, jid, loggedIn, resetting}
      const stateRaw = data?.instance?.state ?? data?.state ?? data?.status ?? data?.connectionState;
      let state: string;
      if (typeof stateRaw === 'object' && stateRaw !== null) {
        state = stateRaw.connected ? 'connected' : 'disconnected';
      } else if (typeof stateRaw === 'boolean') {
        state = stateRaw ? 'connected' : 'disconnected';
      } else {
        state = String(stateRaw ?? (res.ok ? 'connected' : 'desconhecido'));
      }

      setWppStatus(state);
      if (state === 'open' || state === 'connected') {
        toast.success(`WhatsApp conectado ✅`);
      } else {
        toast.warning(`Status: ${state}`);
      }
    } catch {
      toast.error('Erro ao conectar na instância');
      setWppStatus('erro');
    } finally {
      setTestingWpp(false);
    }
  };

  const saveWpp = async () => {
    if (!selected) return;
    setSaving(true);
    const { error } = await (supabase as any).from('store_settings').update({
      whatsapp_instance_url: wppUrl || null,
      whatsapp_instance_token: wppToken || null,
      whatsapp_provider: wppProvider || null,
    }).eq('id', selected.store_id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('WhatsApp salvo!');
    setSelected(prev => prev ? { ...prev, whatsapp_instance_url: wppUrl, whatsapp_instance_token: wppToken, whatsapp_provider: wppProvider } : null);
    setClients(prev => prev.map(c => c.store_id === selected.store_id ? { ...c, whatsapp_instance_url: wppUrl, whatsapp_instance_token: wppToken } : c));
    setEditWpp(false);
  };

  const savePlan = async () => {
    if (!selected) return;
    setSaving(true);
    await (supabase as any).from('store_settings').update({ plan: newPlan }).eq('id', selected.store_id);
    if (selected.subscription) {
      await (supabase as any).from('saas_subscriptions').update({ plan: newPlan }).eq('id', selected.subscription.id);
    }
    setSaving(false);
    toast.success('Plano atualizado!');
    setSelected(prev => prev ? { ...prev, plan: newPlan, subscription: prev.subscription ? { ...prev.subscription, plan: newPlan } : null } : null);
    setClients(prev => prev.map(c => c.store_id === selected.store_id ? { ...c, plan: newPlan } : c));
    setEditPlan(false);
  };

  const saveCustomFeatures = async () => {
    if (!selected) return;
    setSaving(true);
    await (supabase as any).from('store_settings').update({ custom_features: customFeatures }).eq('id', selected.store_id);
    setSaving(false);
    toast.success('Funcionalidades salvas!');
    setSelected(prev => prev ? { ...prev, custom_features: customFeatures } : null);
    setClients(prev => prev.map(c => c.store_id === selected.store_id ? { ...c, custom_features: customFeatures } : c));
    setEditFeatures(false);
  };

  const saveSubscription = async () => {
    if (!selected) return;
    setSaving(true);
    const sb = supabase as any;
    if (selected.subscription) {
      await sb.from('saas_subscriptions').update({
        due_date: subDueDate || null,
        status: subStatus,
        amount: subAmount ? parseFloat(subAmount) : null,
      }).eq('id', selected.subscription.id);
    } else {
      await sb.from('saas_subscriptions').insert({
        store_id: selected.store_id,
        plan: selected.plan || 'basic',
        status: subStatus,
        amount: subAmount ? parseFloat(subAmount) : null,
        due_date: subDueDate || null,
        owner_name: selected.company_name || 'Cliente',
        owner_email: selected.owner_email || 'sem-email@speedseekos.com.br',
      });
    }
    if (subStatus === 'active') await sb.from('store_settings').update({ active: true }).eq('id', selected.store_id);
    if (subStatus === 'cancelled') await sb.from('store_settings').update({ active: false }).eq('id', selected.store_id);
    setSaving(false);
    toast.success('Assinatura atualizada!');
    loadClients();
    setEditSub(false);
  };

  const provisionClient = async (payload: Record<string, any>) => {
    const { data, error } = await supabase.functions.invoke('provision-client', { body: payload });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error);
    return data;
  };

  const createDemo = async () => {
    if (!demoClient.company_name || !demoClient.owner_email || !demoClient.owner_password) {
      toast.error('Preencha nome da loja, e-mail e senha');
      return;
    }
    setCreatingDemo(true);
    try {
      const data = await provisionClient({
        company_name: demoClient.company_name,
        store_phone: demoClient.store_phone || null,
        owner_email: demoClient.owner_email,
        owner_password: demoClient.owner_password,
        is_trial: true,
      });
      const trialEndsAt = data.trial_ends_at;
      toast.success(`Demo criado! Expira em 5 dias (${new Date(trialEndsAt).toLocaleDateString('pt-BR')})`);
      setShowDemo(false);
      setDemoClient({ company_name: '', owner_email: '', owner_password: '', store_phone: '' });
      loadClients();
    } catch (e: any) {
      toast.error(`Erro: ${e.message}`);
    } finally {
      setCreatingDemo(false);
    }
  };

  const createClient = async () => {
    if (!newClient.company_name || !newClient.owner_email || !newClient.owner_password) {
      toast.error('Preencha nome da loja, e-mail e senha');
      return;
    }
    setCreating(true);
    try {
      await provisionClient({
        company_name: newClient.company_name,
        store_phone: newClient.store_phone || null,
        owner_name: newClient.owner_name || null,
        owner_email: newClient.owner_email,
        owner_password: newClient.owner_password,
        plan: newClient.plan,
        is_trial: false,
        due_date: newClient.due_date || null,
        amount: newClient.amount || null,
        whatsapp_instance_url: newClient.whatsapp_instance_url || null,
        whatsapp_instance_token: newClient.whatsapp_instance_token || null,
      });
      toast.success(`${newClient.company_name} criado!`);
      setShowNewClient(false);
      setNewClient({ company_name: '', store_phone: '', owner_name: '', owner_email: '', owner_password: '', plan: 'basic', amount: '', due_date: '', whatsapp_instance_url: '', whatsapp_instance_token: '' });
      loadClients();
    } catch (e: any) {
      toast.error(`Erro: ${e.message}`);
    } finally {
      setCreating(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isSuperAdmin) return null;

  // ---- Detalhe ----
  if (selected) {
    const sub = selected.subscription;
    const days = daysUntil(sub?.due_date ?? null);
    const statusCfg = STATUS_CONFIG[sub?.status ?? 'pending'];
    const StatusIcon = statusCfg?.icon ?? AlertTriangle;

    return (
      <div className="min-h-screen bg-background p-4 md:p-8 max-w-3xl mx-auto space-y-4">
        <Button variant="ghost" onClick={() => setSelected(null)} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>

        {/* Cabeçalho */}
        <Card className="glass-card border-border/50">
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="text-foreground text-xl">{selected.company_name || 'Sem nome'}</CardTitle>
                {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub.owner_name} · {sub.owner_email}</p>}
              </div>
              <div className="flex flex-col items-end gap-1">
                <Badge className={PLAN_COLORS[selected.plan ?? 'basic']}>
                  {PLAN_LABELS[selected.plan ?? 'basic'] ?? selected.plan}
                </Badge>
                <Badge className={selected.active !== false ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'bg-red-500/20 text-red-300 border-red-500/30'}>
                  {selected.active !== false ? 'App ativo' : 'App inativo'}
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex items-center gap-2">
              <Phone className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-foreground">{selected.store_phone || '—'}</span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-foreground">Cliente desde {fmt(selected.created_at)}</span>
            </div>
            <div className="flex items-center gap-2 col-span-2">
              <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-foreground font-mono text-xs text-muted-foreground">{selected.store_id}</span>
            </div>
          </CardContent>
        </Card>

        {/* Assinatura */}
        <Card className="glass-card border-border/50">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <CreditCard className="h-4 w-4" /> Assinatura
              </CardTitle>
              {sub && (
                <Button size="sm" variant="ghost" onClick={() => setEditSub(v => !v)} className="gap-1 h-7 text-xs">
                  <Pencil className="h-3 w-3" /> {editSub ? 'Cancelar' : 'Editar'}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {!sub ? (
              <p className="text-sm text-muted-foreground">Nenhuma assinatura registrada.</p>
            ) : editSub ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground">Status</label>
                    <Select value={subStatus} onValueChange={setSubStatus}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Ativo</SelectItem>
                        <SelectItem value="pending">Pendente</SelectItem>
                        <SelectItem value="overdue">Vencido</SelectItem>
                        <SelectItem value="cancelled">Cancelado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Valor mensal (R$)</label>
                    <Input value={subAmount} onChange={e => setSubAmount(e.target.value)} placeholder="ex: 99.90" className="h-8 text-sm" />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Próximo vencimento</label>
                  <Input type="date" value={subDueDate} onChange={e => setSubDueDate(e.target.value)} className="h-8 text-sm" />
                </div>
                <Button size="sm" onClick={saveSubscription} disabled={saving} className="gap-1 h-8 w-full">
                  {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />} Salvar
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Status</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <StatusIcon className="h-3.5 w-3.5" />
                      <Badge className={`text-xs ${statusCfg?.color}`}>{statusCfg?.label}</Badge>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Valor</p>
                    <p className="text-foreground font-medium">{fmtMoney(sub.amount)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Último pagamento</p>
                    <p className="text-foreground">{fmt(sub.paid_at)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Próximo vencimento</p>
                    <div>
                      <p className="text-foreground">{fmt(sub.due_date)}</p>
                      {days !== null && (
                        <p className={`text-xs font-medium ${days < 0 ? 'text-red-400' : days <= 5 ? 'text-amber-400' : 'text-emerald-400'}`}>
                          {days < 0 ? `Venceu há ${Math.abs(days)} dias` : days === 0 ? 'Vence hoje' : `${days} dias restantes`}
                        </p>
                      )}
                    </div>
                  </div>
                  {sub.asaas_payment_id && (
                    <div className="col-span-2">
                      <p className="text-xs text-muted-foreground">ID Asaas</p>
                      <p className="text-foreground font-mono text-xs">{sub.asaas_payment_id}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Plano */}
        <Card className="glass-card border-border/50">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <DollarSign className="h-4 w-4" /> Plano
              </CardTitle>
              <Button size="sm" variant="ghost" onClick={() => setEditPlan(v => !v)} className="gap-1 h-7 text-xs">
                <Pencil className="h-3 w-3" /> {editPlan ? 'Cancelar' : 'Editar'}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {editPlan ? (
              <div className="flex gap-2">
                <Select value={newPlan} onValueChange={setNewPlan}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="basic">Básico</SelectItem>
                    <SelectItem value="pro">Profissional</SelectItem>
                    <SelectItem value="premium">Premium</SelectItem>
                  </SelectContent>
                </Select>
                <Button size="sm" onClick={savePlan} disabled={saving} className="gap-1 h-8">
                  {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />} Salvar
                </Button>
              </div>
            ) : (
              <Badge className={PLAN_COLORS[selected.plan ?? 'basic']}>
                {PLAN_LABELS[selected.plan ?? 'basic'] ?? selected.plan}
              </Badge>
            )}
          </CardContent>
        </Card>

        {/* Funcionalidades */}
        <Card className="glass-card border-border/50">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Bolt className="h-4 w-4" /> Funcionalidades
              </CardTitle>
              <div className="flex items-center gap-2">
                {customFeatures !== null && (
                  <Badge className="text-xs bg-amber-500/20 text-amber-300 border-amber-500/30">override ativo</Badge>
                )}
                <Button size="sm" variant="ghost" onClick={() => setEditFeatures(v => !v)} className="gap-1 h-7 text-xs">
                  <Pencil className="h-3 w-3" /> {editFeatures ? 'Cancelar' : 'Editar'}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {editFeatures ? (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Quando ativo, o override substitui as permissões do plano. Desative o override para voltar ao comportamento padrão do plano.
                </p>
                <div className="flex items-center gap-2 mb-2">
                  <Switch
                    checked={customFeatures !== null}
                    onCheckedChange={(v) => setCustomFeatures(v ? (PLAN_FEATURES_BY_PLAN[selected.plan ?? 'basic'] ?? BASIC_FEATURES).slice() : null)}
                  />
                  <span className="text-xs font-medium text-foreground">Usar override de funcionalidades</span>
                </div>
                {customFeatures !== null && (
                  <div className="grid grid-cols-2 gap-2">
                    {ALL_FEATURES.map(f => (
                      <div key={f.id} className="flex items-center justify-between rounded-md border border-border/40 bg-muted/20 px-3 py-2">
                        <span className="text-xs text-foreground">{f.label}</span>
                        <Switch
                          checked={customFeatures.includes(f.id)}
                          onCheckedChange={(v) => setCustomFeatures(prev =>
                            v ? [...(prev ?? []), f.id] : (prev ?? []).filter(x => x !== f.id)
                          )}
                        />
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-2 pt-1">
                  {customFeatures !== null && (
                    <>
                      <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setCustomFeatures(ALL_FEATURES.map(f => f.id))}>
                        Tudo ON
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setCustomFeatures(BASIC_FEATURES.slice())}>
                        Resetar para Básico
                      </Button>
                    </>
                  )}
                  <Button size="sm" onClick={saveCustomFeatures} disabled={saving} className="gap-1 h-8 ml-auto">
                    {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />} Salvar
                  </Button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-1.5">
                {ALL_FEATURES.map(f => {
                  const active = customFeatures !== null
                    ? customFeatures.includes(f.id)
                    : (PLAN_FEATURES_BY_PLAN[selected.plan ?? 'basic'] ?? BASIC_FEATURES).includes(f.id);
                  return (
                    <div key={f.id} className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-md ${active ? 'text-emerald-300' : 'text-muted-foreground line-through'}`}>
                      {active ? <CheckCircle className="h-3 w-3 shrink-0" /> : <XCircle className="h-3 w-3 shrink-0" />}
                      {f.label}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* WhatsApp */}
        <Card className="glass-card border-border/50">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Wifi className="h-4 w-4" /> WhatsApp
              </CardTitle>
              <Button size="sm" variant="ghost" onClick={() => setEditWpp(v => !v)} className="gap-1 h-7 text-xs">
                <Pencil className="h-3 w-3" /> {editWpp ? 'Cancelar' : 'Editar'}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {editWpp ? (
              <div className="space-y-2">
                <div>
                  <label className="text-xs text-muted-foreground">Provider</label>
                  <Select value={wppProvider} onValueChange={setWppProvider}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="uazapi">UazAPI</SelectItem>
                      <SelectItem value="zapi">Z-API</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">URL da instância</label>
                  <Input value={wppUrl} onChange={e => setWppUrl(e.target.value)} placeholder="https://uazapi.speedseekos.com.br" className="h-8 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Token</label>
                  <Input value={wppToken} onChange={e => setWppToken(e.target.value)} placeholder="token da UazAPI" className="h-8 text-sm" />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={testWhatsApp} disabled={testingWpp || !wppUrl || !wppToken} className="gap-1 h-8 flex-1">
                    {testingWpp ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wifi className="h-3 w-3" />} Testar
                  </Button>
                  <Button size="sm" onClick={saveWpp} disabled={saving} className="gap-1 h-8 flex-1">
                    {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />} Salvar
                  </Button>
                </div>
                {wppStatus && (
                  <p className={`text-xs font-medium ${wppStatus === 'open' ? 'text-emerald-400' : 'text-amber-400'}`}>
                    Status: {wppStatus}
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-1 text-sm">
                <div className="flex items-center gap-2">
                  {selected.whatsapp_instance_url
                    ? <Wifi className="h-4 w-4 text-emerald-400" />
                    : <WifiOff className="h-4 w-4 text-amber-400" />}
                  <span className="text-foreground font-mono text-xs">
                    {selected.whatsapp_instance_url || 'Não configurado'}
                  </span>
                </div>
                {selected.whatsapp_instance_token && (
                  <p className="text-muted-foreground font-mono text-xs">
                    Token: {selected.whatsapp_instance_token.slice(0, 28)}...
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Ações perigosas */}
        <Card className="glass-card border-red-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-red-400 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> Ações
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Button
              variant={selected.active ? 'destructive' : 'default'}
              onClick={() => toggleActive(selected.store_id, selected.active)}
            >
              {selected.active ? <><Ban className="h-4 w-4 mr-2" />Desativar app</> : <><RefreshCw className="h-4 w-4 mr-2" />Reativar app</>}
            </Button>
            {selected.subscription?.status !== 'cancelled' && (
              <Button variant="outline" className="border-red-500/50 text-red-400 hover:bg-red-500/10" onClick={cancelSubscription}>
                <XCircle className="h-4 w-4 mr-2" /> Cancelar assinatura
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // ---- Lista ----
  const filtered = filterStatus === 'all'
    ? clients
    : filterStatus === 'no_sub'
      ? clients.filter(c => !c.subscription)
      : clients.filter(c => c.subscription?.status === filterStatus);

  const active = clients.filter(c => c.active !== false);
  const overdue = clients.filter(c => c.subscription?.status === 'overdue');
  const noSub = clients.filter(c => !c.subscription);

  return (
    <div className="min-h-screen bg-background p-4 md:p-8 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Painel Admin</h1>
          <p className="text-muted-foreground text-sm">SpeedSeekOS — Gestão de clientes</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadClients} size="sm" className="gap-1">
            <RefreshCw className="h-3.5 w-3.5" /> Atualizar
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowDemo(true)} className="gap-2 border-amber-500/50 text-amber-400 hover:bg-amber-500/10">
            <FlaskConical className="h-4 w-4" /> Demo
          </Button>
          <Button size="sm" onClick={() => setShowNewClient(true)} className="gap-2">
            <Plus className="h-4 w-4" /> Novo Cliente
          </Button>
        </div>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-4 gap-3">
        <Card className="glass-card border-border/50 cursor-pointer hover:bg-muted/20" onClick={() => setFilterStatus('all')}>
          <CardContent className="pt-4 pb-3">
            <p className="text-2xl font-bold text-foreground">{clients.length}</p>
            <p className="text-xs text-muted-foreground">Total</p>
          </CardContent>
        </Card>
        <Card className="glass-card border-border/50 bg-emerald-500/10 cursor-pointer hover:bg-emerald-500/20" onClick={() => setFilterStatus('active')}>
          <CardContent className="pt-4 pb-3">
            <p className="text-2xl font-bold text-emerald-400">{active.length}</p>
            <p className="text-xs text-muted-foreground">Ativos</p>
          </CardContent>
        </Card>
        <Card className="glass-card border-border/50 bg-red-500/10 cursor-pointer hover:bg-red-500/20" onClick={() => setFilterStatus('overdue')}>
          <CardContent className="pt-4 pb-3">
            <p className="text-2xl font-bold text-red-400">{overdue.length}</p>
            <p className="text-xs text-muted-foreground">Vencidos</p>
          </CardContent>
        </Card>
        <Card className="glass-card border-border/50 bg-yellow-500/10 cursor-pointer hover:bg-yellow-500/20" onClick={() => setFilterStatus('no_sub')}>
          <CardContent className="pt-4 pb-3">
            <p className="text-2xl font-bold text-yellow-400">{noSub.length}</p>
            <p className="text-xs text-muted-foreground">Sem assinatura</p>
          </CardContent>
        </Card>
      </div>

      {/* Lista */}
      <Card className="glass-card border-border/50">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-foreground flex items-center gap-2">
              <Users className="h-5 w-5" /> Clientes
              {filterStatus !== 'all' && (
                <Badge className="text-xs bg-primary/20 text-primary border-primary/30 cursor-pointer" onClick={() => setFilterStatus('all')}>
                  filtro ativo ×
                </Badge>
              )}
            </CardTitle>
            <p className="text-xs text-muted-foreground">{filtered.length} resultado(s)</p>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {filtered.length === 0 && <p className="text-muted-foreground text-sm">Nenhum cliente encontrado.</p>}
          {filtered.map(c => {
            const sub = c.subscription;
            const days = daysUntil(sub?.due_date ?? null);
            const subStatusCfg = STATUS_CONFIG[sub?.status ?? 'pending'];

            return (
              <div
                key={c.store_id}
                className="flex items-center justify-between rounded-md border border-border/50 bg-muted/30 p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => setSelected(c)}
              >
                <div className="flex items-center gap-3 min-w-0">
                  {c.active !== false
                    ? <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0" />
                    : <XCircle className="h-4 w-4 text-red-400 shrink-0" />}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{c.company_name || 'Sem nome'}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {sub ? (
                        <>
                          <span>{fmtMoney(sub.amount)}/mês</span>
                          {days !== null && (
                            <span className={days < 0 ? 'text-red-400' : days <= 5 ? 'text-amber-400' : ''}>
                              · vence {fmt(sub.due_date)}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-yellow-400">sem assinatura</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge className={`text-xs ${PLAN_COLORS[c.plan ?? 'basic']}`}>
                    {PLAN_LABELS[c.plan ?? 'basic'] ?? c.plan}
                  </Badge>
                  {sub && (
                    <Badge className={`text-xs ${subStatusCfg?.color}`}>
                      {subStatusCfg?.label}
                    </Badge>
                  )}
                  <div title={c.whatsapp_instance_url ? 'WhatsApp configurado' : 'Sem WhatsApp'}>
                    {c.whatsapp_instance_url
                      ? <Wifi className="h-3.5 w-3.5 text-emerald-400" />
                      : <WifiOff className="h-3.5 w-3.5 text-amber-400" />}
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Dialog demo */}
      <Dialog open={showDemo} onOpenChange={setShowDemo}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FlaskConical className="h-4 w-4 text-amber-400" /> Criar Demo — 5 dias grátis
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-3 text-xs text-amber-300">
              Acesso completo por 5 dias. Após isso o app é desativado automaticamente.
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Nome da loja *</label>
              <Input value={demoClient.company_name} onChange={e => setDemoClient(p => ({ ...p, company_name: e.target.value }))} placeholder="Ex: Oficina do João" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Telefone</label>
              <Input value={demoClient.store_phone} onChange={e => setDemoClient(p => ({ ...p, store_phone: e.target.value }))} placeholder="75999999999" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">E-mail *</label>
              <Input type="email" value={demoClient.owner_email} onChange={e => setDemoClient(p => ({ ...p, owner_email: e.target.value }))} placeholder="cliente@email.com" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Senha *</label>
              <Input type="password" value={demoClient.owner_password} onChange={e => setDemoClient(p => ({ ...p, owner_password: e.target.value }))} placeholder="Mínimo 6 caracteres" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDemo(false)}>Cancelar</Button>
            <Button onClick={createDemo} disabled={creatingDemo} className="gap-2 bg-amber-600 hover:bg-amber-700">
              {creatingDemo && <Loader2 className="h-4 w-4 animate-spin" />}
              Criar Demo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog novo cliente */}
      <Dialog open={showNewClient} onOpenChange={setShowNewClient}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Novo Cliente</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase">Loja</p>
            <div>
              <label className="text-xs text-muted-foreground">Nome da loja *</label>
              <Input value={newClient.company_name} onChange={e => setNewClient(p => ({ ...p, company_name: e.target.value }))} placeholder="Ex: Bandara Motos" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Telefone</label>
              <Input value={newClient.store_phone} onChange={e => setNewClient(p => ({ ...p, store_phone: e.target.value }))} placeholder="75999999999" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Plano</label>
              <Select value={newClient.plan} onValueChange={v => setNewClient(p => ({ ...p, plan: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="basic">Básico</SelectItem>
                  <SelectItem value="pro">Profissional</SelectItem>
                  <SelectItem value="premium">Premium</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs font-semibold text-muted-foreground uppercase pt-1">Dono</p>
            <div>
              <label className="text-xs text-muted-foreground">Nome do dono</label>
              <Input value={newClient.owner_name} onChange={e => setNewClient(p => ({ ...p, owner_name: e.target.value }))} placeholder="João da Silva" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">E-mail *</label>
              <Input type="email" value={newClient.owner_email} onChange={e => setNewClient(p => ({ ...p, owner_email: e.target.value }))} placeholder="dono@email.com" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Senha inicial *</label>
              <Input type="password" value={newClient.owner_password} onChange={e => setNewClient(p => ({ ...p, owner_password: e.target.value }))} placeholder="Mínimo 6 caracteres" />
            </div>
            <p className="text-xs font-semibold text-muted-foreground uppercase pt-1">Assinatura</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">Valor (R$)</label>
                <Input value={newClient.amount} onChange={e => setNewClient(p => ({ ...p, amount: e.target.value }))} placeholder="99.90" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Vencimento</label>
                <Input type="date" value={newClient.due_date} onChange={e => setNewClient(p => ({ ...p, due_date: e.target.value }))} />
              </div>
            </div>
            <p className="text-xs font-semibold text-muted-foreground uppercase pt-1">WhatsApp</p>
            <div>
              <label className="text-xs text-muted-foreground">URL da instância</label>
              <Input value={newClient.whatsapp_instance_url} onChange={e => setNewClient(p => ({ ...p, whatsapp_instance_url: e.target.value }))} placeholder="https://uazapi.speedseekos.com.br" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Token</label>
              <Input value={newClient.whatsapp_instance_token} onChange={e => setNewClient(p => ({ ...p, whatsapp_instance_token: e.target.value }))} placeholder="token da UazAPI" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewClient(false)}>Cancelar</Button>
            <Button onClick={createClient} disabled={creating} className="gap-2">
              {creating && <Loader2 className="h-4 w-4 animate-spin" />}
              Criar Cliente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
