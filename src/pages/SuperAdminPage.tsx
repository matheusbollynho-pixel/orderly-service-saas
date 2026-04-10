import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useSuperAdmin } from '@/hooks/useSuperAdmin';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Users, CheckCircle, XCircle, Clock, ChevronRight, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

interface StoreClient {
  store_id: string;
  company_name: string | null;
  phone: string | null;
  plan: string | null;
  active: boolean | null;
  created_at: string;
  owner_email: string | null;
  whatsapp_instance: string | null;
  whatsapp_token: string | null;
  asaas_api_key: string | null;
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

  useEffect(() => {
    if (!authLoading && !isSuperAdmin) {
      navigate('/');
    }
  }, [authLoading, isSuperAdmin]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    loadClients();
  }, [isSuperAdmin]);

  const loadClients = async () => {
    setLoading(true);
    const sb = supabase as unknown as { from: typeof supabase.from };

    const { data: stores } = await sb
      .from('store_settings')
      .select('id, company_name, phone, plan, active, created_at, whatsapp_instance, whatsapp_token, asaas_api_key')
      .order('created_at', { ascending: false });

    if (!stores) { setLoading(false); return; }

    // Busca e-mail do owner de cada store
    const result: StoreClient[] = await Promise.all(
      stores.map(async (s: Record<string, unknown>) => {
        const { data: member } = await sb
          .from('store_members')
          .select('user_id')
          .eq('store_id', s.id)
          .eq('active', true)
          .limit(1)
          .maybeSingle();

        let ownerEmail: string | null = null;
        if (member?.user_id) {
          const { data: { user } } = await supabase.auth.admin?.getUserById?.(member.user_id) ?? { data: { user: null } };
          ownerEmail = user?.email ?? null;
        }

        return {
          store_id: s.id as string,
          company_name: s.company_name as string | null,
          phone: s.phone as string | null,
          plan: s.plan as string | null,
          active: s.active as boolean | null,
          created_at: s.created_at as string,
          owner_email: ownerEmail,
          whatsapp_instance: s.whatsapp_instance as string | null,
          whatsapp_token: s.whatsapp_token as string | null,
          asaas_api_key: s.asaas_api_key as string | null,
        };
      })
    );

    setClients(result);
    setLoading(false);
  };

  const toggleActive = async (storeId: string, current: boolean | null) => {
    const sb = supabase as unknown as { from: typeof supabase.from };
    await sb.from('store_settings').update({ active: !current }).eq('id', storeId);
    toast.success(`Loja ${!current ? 'ativada' : 'desativada'}`);
    setClients(prev => prev.map(c => c.store_id === storeId ? { ...c, active: !current } : c));
    if (selected?.store_id === storeId) setSelected(prev => prev ? { ...prev, active: !current } : null);
  };

  const testWhatsApp = async (instance: string, token: string) => {
    setTestingWpp(true);
    try {
      const res = await fetch(`https://uazapi.speedseekos.com.br/instance/connectionState/${instance}`, {
        headers: { apikey: token },
      });
      const data = await res.json();
      const state = data?.instance?.state ?? data?.state ?? 'desconhecido';
      toast.success(`Status WhatsApp: ${state}`);
    } catch {
      toast.error('Erro ao conectar na UazAPI');
    } finally {
      setTestingWpp(false);
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

  // Detalhe do cliente selecionado
  if (selected) {
    return (
      <div className="min-h-screen bg-background p-4 md:p-8 max-w-3xl mx-auto space-y-4">
        <Button variant="ghost" onClick={() => setSelected(null)} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>

        <Card className="glass-card border-border/50">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-foreground">{selected.company_name || 'Sem nome'}</CardTitle>
              <Badge className={PLAN_COLORS[selected.plan ?? 'basic']}>
                {PLAN_LABELS[selected.plan ?? 'basic'] ?? selected.plan}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-muted-foreground text-xs">Telefone</p>
                <p className="text-foreground">{selected.phone || '—'}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">E-mail owner</p>
                <p className="text-foreground">{selected.owner_email || '—'}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Store ID</p>
                <p className="text-foreground font-mono text-xs">{selected.store_id}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Criado em</p>
                <p className="text-foreground">{new Date(selected.created_at).toLocaleDateString('pt-BR')}</p>
              </div>
            </div>

            <div className="border-t border-border/50 pt-4 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase">WhatsApp</p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">Instância</p>
                  <p className="text-foreground font-mono text-xs">{selected.whatsapp_instance || '—'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Token</p>
                  <p className="text-foreground font-mono text-xs truncate">{selected.whatsapp_token ? `${selected.whatsapp_token.slice(0, 20)}...` : '—'}</p>
                </div>
              </div>
              {selected.whatsapp_instance && selected.whatsapp_token && (
                <Button size="sm" variant="outline" onClick={() => testWhatsApp(selected.whatsapp_instance!, selected.whatsapp_token!)} disabled={testingWpp} className="gap-2">
                  {testingWpp ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                  Testar conexão
                </Button>
              )}
            </div>

            <div className="border-t border-border/50 pt-4 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase">Asaas</p>
              <div className="text-sm">
                <p className="text-muted-foreground text-xs">API Key</p>
                <p className="text-foreground font-mono text-xs">{selected.asaas_api_key ? `${selected.asaas_api_key.slice(0, 20)}...` : '—'}</p>
              </div>
            </div>

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

  // Lista de clientes
  const active = clients.filter(c => c.active !== false);
  const inactive = clients.filter(c => c.active === false);

  return (
    <div className="min-h-screen bg-background p-4 md:p-8 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Painel Admin</h1>
          <p className="text-muted-foreground text-sm">SpeedSeekOS</p>
        </div>
        <Button variant="outline" onClick={loadClients} size="sm">Atualizar</Button>
      </div>

      {/* Resumo */}
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

      {/* Lista */}
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
                  : <XCircle className="h-4 w-4 text-red-400 shrink-0" />
                }
                <div>
                  <p className="text-sm font-medium text-foreground">{c.company_name || 'Sem nome'}</p>
                  <p className="text-xs text-muted-foreground">{c.phone || '—'}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge className={`text-xs ${PLAN_COLORS[c.plan ?? 'basic']}`}>
                  {PLAN_LABELS[c.plan ?? 'basic'] ?? c.plan}
                </Badge>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  {c.whatsapp_instance ? <CheckCircle className="h-3 w-3 text-emerald-400" /> : <Clock className="h-3 w-3 text-amber-400" />}
                  WPP
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
