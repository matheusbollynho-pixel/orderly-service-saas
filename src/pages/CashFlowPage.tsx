import { useState, useEffect, useRef } from 'react';
import { useCashFlow, useCashFlowPeriod } from '@/hooks/useCashFlow';
import { useInventory, type InventoryProduct } from '@/hooks/useInventory';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowUpCircle, ArrowDownCircle, DollarSign, Calendar, Trash2, Plus, Eye, EyeOff, Package } from 'lucide-react';
import { CashFlowType, PaymentMethod, CashFlow } from '@/types/service-order';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export function CashFlowPage() {
    // Estados para os campos do cabeçalho
    const [status, setStatus] = useState('aberta');
    const [osAbertaPor, setOsAbertaPor] = useState('Matheus');
    const [mecanico, setMecanico] = useState('Anderson');
  // Função para obter a data local em timezone de Paulo Afonso
  const getLocalDate = () => {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Fortaleza',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    const parts = formatter.formatToParts(now);
    const day = parts.find(p => p.type === 'day')?.value || '01';
    const month = parts.find(p => p.type === 'month')?.value || '01';
    const year = parts.find(p => p.type === 'year')?.value || '2026';
    return `${year}-${month}-${day}`;
  };

  const getLocalMonth = () => {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Fortaleza',
      year: 'numeric',
      month: '2-digit'
    });
    const parts = formatter.formatToParts(now);
    const month = parts.find(p => p.type === 'month')?.value || '01';
    const year = parts.find(p => p.type === 'year')?.value || '2026';
    return `${year}-${month}`;
  };

  const [selectedDate, setSelectedDate] = useState<string>(getLocalDate());
  const [selectedMonth, setSelectedMonth] = useState<string>(getLocalMonth());
  const [activePeriod, setActivePeriod] = useState<'day' | 'week' | 'month'>('day');
  const [showForm, setShowForm] = useState(false);
  const [hideValues, setHideValues] = useState(false);
  const [entrySourceFilter, setEntrySourceFilter] = useState<'all' | 'without-os' | 'os-only'>('all');
  const [selectedProductId, setSelectedProductId] = useState<string | undefined>(undefined);
  const [productSuggestions, setProductSuggestions] = useState<InventoryProduct[]>([]);
  const [showProductSuggestions, setShowProductSuggestions] = useState(false);
  const productSuggestionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (productSuggestionsRef.current && !productSuggestionsRef.current.contains(e.target as Node)) {
        setShowProductSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Quando volta para dia, sempre volta a hoje
  useEffect(() => {
    if (activePeriod === 'day') {
      setSelectedDate(getLocalDate());
    }
  }, [activePeriod]);
  const { cashFlow, summary, isLoading, createEntry, deleteEntry, isCreating } = useCashFlow(selectedDate);
  const { products: inventoryProducts, createMovement, isCreatingMovement } = useInventory();
  const { summary: weeklySummary, isLoading: weeklyLoading } = useCashFlowPeriod('week');
  const { summary: monthlySummary, isLoading: monthlyLoading } = useCashFlowPeriod('month', selectedMonth);

  const [formData, setFormData] = useState({
    type: 'entrada' as CashFlowType,
    saidaDestination: 'oficina' as 'oficina' | 'balcao',
    amount: '',
    description: '',
    category: '',
    payment_method: 'dinheiro' as PaymentMethod,
    notes: '',
    quantity: '',
    transactionDate: '',
  });

  const handleDescriptionChange = (value: string) => {
    setFormData((prev) => ({ ...prev, description: value }));
    setSelectedProductId(undefined);
    if (value.trim().length >= 2 && inventoryProducts.length > 0) {
      const q = value.toLowerCase();
      const found = inventoryProducts
        .filter((p) => p.active && (p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q)))
        .slice(0, 6);
      setProductSuggestions(found);
      setShowProductSuggestions(found.length > 0);
    } else {
      setShowProductSuggestions(false);
    }
  };

  const handleSelectInventoryProduct = (product: InventoryProduct) => {
    const qty = parseFloat(formData.quantity) || 1;
    setFormData((prev) => ({
      ...prev,
      description: product.name,
      amount: String(product.sale_price * qty),
    }));
    setSelectedProductId(product.id);
    setShowProductSuggestions(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.amount || !formData.description) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    if (formData.type === 'saida' && !formData.saidaDestination) {
      toast.error('Selecione se a saída foi para Oficina ou Balcão');
      return;
    }

    const todayDate = getLocalDate();

    // Se é venda de produto do estoque: cria movimentação → trigger auto-cria o cash_flow
    if (selectedProductId && formData.type === 'entrada') {
      const qty = parseFloat(formData.quantity) || 1;
      createMovement({
        product_id: selectedProductId,
        type: 'saida_venda',
        quantity: qty,
        unit_price: parseFloat(formData.amount) / qty,
        notes: formData.notes || undefined,
      });
    } else {
      // Venda avulsa sem produto do estoque
      createEntry({
        type: formData.type,
        amount: parseFloat(formData.amount),
        description: formData.description,
        category:
          formData.type === 'saida'
            ? (formData.saidaDestination === 'oficina' ? 'Saída - Oficina' : 'Saída - Balcão')
            : formData.category,
        payment_method: formData.payment_method,
        date: todayDate,
        notes: formData.notes,
      });
    }

    if (selectedDate !== todayDate) {
      toast.info('Por segurança, novos lançamentos são registrados apenas na data de hoje.');
      setSelectedDate(todayDate);
    }

    setFormData({
      type: 'entrada',
      saidaDestination: 'oficina',
      amount: '',
      description: '',
      category: '',
      payment_method: 'dinheiro',
      notes: '',
      quantity: '',
      transactionDate: '',
    });
    setSelectedProductId(undefined);
    setShowForm(false);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const formatTime = (dateString: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return '';
    return format(date, 'HH:mm', { locale: ptBR });
  };

  const formatDisplayDate = (dateString: string) => {
    if (!dateString) return '';
    const date = new Date(`${dateString}T00:00:00`);
    if (Number.isNaN(date.getTime())) return '';
    return format(date, 'dd/MM/yyyy', { locale: ptBR });
  };

  const formatWeekDisplay = () => {
    const today = new Date();
    const day = today.getDay();
    const diff = today.getDate() - day + (day === 0 ? -6 : 1);
    const start = new Date(today.setDate(diff));
    const end = new Date(start);
    end.setDate(end.getDate() + 5);
    
    return `${format(start, 'dd/MM', { locale: ptBR })} - ${format(end, 'dd/MM/yyyy', { locale: ptBR })}`;
  };

  const formatMonthDisplay = (monthStr: string) => {
    if (!monthStr || !monthStr.includes('-')) return '';
    const [year, month] = monthStr.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1);
    if (Number.isNaN(date.getTime())) return '';
    return format(date, 'MMMM/yyyy', { locale: ptBR });
  };

  const isOrderEntry = (entry: CashFlow) => {
    // Entrada vinda de OS (order_id ou payment_id)
    if (entry?.type === 'entrada' && (!!entry?.order_id || !!entry?.payment_id)) {
      return true;
    }
    // Saída para Oficina
    if (entry?.type === 'saida' && typeof entry?.category === 'string' && entry?.category.includes('Oficina')) {
      return true;
    }
    return false;
  };

  const applyEntryFilter = (transactions: CashFlow[]) => {
    if (entrySourceFilter === 'all') return transactions;
    if (entrySourceFilter === 'os-only') {
      return transactions.filter((entry: CashFlow) => isOrderEntry(entry));
    }

    // without-os: remove apenas entradas vindas de OS e saídas para Oficina
    return transactions.filter((entry: CashFlow) => !isOrderEntry(entry));
  };

  const renderSummaryCards = (transactions: CashFlow[], isLoadingData: boolean) => {
    if (isLoadingData) {
      return (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="h-20 bg-muted rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      );
    }

    const entradas = transactions.filter(e => e.type === 'entrada');
    const saidas = transactions.filter(e => e.type === 'saida');
    const retiradas = transactions.filter(e => e.type === 'retirada');

    const total_entradas = entradas.reduce((sum, e) => sum + e.amount, 0);
    const total_saidas = saidas.reduce((sum, e) => sum + e.amount, 0);
    const total_retiradas = retiradas.reduce((sum, e) => sum + e.amount, 0);
    const saldo = total_entradas - total_saidas;

    return (
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Total Entradas
                </p>
                <h3 className="text-2xl font-bold text-green-600">
                  {hideValues ? '****' : formatCurrency(total_entradas)}
                </h3>
              </div>
              <ArrowUpCircle className="h-12 w-12 text-green-600 opacity-20" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Total Saídas
                </p>
                <h3 className="text-2xl font-bold text-red-600">
                  {hideValues ? '****' : formatCurrency(total_saidas)}
                </h3>
              </div>
              <ArrowDownCircle className="h-12 w-12 text-red-600 opacity-20" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Total Retiradas
                </p>
                <h3 className="text-2xl font-bold text-orange-600">
                  {hideValues ? '****' : formatCurrency(total_retiradas)}
                </h3>
              </div>
              <ArrowDownCircle className="h-12 w-12 text-orange-600 opacity-20" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Saldo
                </p>
                <h3
                  className={`text-2xl font-bold ${
                    saldo >= 0 ? 'text-blue-600' : 'text-red-600'
                  }`}
                >
                  {hideValues ? '****' : formatCurrency(saldo)}
                </h3>
              </div>
              <DollarSign
                className={`h-12 w-12 opacity-20 ${
                  saldo >= 0 ? 'text-blue-600' : 'text-red-600'
                }`}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  const renderPaymentMethodCards = (transactions: Record<string, unknown>[]) => {
    if (!transactions || transactions.length === 0) return null;

    // Calcular saldo por forma de pagamento (apenas entradas - saídas)
    const paymentMethods = {
      dinheiro: 0,
      pix: 0,
      cartao: 0,
    };

    transactions.forEach((entry) => {
      const method = (entry.payment_method || 'dinheiro') as keyof typeof paymentMethods;
      const amount = entry.amount || 0;

      if (entry.type === 'entrada') {
        paymentMethods[method] = (paymentMethods[method] || 0) + amount;
      } else if (entry.type === 'saida') {
        paymentMethods[method] = (paymentMethods[method] || 0) - amount;
      } else if (entry.type === 'retirada') {
        // Retirada reduz apenas o caixa em espécie (dinheiro)
        paymentMethods['dinheiro'] = (paymentMethods['dinheiro'] || 0) - amount;
      }
    });

    const methodLabels = {
      dinheiro: { label: 'Dinheiro (Espécie)', icon: '💵', color: 'text-green-600' },
      pix: { label: 'PIX (Conta)', icon: '📱', color: 'text-blue-600' },
      cartao: { label: 'Cartão (Conta)', icon: '💳', color: 'text-purple-600' },
    };

    return (
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground">Controle por Forma de Pagamento</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {Object.entries(paymentMethods).map(([method, balance]) => {
            const config = methodLabels[method as keyof typeof methodLabels] ?? {
              label: String(method),
              icon: '💰',
              color: 'text-muted-foreground',
            };
            const isPositive = balance >= 0;

            return (
              <Card key={method}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">
                        {config.icon} {config.label}
                      </p>
                      <h3 className={`text-lg font-bold ${isPositive ? config.color : 'text-red-600'}`}>
                        {hideValues ? '****' : formatCurrency(balance)}
                      </h3>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    );
  };

  const renderTransactionsList = (transactions: Record<string, unknown>[]) => {
    if (transactions.length === 0) {
      return (
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground">
            Nenhuma transação neste período
          </CardContent>
        </Card>
      );
    }

    return (
      <div className="space-y-2">
        {transactions.map((entry) => (
          <Card
            key={entry.id}
            className={`border-l-4 ${
              entry.type === 'entrada'
                ? 'border-l-green-500'
                : entry.type === 'retirada'
                ? 'border-l-orange-500'
                : 'border-l-red-500'
            }`}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    {entry.type === 'entrada' ? (
                      <ArrowUpCircle className="h-5 w-5 text-green-600" />
                    ) : entry.type === 'retirada' ? (
                      <ArrowDownCircle className="h-5 w-5 text-orange-600" />
                    ) : (
                      <ArrowDownCircle className="h-5 w-5 text-red-600" />
                    )}
                    <h3 className="font-semibold">{entry.description}</h3>
                  </div>
                  {entry.category && (
                    <p className="text-sm text-muted-foreground mb-1">
                      {entry.category}
                    </p>
                  )}
                  {entry.type === 'saida' && (entry.category?.includes('Oficina') || entry.category?.includes('Balcão')) && (
                    <p className="text-xs font-medium text-amber-500 mb-1">
                      Destino: {entry.category.includes('Oficina') ? 'Oficina' : 'Balcão'}
                    </p>
                  )}
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{formatTime(entry.created_at)}</span>
                    {entry.payment_method && (
                      <span className="capitalize">
                        {entry.payment_method.replace('_', ' ')}
                      </span>
                    )}
                  </div>
                  {entry.notes && (
                    <p className="text-sm text-muted-foreground mt-2">
                      {entry.notes}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`text-lg font-bold ${
                      entry.type === 'entrada'
                        ? 'text-green-600'
                        : 'text-red-600'
                    }`}
                  >
                    {entry.type === 'entrada' ? '+' : '-'}
                    {formatCurrency(Math.abs(entry.amount))}
                  </span>
                  {entry.order_id === null && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        if (
                          confirm(
                            'Tem certeza que deseja excluir esta transação?'
                          )
                        ) {
                          deleteEntry(entry.id);
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  };

  const renderEntrySourceFilter = () => (
    <div className="w-full md:w-[280px]">
      <Label htmlFor="entry-source-filter" className="text-xs text-muted-foreground">
        Mostrar entradas
      </Label>
      <Select
        value={entrySourceFilter}
        onValueChange={(value: 'all' | 'without-os' | 'os-only') => setEntrySourceFilter(value)}
      >
        <SelectTrigger id="entry-source-filter" className="mt-1">
          <SelectValue placeholder="Selecione o filtro" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tudo (Oficina + Balcão)</SelectItem>
          <SelectItem value="without-os">Somente Balcão</SelectItem>
          <SelectItem value="os-only">Somente Oficina</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Fluxo de Caixa</h1>
          <p className="text-sm text-muted-foreground">
            Controle suas entradas e saídas
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            onClick={() => setHideValues(!hideValues)} 
            size="sm"
            variant="outline"
          >
            {hideValues ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </Button>
          {activePeriod === 'day' && (
            <Button onClick={() => setShowForm(!showForm)} size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Nova Transação
            </Button>
          )}
        </div>
      </div>

      {/* Layout igual ao anexo: linha com Status, OS Aberta por e Mecânico; Data de Entrada embaixo */}
      {/* Bloco removido: cabeçalho da OS não pertence ao fluxo de caixa */}
      {/* Bloco removido: Data de Entrada não pertence ao fluxo de caixa */}

      {/* Period Tabs */}
      <Tabs value={activePeriod} onValueChange={(v) => setActivePeriod(v as 'day' | 'week' | 'month')}>
        <TabsList>
          <TabsTrigger value="day">Diário</TabsTrigger>
          <TabsTrigger value="week">Semanal</TabsTrigger>
          <TabsTrigger value="month">Mensal</TabsTrigger>
        </TabsList>

        {/* Daily Tab */}
        <TabsContent value="day" className="space-y-6">
          {/* Date Selector */}
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-muted-foreground" />
              <Input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="max-w-xs bg-muted/50 border-border/50 text-foreground"
              />
              <span className="text-sm text-muted-foreground">
                {formatDisplayDate(selectedDate)}
              </span>
            </div>
            {renderEntrySourceFilter()}
          </div>

          {/* Form */}
          {showForm && (
            <Card>
              <CardHeader>
                <CardTitle>Nova Transação</CardTitle>
                <CardDescription>
                  Adicione uma entrada ou saída manual no fluxo de caixa
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-12 gap-4">
                    {/* Quantidade */}
                    <div className="col-span-1">
                      <Label htmlFor="quantity">Qtd</Label>
                      <input
                        id="quantity"
                        type="text"
                        placeholder="1"
                        value={formData.quantity}
                        onChange={(e) => {
                          const value = e.target.value;
                          if (value === '' || /^\d*\.?\d*$/.test(value)) {
                            setFormData({ ...formData, quantity: value });
                          }
                        }}
                        inputMode="decimal"
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                      />
                    </div>

                    {/* Descrição */}
                    <div className="col-span-5 relative" ref={productSuggestionsRef}>
                      <Label htmlFor="description">
                        Descrição {selectedProductId && <span className="text-green-600 ml-1 text-xs">✓ estoque</span>}
                      </Label>
                      <Input
                        id="description"
                        placeholder="Ex: Compra de peças ou buscar no estoque..."
                        value={formData.description}
                        onChange={(e) => handleDescriptionChange(e.target.value)}
                        onFocus={() => productSuggestions.length > 0 && setShowProductSuggestions(true)}
                        required
                      />
                      {showProductSuggestions && (
                        <div className="absolute top-full left-0 right-0 z-50 mt-1 rounded-md border border-border bg-popover shadow-lg">
                          {productSuggestions.map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => handleSelectInventoryProduct(p)}
                              className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs hover:bg-muted transition-colors"
                            >
                              <Package className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <span className="font-medium truncate block">{p.name}</span>
                                <span className="text-muted-foreground">{p.code} · Estoque: {p.stock_current} {p.unit} · R$ {p.sale_price.toFixed(2)}</span>
                              </div>
                              {p.stock_current <= 0 && <span className="text-red-500 flex-shrink-0">Zerado</span>}
                              {p.stock_current > 0 && p.stock_current <= p.stock_minimum && <span className="text-orange-500 flex-shrink-0">Baixo</span>}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Forma de Pagamento */}
                    <div className="col-span-2">
                      <Label htmlFor="payment_method">Pagamento</Label>
                      <Select
                        value={formData.payment_method}
                        onValueChange={(value: PaymentMethod) =>
                          setFormData({ ...formData, payment_method: value })
                        }
                      >
                        <SelectTrigger id="payment_method">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="dinheiro">Dinheiro</SelectItem>
                          <SelectItem value="pix">PIX</SelectItem>
                          <SelectItem value="cartao">Cartão</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Tipo */}
                    <div className="col-span-2">
                      <Label htmlFor="type">Tipo</Label>
                      <Select
                        value={formData.type}
                        onValueChange={(value: CashFlowType) =>
                          setFormData({
                            ...formData,
                            type: value,
                            saidaDestination: value === 'saida' ? formData.saidaDestination : 'oficina',
                          })
                        }
                      >
                        <SelectTrigger id="type">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="entrada">Entrada</SelectItem>
                          <SelectItem value="saida">Saída</SelectItem>
                          <SelectItem value="retirada">Retirada</SelectItem>
                        </SelectContent>
                      </Select>
                      
                      {/* Saída Destination Selector - below select */}
                      {formData.type === 'saida' && (
                        <div className="mt-2 flex gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant={formData.saidaDestination === 'oficina' ? 'default' : 'outline'}
                            onClick={() => setFormData({ ...formData, saidaDestination: 'oficina' })}
                            className="flex-1"
                          >
                            Oficina
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant={formData.saidaDestination === 'balcao' ? 'default' : 'outline'}
                            onClick={() => setFormData({ ...formData, saidaDestination: 'balcao' })}
                            className="flex-1"
                          >
                            Balcão
                          </Button>
                        </div>
                      )}
                    </div>

                    {/* Valor */}
                    <div className="col-span-2">
                      <Label htmlFor="amount">Valor</Label>
                      <input
                        id="amount"
                        type="text"
                        placeholder="0.00"
                        value={formData.amount}
                        onChange={(e) => {
                          const value = e.target.value;
                          if (value === '' || /^\d*\.?\d*$/.test(value)) {
                            setFormData({ ...formData, amount: value });
                          }
                        }}
                        inputMode="decimal"
                        required
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                      />
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button type="submit" disabled={isCreating || isCreatingMovement}>
                      {(isCreating || isCreatingMovement) ? 'Salvando...' : 'Salvar'}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setShowForm(false)}
                    >
                      Cancelar
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          {/* Summary Cards */}
          {renderSummaryCards(applyEntryFilter(cashFlow), isLoading)}

          {/* Payment Method Cards */}
          {renderPaymentMethodCards(applyEntryFilter(cashFlow))}

          {/* Transactions List */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Transações do Dia</h2>
            {renderTransactionsList(applyEntryFilter(cashFlow))}
          </div>
        </TabsContent>

        {/* Weekly Tab */}
        <TabsContent value="week" className="space-y-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="h-5 w-5" />
              <span>Semana: {formatWeekDisplay()}</span>
            </div>
            {renderEntrySourceFilter()}
          </div>

          {/* Summary Cards */}
          {renderSummaryCards(
            applyEntryFilter(
              weeklySummary
                ? [
                    ...weeklySummary.entradas,
                    ...weeklySummary.saidas,
                    ...weeklySummary.retiradas,
                  ]
                : []
            ),
            weeklyLoading
          )}

          {/* Transactions List */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Transações da Semana</h2>
            {weeklySummary ? renderTransactionsList([
              ...weeklySummary.entradas,
              ...weeklySummary.saidas,
              ...weeklySummary.retiradas,
            ].filter((entry) => applyEntryFilter([entry]).length > 0)
             .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())) : (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Monthly Tab */}
        <TabsContent value="month" className="space-y-6">
          {/* Month Selector */}
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-muted-foreground" />
              <Input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="max-w-xs"
              />
              <span className="text-sm text-muted-foreground">
                {formatMonthDisplay(selectedMonth)}
              </span>
            </div>
            {renderEntrySourceFilter()}
          </div>

          {/* Summary Cards */}
          {renderSummaryCards(
            applyEntryFilter(
              monthlySummary
                ? [
                    ...monthlySummary.entradas,
                    ...monthlySummary.saidas,
                    ...monthlySummary.retiradas,
                  ]
                : []
            ),
            monthlyLoading
          )}

          {/* Transactions List */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Transações do Mês</h2>
            {monthlySummary ? renderTransactionsList([
              ...monthlySummary.entradas,
              ...monthlySummary.saidas,
              ...monthlySummary.retiradas,
            ].filter((entry) => applyEntryFilter([entry]).length > 0)
             .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())) : (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
