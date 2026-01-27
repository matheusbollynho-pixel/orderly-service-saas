import { useMemo, useState } from 'react';
import { useServiceOrders } from '@/hooks/useServiceOrders';
import { useMechanics } from '@/hooks/useMechanics';
import { Mechanic } from '@/types/service-order';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowLeft, Calendar, Check, X } from 'lucide-react';
import { format, parseISO } from 'date-fns';

interface MechanicDetailReportProps {
  onBack: () => void;
}

export function MechanicDetailReport({ onBack }: MechanicDetailReportProps) {
  const { orders, isLoading, markMaterialAsPaid, markMaterialAsUnpaid } = useServiceOrders();
  const { mechanics } = useMechanics();
  const [selectedMechanicId, setSelectedMechanicId] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [showPaid, setShowPaid] = useState<boolean>(false);

  const selectedMechanic = useMemo(() => {
    return mechanics.find(m => m.id === selectedMechanicId);
  }, [selectedMechanicId, mechanics]);

  const filteredOrders = useMemo(() => {
    console.log('🔄 useMemo executado com:', { selectedMechanicId, startDate, endDate, ordersCount: orders.length });
    
    if (!selectedMechanicId) {
      console.log('❌ Sem mecânico selecionado');
      return [];
    }
    if (!startDate) {
      console.log('❌ Sem data inicial');
      return [];
    }
    if (!endDate) {
      console.log('❌ Sem data final');
      return [];
    }

    // Corrigir a data para timezone local (input date vem no formato YYYY-MM-DD)
    const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
    const start = new Date(startYear, startMonth - 1, startDay, 0, 0, 0, 0);
    
    const [endYear, endMonth, endDay] = endDate.split('-').map(Number);
    const end = new Date(endYear, endMonth - 1, endDay, 23, 59, 59, 999);

    console.log('📅 Datas de filtro:', {
      startDateInput: startDate,
      endDateInput: endDate,
      startCompare: start.toISOString(),
      endCompare: end.toISOString()
    });

    console.log('📋 Todos os status das ordens:', orders.map(o => ({ id: o.id, status: o.status, date: o.created_at })));

    const filtered = orders
      .filter(o => {
        console.log(`🔍 Verificando status de ${o.id}: "${o.status}" === "concluida"?`, o.status === 'concluida');
        return o.status === 'concluida';
      })
      .filter(o => {
        const hasMechanicInOS = o.mechanic_id === selectedMechanicId;
        const hasMechanicInMaterials = (o.materials || []).some(m => m.mechanic_id === selectedMechanicId);
        console.log(`👤 OS ${o.id} tem mecânico? OS: ${hasMechanicInOS}, Materials: ${hasMechanicInMaterials}`);
        return hasMechanicInOS || hasMechanicInMaterials;
      })
      .filter(o => {
        const osDate = new Date(o.created_at);
        const isInRange = osDate >= start && osDate <= end;
        console.log(`⏰ OS ${o.id} (${osDate.toLocaleDateString('pt-BR')}) está entre ${start.toLocaleDateString('pt-BR')} e ${end.toLocaleDateString('pt-BR')}?`, isInRange);
        return isInRange;
      })
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    console.log(`✅ Resultado da filtragem: ${filtered.length} ordens encontradas`);
    return filtered;
  }, [orders, selectedMechanicId, startDate, endDate]);

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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Mecânico</Label>
              <Select value={selectedMechanicId} onValueChange={setSelectedMechanicId}>
                <SelectTrigger>
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

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Calendar className="h-4 w-4" /> Data Inicial
              </Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Calendar className="h-4 w-4" /> Data Final
              </Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
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
              <div className="bg-blue-50 p-4 rounded-lg">
                <p className="text-xs text-blue-600 font-medium">Total de OS</p>
                <p className="text-2xl font-bold text-blue-900">{filteredOrders.length}</p>
              </div>
              <div className="bg-green-50 p-4 rounded-lg">
                <p className="text-xs text-green-600 font-medium">Faturado (Serviços)</p>
                <p className="text-2xl font-bold text-green-900">R$ {totalServicos.toFixed(2)}</p>
              </div>
              <div className="bg-purple-50 p-4 rounded-lg">
                <p className="text-xs text-purple-600 font-medium">Vendido (Peças)</p>
                <p className="text-2xl font-bold text-purple-900">R$ {totalPecas.toFixed(2)}</p>
              </div>
              <div className="bg-orange-50 p-4 rounded-lg">
                <p className="text-xs text-orange-600 font-medium">Comissão a Pagar</p>
                <p className="text-2xl font-bold text-orange-900">R$ {totalComissao.toFixed(2)}</p>
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

              if (servicosFiltrados.length === 0) return null;

              const totalServicos = servicosFiltrados.reduce((acc, m) => {
                const qtd = parseFloat(m.quantidade) || 0;
                return acc + ((m.valor || 0) * qtd);
              }, 0);
              const comissao = totalServicos * (selectedMechanic.commission_rate / 100);

              return (
                <Card key={order.id}>
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
                              className={`flex items-center justify-between text-sm p-2 rounded border ${m.paid_at ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-50 border-transparent'}`}
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
                                    markMaterialAsUnpaid(m.id);
                                  } else {
                                    markMaterialAsPaid(m.id);
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
