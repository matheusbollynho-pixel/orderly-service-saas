import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as DateCalendar } from '@/components/ui/calendar';
import { useMechanics } from '@/hooks/useMechanics';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { AlertTriangle, ChevronDown, Calendar as CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { DateRange } from 'react-day-picker';

type RatingRow = {
  id: string;
  order_id: string;
  client_id: string;
  atendimento_id: string | null;
  mechanic_id: string | null;
  atendimento_rating: number | null;
  servico_rating: number | null;
  tags: Record<string, string[]>;
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

type ClientLite = { id: string; name: string; phone: string };

const QR_PLACEHOLDER_EQUIPMENT = '__QR_WALKIN_PLACEHOLDER__';
const QR_SYSTEM_NAME = 'SISTEMA QR';

function average(nums: number[]) {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export default function SatisfactionDashboardPage() {
  const { mechanics } = useMechanics();
  const { members } = useTeamMembers();

  const [rows, setRows] = useState<RatingRow[]>([]);
  const [ordersMap, setOrdersMap] = useState<Record<string, OrderLite>>({});
  const [clientsMap, setClientsMap] = useState<Record<string, ClientLite>>({});
  const [loading, setLoading] = useState(true);

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [mechanicFilter, setMechanicFilter] = useState('all');
  const [atendimentoFilter, setAtendimentoFilter] = useState('all');
  const [serviceFilter, setServiceFilter] = useState('all');
  const [tagFilter, setTagFilter] = useState('all');
  const [expandedDetail, setExpandedDetail] = useState<string | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange | undefined>();

  useEffect(() => {
    setStartDate(dateRange?.from ? format(dateRange.from, 'yyyy-MM-dd') : '');
    setEndDate(dateRange?.to ? format(dateRange.to, 'yyyy-MM-dd') : '');
  }, [dateRange]);

  const clearFilters = () => {
    setStartDate('');
    setEndDate('');
    setDateRange(undefined);
    setShowDatePicker(false);
    setMechanicFilter('all');
    setAtendimentoFilter('all');
    setServiceFilter('all');
    setTagFilter('all');
  };

  const markResolved = async (id: string) => {
    await supabase
      .from('satisfaction_ratings')
      .update({ status: 'resolvido' })
      .eq('id', id);

    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status: 'resolvido' } : r)));
  };

  const reloadData = async () => {
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

    console.log('📊 [DASHBOARD] Avaliações respondidas recarregadas:', {
      total: ratings.length,
      comMechanico: ratings.filter(r => r.mechanic_id).length,
      comAtendimento: ratings.filter(r => r.atendimento_id).length,
    });

    const orderIds = [...new Set(ratings.map((r) => r.order_id).filter(Boolean))];
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

    // Buscar dados reais de todos os clientes (para ter telefone atualizado)
    const allClientIds = ratings
      .filter((r) => r.client_id)
      .map((r) => r.client_id)
      .filter(Boolean) as string[];

    if (allClientIds.length > 0) {
      const uniqueIds = [...new Set(allClientIds)];
      const { data: clientsData } = await supabase
        .from('clients')
        .select('id, name, phone')
        .in('id', uniqueIds);
      const cMap: Record<string, ClientLite> = {};
      for (const c of clientsData || []) cMap[c.id] = c as ClientLite;
      setClientsMap(cMap);
    } else {
      setClientsMap({});
    }

    setLoading(false);
  };

  useEffect(() => {
    reloadData();

    // Subscrever a mudanças em tempo real na tabela satisfaction_ratings
    const channel = supabase
      .channel('satisfaction_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'satisfaction_ratings' },
        () => {
          console.log('📊 Mudança detectada em satisfaction_ratings, recarregando...');
          reloadData();
        }
      )
      .subscribe();

    // Cleanup
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const getClientInfo = (r: RatingRow) => {
    const order = ordersMap[r.order_id];
    const clientFromMap = r.client_id ? clientsMap[r.client_id] : undefined;
    const isWalkIn = !order || order.client_name === QR_SYSTEM_NAME || order.client_phone === '00000000000';
    const name = isWalkIn
      ? (clientFromMap?.name || order?.client_name || 'Cliente')
      : (order?.client_name || clientFromMap?.name || 'Cliente');
    // Para telefone, prioriza dados do cliente (mais atualizados) e usa OS como fallback
    const phone = clientFromMap?.phone || order?.client_phone || '';
    return { name, phone };
  };

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

      if (atendimentoFilter !== 'all' && r.atendimento_id !== atendimentoFilter) return false;

      if (serviceFilter !== 'all') {
        const desc = ordersMap[r.order_id]?.problem_description || '';
        if (!desc.includes(serviceFilter)) return false;
      }

      if (tagFilter !== 'all') {
        const allTags = [...(r.tags?.atendimento || []), ...(r.tags?.servico || []), ...(r.tags?.store || [])];
        if (!allTags.includes(tagFilter)) return false;
      }

      return true;
    });
  }, [rows, startDate, endDate, mechanicFilter, atendimentoFilter, serviceFilter, tagFilter, ordersMap]);

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

    const result = Array.from(map.entries())
      .map(([id, notes]) => ({ id, avg: average(notes), count: notes.length }))
      .sort((a, b) => b.avg - a.avg);
    
    console.log('🔧 [DASHBOARD] Mechanic Ranking:', {
      total: result.length,
      scored_count: scored.length,
      com_mechanic_id: scored.filter(r => r.mechanic_id).length,
      com_servico_rating: scored.filter(r => r.servico_rating).length,
      resultado: result
    });
    
    return result;
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

  // Calcular ranking de tags (elogios e críticas)
  const allTags = useMemo(() => {
    const tagCount = new Map<string, number>();
    for (const r of scored) {
      const tags = [...(r.tags?.atendimento || []), ...(r.tags?.servico || []), ...(r.tags?.store || [])];
      for (const tag of tags) {
        tagCount.set(tag, (tagCount.get(tag) || 0) + 1);
      }
    }
    return Array.from(tagCount.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count);
  }, [scored]);

  const positiveTagRanking = useMemo(() => {
    const POSITIVE_TAGS = [
      'Educação', 'Rapidez', 'Transparência', 'Simpatia', 'Agilidade',
      'Qualidade', 'Prazo Cumprido', 'Moto Limpa', 'Bem Feito', 'Perfeição',
      'Atendimento rápido', 'Mecânico atencioso', 'Preço justo', 'Loja organizada', 'Serviço de confiança'
    ];
    return allTags
      .filter(t => POSITIVE_TAGS.includes(t.tag))
      .slice(0, 8);
  }, [allTags]);

  const negativeTagRanking = useMemo(() => {
    const NEGATIVE_TAGS = [
      'Demora no balcão', 'Falta de Atenção', 'Falta de Informação', 'Não Entendia',
      'Problema não resolvido', 'Sujeira', 'Demora', 'Moto com Defeito', 'Peças Trocadas Sem Avisar',
      'Demora no atendimento', 'Preço elevado', 'Falta de peças', 'Dificuldade de contato', 'Ambiente desconfortável'
    ];
    return allTags
      .filter(t => NEGATIVE_TAGS.includes(t.tag))
      .slice(0, 8);
  }, [allTags]);

  // Feed filtrado por colaborador selecionado
  const collaboratorFilteredFeed = useMemo(() => {
    return scored.filter(r => {
      // Se mecânico selecionado, mostra apenas avaliações desse mecânico
      if (mechanicFilter !== 'all' && r.mechanic_id !== mechanicFilter) return false;
      
      // Se atendente selecionado, mostra apenas avaliações desse atendente
      if (atendimentoFilter !== 'all' && r.atendimento_id !== atendimentoFilter) return false;
      
      return true;
    });
  }, [scored, mechanicFilter, atendimentoFilter]);

  const crisis = useMemo(() => {
    return scored.filter(
      (r) => ((r.atendimento_rating || 0) < 3 || (r.servico_rating || 0) < 3) && r.status === 'pendente'
    );
  }, [scored]);

  if (loading) {
    return <div className="py-10 text-center text-foreground">Carregando painel de satisfação...</div>;
  }

  return (
    <div className="min-h-screen bg-background p-6 space-y-4">
      <h2 className="text-lg font-semibold text-foreground">Satisfação • Atendimento + Oficina</h2>

      <Card className="glass-card border-border/50">
        <CardContent className="pt-6 space-y-4">
          <div className="flex flex-col md:flex-row gap-3">
            <Popover open={showDatePicker} onOpenChange={setShowDatePicker}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full md:w-[360px] justify-between bg-muted/50 border-border/50 text-foreground hover:bg-muted/70">
                  <span className="flex items-center gap-2">
                    <CalendarIcon className="h-4 w-4" />
                    {dateRange?.from ? (
                      dateRange.to ? (
                        <>{format(dateRange.from, 'dd/MM/yyyy')} até {format(dateRange.to, 'dd/MM/yyyy')}</>
                      ) : (
                        <>{format(dateRange.from, 'dd/MM/yyyy')}</>
                      )
                    ) : (
                      'Selecione o período'
                    )}
                  </span>
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <DateCalendar
                  initialFocus
                  mode="range"
                  selected={dateRange}
                  onSelect={setDateRange}
                  numberOfMonths={1}
                  locale={ptBR}
                />
              </PopoverContent>
            </Popover>

            <Button variant="outline" onClick={clearFilters} className="md:w-[140px] bg-muted/50 border-border/50 text-foreground hover:bg-muted/70">
              Limpar
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <select className="h-10 rounded-md border border-border/50 px-3 bg-muted/50 text-foreground" value={mechanicFilter} onChange={(e) => setMechanicFilter(e.target.value)}>
              <option value="all">Todos os mecânicos</option>
              {mechanics.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
            <select className="h-10 rounded-md border border-border/50 px-3 bg-muted/50 text-foreground" value={atendimentoFilter} onChange={(e) => setAtendimentoFilter(e.target.value)}>
              <option value="all">Todos os atendentes</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
            <select className="h-10 rounded-md border border-border/50 px-3 bg-muted/50 text-foreground" value={serviceFilter} onChange={(e) => setServiceFilter(e.target.value)}>
              <option value="all">Todos os tipos de serviço</option>
              {serviceOptions.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <select className="h-10 rounded-md border border-border/50 px-3 bg-muted/50 text-foreground" value={tagFilter} onChange={(e) => setTagFilter(e.target.value)}>
              <option value="all">Filtrar por tag...</option>
              {allTags.map((t) => (
                <option key={t.tag} value={t.tag}>{t.tag} ({t.count})</option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="glass-card border-border/50 bg-amber-500/10">
          <CardHeader><CardTitle className="text-sm text-foreground">Média Geral</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-foreground">{metrics.avg.toFixed(2)} ⭐</p></CardContent>
        </Card>
        <Card className="glass-card border-border/50 bg-blue-500/10">
          <CardHeader><CardTitle className="text-sm text-foreground">NPS</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-foreground">{metrics.nps.toFixed(0)}</p></CardContent>
        </Card>
        <Card className="glass-card border-border/50 bg-emerald-500/10">
          <CardHeader><CardTitle className="text-sm text-foreground">Taxa de Recomendação</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-foreground">{metrics.recommendRate.toFixed(0)}%</p></CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="glass-card border-border/50">
          <CardHeader><CardTitle className="text-foreground">Ranking • Oficina (Mecânicos)</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {mechanicRanking.length === 0 && <p className="text-sm text-muted-foreground">Sem dados no período.</p>}
            {mechanicRanking.map((r, idx) => (
              <div key={r.id} className="flex items-center justify-between rounded-md border border-border/50 bg-muted/30 p-2 text-sm">
                <span className="text-foreground">{idx + 1}. {mechanics.find((m) => m.id === r.id)?.name || 'Sem nome'}</span>
                <span className="font-semibold text-foreground">{r.avg.toFixed(2)} ⭐ ({r.count})</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="glass-card border-border/50">
          <CardHeader><CardTitle className="text-foreground">Ranking • Atendimento (Balcão)</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {atendimentoRanking.length === 0 && <p className="text-sm text-muted-foreground">Sem dados no período.</p>}
            {atendimentoRanking.map((r, idx) => (
              <div key={r.id} className="flex items-center justify-between rounded-md border border-border/50 bg-muted/30 p-2 text-sm">
                <span className="text-foreground">{idx + 1}. {members.find((m) => m.id === r.id)?.name || 'Sem nome'}</span>
                <span className="font-semibold text-foreground">{r.avg.toFixed(2)} ⭐ ({r.count})</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="glass-card border-border/50">
          <CardHeader><CardTitle className="text-foreground">🎉 Top Elogios</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {positiveTagRanking.length === 0 && <p className="text-sm text-muted-foreground">Sem elogios no período.</p>}
            {positiveTagRanking.map((t, idx) => (
              <div key={t.tag} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-foreground">{idx + 1}. {t.tag}</span>
                  <span className="text-emerald-500 font-bold">{t.count}</span>
                </div>
                <div className="w-full bg-white/10 rounded-full h-2">
                  <div 
                    className="bg-emerald-500 h-2 rounded-full" 
                    style={{ width: `${(t.count / Math.max(...positiveTagRanking.map(x => x.count), 1)) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="glass-card border-border/50">
          <CardHeader><CardTitle className="text-foreground">⚠️ Principais Críticas</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {negativeTagRanking.length === 0 && <p className="text-sm text-muted-foreground">Sem críticas no período.</p>}
            {negativeTagRanking.map((t, idx) => (
              <div key={t.tag} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-foreground">{idx + 1}. {t.tag}</span>
                  <span className="text-[#C1272D] font-bold">{t.count}</span>
                </div>
                <div className="w-full bg-white/10 rounded-full h-2">
                  <div 
                    className="bg-[#C1272D] h-2 rounded-full" 
                    style={{ width: `${(t.count / Math.max(...negativeTagRanking.map(x => x.count), 1)) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="glass-card border-border/50">
        <CardHeader>
          <CardTitle className="text-foreground">
            📋 Feed de Avaliações Detalhadas
            {mechanicFilter !== 'all' && ` • 🔧 ${mechanics.find(m => m.id === mechanicFilter)?.name || 'Mecânico'}`}
            {atendimentoFilter !== 'all' && ` • 🎤 ${members.find(m => m.id === atendimentoFilter)?.name || 'Atendente'}`}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {collaboratorFilteredFeed.length === 0 && <p className="text-sm text-muted-foreground">Sem avaliações no período.</p>}
          {collaboratorFilteredFeed.map((r) => {
            const mechanic = mechanics.find(m => m.id === r.mechanic_id);
            const atendente = members.find(m => m.id === r.atendimento_id);
            const allRatingTags = [...(r.tags?.atendimento || []), ...(r.tags?.servico || []), ...(r.tags?.store || [])];
            const isExpanded = expandedDetail === r.id;
            const { name: clientName, phone: clientPhone } = getClientInfo(r);

            return (
              <div key={r.id} className="rounded-md border border-border/50 bg-muted/30 p-3 space-y-2">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="font-semibold text-sm text-foreground">{clientName}</p>
                    <p className="text-xs text-muted-foreground">
                      📱 {clientPhone || '-'} | 📅 {new Date(r.responded_at || '').toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-foreground">
                      ⭐ {r.atendimento_rating}/{r.servico_rating}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 text-xs">
                  {mechanic && <span className="bg-blue-500/20 text-blue-400 border border-blue-500/30 px-2 py-1 rounded">🔧 {mechanic.name}</span>}
                  {atendente && <span className="bg-purple-500/20 text-purple-400 border border-purple-500/30 px-2 py-1 rounded">🎤 {atendente.name}</span>}
                </div>

                {allRatingTags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {allRatingTags.map((tag) => (
                      <span 
                        key={tag}
                        className="inline-flex items-center gap-1 bg-amber-500/20 border border-amber-500/30 text-amber-400 px-2 py-0.5 rounded-full text-xs font-medium cursor-pointer hover:bg-amber-500/30"
                        onClick={() => setTagFilter(tag)}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {!isExpanded && r.comment && (
                  <p className="text-xs text-muted-foreground line-clamp-2">"{r.comment}"</p>
                )}

                <button
                  onClick={() => setExpandedDetail(isExpanded ? null : r.id)}
                  className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 font-medium"
                >
                  <ChevronDown className="h-4 w-4" style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
                  {isExpanded ? 'Fechar' : 'Ver detalhes'}
                </button>

                {isExpanded && (
                  <div className="mt-2 pt-2 border-t border-border/50 space-y-2 text-sm">
                    <div>
                      <p className="font-semibold text-xs text-muted-foreground uppercase">Comentário:</p>
                      <p className="text-sm text-foreground">{r.comment || '(sem comentário)'}</p>
                    </div>
                    <div>
                      <p className="font-semibold text-xs text-muted-foreground uppercase">Recomenda:</p>
                      <p className="text-sm text-foreground">{r.recommends === true ? '✅ Sim' : r.recommends === false ? '❌ Não' : '⚪ Não respondeu'}</p>
                    </div>
                    <div>
                      <p className="font-semibold text-xs text-muted-foreground uppercase">Status:</p>
                      <p className="text-sm text-foreground">{r.status === 'resolvido' ? '✅ Resolvido' : '⏳ Pendente'}</p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card className="glass-card border-[#C1272D]/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-[#C1272D]">
            <AlertTriangle className="h-5 w-5" /> Alerta de Crise (nota abaixo de 3)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {crisis.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma avaliação crítica no período.</p>}
          {crisis.map((r) => {
            const { name: crisisName, phone: crisisPhone } = getClientInfo(r);
            const phone = crisisPhone.replace(/\D/g, '');
            const wa = phone ? `https://wa.me/${phone.startsWith('55') ? phone : `55${phone}`}` : '#';

            return (
              <div key={r.id} className="rounded-md border border-[#C1272D]/30 bg-[#C1272D]/10 p-3">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div className="text-sm">
                    <p className="font-semibold text-foreground">{crisisName}</p>
                    <p className="text-foreground">Atendimento: {r.atendimento_rating || '-'} • Serviço: {r.servico_rating || '-'}</p>
                    <p className="text-foreground">Status: <span className="font-medium">{r.status}</span></p>
                    {r.comment && <p className="text-muted-foreground">“{r.comment}”</p>}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="destructive"
                      size="sm"
                      className="bg-[#C1272D] hover:bg-red-700"
                      onClick={() => {
                        if (!phone) { alert('Telefone do cliente não disponível.'); return; }
                        window.open(wa, '_blank');
                      }}
                    >
                      Resolver no WhatsApp
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => markResolved(r.id)} className="border-border/50 bg-muted/50 text-foreground hover:bg-muted/70">
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
