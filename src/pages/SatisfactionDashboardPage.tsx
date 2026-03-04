import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useMechanics } from '@/hooks/useMechanics';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { AlertTriangle } from 'lucide-react';

type RatingRow = {
  id: string;
  order_id: string;
  client_id: string;
  atendimento_id: string | null;
  mechanic_id: string | null;
  atendimento_rating: number | null;
  servico_rating: number | null;
  tags: any;
  comment: string | null;
  recommends: boolean | null;
  status: 'pendente' | 'resolvido';
  responded_at: string | null;
  created_at: string;
};

type OrderLite = {
  id: string;
  client_name: string;
  client_phone: string;
  problem_description: string;
};

function average(nums: number[]) {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export default function SatisfactionDashboardPage() {
  const { mechanics } = useMechanics();
  const { members } = useTeamMembers();

  const [rows, setRows] = useState<RatingRow[]>([]);
  const [ordersMap, setOrdersMap] = useState<Record<string, OrderLite>>({});
  const [loading, setLoading] = useState(true);

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [mechanicFilter, setMechanicFilter] = useState('all');
  const [serviceFilter, setServiceFilter] = useState('all');

  const markResolved = async (id: string) => {
    await supabase
      .from('satisfaction_ratings')
      .update({ status: 'resolvido' })
      .eq('id', id);

    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status: 'resolvido' } : r)));
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);

      const { data: ratingsData, error } = await supabase
        .from('satisfaction_ratings')
        .select('*')
        .not('responded_at', 'is', null)
        .order('responded_at', { ascending: false });

      if (error) {
        console.error('Erro ao carregar avaliações:', error);
        setRows([]);
        setOrdersMap({});
        setLoading(false);
        return;
      }

      const ratings = (ratingsData || []) as RatingRow[];
      setRows(ratings);

      const orderIds = [...new Set(ratings.map((r) => r.order_id))];
      if (!orderIds.length) {
        setOrdersMap({});
        setLoading(false);
        return;
      }

      const { data: ordersData } = await supabase
        .from('service_orders')
        .select('id, client_name, client_phone, problem_description')
        .in('id', orderIds);

      const nextMap: Record<string, OrderLite> = {};
      for (const o of ordersData || []) {
        nextMap[o.id] = o as OrderLite;
      }
      setOrdersMap(nextMap);
      setLoading(false);
    };

    load();
  }, []);

  const serviceOptions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => {
      const d = ordersMap[r.order_id]?.problem_description || '';
      const normalized = d.split('\n')[0]?.trim();
      if (normalized) set.add(normalized);
    });
    return Array.from(set).slice(0, 80);
  }, [rows, ordersMap]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (!r.responded_at) return false;

      if (startDate) {
        const from = new Date(`${startDate}T00:00:00`);
        if (new Date(r.responded_at) < from) return false;
      }

      if (endDate) {
        const to = new Date(`${endDate}T23:59:59`);
        if (new Date(r.responded_at) > to) return false;
      }

      if (mechanicFilter !== 'all' && r.mechanic_id !== mechanicFilter) return false;

      if (serviceFilter !== 'all') {
        const desc = ordersMap[r.order_id]?.problem_description || '';
        if (!desc.includes(serviceFilter)) return false;
      }

      return true;
    });
  }, [rows, startDate, endDate, mechanicFilter, serviceFilter, ordersMap]);

  const scored = useMemo(() => {
    return filtered.map((r) => ({
      ...r,
      final_score: ((r.atendimento_rating || 0) + (r.servico_rating || 0)) / 2,
    }));
  }, [filtered]);

  const metrics = useMemo(() => {
    const finalScores = scored.map((r) => r.final_score).filter((x) => x > 0);
    const rec = scored.filter((r) => r.recommends === true).length;

    const promoters = scored.filter((r) => r.final_score === 5).length;
    const detractors = scored.filter((r) => r.final_score <= 3).length;
    const total = scored.length || 1;
    const nps = ((promoters / total) * 100) - ((detractors / total) * 100);

    return {
      avg: average(finalScores),
      nps,
      recommendRate: (rec / total) * 100,
    };
  }, [scored]);

  const mechanicRanking = useMemo(() => {
    const map = new Map<string, number[]>();
    for (const r of scored) {
      if (!r.mechanic_id || !r.servico_rating) continue;
      const arr = map.get(r.mechanic_id) || [];
      arr.push(r.servico_rating);
      map.set(r.mechanic_id, arr);
    }

    return Array.from(map.entries())
      .map(([id, notes]) => ({ id, avg: average(notes), count: notes.length }))
      .sort((a, b) => b.avg - a.avg);
  }, [scored]);

  const atendimentoRanking = useMemo(() => {
    const map = new Map<string, number[]>();
    for (const r of scored) {
      if (!r.atendimento_id || !r.atendimento_rating) continue;
      const arr = map.get(r.atendimento_id) || [];
      arr.push(r.atendimento_rating);
      map.set(r.atendimento_id, arr);
    }

    return Array.from(map.entries())
      .map(([id, notes]) => ({ id, avg: average(notes), count: notes.length }))
      .sort((a, b) => b.avg - a.avg);
  }, [scored]);

  const crisis = useMemo(() => {
    return scored.filter(
      (r) => ((r.atendimento_rating || 0) < 3 || (r.servico_rating || 0) < 3) && r.status === 'pendente'
    );
  }, [scored]);

  if (loading) {
    return <div className="py-10 text-center">Carregando painel de satisfação...</div>;
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Satisfação • Atendimento + Oficina</h2>

      <Card>
        <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-4 gap-3">
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          <select className="h-10 rounded-md border px-3" value={mechanicFilter} onChange={(e) => setMechanicFilter(e.target.value)}>
            <option value="all">Todos os mecânicos</option>
            {mechanics.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
          <select className="h-10 rounded-md border px-3" value={serviceFilter} onChange={(e) => setServiceFilter(e.target.value)}>
            <option value="all">Todos os tipos de serviço</option>
            {serviceOptions.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-sm">Média Geral</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{metrics.avg.toFixed(2)} ⭐</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">NPS</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{metrics.nps.toFixed(0)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Taxa de Recomendação</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{metrics.recommendRate.toFixed(0)}%</p></CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Ranking • Oficina (Mecânicos)</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {mechanicRanking.length === 0 && <p className="text-sm text-muted-foreground">Sem dados no período.</p>}
            {mechanicRanking.map((r, idx) => (
              <div key={r.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
                <span>{idx + 1}. {mechanics.find((m) => m.id === r.id)?.name || 'Sem nome'}</span>
                <span className="font-semibold">{r.avg.toFixed(2)} ⭐ ({r.count})</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Ranking • Atendimento (Balcão)</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {atendimentoRanking.length === 0 && <p className="text-sm text-muted-foreground">Sem dados no período.</p>}
            {atendimentoRanking.map((r, idx) => (
              <div key={r.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
                <span>{idx + 1}. {members.find((m) => m.id === r.id)?.name || 'Sem nome'}</span>
                <span className="font-semibold">{r.avg.toFixed(2)} ⭐ ({r.count})</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="border-red-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-700">
            <AlertTriangle className="h-5 w-5" /> Alerta de Crise (nota abaixo de 3)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {crisis.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma avaliação crítica no período.</p>}
          {crisis.map((r) => {
            const order = ordersMap[r.order_id];
            const phone = (order?.client_phone || '').replace(/\D/g, '');
            const wa = phone ? `https://wa.me/${phone.startsWith('55') ? phone : `55${phone}`}` : '#';

            return (
              <div key={r.id} className="rounded-md border border-red-200 bg-red-50 p-3">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div className="text-sm">
                    <p className="font-semibold">{order?.client_name || 'Cliente'}</p>
                    <p>Atendimento: {r.atendimento_rating || '-'} • Serviço: {r.servico_rating || '-'}</p>
                    <p>Status: <span className="font-medium">{r.status}</span></p>
                    {r.comment && <p className="text-muted-foreground">“{r.comment}”</p>}
                  </div>
                  <div className="flex gap-2">
                    <Button asChild variant="destructive" size="sm">
                      <a href={wa} target="_blank" rel="noreferrer">Resolver no WhatsApp</a>
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => markResolved(r.id)}>
                      Marcar resolvido
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
