import { useEffect, useMemo, useState } from 'react';
import { useBalcao } from '@/hooks/useBalcao';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { useServiceOrders } from '@/hooks/useServiceOrders';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as DateCalendar } from '@/components/ui/calendar';
import { Calendar as CalendarIcon, ChevronDown } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { DateRange } from 'react-day-picker';

interface Props {
  onOpenOrder?: (id: string) => void;
  onOpenBalcaoOrder?: (id: string) => void;
}

export function BalcaoCommissionReport({ onOpenOrder, onOpenBalcaoOrder }: Props) {
  const { orders: balcaoOrders } = useBalcao();
  const { orders: serviceOrders } = useServiceOrders();
  const { members } = useTeamMembers();
  const [selectedAtendente, setSelectedAtendente] = useState<string>('todos');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [showDatePicker, setShowDatePicker] = useState(false);

  useEffect(() => {
    setStartDate(dateRange?.from ? format(dateRange.from, 'yyyy-MM-dd') : '');
    setEndDate(dateRange?.to ? format(dateRange.to, 'yyyy-MM-dd') : '');
  }, [dateRange]);

  const memberMap = useMemo(() => new Map(members.map(m => [m.id, m])), [members]);

  const filteredOrders = useMemo(() => {
    let result = balcaoOrders.filter(o => o.status === 'finalizada' && o.finalized_at);

    if (startDate && endDate) {
      const [sy, sm, sd] = startDate.split('-').map(Number);
      const [ey, em, ed] = endDate.split('-').map(Number);
      const start = new Date(sy, sm - 1, sd, 0, 0, 0);
      const end = new Date(ey, em - 1, ed, 23, 59, 59);
      result = result.filter(o => {
        const d = new Date(o.finalized_at!);
        return d >= start && d <= end;
      });
    }

    if (selectedAtendente !== 'todos') {
      result = result.filter(o => (o.atendente_id ?? 'sem') === selectedAtendente);
    }

    return result.sort((a, b) => new Date(b.finalized_at!).getTime() - new Date(a.finalized_at!).getTime());
  }, [balcaoOrders, startDate, endDate, selectedAtendente]);

  // OS com peças no período (para commission_on_parts)
  const { filteredOS, totalPecasOS, totalComissaoPecasOS } = useMemo(() => {
    if (!startDate || !endDate) return { filteredOS: [], totalPecasOS: 0, totalComissaoPecasOS: 0 };
    const [sy, sm, sd] = startDate.split('-').map(Number);
    const [ey, em, ed] = endDate.split('-').map(Number);
    const start = new Date(sy, sm - 1, sd, 0, 0, 0);
    const end = new Date(ey, em - 1, ed, 23, 59, 59);

    const osInPeriod = serviceOrders
      .filter(o => o.status === 'concluida' || o.status === 'concluida_entregue')
      .filter(o => { const d = new Date(o.created_at); return d >= start && d <= end; });

    // Comissão de peças: cada atendente recebe apenas das OS que ele criou
    let totalComissaoPecasOS = 0;
    if (selectedAtendente === 'todos') {
      members.filter(m => m.commission_on_parts).forEach(m => {
        const pecasDoAtendente = osInPeriod
          .filter(o => (o.atendimento_id ?? 'sem') === m.id)
          .reduce((s, o) => s + (o.materials ?? [])
            .filter(mat => mat.is_service !== true)
            .reduce((ss, mat) => ss + (mat.valor || 0) * (parseFloat(mat.quantidade) || 0), 0), 0);
        totalComissaoPecasOS += pecasDoAtendente * (m.commission_rate / 100);
      });
    } else {
      const member = memberMap.get(selectedAtendente);
      if (member?.commission_on_parts) {
        const pecasDoAtendente = osInPeriod
          .filter(o => (o.atendimento_id ?? 'sem') === selectedAtendente)
          .reduce((s, o) => s + (o.materials ?? [])
            .filter(mat => mat.is_service !== true)
            .reduce((ss, mat) => ss + (mat.valor || 0) * (parseFloat(mat.quantidade) || 0), 0), 0);
        totalComissaoPecasOS = pecasDoAtendente * (member.commission_rate / 100);
      }
    }

    // Lista para exibição (filtrada pelo atendente selecionado)
    let totalDisplay = 0;
    const lista = osInPeriod
      .filter(o => selectedAtendente === 'todos' || (o.atendimento_id ?? 'sem') === selectedAtendente)
      .map(o => {
        const pecas = (o.materials ?? []).filter(m => m.is_service !== true);
        const totalPecas = pecas.reduce((s, m) => s + (m.valor || 0) * (parseFloat(m.quantidade) || 0), 0);
        totalDisplay += totalPecas;
        const atRate = memberMap.get(o.atendimento_id ?? '')?.commission_rate ?? 0;
        return { id: o.id, created_at: o.created_at, client_name: o.client_name, equipment: o.equipment, pecas, totalPecas, atRate };
      })
      .filter(o => o.totalPecas > 0)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return { filteredOS: lista, totalPecasOS: totalDisplay, totalComissaoPecasOS };
  }, [serviceOrders, startDate, endDate, selectedAtendente, members, memberMap]);

  // Totais gerais
  const { totalVendas, totalComissaoBalcao } = useMemo(() => {
    let vendas = 0;
    let comissao = 0;
    filteredOrders.forEach(o => {
      const itemsTotal = (o.balcao_items ?? []).reduce((s, i) => s + i.unit_price * i.quantity, 0);
      const effective = o.discount_pct > 0 ? itemsTotal * (1 - o.discount_pct / 100) : itemsTotal;
      vendas += effective;
      const membro = o.atendente_id ? memberMap.get(o.atendente_id) : null;
      comissao += effective * ((membro?.commission_rate ?? 0) / 100);
    });
    return { totalVendas: vendas, totalComissaoBalcao: comissao };
  }, [filteredOrders, memberMap]);

  // Resumo por atendente (para os cards clicáveis)
  const porAtendente = useMemo(() => {
    const map: Record<string, { name: string; receita: number; comissao: number; rate: number; onParts: boolean; notas: number }> = {};
    filteredOrders.forEach(o => {
      const itemsTotal = (o.balcao_items ?? []).reduce((s, i) => s + i.unit_price * i.quantity, 0);
      const effective = o.discount_pct > 0 ? itemsTotal * (1 - o.discount_pct / 100) : itemsTotal;
      const atId = o.atendente_id ?? 'sem';
      const membro = atId !== 'sem' ? memberMap.get(atId) : null;
      const nome = membro?.name ?? 'Sem atendente';
      const rate = membro?.commission_rate ?? 0;
      const onParts = membro?.commission_on_parts ?? false;
      if (!map[atId]) map[atId] = { name: nome, receita: 0, comissao: 0, rate, onParts, notas: 0 };
      map[atId].receita += effective;
      map[atId].comissao += effective * (rate / 100);
      map[atId].notas += 1;
    });
    return map;
  }, [filteredOrders, memberMap, totalPecasOS]);

  const hasFilter = startDate && endDate;

  return (
    <div className="space-y-5 pb-24">
      {/* Filtros */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
            <div className="space-y-2 md:col-span-4">
              <Label>Atendente</Label>
              <Select value={selectedAtendente} onValueChange={setSelectedAtendente}>
                <SelectTrigger className="bg-background text-foreground border-input">
                  <SelectValue placeholder="Todos os atendentes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os atendentes</SelectItem>
                  {members.map(m => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name} ({m.commission_rate}%)
                    </SelectItem>
                  ))}
                  <SelectItem value="sem">Sem atendente</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 md:col-span-8">
              <Label className="flex items-center gap-2">
                <CalendarIcon className="h-4 w-4" /> Período
              </Label>
              <div className="flex gap-2 items-center">
                <Popover open={showDatePicker} onOpenChange={setShowDatePicker}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="h-10 w-full justify-between bg-background text-foreground border-input">
                      <span className="flex items-center gap-2">
                        <CalendarIcon className="h-4 w-4" />
                        {dateRange?.from ? (
                          dateRange.to
                            ? <>{format(dateRange.from, 'dd/MM/yyyy')} até {format(dateRange.to, 'dd/MM/yyyy')}</>
                            : <>{format(dateRange.from, 'dd/MM/yyyy')}</>
                        ) : 'Selecione o período'}
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
                <Button
                  variant="outline"
                  className="h-10 bg-background text-foreground border-input"
                  onClick={() => { setDateRange(undefined); setStartDate(''); setEndDate(''); setShowDatePicker(false); }}
                >
                  Limpar
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cards por atendente (clicáveis para filtrar) */}
      {hasFilter && selectedAtendente === 'todos' && Object.keys(porAtendente).length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {Object.entries(porAtendente).map(([id, data]) => (
            <Card key={id} className="cursor-pointer hover:bg-accent" onClick={() => setSelectedAtendente(id)}>
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground">{data.name}</p>
                <p className="text-base font-bold">R$ {data.receita.toFixed(2)}</p>
                <p className="text-xs text-muted-foreground">
                  {data.notas} nota{data.notas !== 1 ? 's' : ''}
                  {data.onParts && <span className="ml-1 text-blue-500">· +peças OS</span>}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Cards de resumo coloridos */}
      {hasFilter && (
        <Card>
          <CardContent className="p-4">
            {(() => {
              const showPecasOS = (selectedAtendente === 'todos' ? Object.values(porAtendente).some(a => a.onParts) : (memberMap.get(selectedAtendente)?.commission_on_parts ?? false)) && totalPecasOS > 0;
              const totalComissao = totalComissaoBalcao + totalComissaoPecasOS;
              return (
                <div className={`grid grid-cols-1 gap-4 ${showPecasOS ? 'md:grid-cols-4' : 'md:grid-cols-3'}`}>
                  <div className="bg-blue-500/10 dark:bg-blue-500/20 p-4 rounded-lg border border-blue-500/20">
                    <p className="text-xs text-blue-600 dark:text-blue-400 font-medium">Total de Notas</p>
                    <p className="text-2xl font-bold text-blue-900 dark:text-blue-100">{filteredOrders.length}</p>
                  </div>
                  <div className="bg-green-500/10 dark:bg-green-500/20 p-4 rounded-lg border border-green-500/20">
                    <p className="text-xs text-green-600 dark:text-green-400 font-medium">Total Vendas Balcão</p>
                    <p className="text-2xl font-bold text-green-900 dark:text-green-100">R$ {totalVendas.toFixed(2)}</p>
                  </div>
                  {showPecasOS && (
                    <div className="bg-purple-500/10 dark:bg-purple-500/20 p-4 rounded-lg border border-purple-500/20">
                      <p className="text-xs text-purple-600 dark:text-purple-400 font-medium">Peças de OS</p>
                      <p className="text-2xl font-bold text-purple-900 dark:text-purple-100">R$ {totalPecasOS.toFixed(2)}</p>
                    </div>
                  )}
                  <div className="bg-orange-500/10 dark:bg-orange-500/20 p-4 rounded-lg border border-orange-500/20">
                    <p className="text-xs text-orange-600 dark:text-orange-400 font-medium">Comissão Total a Pagar</p>
                    <p className="text-2xl font-bold text-orange-900 dark:text-orange-100">R$ {totalComissao.toFixed(2)}</p>
                    {showPecasOS && (
                      <p className="text-xs text-orange-500 mt-1">
                        Balcão R$ {totalComissaoBalcao.toFixed(2)} + Peças R$ {totalComissaoPecasOS.toFixed(2)}
                      </p>
                    )}
                  </div>
                </div>
              );
            })()}
          </CardContent>
        </Card>
      )}

      {/* Lista de notas */}
      {hasFilter ? (
        filteredOrders.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center text-muted-foreground">
              Nenhuma nota finalizada neste período
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {filteredOrders.map(o => {
              const itemsTotal = (o.balcao_items ?? []).reduce((s, i) => s + i.unit_price * i.quantity, 0);
              const effective = o.discount_pct > 0 ? itemsTotal * (1 - o.discount_pct / 100) : itemsTotal;
              const membro = o.atendente_id ? memberMap.get(o.atendente_id) : null;
              const comissao = effective * ((membro?.commission_rate ?? 0) / 100);
              return (
                <Card key={o.id} className={onOpenBalcaoOrder ? 'cursor-pointer hover:bg-accent transition-colors' : ''} onClick={() => onOpenBalcaoOrder?.(o.id)}>
                  <CardContent className="p-4 space-y-2">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 items-start">
                      <div>
                        <p className="text-xs text-muted-foreground">Data</p>
                        <p className="font-medium">{format(new Date(o.finalized_at!), 'dd/MM/yyyy')}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Nota / Cliente</p>
                        <p className="font-medium">#{o.numero} {o.client_name ? `· ${o.client_name}` : ''}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Total</p>
                        <p className="font-semibold text-green-600">R$ {effective.toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Comissão</p>
                        <p className="font-semibold text-orange-600">R$ {comissao.toFixed(2)}</p>
                      </div>
                    </div>
                    {(o.balcao_items ?? []).length > 0 && (
                      <div className="border-t pt-2 space-y-1">
                        {(o.balcao_items ?? []).map(item => (
                          <div key={item.id} className="flex justify-between text-sm bg-muted/50 rounded px-2 py-1">
                            <span className="text-muted-foreground">{item.quantity}x {item.description}</span>
                            <span>R$ {(item.unit_price * item.quantity).toFixed(2)}</span>
                          </div>
                        ))}
                        {o.discount_pct > 0 && (
                          <div className="flex justify-between text-sm text-red-500 px-2">
                            <span>Desconto ({o.discount_pct}%)</span>
                            <span>- R$ {(itemsTotal - effective).toFixed(2)}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )
      ) : (
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground">
            Selecione um período para visualizar o relatório
          </CardContent>
        </Card>
      )}

      {/* Seção de peças das OS (só aparece quando commission_on_parts está ativo para o atendente selecionado) */}
      {hasFilter && filteredOS.length > 0 && (() => {
        const showSection = selectedAtendente === 'todos'
          ? Object.values(porAtendente).some(a => a.onParts)
          : (memberMap.get(selectedAtendente)?.commission_on_parts ?? false);
        if (!showSection) return null;
        return (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-muted-foreground">Peças de OS incluídas na comissão</h3>
              <span className="text-sm font-semibold">Total: R$ {totalPecasOS.toFixed(2)}</span>
            </div>
            {filteredOS.map(o => {
              const comissaoOS = o.totalPecas * (o.atRate / 100);
              return (
              <Card key={o.id} className={`border-blue-500/20 ${onOpenOrder ? 'cursor-pointer hover:bg-accent transition-colors' : ''}`} onClick={() => onOpenOrder?.(o.id)}>
                <CardContent className="p-4 space-y-2">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground">Data</p>
                      <p className="font-medium">{format(new Date(o.created_at), 'dd/MM/yyyy')}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Cliente / Moto</p>
                      <p className="font-medium">{o.client_name} · {o.equipment}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Total Peças</p>
                      <p className="font-semibold text-green-600">R$ {o.totalPecas.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Comissão</p>
                      <p className="font-semibold text-orange-500">R$ {comissaoOS.toFixed(2)}</p>
                    </div>
                  </div>
                  <div className="border-t pt-2 space-y-1">
                    {o.pecas.map((m, i) => (
                      <div key={i} className="flex justify-between text-sm bg-muted/50 rounded px-2 py-1">
                        <span className="text-muted-foreground">{m.quantidade}x {m.descricao}</span>
                        <span>R$ {((m.valor || 0) * (parseFloat(m.quantidade) || 0)).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
              );
            })}
          </div>
        );
      })()}
    </div>
  );
}
