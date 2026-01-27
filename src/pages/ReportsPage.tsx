import { useEffect, useMemo, useState } from 'react';
import { useServiceOrders } from '@/hooks/useServiceOrders';
import { useMechanics } from '@/hooks/useMechanics';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MechanicDetailReport } from './MechanicDetailReport';
import { PaymentsTab } from '@/components/PaymentsTab';

type Period = 'week' | 'month';

export function ReportsPage() {
  const { orders, isLoading, createPayment, deletePayment } = useServiceOrders();
  const { mechanics } = useMechanics();
  const [period, setPeriod] = useState<Period>('month');
  const [activeTab, setActiveTab] = useState<'resumo' | 'detalhado' | 'itens' | 'pagamentos'>('resumo');
  const [itemsQuery, setItemsQuery] = useState('');
  const [selectedMechanicFilter, setSelectedMechanicFilter] = useState<string>('todos');

  const startOfWeek = () => {
    const d = new Date();
    const day = d.getDay(); // 0 (Dom) .. 6 (Sáb)
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Segunda como início
    const date = new Date(d.setDate(diff));
    date.setHours(0, 0, 0, 0);
    return date;
  };
  const startOfMonth = () => {
    const date = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    date.setHours(0, 0, 0, 0);
    return date;
  };

  const rangeStart = period === 'week' ? startOfWeek() : startOfMonth();

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);

  const { totalGeral, porMecanico } = useMemo(() => {
    const mecMap = new Map(mechanics.map(m => [m.id, m]));
    let total = 0; // total geral (APENAS serviços)
    const porMec: Record<string, { name: string; receita: number; comissao: number; rate: number } > = {};

    orders
      .filter(o => o.status === 'concluida')
      .filter(o => new Date(o.created_at) >= rangeStart)
      .forEach(o => {
        // Processa apenas serviços para o total geral e por mecânico
        (o.materials || [])
          .filter(m => m.is_service === true)
          .forEach(material => {
            const qtd = parseFloat(material.quantidade) || 0;
            const valor = (material.valor || 0) * qtd;
            total += valor;

            const mecId = material.mechanic_id || o.mechanic_id || 'sem';
            const mec = mecMap.get(material.mechanic_id || o.mechanic_id || '');
            const nome = mec?.name || 'Sem mecânico';
            const rate = mec?.commission_rate ?? 0;
            const comissao = valor * (rate / 100);

            if (!porMec[mecId]) porMec[mecId] = { name: nome, receita: 0, comissao: 0, rate };
            porMec[mecId].receita += valor;
            porMec[mecId].comissao += comissao;
          });
      });

    return { totalGeral: total, porMecanico: porMec };
  }, [orders, mechanics, rangeStart]);

  // Resumo de peças (itens) por período
  const { totalPecas, pecasPorOS, pecasPorMecanico } = useMemo(() => {
    const mecMap = new Map(mechanics.map(m => [m.id, m]));
    let total = 0;
    const lista: Array<{ 
      id: string; 
      created_at: string; 
      equipment: string; 
      client_name: string; 
      total: number;
      mechanic_id?: string;
      mechanic_name?: string;
    }> = [];
    const porMec: Record<string, { name: string; total: number }> = {};

    orders
      .filter(o => o.status === 'concluida')
      .filter(o => new Date(o.created_at) >= rangeStart)
      .forEach(o => {
        let somaOS = 0;
        // Mecânico é o da OS, não do material individual
        const mecId = o.mechanic_id || 'sem';
        const mec = mecMap.get(mecId);
        const mecName = mec?.name || 'Sem mecânico';
        
        // Soma todas as peças da OS (não serviços)
        (o.materials || [])
          .filter(m => m.is_service !== true)
          .forEach(m => {
            const valor = (m.valor || 0) * (parseFloat(m.quantidade) || 0);
            somaOS += valor;
          });
        
        if (somaOS > 0) {
          // Atribui todas as peças ao mecânico da OS
          if (!porMec[mecId]) porMec[mecId] = { name: mecName, total: 0 };
          porMec[mecId].total += somaOS;
          
          lista.push({ 
            id: o.id, 
            created_at: o.created_at, 
            equipment: o.equipment, 
            client_name: o.client_name, 
            total: somaOS,
            mechanic_id: mecId,
            mechanic_name: mecName
          });
          total += somaOS;
        }
      });

    // Ordenar por data desc
    lista.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return { totalPecas: total, pecasPorOS: lista, pecasPorMecanico: porMec };
  }, [orders, rangeStart, mechanics]);

  const filteredPecas = useMemo(() => {
    const q = itemsQuery.trim().toLowerCase();
    let filtered = pecasPorOS;
    
    // Filtro por mecânico
    if (selectedMechanicFilter !== 'todos') {
      filtered = filtered.filter(item => 
        item.mechanic_id === selectedMechanicFilter
      );
    }
    
    // Filtro por busca
    if (q) {
      filtered = filtered.filter(item =>
        item.client_name.toLowerCase().includes(q) ||
        item.equipment.toLowerCase().includes(q)
      );
    }
    
    return filtered;
  }, [itemsQuery, pecasPorOS, selectedMechanicFilter]);

  useEffect(() => {
    const handler = () => setActiveTab('detalhado');
    window.addEventListener('reports:openDetailed', handler as any);
    return () => window.removeEventListener('reports:openDetailed', handler as any);
  }, []);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Relatórios</h2>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
        <TabsList className="grid grid-cols-4 w-full">
          <TabsTrigger value="resumo">Resumo</TabsTrigger>
          <TabsTrigger value="detalhado">Mecânicos</TabsTrigger>
          <TabsTrigger value="itens">Peças</TabsTrigger>
          <TabsTrigger value="pagamentos">Pagtos</TabsTrigger>
        </TabsList>

        <TabsContent value="resumo" className="space-y-5">
          <div className="flex items-center justify-between">
            <div />
            <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="week">Semana atual</SelectItem>
                <SelectItem value="month">Mês atual</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Faturado (serviços - {period === 'week' ? 'semana' : 'mês'})</p>
              <p className="text-2xl font-bold">R$ {totalGeral.toFixed(2)}</p>
            </CardContent>
          </Card>

          <div className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground">Por mecânico</h3>
            {isLoading ? (
              <p>Carregando...</p>
            ) : (
              <div className="space-y-2">
                {Object.entries(porMecanico).map(([id, data]) => (
                  <Card key={id}>
                    <CardContent className="p-4 flex items-center justify-between">
                      <div>
                        <p className="font-medium">{data.name}</p>
                        <p className="text-xs text-muted-foreground">Comissão: {data.rate}%</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm">Receita: <span className="font-semibold">R$ {data.receita.toFixed(2)}</span></p>
                        <p className="text-sm">A pagar: <span className="font-semibold">R$ {data.comissao.toFixed(2)}</span></p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="detalhado">
          <MechanicDetailReport onBack={() => setActiveTab('resumo')} />
        </TabsContent>

        <TabsContent value="itens" className="space-y-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <Input
              placeholder="Buscar cliente ou moto..."
              value={itemsQuery}
              onChange={(e) => setItemsQuery(e.target.value)}
              className="h-10 sm:col-span-2"
            />
            <Select value={selectedMechanicFilter} onValueChange={setSelectedMechanicFilter}>
              <SelectTrigger className="w-full h-10">
                <SelectValue placeholder="Todos mecânicos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos mecânicos</SelectItem>
                {mechanics.map(m => (
                  <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                ))}
                <SelectItem value="sem">Sem mecânico</SelectItem>
              </SelectContent>
            </Select>
            <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
              <SelectTrigger className="w-full h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="week">Semana atual</SelectItem>
                <SelectItem value="month">Mês atual</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Cards resumo por mecânico */}
          {selectedMechanicFilter === 'todos' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {Object.entries(pecasPorMecanico).map(([id, data]) => (
                <Card key={id} className="cursor-pointer hover:bg-accent" onClick={() => setSelectedMechanicFilter(id)}>
                  <CardContent className="p-3">
                    <p className="text-xs text-muted-foreground">{data.name}</p>
                    <p className="text-lg font-bold">R$ {data.total.toFixed(2)}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">
                Peças ({period === 'week' ? 'semana' : 'mês'})
                {selectedMechanicFilter !== 'todos' && (
                  <span className="ml-2">
                    - {mechanics.find(m => m.id === selectedMechanicFilter)?.name || 'Sem mecânico'}
                  </span>
                )}
              </p>
              <p className="text-2xl font-bold">
                R$ {selectedMechanicFilter === 'todos' 
                  ? totalPecas.toFixed(2) 
                  : (pecasPorMecanico[selectedMechanicFilter]?.total || 0).toFixed(2)}
              </p>
            </CardContent>
          </Card>

          {isLoading ? (
            <p>Carregando...</p>
          ) : filteredPecas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem peças no período selecionado.</p>
          ) : (
            <div className="space-y-2">
              {filteredPecas.map(item => (
                <Card key={item.id}>
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="flex-1">
                      <p className="text-xs text-muted-foreground">{new Date(item.created_at).toLocaleDateString('pt-BR')}</p>
                      <p className="font-medium">{item.client_name}</p>
                      <p className="text-sm text-muted-foreground">{item.equipment}</p>
                      <p className="text-xs text-muted-foreground italic mt-1">Mecânico: {item.mechanic_name}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm">Total de peças</p>
                      <p className="font-semibold">R$ {item.total.toFixed(2)}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="pagamentos" className="space-y-5">
          <PaymentsTab
            orders={orders}
            isLoading={isLoading}
            period={period}
            onPeriodChange={(v) => setPeriod(v as any)}
            onAddPayment={({ order_id, amount, method, reference, notes }) => {
              createPayment({ order_id, amount, method, reference, notes });
            }}
            onDeletePayment={(id) => {
              deletePayment(id);
            }}
          />
        </TabsContent>

      </Tabs>
    </div>
  );
}
