import { useState, useMemo, useRef } from 'react';
import { useFiados, Fiado, FiadoItem, CreateFiadoInput } from '@/hooks/useFiados';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { useInventory } from '@/hooks/useInventory';
import { sendWhatsAppText } from '@/lib/whatsappService';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  Plus,
  Trash2,
  MessageCircle,
  DollarSign,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Scale,
  ChevronDown,
  History,
  Send,
  HandCoins,
  RefreshCw,
  X,
  Zap,
  Link,
  CalendarClock,
} from 'lucide-react';
import { format, differenceInDays, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type FilterTab = 'todos' | 'pendente' | 'vencidos' | 'parcial' | 'pago' | 'juridico';

const STATUS_COLORS: Record<string, string> = {
  pendente: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  parcial: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  pago: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  juridico: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

const STATUS_LABELS: Record<string, string> = {
  pendente: 'Pendente',
  parcial: 'Parcial',
  pago: 'Pago',
  juridico: 'Jurídico',
};

const ORIGIN_LABELS: Record<string, string> = {
  os: 'OS',
  balcao: 'Balcão',
  manual: 'Manual',
};

const ORIGIN_COLORS: Record<string, string> = {
  os: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  balcao: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  manual: 'bg-gray-100 text-gray-700 dark:bg-gray-800/50 dark:text-gray-400',
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  dinheiro: 'Dinheiro',
  pix: 'PIX',
  cartao_credito: 'Cartão Crédito',
  cartao_debito: 'Cartão Débito',
};

function getToday(): string {
  return new Date().toISOString().split('T')[0];
}

function calcDaysOverdue(dueDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = parseISO(dueDate);
  due.setHours(0, 0, 0, 0);
  return differenceInDays(today, due);
}

function calcBalance(fiado: Fiado): number {
  return Math.max(fiado.original_amount + fiado.interest_accrued - fiado.amount_paid, 0);
}

interface EmptyItemRow {
  desc: string;
  qty: string;
  value: string;
  inventory_product_id?: string;
}

function emptyItem(): EmptyItemRow {
  return { desc: '', qty: '1', value: '', inventory_product_id: undefined };
}

export default function FiadosPage() {
  const { fiados, loading, createFiado, addPayment, updateStatus, deleteFiado, sendReminder, createAsaasCharge, reload } = useFiados();
  const { members: teamMembers } = useTeamMembers();
  const { products: inventoryProducts } = useInventory();

  const [activeTab, setActiveTab] = useState<FilterTab>('todos');
  const [searchQuery, setSearchQuery] = useState('');

  // New fiado dialog
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [newForm, setNewForm] = useState({
    client_name: '',
    client_phone: '',
    client_cpf: '',
    due_date: '',
    notes: '',
    interest_rate_monthly: '2',
  });
  const [newItems, setNewItems] = useState<EmptyItemRow[]>([emptyItem()]);
  const [isCreating, setIsCreating] = useState(false);
  const [productDropdownIdx, setProductDropdownIdx] = useState<number | null>(null);
  const productDropdownRef = useRef<HTMLDivElement>(null);

  // Payment dialog
  const [paymentFiado, setPaymentFiado] = useState<Fiado | null>(null);
  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    method: 'dinheiro',
    received_by: '',
    notes: '',
  });
  const [isPaymentLoading, setIsPaymentLoading] = useState(false);

  // Reminder dialog
  const [reminderFiado, setReminderFiado] = useState<Fiado | null>(null);
  const [reminderLoading, setReminderLoading] = useState(false);

  // History dialog
  const [historyFiado, setHistoryFiado] = useState<Fiado | null>(null);

  // Delete confirm
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Asaas
  const [asaasLoadingId, setAsaasLoadingId] = useState<string | null>(null);

  const handleAsaasCharge = async (fiado: Fiado, billing_type: 'PIX' | 'BOLETO') => {
    setAsaasLoadingId(fiado.id);
    const result = await createAsaasCharge(fiado.id, billing_type);
    setAsaasLoadingId(null);
    if (result?.invoice_url && fiado.client_phone) {
      const typeLabel = billing_type === 'PIX' ? 'PIX' : 'Boleto';
      const msg = `Olá ${fiado.client_name.split(' ')[0]}! 👋\n\nSegue o link para pagamento do seu débito de *R$ ${result.value.toFixed(2)}* via *${typeLabel}*:\n\n${result.invoice_url}\n\nQualquer dúvida, estamos à disposição! 😊`;
      await sendWhatsAppText({ phone: fiado.client_phone, text: msg }).catch(() => null);
    }
  };

  // ── Computed stats ─────────────────────────────────────────────
  const today = getToday();

  const totalEmAberto = useMemo(() =>
    fiados
      .filter(f => f.status !== 'pago')
      .reduce((s, f) => s + calcBalance(f), 0),
    [fiados]
  );

  const countVencidos = useMemo(() =>
    fiados.filter(f => f.status !== 'pago' && f.due_date < today).length,
    [fiados, today]
  );

  const recebidoNoMes = useMemo(() => {
    const now = new Date();
    const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return fiados.reduce((sum, f) => {
      const payments = f.fiado_payments || [];
      return sum + payments.filter(p => p.paid_at.startsWith(yearMonth)).reduce((s, p) => s + p.amount, 0);
    }, 0);
  }, [fiados]);

  // ── Filtered list ──────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = fiados;

    if (activeTab === 'pendente') list = list.filter(f => f.status === 'pendente');
    else if (activeTab === 'vencidos') list = list.filter(f => f.status !== 'pago' && f.due_date < today);
    else if (activeTab === 'parcial') list = list.filter(f => f.status === 'parcial');
    else if (activeTab === 'pago') list = list.filter(f => f.status === 'pago');
    else if (activeTab === 'juridico') list = list.filter(f => f.status === 'juridico');

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(f =>
        f.client_name.toLowerCase().includes(q) ||
        (f.client_phone || '').includes(q) ||
        (f.client_cpf || '').includes(q)
      );
    }

    return list;
  }, [fiados, activeTab, searchQuery, today]);

  // ── Handlers ───────────────────────────────────────────────────
  const handleNewItemChange = (idx: number, field: keyof EmptyItemRow, value: string) => {
    setNewItems(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      // Clear product link when desc is typed manually
      if (field === 'desc') return { ...item, desc: value, inventory_product_id: undefined };
      return { ...item, [field]: value };
    }));
  };

  const handleSelectProduct = (idx: number, productId: string, name: string, salePrice: number | null) => {
    setNewItems(prev => prev.map((item, i) =>
      i === idx
        ? { ...item, desc: name, value: String(salePrice ?? ''), inventory_product_id: productId }
        : item
    ));
    setProductDropdownIdx(null);
  };

  const handleAddItemRow = () => setNewItems(prev => [...prev, emptyItem()]);
  const handleRemoveItemRow = (idx: number) => setNewItems(prev => prev.filter((_, i) => i !== idx));

  const newItemsTotal = useMemo(() =>
    newItems.reduce((s, item) => {
      const qty = parseFloat(item.qty) || 0;
      const val = parseFloat(item.value) || 0;
      return s + qty * val;
    }, 0),
    [newItems]
  );

  const handleCreateFiado = async () => {
    if (!newForm.client_name.trim()) { toast.error('Nome do cliente é obrigatório'); return; }
    if (!newForm.due_date) { toast.error('Data de vencimento é obrigatória'); return; }
    if (newItemsTotal <= 0) { toast.error('Adicione pelo menos um item com valor'); return; }

    setIsCreating(true);
    const items: FiadoItem[] = newItems
      .filter(i => i.desc.trim() && parseFloat(i.value) > 0)
      .map(i => ({
        desc: i.desc.trim(),
        qty: parseFloat(i.qty) || 1,
        value: parseFloat(i.value) || 0,
        ...(i.inventory_product_id ? { inventory_product_id: i.inventory_product_id } : {}),
      }));

    const input: CreateFiadoInput = {
      origin_type: 'manual',
      client_name: newForm.client_name.trim(),
      client_phone: newForm.client_phone.trim() || undefined,
      client_cpf: newForm.client_cpf.trim() || undefined,
      due_date: newForm.due_date,
      notes: newForm.notes.trim() || undefined,
      interest_rate_monthly: parseFloat(newForm.interest_rate_monthly) || 2,
      items,
      original_amount: newItemsTotal,
    };

    const result = await createFiado(input);
    setIsCreating(false);
    if (result) {
      setShowNewDialog(false);
      setNewForm({ client_name: '', client_phone: '', client_cpf: '', due_date: '', notes: '', interest_rate_monthly: '2' });
      setNewItems([emptyItem()]);
    }
  };

  const handleOpenPayment = (fiado: Fiado) => {
    setPaymentFiado(fiado);
    setPaymentForm({ amount: '', method: 'dinheiro', received_by: '', notes: '' });
  };

  const handleSubmitPayment = async () => {
    if (!paymentFiado) return;
    const amount = parseFloat(paymentForm.amount);
    if (!amount || amount <= 0) { toast.error('Informe o valor'); return; }
    if (!paymentForm.received_by) { toast.error('Selecione o recebedor'); return; }
    setIsPaymentLoading(true);
    await addPayment(paymentFiado.id, amount, paymentForm.method, paymentForm.received_by, paymentForm.notes || undefined);
    setIsPaymentLoading(false);
    setPaymentFiado(null);
  };

  const handleSendReminder = async (fiado: Fiado, level: number) => {
    setReminderLoading(true);
    await sendReminder(fiado, level);
    setReminderLoading(false);
    setReminderFiado(null);
  };

  const handleMarkJuridico = async (fiado: Fiado) => {
    await updateStatus(fiado.id, 'juridico');
    toast.success('Fiado marcado como Jurídico');
  };

  const handleDelete = async (id: string) => {
    await deleteFiado(id);
    setDeleteConfirmId(null);
  };

  const tabs: { id: FilterTab; label: string }[] = [
    { id: 'todos', label: 'Todos' },
    { id: 'pendente', label: 'Pendentes' },
    { id: 'vencidos', label: 'Vencidos' },
    { id: 'parcial', label: 'Parcial' },
    { id: 'pago', label: 'Pagos' },
    { id: 'juridico', label: 'Jurídico' },
  ];

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <HandCoins className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Fiados</h2>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={reload} title="Recarregar">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button size="sm" className="gap-1.5" onClick={() => setShowNewDialog(true)}>
            <Plus className="h-4 w-4" />
            Novo Fiado
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="border-border/50">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground mb-1">Em Aberto</p>
            <p className="text-lg font-bold text-foreground">R$ {totalEmAberto.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground mb-1">Vencidos</p>
            <p className={`text-lg font-bold ${countVencidos > 0 ? 'text-red-600' : 'text-foreground'}`}>{countVencidos}</p>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground mb-1">Recebido/Mês</p>
            <p className="text-lg font-bold text-green-600">R$ {recebidoNoMes.toFixed(2)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
        {tabs.map(tab => (
          <button
            type="button"
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
              activeTab === tab.id
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <Input
        placeholder="Buscar por nome, telefone ou CPF..."
        value={searchQuery}
        onChange={e => setSearchQuery(e.target.value)}
        className="h-10"
      />

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-32 bg-muted/40 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <HandCoins className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>Nenhum fiado encontrado</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(fiado => {
            const balance = calcBalance(fiado);
            const daysOverdue = calcDaysOverdue(fiado.due_date);
            const isOverdue = fiado.status !== 'pago' && daysOverdue > 0;

            return (
              <Card key={fiado.id} className="border-border/50">
                <CardContent className="p-4 space-y-3">
                  {/* Top row */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-foreground truncate">{fiado.client_name}</p>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {fiado.client_phone && (
                          <span className="text-xs text-muted-foreground">{fiado.client_phone}</span>
                        )}
                        {fiado.client_cpf && (
                          <span className="text-xs text-muted-foreground">CPF: {fiado.client_cpf}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <Badge className={`text-xs ${STATUS_COLORS[fiado.status]}`}>
                        {STATUS_LABELS[fiado.status]}
                      </Badge>
                      <Badge className={`text-xs ${ORIGIN_COLORS[fiado.origin_type]}`}>
                        {ORIGIN_LABELS[fiado.origin_type]}
                      </Badge>
                    </div>
                  </div>

                  {/* Items */}
                  {fiado.items && fiado.items.length > 0 && (
                    <div className="text-xs text-muted-foreground bg-muted/30 rounded-lg p-2 space-y-0.5">
                      {fiado.items.map((item, i) => (
                        <div key={i} className="flex justify-between gap-2">
                          <span className="truncate">{item.qty}x {item.desc}</span>
                          <span className="flex-shrink-0">R$ {(item.qty * item.value).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Financial summary */}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Original:</span>
                      <span>R$ {fiado.original_amount.toFixed(2)}</span>
                    </div>
                    {fiado.interest_accrued > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Juros:</span>
                        <span className="text-orange-500">R$ {fiado.interest_accrued.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Pago:</span>
                      <span className="text-green-600">R$ {fiado.amount_paid.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between font-semibold">
                      <span className={balance > 0 ? 'text-red-600' : 'text-muted-foreground'}>Saldo:</span>
                      <span className={balance > 0 ? 'text-red-600' : 'text-green-600'}>R$ {balance.toFixed(2)}</span>
                    </div>
                  </div>

                  {/* Due date */}
                  <div className="flex items-center gap-1.5 text-xs">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    <span className="text-muted-foreground">
                      Vence: {format(parseISO(fiado.due_date), 'dd/MM/yyyy', { locale: ptBR })}
                    </span>
                    {isOverdue && (
                      <span className="text-red-600 font-semibold">
                        ({daysOverdue} {daysOverdue === 1 ? 'dia' : 'dias'} em atraso)
                      </span>
                    )}
                  </div>

                  {fiado.notes && (
                    <p className="text-xs text-muted-foreground italic">{fiado.notes}</p>
                  )}

                  {/* Próximo envio automático (IA) */}
                  {fiado.next_reminder_at && fiado.status !== 'pago' && (
                    <div className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 rounded-md px-2 py-1">
                      <CalendarClock className="h-3.5 w-3.5 flex-shrink-0" />
                      <span>IA agendou próxima cobrança: <strong>{format(parseISO(fiado.next_reminder_at), 'dd/MM/yyyy', { locale: ptBR })}</strong></span>
                    </div>
                  )}

                  {/* Link de pagamento Asaas existente */}
                  {fiado.asaas_payment_url && (
                    <div className="flex items-center gap-1.5 text-xs text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/30 rounded-md px-2 py-1">
                      <Link className="h-3.5 w-3.5 flex-shrink-0" />
                      <a href={fiado.asaas_payment_url} target="_blank" rel="noopener noreferrer" className="underline truncate">
                        Link de pagamento Asaas
                      </a>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex flex-wrap gap-2 pt-1 border-t border-border/30">
                    {fiado.status !== 'pago' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 h-8 text-xs"
                        onClick={() => handleOpenPayment(fiado)}
                      >
                        <DollarSign className="h-3.5 w-3.5" />
                        Pagamento
                      </Button>
                    )}

                    {fiado.status !== 'pago' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 h-8 text-xs"
                        onClick={() => setReminderFiado(fiado)}
                      >
                        <Send className="h-3.5 w-3.5" />
                        Cobrança
                      </Button>
                    )}

                    {fiado.status !== 'pago' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 h-8 text-xs text-blue-600 border-blue-300 hover:bg-blue-50 dark:border-blue-700 dark:hover:bg-blue-950/30"
                        disabled={asaasLoadingId === fiado.id}
                        onClick={() => handleAsaasCharge(fiado, 'PIX')}
                      >
                        <Zap className="h-3.5 w-3.5" />
                        {asaasLoadingId === fiado.id ? '...' : 'PIX Asaas'}
                      </Button>
                    )}

                    {fiado.status !== 'pago' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 h-8 text-xs text-orange-600 border-orange-300 hover:bg-orange-50 dark:border-orange-700 dark:hover:bg-orange-950/30"
                        disabled={asaasLoadingId === fiado.id}
                        onClick={() => handleAsaasCharge(fiado, 'BOLETO')}
                      >
                        <DollarSign className="h-3.5 w-3.5" />
                        {asaasLoadingId === fiado.id ? '...' : 'Boleto'}
                      </Button>
                    )}

                    {fiado.status !== 'pago' && fiado.status !== 'juridico' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 h-8 text-xs text-red-600 border-red-300 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-950/30"
                        onClick={() => handleMarkJuridico(fiado)}
                      >
                        <Scale className="h-3.5 w-3.5" />
                        Jurídico
                      </Button>
                    )}

                    <Button
                      size="sm"
                      variant="ghost"
                      className="gap-1.5 h-8 text-xs"
                      onClick={() => setHistoryFiado(fiado)}
                    >
                      <History className="h-3.5 w-3.5" />
                      Histórico
                    </Button>

                    <Button
                      size="sm"
                      variant="ghost"
                      className="gap-1.5 h-8 text-xs text-destructive hover:text-destructive"
                      onClick={() => setDeleteConfirmId(fiado.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── New Fiado Dialog ────────────────────────────────────── */}
      <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Novo Fiado</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3">
              <div>
                <Label>Cliente *</Label>
                <Input
                  placeholder="Nome completo"
                  value={newForm.client_name}
                  onChange={e => setNewForm(p => ({ ...p, client_name: e.target.value }))}
                  className="mt-1"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Telefone</Label>
                  <Input
                    placeholder="(11) 99999-9999"
                    value={newForm.client_phone}
                    onChange={e => setNewForm(p => ({ ...p, client_phone: e.target.value }))}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>CPF</Label>
                  <Input
                    placeholder="000.000.000-00"
                    value={newForm.client_cpf}
                    onChange={e => setNewForm(p => ({ ...p, client_cpf: e.target.value }))}
                    className="mt-1"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Vencimento *</Label>
                  <Input
                    type="date"
                    value={newForm.due_date}
                    onChange={e => setNewForm(p => ({ ...p, due_date: e.target.value }))}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Juros/mês (%)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    value={newForm.interest_rate_monthly}
                    onChange={e => setNewForm(p => ({ ...p, interest_rate_monthly: e.target.value }))}
                    className="mt-1"
                  />
                </div>
              </div>
            </div>

            {/* Items */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Itens</Label>
                <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={handleAddItemRow}>
                  <Plus className="h-3.5 w-3.5" /> Adicionar
                </Button>
              </div>
              <div className="space-y-2">
                {newItems.map((item, idx) => {
                  const filteredProducts = item.desc.length >= 1
                    ? inventoryProducts.filter(p =>
                        p.name.toLowerCase().includes(item.desc.toLowerCase()) ||
                        (p.code || '').toLowerCase().includes(item.desc.toLowerCase())
                      ).slice(0, 6)
                    : [];
                  const showDropdown = productDropdownIdx === idx && filteredProducts.length > 0 && !item.inventory_product_id;

                  return (
                    <div key={idx} className="space-y-1">
                      <div className="flex gap-2 items-center">
                        <div className="flex-1 relative" ref={idx === productDropdownIdx ? productDropdownRef : undefined}>
                          <Input
                            placeholder="Descrição ou buscar produto..."
                            value={item.desc}
                            onChange={e => {
                              handleNewItemChange(idx, 'desc', e.target.value);
                              setProductDropdownIdx(idx);
                            }}
                            onFocus={() => setProductDropdownIdx(idx)}
                            onBlur={() => setTimeout(() => setProductDropdownIdx(null), 150)}
                            className="h-8 text-sm w-full"
                          />
                          {showDropdown && (
                            <div className="absolute top-full left-0 right-0 z-50 mt-0.5 bg-popover border border-border rounded-md shadow-md max-h-40 overflow-y-auto">
                              {filteredProducts.map(p => (
                                <button
                                  key={p.id}
                                  type="button"
                                  className="w-full text-left px-3 py-2 text-xs hover:bg-accent flex justify-between gap-2"
                                  onMouseDown={e => e.preventDefault()}
                                  onClick={() => handleSelectProduct(idx, p.id, p.name, p.sale_price)}
                                >
                                  <span className="truncate">{p.name}</span>
                                  <span className="text-muted-foreground flex-shrink-0">
                                    {p.sale_price != null ? `R$ ${Number(p.sale_price).toFixed(2)}` : '—'}
                                    {' · '}estq: {p.stock_current ?? 0}
                                  </span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        <Input
                          placeholder="Qtd"
                          type="number"
                          min="1"
                          value={item.qty}
                          onChange={e => handleNewItemChange(idx, 'qty', e.target.value)}
                          className="w-16 h-8 text-sm"
                        />
                        <Input
                          placeholder="Valor"
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.value}
                          onChange={e => handleNewItemChange(idx, 'value', e.target.value)}
                          className="w-24 h-8 text-sm"
                        />
                        {newItems.length > 1 && (
                          <button
                            type="button"
                            title="Remover item"
                            onClick={() => handleRemoveItemRow(idx)}
                            className="text-destructive"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                      {item.inventory_product_id && (
                        <p className="text-xs text-green-600 pl-1">✓ Produto do estoque vinculado</p>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="text-sm font-semibold mt-2 text-right">
                Total: R$ {newItemsTotal.toFixed(2)}
              </p>
            </div>

            <div>
              <Label>Observações</Label>
              <Textarea
                placeholder="Observações opcionais..."
                value={newForm.notes}
                onChange={e => setNewForm(p => ({ ...p, notes: e.target.value }))}
                className="mt-1 resize-none"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowNewDialog(false)}>Cancelar</Button>
            <Button onClick={handleCreateFiado} disabled={isCreating}>
              {isCreating ? 'Salvando...' : 'Registrar Fiado'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Payment Dialog ──────────────────────────────────────── */}
      <Dialog open={!!paymentFiado} onOpenChange={open => !open && setPaymentFiado(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Registrar Pagamento</DialogTitle>
          </DialogHeader>
          {paymentFiado && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Cliente: <strong>{paymentFiado.client_name}</strong>
                {' · '}Saldo: <strong className="text-red-600">R$ {calcBalance(paymentFiado).toFixed(2)}</strong>
              </p>
              <div>
                <Label>Valor *</Label>
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="0,00"
                  value={paymentForm.amount}
                  onChange={e => setPaymentForm(p => ({ ...p, amount: e.target.value }))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Forma de Pagamento</Label>
                <Select value={paymentForm.method} onValueChange={v => setPaymentForm(p => ({ ...p, method: v }))}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dinheiro">Dinheiro</SelectItem>
                    <SelectItem value="pix">PIX</SelectItem>
                    <SelectItem value="cartao_credito">Cartão Crédito</SelectItem>
                    <SelectItem value="cartao_debito">Cartão Débito</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Recebido por *</Label>
                <Select value={paymentForm.received_by} onValueChange={v => setPaymentForm(p => ({ ...p, received_by: v }))}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {teamMembers.map(m => (
                      <SelectItem key={m.id} value={m.name}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Observação</Label>
                <Input
                  placeholder="Opcional"
                  value={paymentForm.notes}
                  onChange={e => setPaymentForm(p => ({ ...p, notes: e.target.value }))}
                  className="mt-1"
                />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPaymentFiado(null)}>Cancelar</Button>
            <Button onClick={handleSubmitPayment} disabled={isPaymentLoading}>
              {isPaymentLoading ? 'Salvando...' : 'Confirmar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Reminder Dialog ─────────────────────────────────────── */}
      <Dialog open={!!reminderFiado} onOpenChange={open => !open && setReminderFiado(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Enviar Cobrança</DialogTitle>
          </DialogHeader>
          {reminderFiado && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {reminderFiado.client_name}
                {reminderFiado.client_phone && ` · ${reminderFiado.client_phone}`}
              </p>
              <p className="text-xs text-muted-foreground">
                Último nível enviado: <strong>{reminderFiado.last_reminder_level || 'Nenhum'}</strong>
              </p>
              <div className="grid grid-cols-2 gap-2">
                {[1, 2, 3, 4].map(level => (
                  <Button
                    key={level}
                    variant={level <= 2 ? 'outline' : level === 3 ? 'outline' : 'destructive'}
                    className={`h-10 text-sm gap-1.5 ${
                      level === 3 ? 'border-orange-400 text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950/30' : ''
                    }`}
                    disabled={reminderLoading}
                    onClick={() => handleSendReminder(reminderFiado, level)}
                  >
                    <MessageCircle className="h-4 w-4" />
                    Nível {level}
                    {level === 1 && ' (amigável)'}
                    {level === 2 && ' (lembrete)'}
                    {level === 3 && ' (advertência)'}
                    {level === 4 && ' (jurídico)'}
                  </Button>
                ))}
              </div>
              {!reminderFiado.client_phone && (
                <p className="text-xs text-amber-600">
                  Sem telefone cadastrado. A mensagem será registrada mas não enviada pelo WhatsApp.
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReminderFiado(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── History Dialog ──────────────────────────────────────── */}
      <Dialog open={!!historyFiado} onOpenChange={open => !open && setHistoryFiado(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Histórico — {historyFiado?.client_name}</DialogTitle>
          </DialogHeader>
          {historyFiado && (
            <div className="space-y-5">
              {/* Payments */}
              <div>
                <p className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                  <DollarSign className="h-4 w-4 text-green-600" />
                  Pagamentos
                </p>
                {(historyFiado.fiado_payments || []).length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhum pagamento registrado</p>
                ) : (
                  <div className="space-y-2">
                    {(historyFiado.fiado_payments || []).map(p => (
                      <div key={p.id} className="flex items-start justify-between text-sm bg-muted/30 rounded-lg p-2">
                        <div>
                          <p className="font-medium text-green-600">R$ {p.amount.toFixed(2)}</p>
                          <p className="text-xs text-muted-foreground">
                            {PAYMENT_METHOD_LABELS[p.method] || p.method}
                            {p.received_by && ` · ${p.received_by}`}
                          </p>
                          {p.notes && <p className="text-xs text-muted-foreground italic">{p.notes}</p>}
                        </div>
                        <p className="text-xs text-muted-foreground flex-shrink-0 ml-2">
                          {format(new Date(p.paid_at), 'dd/MM/yy HH:mm', { locale: ptBR })}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Messages */}
              <div>
                <p className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                  <MessageCircle className="h-4 w-4 text-blue-600" />
                  Cobranças Enviadas
                </p>
                {(historyFiado.fiado_messages || []).length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhuma cobrança enviada</p>
                ) : (
                  <div className="space-y-2">
                    {(historyFiado.fiado_messages || []).map(m => (
                      <div key={m.id} className="bg-muted/30 rounded-lg p-2 text-xs space-y-1">
                        <div className="flex items-center justify-between">
                          <Badge className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                            Nível {m.level}
                          </Badge>
                          <span className="text-muted-foreground">
                            {format(new Date(m.sent_at), 'dd/MM/yy HH:mm', { locale: ptBR })}
                          </span>
                        </div>
                        <p className="text-muted-foreground whitespace-pre-wrap">{m.message}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setHistoryFiado(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm ──────────────────────────────────────── */}
      <Dialog open={!!deleteConfirmId} onOpenChange={open => !open && setDeleteConfirmId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirmar Exclusão</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Tem certeza que deseja excluir este fiado? Esta ação não pode ser desfeita.
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}>
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
