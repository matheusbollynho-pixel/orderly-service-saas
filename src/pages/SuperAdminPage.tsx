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
import { Loader2, Users, CheckCircle, XCircle, ChevronRight, ArrowLeft, Plus, Wifi, WifiOff, Pencil, Save } from 'lucide-react';
import { toast } from 'sonner';

interface StoreClient {
  store_id: string;
  company_name: string | null;
  store_phone: string | null;
  plan: string | null;
  active: boolean | null;
  created_at: string;
  owner_email: string | null;
  whatsapp_instance_url: string | null;
  whatsapp_instance_token: string | null;
  whatsapp_provider: string | null;
}

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

export default function SuperAdminPage() {
  const navigate = useNavigate();
  const { isSuperAdmin, loading: authLoading } = useSuperAdmin();
  const [clients, setClients] = useState<StoreClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<StoreClient | null>(null);
  const [testingWpp, setTestingWpp] = useState(false);
  const [wppStatus, setWppStatus] = useState<string | null>(null);
  const [showNewClient, setShowNewClient] = useState(false);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editWpp, setEditWpp] = useState(false);
  const [wppUrl, setWppUrl] = useState('');
  const [wppToken, setWppToken] = useState('');
  const [wppProvider, setWppProvider] = useState('uazapi');
  const [editPlan, setEditPlan] = useState(false);
  const [newPlan, setNewPlan] = useState('basic');

  const [newClient, setNewClient] = useState({
    company_name: '',
    store_phone: '',
    plan: 'basic',
    owner_email: '',
    owner_password: '',
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
      setWppStatus(null);
    }
  }, [selected]);

  const loadClients = async () => {
    setLoading(true);
    const { data: stores } = await (supabase as any)
      .from('store_settings')
      .select('id, company_name, store_phone, plan, active, created_at, whatsapp_instance_url, whatsapp_instance_token, whatsapp_provider')
      .order('created_at', { ascending: false });

    if (!stores) { setLoading(false); return; }

    const result: StoreClient[] = await Promise.all(
      stores.map(async (s: any) => {
        const { data: member } = await (supabase as any)
          .from('store_members')
          .select('user_id')
          .eq('store_id', s.id)
          .eq('active', true)
          .limit(1)
          .maybeSingle();

        let ownerEmail: string | null = null;
        if (member?.user_id) {
          const { data: userData } = await (supabase as any).auth.admin?.getUserById?.(member.user_id) ?? { data: { user: null } };
          ownerEmail = userData?.user?.email ?? null;
        }

        return {
          store_id: s.id,
          company_name: s.company_name,
          store_phone: s.store_phone,
          plan: s.plan,
          active: s.active,
          created_at: s.created_at,
          owner_email: ownerEmail,
          whatsapp_instance_url: s.whatsapp_instance_url,
          whatsapp_instance_token: s.whatsapp_instance_token,
          whatsapp_provider: s.whatsapp_provider,
        };
      })
    );

    setClients(result);
    setLoading(false);
  };

  const toggleActive = async (storeId: string, current: boolean | null) => {
    await (supabase as any).from('store_settings').update({ active: !current }).eq('id', storeId);
    toast.success(`Loja ${!current ? 'ativada' : 'desativada'}`);
    setClients(prev => prev.map(c => c.store_id === storeId ? { ...c, active: !current } : c));
    if (selected?.store_id === storeId) setSelected(prev => prev ? { ...prev, active: !current } : null);
  };

  const testWhatsApp = async () => {
    if (!wppUrl || !wppToken) return;
    setTestingWpp(true);
    setWppStatus(null);
    try {
      // Extrai nome da instância da URL ou usa diretamente
      const instanceName = selected?.store_id ?? 'test';
      const res = await fetch(`${wppUrl}/instance/connectionState/${instanceName}`, {
        headers: { apikey: wppToken },
      });
      const data = await res.json();
      const state = data?.instance?.state ?? data?.state ?? 'desconhecido';
      setWppStatus(state);
      toast.success(`Status WhatsApp: ${state}`);
    } catch {
      toast.error('Erro ao conectar na UazAPI');
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
    const { error } = await (supabase as any).from('store_settings').update({ plan: newPlan }).eq('id', selected.store_id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Plano atualizado!');
    setSelected(prev => prev ? { ...prev, plan: newPlan } : null);
    setClients(prev => prev.map(c => c.store_id === selected.store_id ? { ...c, plan: newPlan } : c));
    setEditPlan(false);
  };

  const createClient = async () => {
    if (!newClient.company_name || !newClient.owner_email || !newClient.owner_password) {
      toast.error('Preencha nome da loja, e-mail e senha');
      return;
    }
    setCreating(true);
    try {
      // 1. Cria usuário
      const { data: authData, error: authErr } = await supabase.auth.signUp({
        email: newClient.owner_email,
        password: newClient.owner_password,
      });
      if (authErr || !authData.user) { toast.error(`Erro ao criar usuário: ${authErr?.message}`); setCreating(false); return; }
      const userId = authData.user.id;

      // 2. Cria store_settings
      const { data: store, error: storeErr } = await (supabase as any)
        .from('store_settings')
        .insert({
          company_name: newClient.company_name,
          store_phone: newClient.store_phone || null,
          plan: newClient.plan,
          active: true,
          whatsapp_instance_url: newClient.whatsapp_instance_url || null,
          whatsapp_instance_token: newClient.whatsapp_instance_token || null,
        })
        .select('id')
        .single();
      if (storeErr || !store) { toast.error(`Erro ao criar loja: ${storeErr?.message}`); setCreating(false); return; }

      // 3. Cria store_members
      const { error: memberErr } = await (supabase as any)
        .from('store_members')
        .insert({ store_id: store.id, user_id: userId, role: 'owner', active: true });
      if (memberErr) { toast.error(`Erro ao vincular usuário: ${memberErr.message}`); setCreating(false); return; }

      toast.success(`${newClient.company_name} criado!`);
      setShowNewClient(false);
      setNewClient({ company_name: '', store_phone: '', plan: 'basic', owner_email: '', owner_password: '', whatsapp_instance_url: '', whatsapp_instance_token: '' });
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

  // ---- Detalhe do cliente ----
  if (selected) {
    return (
      <div className="min-h-screen bg-background p-4 md:p-8 max-w-3xl mx-auto space-y-4">
        <Button variant="ghost" onClick={() => { setSelected(null); setEditWpp(false); setEditPlan(false); }} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>

        <Card className="glass-card border-border/50">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-foreground">{selected.company_name || 'Sem nome'}</CardTitle>
              <div className="flex items-center gap-2">
                {selected.active !== false
                  ? <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30">Ativa</Badge>
                  : <Badge className="bg-red-500/20 text-red-300 border-red-500/30">Inativa</Badge>}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">

            {/* Info básica */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-muted-foreground text-xs">Telefone</p>
                <p className="text-foreground">{selected.store_phone || '—'}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">E-mail</p>
                <p className="text-foreground">{selected.owner_email || '—'}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Store ID</p>
                <p className="text-foreground font-mono text-xs">{selected.store_id}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Desde</p>
                <p className="text-foreground">{new Date(selected.created_at).toLocaleDateString('pt-BR')}</p>
              </div>
            </div>

            {/* Plano */}
            <div className="border-t border-border/50 pt-4 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-muted-foreground uppercase">Plano</p>
                <Button size="sm" variant="ghost" onClick={() => setEditPlan(v => !v)} className="gap-1 h-7 text-xs">
                  <Pencil className="h-3 w-3" /> Editar
                </Button>
              </div>
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
            </div>

            {/* WhatsApp */}
            <div className="border-t border-border/50 pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-muted-foreground uppercase">WhatsApp</p>
                <Button size="sm" variant="ghost" onClick={() => setEditWpp(v => !v)} className="gap-1 h-7 text-xs">
                  <Pencil className="h-3 w-3" /> {editWpp ? 'Cancelar' : 'Editar'}
                </Button>
              </div>

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
                    <Input value={wppToken} onChange={e => setWppToken(e.target.value)} placeholder="token da instância" className="h-8 text-sm" />
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={testWhatsApp} disabled={testingWpp || !wppUrl || !wppToken} className="gap-1 h-8">
                      {testingWpp ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wifi className="h-3 w-3" />} Testar
                    </Button>
                    <Button size="sm" onClick={saveWpp} disabled={saving} className="gap-1 h-8">
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
                    <span className="text-foreground font-mono text-xs truncate">
                      {selected.whatsapp_instance_url || 'Não configurado'}
                    </span>
                  </div>
                  {selected.whatsapp_instance_token && (
                    <p className="text-muted-foreground font-mono text-xs">
                      Token: {selected.whatsapp_instance_token.slice(0, 24)}...
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Ativar / Desativar */}
            <div className="border-t border-border/50 pt-4">
              <Button
                variant={selected.active ? 'destructive' : 'default'}
                onClick={() => toggleActive(selected.store_id, selected.active)}
                className="w-full"
              >
                {selected.active ? 'Desativar loja' : 'Ativar loja'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ---- Lista ----
  const active = clients.filter(c => c.active !== false);
  const inactive = clients.filter(c => c.active === false);

  return (
    <div className="min-h-screen bg-background p-4 md:p-8 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Painel Admin</h1>
          <p className="text-muted-foreground text-sm">SpeedSeekOS — Gestão de clientes</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadClients} size="sm">Atualizar</Button>
          <Button size="sm" onClick={() => setShowNewClient(true)} className="gap-2">
            <Plus className="h-4 w-4" /> Novo Cliente
          </Button>
        </div>
      </div>

      {/* Cards resumo */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="glass-card border-border/50">
          <CardContent className="pt-4">
            <p className="text-2xl font-bold text-foreground">{clients.length}</p>
            <p className="text-xs text-muted-foreground">Total de lojas</p>
          </CardContent>
        </Card>
        <Card className="glass-card border-border/50 bg-emerald-500/10">
          <CardContent className="pt-4">
            <p className="text-2xl font-bold text-emerald-400">{active.length}</p>
            <p className="text-xs text-muted-foreground">Ativas</p>
          </CardContent>
        </Card>
        <Card className="glass-card border-border/50 bg-red-500/10">
          <CardContent className="pt-4">
            <p className="text-2xl font-bold text-red-400">{inactive.length}</p>
            <p className="text-xs text-muted-foreground">Inativas</p>
          </CardContent>
        </Card>
      </div>

      {/* Lista de clientes */}
      <Card className="glass-card border-border/50">
        <CardHeader>
          <CardTitle className="text-foreground flex items-center gap-2">
            <Users className="h-5 w-5" /> Clientes
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {clients.length === 0 && <p className="text-muted-foreground text-sm">Nenhum cliente cadastrado.</p>}
          {clients.map(c => (
            <div
              key={c.store_id}
              className="flex items-center justify-between rounded-md border border-border/50 bg-muted/30 p-3 cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => setSelected(c)}
            >
              <div className="flex items-center gap-3">
                {c.active !== false
                  ? <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0" />
                  : <XCircle className="h-4 w-4 text-red-400 shrink-0" />}
                <div>
                  <p className="text-sm font-medium text-foreground">{c.company_name || 'Sem nome'}</p>
                  <p className="text-xs text-muted-foreground">{c.store_phone || c.owner_email || '—'}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge className={`text-xs ${PLAN_COLORS[c.plan ?? 'basic']}`}>
                  {PLAN_LABELS[c.plan ?? 'basic'] ?? c.plan}
                </Badge>
                <div className="flex items-center gap-1 text-xs text-muted-foreground" title={c.whatsapp_instance_url ? 'WhatsApp configurado' : 'WhatsApp não configurado'}>
                  {c.whatsapp_instance_url
                    ? <Wifi className="h-3 w-3 text-emerald-400" />
                    : <WifiOff className="h-3 w-3 text-amber-400" />}
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Dialog novo cliente */}
      <Dialog open={showNewClient} onOpenChange={setShowNewClient}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Novo Cliente</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
            <div>
              <label className="text-xs text-muted-foreground">Nome da loja *</label>
              <Input value={newClient.company_name} onChange={e => setNewClient(p => ({ ...p, company_name: e.target.value }))} placeholder="Ex: Bandara Motos" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Telefone da loja</label>
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
            <div className="border-t border-border/50 pt-3">
              <label className="text-xs text-muted-foreground">E-mail do dono *</label>
              <Input type="email" value={newClient.owner_email} onChange={e => setNewClient(p => ({ ...p, owner_email: e.target.value }))} placeholder="dono@email.com" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Senha inicial *</label>
              <Input type="password" value={newClient.owner_password} onChange={e => setNewClient(p => ({ ...p, owner_password: e.target.value }))} placeholder="Mínimo 6 caracteres" />
            </div>
            <div className="border-t border-border/50 pt-3">
              <label className="text-xs text-muted-foreground">WhatsApp — URL da instância</label>
              <Input value={newClient.whatsapp_instance_url} onChange={e => setNewClient(p => ({ ...p, whatsapp_instance_url: e.target.value }))} placeholder="https://uazapi.speedseekos.com.br" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">WhatsApp — Token</label>
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
