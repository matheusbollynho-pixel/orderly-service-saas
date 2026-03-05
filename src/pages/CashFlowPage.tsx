import { useState, useEffect } from 'react';
import { useCashFlow, useCashFlowPeriod } from '@/hooks/useCashFlow';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowUpCircle, ArrowDownCircle, DollarSign, Calendar, Trash2, Plus, Eye, EyeOff } from 'lucide-react';
import { CashFlowType } from '@/types/service-order';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export function CashFlowPage() {
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
  
  // Quando volta para dia, sempre volta a hoje
  useEffect(() => {
    if (activePeriod === 'day') {
      setSelectedDate(getLocalDate());
    }
  }, [activePeriod]);
  const { cashFlow, summary, isLoading, createEntry, deleteEntry, isCreating } = useCashFlow(selectedDate);
  const { summary: weeklySummary, isLoading: weeklyLoading } = useCashFlowPeriod('week');
  const { summary: monthlySummary, isLoading: monthlyLoading } = useCashFlowPeriod('month', selectedMonth);

  const [formData, setFormData] = useState({
    type: 'entrada' as CashFlowType,
    amount: '',
    description: '',
    category: '',
    payment_method: 'dinheiro' as any,
    notes: '',
    quantity: '',
    transactionDate: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.amount || !formData.description) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    const dateToUse = formData.transactionDate || selectedDate;
    
    // Log para debug
    console.log('🔍 Salvando transação:', {
      descricao: formData.description,
      valor: formData.amount,
      data: dateToUse,
      dataSelecionada: selectedDate,
      dataTipada: formData.transactionDate,
    });

    createEntry({
      type: formData.type,
      amount: parseFloat(formData.amount),
      description: formData.description,
      category: formData.category,
      payment_method: formData.payment_method,
      date: dateToUse,
      notes: formData.notes,
    });

    // Mostrar aviso se for de outro dia
    if (formData.transactionDate && formData.transactionDate !== selectedDate) {
      toast.info(`Transação salva em ${formatDisplayDate(formData.transactionDate)}. Selecione essa data para visualizar.`);
    }

    setFormData({
      type: 'entrada',
      amount: '',
      description: '',
      category: '',
      payment_method: 'dinheiro',
      notes: '',
      quantity: '',
      transactionDate: '',
    });
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

  const renderSummaryCards = (summaryData: any, isLoadingData: boolean) => {
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

    if (!summaryData) return null;

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
                  {hideValues ? '****' : formatCurrency(summaryData.total_entradas)}
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
                  {hideValues ? '****' : formatCurrency(summaryData.total_saidas)}
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
                  {hideValues ? '****' : formatCurrency(summaryData.total_retiradas)}
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
                    summaryData.saldo >= 0 ? 'text-blue-600' : 'text-red-600'
                  }`}
                >
                  {hideValues ? '****' : formatCurrency(summaryData.saldo)}
                </h3>
              </div>
              <DollarSign
                className={`h-12 w-12 opacity-20 ${
                  summaryData.saldo >= 0 ? 'text-blue-600' : 'text-red-600'
                }`}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  const renderPaymentMethodCards = () => {
    if (!cashFlow || cashFlow.length === 0) return null;

    // Calcular saldo por forma de pagamento (apenas entradas - saídas)
    const paymentMethods = {
      dinheiro: 0,
      pix: 0,
      cartao: 0,
    };

    cashFlow.forEach((entry) => {
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

  const renderTransactionsList = (transactions: any[]) => {
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
                      <Input
                        id="quantity"
                        type="number"
                        step="0.01"
                        placeholder="1"
                        value={formData.quantity}
                        onChange={(e) => {
                          let value = e.target.value;
                          if (value === '') {
                            value = '1';
                          }
                          setFormData({ ...formData, quantity: value });
                        }}
                        className="[&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                    </div>

                    {/* Descrição */}
                    <div className="col-span-5">
                      <Label htmlFor="description">Descrição</Label>
                      <Input
                        id="description"
                        placeholder="Ex: Compra de peças"
                        value={formData.description}
                        onChange={(e) =>
                          setFormData({ ...formData, description: e.target.value })
                        }
                        required
                      />
                    </div>

                    {/* Forma de Pagamento */}
                    <div className="col-span-2">
                      <Label htmlFor="payment_method">Pagamento</Label>
                      <Select
                        value={formData.payment_method}
                        onValueChange={(value: any) =>
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
                          setFormData({ ...formData, type: value })
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
                    </div>

                    {/* Valor */}
                    <div className="col-span-2">
                      <Label htmlFor="amount">Valor</Label>
                      <Input
                        id="amount"
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={formData.amount}
                        onChange={(e) =>
                          setFormData({ ...formData, amount: e.target.value })
                        }
                        required
                      />
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button type="submit" disabled={isCreating}>
                      {isCreating ? 'Salvando...' : 'Salvar'}
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
          {renderSummaryCards(summary, isLoading)}

          {/* Payment Method Cards */}
          {renderPaymentMethodCards()}

          {/* Transactions List */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Transações do Dia</h2>
            {renderTransactionsList(cashFlow)}
          </div>
        </TabsContent>

        {/* Weekly Tab */}
        <TabsContent value="week" className="space-y-6">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar className="h-5 w-5" />
            <span>Semana: {formatWeekDisplay()}</span>
          </div>

          {/* Summary Cards */}
          {renderSummaryCards(weeklySummary, weeklyLoading)}

          {/* Transactions List */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Transações da Semana</h2>
            {weeklySummary ? renderTransactionsList([
              ...weeklySummary.entradas,
              ...weeklySummary.saidas,
              ...weeklySummary.retiradas,
            ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())) : (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Monthly Tab */}
        <TabsContent value="month" className="space-y-6">
          {/* Month Selector */}
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

          {/* Summary Cards */}
          {renderSummaryCards(monthlySummary, monthlyLoading)}

          {/* Transactions List */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Transações do Mês</h2>
            {monthlySummary ? renderTransactionsList([
              ...monthlySummary.entradas,
              ...monthlySummary.saidas,
              ...monthlySummary.retiradas,
            ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())) : (
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
