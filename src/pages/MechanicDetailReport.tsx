import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useServiceOrders } from '@/hooks/useServiceOrders';
import { useMechanics } from '@/hooks/useMechanics';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as DateCalendar } from '@/components/ui/calendar';
import { ArrowLeft, Calendar as CalendarIcon, ChevronDown, Check, X } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { DateRange } from 'react-day-picker';

interface MechanicDetailReportProps {
  onBack: () => void;
  onOpenOrder?: (id: string) => void;
}

export function MechanicDetailReport({ onBack, onOpenOrder }: MechanicDetailReportProps) {
  const { markMaterialAsPaid, markMaterialAsUnpaid } = useServiceOrders();
  const queryClient = useQueryClient();
  const { mechanics } = useMechanics();
  const [selectedMechanicId, setSelectedMechanicId] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showPaid, setShowPaid] = useState<boolean>(false);

  useEffect(() => {
    setStartDate(dateRange?.from ? format(dateRange.from, 'yyyy-MM-dd') : '');
    setEndDate(dateRange?.to ? format(dateRange.to, 'yyyy-MM-dd') : '');
  }, [dateRange]);

  const selectedMechanic = useMemo(() => {
    return mechanics.find(m => m.id === selectedMechanicId);
  }, [selectedMechanicId, mechanics]);

  // Query dedicada: busca OS onde o mecânico é responsável pela OS OU tem serviços atribuídos a ele
  const { data: filteredOrders = [], isLoading } = useQuery({
    queryKey: ['mechanic-report', selectedMechanicId, startDate, endDate],
    queryFn: async () => {
      if (!selectedMechanicId || !startDate || !endDate) return [];

      const [sy, sm, sd] = startDate.split('-').map(Number);
      const [ey, em, ed] = endDate.split('-').map(Number);
      const start = new Date(sy, sm - 1, sd, 0, 0, 0, 0);
      const end = new Date(ey, em - 1, ed, 23, 59, 59, 999);

      // 1) OS onde o mecânico é o responsável principal
      const q1 = supabase
        .from('service_orders')
        .select(`id, client_name, equipment, status, mechanic_id,
          entry_date, exit_date, conclusion_date, created_at, updated_at,
          materials (*), payments (*)`)
        .eq('mechanic_id', selectedMechanicId)
        .in('status', ['concluida', 'concluida_entregue']);

      // 2) OS onde o mecânico tem materiais de serviço atribuídos a ele
      const q2 = supabase
        .from('materials')
        .select('order_id')
        .eq('mechanic_id', selectedMechanicId)
        .eq('is_service', true);

      const [r1, r2] = await Promise.all([q1, q2]);
      if (r1.error) throw r1.error;
      if (r2.error) throw r2.error;

      // Buscar OS das OS referenciadas nos materiais (que não são do mecânico principal)
      const extraOrderIds = [...new Set((r2.data || []).map(m => m.order_id))];
      const existingIds = new Set((r1.data || []).map(o => o.id));
      const missingIds = extraOrderIds.filter(id => !existingIds.has(id));

      let extraOrders: typeof r1.data = [];
      if (missingIds.length > 0) {
        const r3 = await supabase
          .from('service_orders')
          .select(`id, client_name, equipment, status, mechanic_id,
            entry_date, exit_date, conclusion_date, created_at, updated_at,
            materials (*), payments (*)`)
          .in('id', missingIds)
          .in('status', ['concluida', 'concluida_entregue']);
        if (r3.error) throw r3.error;
        extraOrders = r3.data || [];
      }

      const allOrders = [...(r1.data || []), ...extraOrders];

      // Filtrar por data de conclusão/saída no intervalo selecionado
      return allOrders.filter(o => {
        const osDate = new Date(o.exit_date || o.updated_at || o.created_at);
        return osDate >= start && osDate <= end;
      });
    },
    enabled: !!(selectedMechanicId && startDate && endDate),
    staleTime: 30 * 1000,
  });

  const { totalServicos, totalComissao, totalPecas } = useMemo(() => {
    let totalServicos = 0;
    let totalComissao = 0;
    let totalPecas = 0;

    filteredOrders.forEach(o => {
      (o.materials || [])
        .forEach(material => {
          // Se material tem seu próprio mechanic_id, só conta se for do mechanic selecionado
          if (material.mechanic_id && material.mechanic_id !== selectedMechanicId) {
            return;
          }
          const qtd = parseFloat(material.quantidade) || 0;
          const valor = (material.valor || 0) * qtd;
          
          if (material.is_service === true) {
            totalServicos += valor;
            if (selectedMechanic) {
              totalComissao += valor * (selectedMechanic.commission_rate / 100);
            }
          } else {
            // É uma peça
            totalPecas += valor;
          }
        });
    });

    return { totalServicos, totalComissao, totalPecas };
  }, [filteredOrders, selectedMechanic, selectedMechanicId]);

  return (
    <div className="space-y-5 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h2 className="text-lg font-semibold">Relatório Detalhado por Mecânico</h2>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
            <div className="space-y-2 md:col-span-4">
              <Label>Mecânico</Label>
              <Select value={selectedMechanicId} onValueChange={setSelectedMechanicId}>
                <SelectTrigger className="bg-background text-foreground border-input">
                  <SelectValue placeholder="Selecione um mecânico" />
                </SelectTrigger>
                <SelectContent>
                  {mechanics.map(m => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name} ({m.commission_rate}%)
                    </SelectItem>
                  ))}
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

                <Button
                  variant="outline"
                  className="h-10 bg-background text-foreground border-input"
                  onClick={() => {
                    setDateRange(undefined);
                    setStartDate('');
                    setEndDate('');
                    setShowDatePicker(false);
                  }}
                >
                  Limpar
                </Button>
              </div>
            </div>
          </div>
          
          {/* Filtro de Pagamento */}
          <div className="border-t pt-4 mt-4">
            <div className="flex items-center gap-2">
              <Label>Mostrar:</Label>
              <Button 
                variant={!showPaid ? 'default' : 'outline'} 
                size="sm"
                onClick={() => setShowPaid(false)}
              >
                Não Pagos
              </Button>
              <Button 
                variant={showPaid ? 'default' : 'outline'} 
                size="sm"
                onClick={() => setShowPaid(true)}
              >
                Pagos
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Resumo */}
      {selectedMechanic && startDate && endDate && (
        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-blue-500/10 dark:bg-blue-500/20 p-4 rounded-lg border border-blue-500/20">
                <p className="text-xs text-blue-600 dark:text-blue-400 font-medium">Total de OS</p>
                <p className="text-2xl font-bold text-blue-900 dark:text-blue-100">{filteredOrders.length}</p>
              </div>
              <div className="bg-green-500/10 dark:bg-green-500/20 p-4 rounded-lg border border-green-500/20">
                <p className="text-xs text-green-600 dark:text-green-400 font-medium">Faturado (Serviços)</p>
                <p className="text-2xl font-bold text-green-900 dark:text-green-100">R$ {totalServicos.toFixed(2)}</p>
              </div>
              <div className="bg-purple-500/10 dark:bg-purple-500/20 p-4 rounded-lg border border-purple-500/20">
                <p className="text-xs text-purple-600 dark:text-purple-400 font-medium">Vendido (Peças)</p>
                <p className="text-2xl font-bold text-purple-900 dark:text-purple-100">R$ {totalPecas.toFixed(2)}</p>
              </div>
              <div className="bg-orange-500/10 dark:bg-orange-500/20 p-4 rounded-lg border border-orange-500/20">
                <p className="text-xs text-orange-600 dark:text-orange-400 font-medium">Comissão a Pagar</p>
                <p className="text-2xl font-bold text-orange-900 dark:text-orange-100">R$ {totalComissao.toFixed(2)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Listagem de OS */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : selectedMechanic && startDate && endDate ? (
        <div className="space-y-3">
          {filteredOrders.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground">
                Nenhuma ordem concluída neste período
              </CardContent>
            </Card>
          ) : (
            filteredOrders.map((order) => {
              const servicosDomec = (order.materials || [])
                .filter(m => m.is_service === true)
                .filter(m => !m.mechanic_id || m.mechanic_id === selectedMechanicId);

              // Filtrar por status de pagamento
              const servicosFiltrados = servicosDomec.filter(m =>
                showPaid ? m.paid_at !== null && m.paid_at !== undefined : !m.paid_at
              );

              const totalServicos = servicosFiltrados.reduce((acc, m) => {
                const qtd = parseFloat(m.quantidade) || 0;
                return acc + ((m.valor || 0) * qtd);
              }, 0);
              const comissao = totalServicos * (selectedMechanic.commission_rate / 100);

              return (
                <Card key={order.id} className={onOpenOrder ? 'cursor-pointer hover:bg-accent transition-colors' : ''} onClick={() => onOpenOrder?.(order.id)}>
                  <CardContent className="p-4 space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-start">
                      <div>
                        <p className="text-xs text-muted-foreground">Data</p>
                        <p className="font-medium">{format(new Date(order.created_at), 'dd/MM/yyyy')}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Moto</p>
                        <p className="font-medium">{order.equipment}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Serviços (Valor)</p>
                        <p className="font-semibold text-green-600">R$ {totalServicos.toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Comissão</p>
                        <p className="font-semibold text-orange-600">R$ {comissao.toFixed(2)}</p>
                      </div>
                    </div>

                    {/* Detalhes dos serviços */}
                    {servicosFiltrados.length > 0 && (
                      <div className="border-t pt-3">
                        <p className="text-xs font-medium text-muted-foreground mb-2">Serviços prestados por este mecânico:</p>
                        <div className="space-y-2">
                          {servicosFiltrados.map((m, i) => (
                            <div
                              key={i}
                              className={`flex items-center justify-between text-sm p-2 rounded border ${m.paid_at ? 'bg-green-500/10 dark:bg-green-500/20 text-green-700 dark:text-green-300 border-green-200 dark:border-green-500/30' : 'bg-muted/50 border-border/50'}`}
                            >
                              <div className="flex-1">
                                <span className="opacity-80">{m.descricao} ({m.quantidade})</span>
                                <span className="font-medium ml-2">R$ {m.valor.toFixed(2)}</span>
                              </div>
                              <Button
                                size="sm"
                                variant={m.paid_at ? 'default' : 'outline'}
                                onClick={() => {
                                  if (m.paid_at) {
                                    markMaterialAsUnpaid(m.id, {
                                      onSuccess: () => queryClient.invalidateQueries({ queryKey: ['mechanic-report'] }),
                                    });
                                  } else {
                                    markMaterialAsPaid(m.id, {
                                      onSuccess: () => queryClient.invalidateQueries({ queryKey: ['mechanic-report'] }),
                                    });
                                  }
                                }}
                                className={`ml-2 h-7 ${m.paid_at ? 'bg-green-600 hover:bg-green-700 text-white' : ''}`}
                              >
                                {m.paid_at ? (
                                  <>
                                    <Check className="h-3 w-3 mr-1" />
                                    Pago em {format(new Date(m.paid_at), 'dd/MM')}
                                  </>
                                ) : (
                                  <>
                                    <X className="h-3 w-3 mr-1" />
                                    Marcar como pago
                                  </>
                                )}
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      ) : (
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground">
            Selecione um mecânico e um período para visualizar o relatório
          </CardContent>
        </Card>
      )}
    </div>
  );
}
