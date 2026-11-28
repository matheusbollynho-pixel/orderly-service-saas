// Relatórios: Resumo · Vendas · Oficina · Clientes · Equipe · Estoque · Vencimentos · Pagamentos.
// Limpeza 24/11: saiu o Resumo antigo (só somava serviços; o novo bate com o Caixa) e a aba Peças
// (peças por mecânico estão em Equipe → Por mecânico; mais vendidos em Vendas e em Estoque → ABC).
// Comissões, Mecânicos e Balcão viraram a aba Equipe. Pagamentos continua: lança/edita/exclui pagamento de OS.
import { useEffect, useState } from 'react';
import { useServiceOrders } from '@/hooks/useServiceOrders';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { MechanicDetailReport } from './MechanicDetailReport';
import { BalcaoCommissionReport } from './BalcaoCommissionReport';
import { PaymentsTab } from '@/components/PaymentsTab';
import ResumoV2 from '@/components/relatorios/ResumoV2';
import PagamentosEquipe from '@/components/equipe/PagamentosEquipe';
import RelatoriosEstoque from '@/components/relatorios/RelatoriosEstoque';
import Vencimentos from '@/components/relatorios/Vencimentos';
import RelatorioVendas from '@/components/relatorios/RelatorioVendas';
import RelatorioOficina from '@/components/relatorios/RelatorioOficina';
import RelatorioNfse from '@/components/relatorios/RelatorioNfse';
import RelatorioClientes from '@/components/relatorios/RelatorioClientes';
import HistoricoAcoes from '@/components/relatorios/HistoricoAcoes';
import { useStore } from '@/contexts/StoreContext';

type Period = 'week' | 'month' | 'all';
type Aba = 'resumo' | 'vendas' | 'oficina' | 'nfse' | 'clientes' | 'equipe' | 'estoque' | 'vencimentos' | 'pagamentos' | 'historico';
type ParteEquipe = 'comissoes' | 'mecanicos' | 'balcao';

interface ReportsPageProps {
  onOpenOrder?: (id: string) => void;
  onOpenBalcaoOrder?: (id: string) => void;
  /** Abre o Caixa no dia do lançamento, já destacado. */
  onOpenCaixa?: (data: string, id: string) => void;
}

const ABAS: { id: Aba; nome: string }[] = [
  { id: 'resumo', nome: 'Resumo' },
  { id: 'vendas', nome: 'Vendas' },
  { id: 'oficina', nome: 'Oficina' },
  { id: 'nfse', nome: 'Notas de serviço' },
  { id: 'clientes', nome: 'Clientes' },
  { id: 'equipe', nome: 'Equipe' },
  { id: 'estoque', nome: 'Estoque' },
  { id: 'vencimentos', nome: 'Vencimentos' },
  { id: 'pagamentos', nome: 'Pagamentos' },
  { id: 'historico', nome: 'Histórico' },
];

export function ReportsPage({ onOpenOrder, onOpenBalcaoOrder, onOpenCaixa }: ReportsPageProps = {}) {
  const { orders, isLoading, createPayment, deletePayment, updatePayment } = useServiceOrders();
  const [period, setPeriod] = useState<Period>('month');
  const [activeTab, setActiveTab] = useState<Aba>('resumo');
  const [parteEquipe, setParteEquipe] = useState<ParteEquipe>('comissoes');
  // Histórico (quem cancelou, deu desconto...): só o dono vê a aba
  const { isOwner } = useStore();
  const abas = ABAS.filter((a) => a.id !== 'historico' || isOwner);

  // Atalho antigo de outras telas: abre o relatório por mecânico
  useEffect(() => {
    const handler = () => { setActiveTab('equipe'); setParteEquipe('mecanicos'); };
    window.addEventListener('reports:openDetailed', handler as EventListener);
    return () => window.removeEventListener('reports:openDetailed', handler as EventListener);
  }, []);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Relatórios</h2>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as Aba)} className="w-full">
        {/* Celular: as abas rolam para o lado; PC: cabem inteiras */}
        <TabsList className="w-full justify-start overflow-x-auto overflow-y-hidden scrollbar-hide">
          {abas.map((a) => (
            <TabsTrigger key={a.id} value={a.id} className="flex-1 shrink-0">{a.nome}</TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="resumo"><ResumoV2 onOpenCaixa={onOpenCaixa} /></TabsContent>
        <TabsContent value="vendas"><RelatorioVendas /></TabsContent>
        <TabsContent value="oficina"><RelatorioOficina onOpenOrder={onOpenOrder} /></TabsContent>
        <TabsContent value="nfse"><RelatorioNfse onOpenOrder={onOpenOrder} /></TabsContent>
        <TabsContent value="clientes"><RelatorioClientes /></TabsContent>

        <TabsContent value="equipe" className="space-y-4">
          <div className="flex flex-wrap gap-1">
            <Button size="sm" variant={parteEquipe === 'comissoes' ? 'default' : 'outline'} onClick={() => setParteEquipe('comissoes')}>Pagamentos</Button>
            <Button size="sm" variant={parteEquipe === 'mecanicos' ? 'default' : 'outline'} onClick={() => setParteEquipe('mecanicos')}>Por mecânico</Button>
            <Button size="sm" variant={parteEquipe === 'balcao' ? 'default' : 'outline'} onClick={() => setParteEquipe('balcao')}>Balcão (atendentes)</Button>
          </div>
          {parteEquipe === 'comissoes' ? (
            <PagamentosEquipe />
          ) : parteEquipe === 'mecanicos' ? (
            <MechanicDetailReport onBack={() => setParteEquipe('comissoes')} onOpenOrder={onOpenOrder} />
          ) : (
            <BalcaoCommissionReport onOpenOrder={onOpenOrder} onOpenBalcaoOrder={onOpenBalcaoOrder} />
          )}
        </TabsContent>

        <TabsContent value="estoque" className="space-y-5"><RelatoriosEstoque /></TabsContent>
        <TabsContent value="vencimentos"><Vencimentos /></TabsContent>
        {isOwner && <TabsContent value="historico"><HistoricoAcoes /></TabsContent>}

        <TabsContent value="pagamentos" className="space-y-5">
          <PaymentsTab
            orders={orders}
            isLoading={isLoading}
            onOpenOrder={onOpenOrder}
            period={period}
            onPeriodChange={(v) => setPeriod(v as Period)}
            onAddPayment={({ order_id, amount, discount_amount, method, reference, notes }) => {
              createPayment({ order_id, amount, discount_amount, method, reference, notes });
            }}
            onDeletePayment={(id, motivo) => {
              deletePayment({ id, motivo });
            }}
            onUpdatePayment={(payload) => {
              updatePayment(payload);
            }}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
