import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  getActiveBirthdayDiscounts,
  getUpcomingBirthdays,
  sendBirthdayMessage,
  createBirthdayDiscount,
  sendReminderMessage,
  expireBirthdayDiscount,
  getClientBirthdayDiscount,
} from '@/lib/birthdayService';
import type { BirthdayDiscount } from '@/lib/birthdayService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Heart, Gift, Bell, Clock, CheckCircle, Zap, Eye, EyeOff } from 'lucide-react';
import { MaintenanceKeywordsManager } from '@/components/MaintenanceKeywordsManager';
import { useAuth } from '@/hooks/useAuth';
import {
  getPendingMaintenanceReminders,
  getMaintenanceKeywords,
  findKeywordInText,
  createMaintenanceReminder,
  getAllMaintenanceReminders,
  type MaintenanceReminderWithDetails,
} from '@/services/maintenanceReminderService';

interface ClientDiscount {
  id: string;
  name: string;
  phone: string;
  birth_date: string | null;
  discount?: {
    id: string;
    discount_percentage: number;
    expires_at: string;
    is_active: boolean;
    message_sent_at: string | null;
  };
}

export default function AfterSalesPage() {
  const { isRestrictedUser } = useAuth();
  const [clients, setClients] = useState<ClientDiscount[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [maintenanceReminders, setMaintenanceReminders] = useState<MaintenanceReminderWithDetails[]>([]);
  const [maintenanceLoading, setMaintenanceLoading] = useState(true);
  const [allMaintenanceReminders, setAllMaintenanceReminders] = useState<MaintenanceReminderWithDetails[]>([]);
  const [backfillDays, setBackfillDays] = useState(180);
  const [backfillLoading, setBackfillLoading] = useState(false);
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [filterKeyword, setFilterKeyword] = useState('');
  const [filterClient, setFilterClient] = useState('');
  const [expandUpcoming, setExpandUpcoming] = useState(false);
  const [birthdayFilterType, setBirthdayFilterType] = useState<'all' | 'upcoming' | 'active'>('all');
  const [activeStatsFilter, setActiveStatsFilter] = useState<'all' | 'pending' | 'sent' | 'blocked' | 'due' | 'scheduled' | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    clientId: string;
    clientName: string;
    action: 'send' | 'expire';
  }>({
    open: false,
    clientId: '',
    clientName: '',
    action: 'send',
  });

  useEffect(() => {
    loadData();
    loadMaintenanceReminders();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      // Get upcoming birthdays (incluindo hoje)
      const upcoming = await getUpcomingBirthdays();
      
      // Get active discounts
      const discounts: BirthdayDiscount[] = await getActiveBirthdayDiscounts();

      // Combine data
      const clientsMap = new Map<string, ClientDiscount>();
      
      // Add upcoming birthday clients
      for (const client of upcoming) {
        clientsMap.set(client.id, {
          id: client.id,
          name: client.name,
          phone: client.phone,
          birth_date: client.birth_date,
        });
      }

      // Get clients with existing active discounts
      const discountsByClient = new Map();
      for (const discount of discounts) {
        // Usa service_order_id como chave
        discountsByClient.set(discount.service_order_id, discount);
      }

      // Fetch all clients to show their discount status
      const { data: orders } = await supabase
        .from('service_orders')
        .select('id, client_name, client_phone, client_birth_date');

      if (orders) {
        for (const order of orders) {
          // Pular se não tiver data de nascimento
          if (!order.client_birth_date) continue;
          
          if (!clientsMap.has(order.id)) {
            clientsMap.set(order.id, {
              id: order.id,
              name: order.client_name,
              phone: order.client_phone,
              birth_date: order.client_birth_date,
            });
          }
          
          const discount = discountsByClient.get(order.id);
          if (discount) {
            clientsMap.get(order.id)!.discount = discount;
          }
        }
      }

      setClients(Array.from(clientsMap.values()));
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMaintenanceReminders = async () => {
    setMaintenanceLoading(true);
    const [pending, all] = await Promise.all([
      getPendingMaintenanceReminders(),
      getAllMaintenanceReminders(),
    ]);
    setMaintenanceReminders(pending);
    setAllMaintenanceReminders(all);
    setMaintenanceLoading(false);
  };

  const handleBackfillReminders = async () => {
    setBackfillLoading(true);
    try {
      const since = new Date();
      since.setDate(since.getDate() - backfillDays);

      const { data: materials, error } = await supabase
        .from('materials')
        .select(
          'id, descricao, created_at, order:service_orders(id, client_id, client_phone, entry_date, client:clients(autoriza_lembretes))'
        )
        .gte('created_at', since.toISOString());

      if (error) throw error;

      const keywords = await getMaintenanceKeywords();
      let createdCount = 0;

      for (const material of materials || []) {
        const description = material.descricao || '';
        const detectedKeyword = findKeywordInText(description, keywords);
        if (!detectedKeyword) continue;

        const order = material.order as {
          id?: string;
          client_id?: string;
          client_phone?: string;
          entry_date?: string;
          client?: { autoriza_lembretes?: boolean };
        };
        if (!order?.id || !order?.client_id) continue;
        if (order?.client?.autoriza_lembretes === false) continue;

        const serviceDate = new Date(material.created_at || order.entry_date || new Date());
        const reminder = await createMaintenanceReminder(
          order.id,
          order.client_id,
          order.client_phone || '',
          detectedKeyword.id,
          serviceDate
        );

        if (reminder) createdCount++;
      }

      await loadMaintenanceReminders();
      alert(`✅ Lembretes gerados: ${createdCount}`);
    } catch (error) {
      console.error('Erro ao reprocessar lembretes:', error);
      alert('❌ Erro ao reprocessar lembretes');
    } finally {
      setBackfillLoading(false);
    }
  };

  const handleSendMessage = async (client: ClientDiscount) => {
    setSendingId(client.id);
    try {
      // Create discount
      await createBirthdayDiscount(client.id, 15);

      // Send message
      const success = await sendBirthdayMessage(client.phone, client.name);

      if (success) {
        // Reload data
        await loadData();
      }
    } catch (error) {
      console.error('Erro ao enviar:', error);
    } finally {
      setSendingId(null);
      setConfirmDialog({ ...confirmDialog, open: false });
    }
  };

  const handleSendReminder = async (client: ClientDiscount) => {
    setSendingId(client.id);
    try {
      await sendReminderMessage(client.phone, client.name);
      await loadData();
    } catch (error) {
      console.error('Erro ao enviar lembrete:', error);
    } finally {
      setSendingId(null);
    }
  };

  const handleExpireDiscount = async (client: ClientDiscount) => {
    if (!client.discount) return;
    
    setSendingId(client.id);
    try {
      await expireBirthdayDiscount(client.discount.id);
      await loadData();
    } catch (error) {
      console.error('Erro ao expirar desconto:', error);
    } finally {
      setSendingId(null);
      setConfirmDialog({ ...confirmDialog, open: false });
    }
  };

  const now = new Date();
  const allowedReminders = maintenanceReminders.filter(
    (reminder) => reminder.order?.client?.autoriza_lembretes !== false
  );
  
  // Aplicar filtro de estatísticas primeiro
  let statsFilteredReminders = allowedReminders;
  if (activeStatsFilter) {
    switch (activeStatsFilter) {
      case 'all':
        statsFilteredReminders = allMaintenanceReminders;
        break;
      case 'pending':
        statsFilteredReminders = allowedReminders.filter((r) => !r.reminder_sent_at);
        break;
      case 'sent':
        statsFilteredReminders = allMaintenanceReminders.filter((r) => r.reminder_sent_at);
        break;
      case 'blocked':
        statsFilteredReminders = allMaintenanceReminders.filter(
          (r) => r.order?.client?.autoriza_lembretes === false
        );
        break;
      case 'due':
        statsFilteredReminders = allowedReminders.filter(
          (r) => !r.reminder_sent_at && new Date(r.reminder_due_date) <= now
        );
        break;
      case 'scheduled':
        statsFilteredReminders = allowedReminders.filter(
          (r) => !r.reminder_sent_at && new Date(r.reminder_due_date) > now
        );
        break;
    }
  }
  
  const filteredAllowedReminders = statsFilteredReminders.filter((reminder) => {
    const dueDate = new Date(reminder.reminder_due_date);
    if (filterStartDate) {
      const start = new Date(`${filterStartDate}T00:00:00`);
      if (dueDate < start) return false;
    }
    if (filterEndDate) {
      const end = new Date(`${filterEndDate}T23:59:59.999`);
      if (dueDate > end) return false;
    }
    if (filterKeyword) {
      const keyword = (reminder.keyword?.keyword || '').toLowerCase();
      if (!keyword.includes(filterKeyword.toLowerCase())) return false;
    }
    if (filterClient) {
      const name = (reminder.order?.client_name || '').toLowerCase();
      const phone = (reminder.order?.client_phone || reminder.client_phone || '').toLowerCase();
      const query = filterClient.toLowerCase();
      if (!name.includes(query) && !phone.includes(query)) return false;
    }
    return true;
  });
  // Split filtered reminders into due and upcoming only when not using stats filters
  const displayedReminders = activeStatsFilter ? statsFilteredReminders : filteredAllowedReminders;
  
  const dueReminders = displayedReminders.filter(
    (reminder) => new Date(reminder.reminder_due_date) <= now && !reminder.reminder_sent_at
  );
  const upcomingReminders = displayedReminders.filter(
    (reminder) => new Date(reminder.reminder_due_date) > now && !reminder.reminder_sent_at
  );

  const totalAll = allMaintenanceReminders.length;
  const totalSent = allMaintenanceReminders.filter((r) => r.reminder_sent_at).length;
  const totalPending = allMaintenanceReminders.filter((r) => !r.reminder_sent_at).length;
  const totalBlocked = allMaintenanceReminders.filter(
    (r) => r.order?.client?.autoriza_lembretes === false
  ).length;

  const getDaysUntilBirthday = (birthDate: string | null): number | null => {
    if (!birthDate) return null;
    
    const [year, month, day] = birthDate.split('-');
    const birth = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Zerar horas para comparação correta
    
    let thisYear = new Date(today.getFullYear(), birth.getMonth(), birth.getDate());
    thisYear.setHours(0, 0, 0, 0); // Zerar horas também
    
    if (thisYear < today) {
      thisYear = new Date(today.getFullYear() + 1, birth.getMonth(), birth.getDate());
      thisYear.setHours(0, 0, 0, 0);
    }
    
    const diff = thisYear.getTime() - today.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  const getDaysUntilExpire = (expiresAt: string): number => {
    const expire = new Date(expiresAt);
    const today = new Date();
    const diff = expire.getTime() - today.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  const getFilteredBirthdayClients = () => {
    return clients.filter(c => {
      if (birthdayFilterType === 'upcoming') {
        const daysUntil = getDaysUntilBirthday(c.birth_date);
        return daysUntil !== null && daysUntil <= 7;
      } else if (birthdayFilterType === 'active') {
        return c.discount?.is_active;
      }
      return true; // 'all'
    });
  };

  const getTodaysBirthdays = async () => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Zerar horas para comparação correta
      
      const todayMonth = String(today.getMonth() + 1).padStart(2, '0'); // 01-12
      const todayDay = String(today.getDate()).padStart(2, '0'); // 01-31
      
      console.log('🔍 Procurando aniversários de hoje:', `${today.getFullYear()}-${todayMonth}-${todayDay}`);
      console.log('📅 Mês:', todayMonth, 'Dia:', todayDay);

      const { data: orders } = await supabase
        .from('service_orders')
        .select('id, client_name, client_phone, client_birth_date');

      console.log('📊 Total de ordens no banco:', orders?.length || 0);
      
      if (!orders) return [];

      // Filter only orders with birth_date filled
      const withBirthDate = orders.filter(o => o.client_birth_date);
      console.log('👥 Ordens com data de nascimento:', withBirthDate.length);

      // Filter for today's birthday (ignoring year)
      const todaysBirthdays = withBirthDate.filter(order => {
        const [year, month, day] = order.client_birth_date.split('-');
        const isMatch = month === todayMonth && day === todayDay;
        console.log(`  ${order.client_name}: ${order.client_birth_date} (ano:${year}, mês:${month}, dia:${day}) → ${isMatch ? '✅ MATCH' : '❌'}`);
        return isMatch;
      });

      console.log('🎂 Aniversários de hoje encontrados:', todaysBirthdays.length);
      return todaysBirthdays;
    } catch (error) {
      console.error('Erro ao buscar aniversários de hoje:', error);
      return [];
    }
  };

  const handleTestTodaysBirthdays = async () => {
    setSendingId('testing');
    try {
      const birthdays = await getTodaysBirthdays();
      
      console.log('🧪 Teste manual iniciado');
      console.log('📊 Aniversários encontrados:', birthdays.length);
      
      if (birthdays.length === 0) {
        alert('❌ Nenhum aniversário encontrado para hoje');
        setSendingId(null);
        return;
      }

      // Send to all birthdays today
      let sucessos = 0;
      for (const person of birthdays) {
        console.log(`📱 Enviando para: ${person.client_name} (${person.client_phone})`);
        const success = await sendBirthdayMessage(person.client_phone, person.client_name);
        if (success) {
          sucessos++;
          console.log(`✅ Mensagem enviada para ${person.client_name}`);
        } else {
          console.error(`❌ Erro ao enviar para ${person.client_name}`);
        }
      }

      alert(`✅ ${sucessos} mensagem(ns) enviada(s) com sucesso!`);
      await loadData();
    } catch (error) {
      console.error('❌ Erro no teste:', error);
      alert('❌ Erro ao testar. Verifique o console (F12)');
    } finally {
      setSendingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin">
          <Gift className="w-8 h-8 text-red-600" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 pb-20">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <Heart className="w-8 h-8 text-red-600" />
            <div>
              <h1 className="text-3xl font-bold text-foreground">Pós-Venda</h1>
              <p className="text-muted-foreground">Gestão de campanhas e manutenção preventiva</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="aniversario" className="mb-8">
          <TabsList className={`grid w-full ${isRestrictedUser ? 'grid-cols-2' : 'grid-cols-3'} glass-card`}>
            <TabsTrigger value="aniversario" className="gap-2">
              <Gift size={18} />
              Aniversário
            </TabsTrigger>
            {!isRestrictedUser && (
              <>
                <TabsTrigger value="manutencao" className="gap-2">
                  <Zap size={18} />
                  Manutenção
                </TabsTrigger>
              </>
            )}
          </TabsList>

          {/* ABA: ANIVERSÁRIO */}
          <TabsContent value="aniversario" className="space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Card 
            className={`cursor-pointer transition-all glass-card ${
              birthdayFilterType === 'upcoming' 
                ? 'ring-2 ring-[#C1272D] bg-[#C1272D]/10' 
                : 'hover:border-[#C1272D]/50'
            }`}
            onClick={() => setBirthdayFilterType('upcoming')}
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Aniversários próximos</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-[#C1272D]">
                {clients.filter(c => getDaysUntilBirthday(c.birth_date) !== null && getDaysUntilBirthday(c.birth_date)! <= 7).length}
              </div>
            </CardContent>
          </Card>

          <Card 
            className={`cursor-pointer transition-all glass-card ${
              birthdayFilterType === 'active' 
                ? 'ring-2 ring-emerald-500 bg-emerald-500/10' 
                : 'hover:border-emerald-500/50'
            }`}
            onClick={() => setBirthdayFilterType('active')}
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Descontos ativos</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-emerald-500">
                {clients.filter(c => c.discount?.is_active).length}
              </div>
            </CardContent>
          </Card>

          <Card 
            className={`cursor-pointer transition-all glass-card ${
              birthdayFilterType === 'all' 
                ? 'ring-2 ring-blue-400 bg-blue-400/10' 
                : 'hover:border-blue-400/50'
            }`}
            onClick={() => setBirthdayFilterType('all')}
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Clientes cadastrados</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-blue-400">
                {clients.length}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Clients List */}
        <div className="space-y-4">
          {getFilteredBirthdayClients().length === 0 ? (
            <Card className="glass-card">
              <CardContent className="pt-6 text-center">
                <Gift className="w-12 h-12 text-muted-foreground mx-auto mb-2" />
                <p className="text-muted-foreground">Nenhum cliente com data de nascimento cadastrada</p>
              </CardContent>
            </Card>
          ) : (
            getFilteredBirthdayClients().map(client => {
              const daysUntil = getDaysUntilBirthday(client.birth_date);
              const isUpcoming = daysUntil !== null && daysUntil <= 7;
              const daysUntilExpire = client.discount ? getDaysUntilExpire(client.discount.expires_at) : 0;

              return (
                <Card
                  key={client.id}
                  className={`glass-card ${
                    client.discount?.is_active
                      ? 'border-emerald-500/50 bg-emerald-500/5'
                      : isUpcoming
                      ? 'border-[#C1272D]/50 bg-[#C1272D]/5'
                      : 'border-border/50'
                  }`}
                >
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="font-semibold text-lg text-foreground">{client.name}</h3>
                        <p className="text-sm text-muted-foreground">{client.phone}</p>
                        {client.birth_date && (
                          <p className="text-sm text-muted-foreground">
                            📅 {new Date(client.birth_date + 'T00:00:00').toLocaleDateString('pt-BR', {
                              month: 'long',
                              day: 'numeric',
                            })}
                          </p>
                        )}
                      </div>

                      <div className="flex gap-2">
                        {client.discount?.is_active && (
                          <Badge className="bg-emerald-500">15% OFF</Badge>
                        )}
                        {isUpcoming && !client.discount && (
                          <Badge className="bg-[#C1272D]">Próximo aniversário</Badge>
                        )}
                      </div>
                    </div>

                    {/* Discount Status */}
                    {client.discount?.is_active && (
                      <div className="mb-4 p-3 bg-emerald-500/10 rounded-lg border border-emerald-500/50">
                        <div className="flex items-center gap-2 mb-2">
                          <CheckCircle className="w-4 h-4 text-emerald-500" />
                          <span className="text-sm font-medium text-emerald-400">Desconto Ativo</span>
                        </div>
                        <p className="text-xs text-emerald-300">
                          Válido até {new Date(client.discount.expires_at).toLocaleDateString('pt-BR')}
                          ({daysUntilExpire} dias)
                        </p>
                        {client.discount.message_sent_at && (
                          <p className="text-xs text-emerald-300 mt-1">
                            ✓ Mensagem enviada em {new Date(client.discount.message_sent_at).toLocaleDateString('pt-BR')}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2 flex-wrap">
                      {!client.discount?.is_active && isUpcoming && (
                        <Button
                          onClick={() =>
                            setConfirmDialog({
                              open: true,
                              clientId: client.id,
                              clientName: client.name,
                              action: 'send',
                            })
                          }
                          disabled={sendingId === client.id}
                          className="bg-[#C1272D] hover:bg-red-700"
                        >
                          <Gift className="w-4 h-4 mr-2" />
                          {sendingId === client.id ? 'Enviando...' : 'Enviar Desconto'}
                        </Button>
                      )}

                      {client.discount?.is_active && daysUntilExpire <= 2 && (
                        <Button
                          onClick={() => handleSendReminder(client)}
                          disabled={sendingId === client.id}
                          variant="outline"
                        >
                          <Bell className="w-4 h-4 mr-2" />
                          {sendingId === client.id ? 'Enviando...' : 'Enviar Lembrete'}
                        </Button>
                      )}

                      {client.discount?.is_active && (
                        <Button
                          onClick={() =>
                            setConfirmDialog({
                              open: true,
                              clientId: client.id,
                              clientName: client.name,
                              action: 'expire',
                            })
                          }
                          disabled={sendingId === client.id}
                          variant="outline"
                          className="text-red-600 hover:text-red-700"
                        >
                          <Clock className="w-4 h-4 mr-2" />
                          {sendingId === client.id ? 'Processando...' : 'Expirar Desconto'}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
          </TabsContent>

          {/* ABA: MANUTENÇÃO */}
          <TabsContent value="manutencao" className="space-y-8">
            <div className="glass-card-elevated rounded-lg border border-border/50">
              <div className="p-6 border-b border-border/50">
                <div className="flex items-center gap-3 mb-2">
                  <Bell className="w-6 h-6 text-blue-600" />
                  <h2 className="text-2xl font-bold text-foreground">Monitoramento de Lembretes</h2>
                </div>
                <p className="text-muted-foreground">Veja quais lembretes já estão prontos para envio e os próximos agendados</p>
              </div>
              <div className="p-6 space-y-6">
                {maintenanceLoading ? (
                  <p className="text-sm text-muted-foreground">Carregando lembretes...</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <button
                      onClick={() => setActiveStatsFilter(activeStatsFilter === 'all' ? null : 'all')}
                      className={`bg-gray-500/10 rounded-lg border p-4 text-left transition-all hover:shadow-md glass-card ${
                        activeStatsFilter === 'all' ? 'border-gray-400 ring-2 ring-gray-400' : 'border-gray-400/30'
                      }`}
                    >
                      <div className="text-xs text-gray-400">Total criados</div>
                      <div className="text-2xl font-bold text-gray-300">
                        {totalAll}
                      </div>
                      <div className="text-xs text-gray-500/70 mt-1">Clique para filtrar</div>
                    </button>
                    <button
                      onClick={() => setActiveStatsFilter(activeStatsFilter === 'pending' ? null : 'pending')}
                      className={`bg-blue-500/10 rounded-lg border p-4 text-left transition-all hover:shadow-md glass-card ${
                        activeStatsFilter === 'pending' ? 'border-blue-500 ring-2 ring-blue-500' : 'border-blue-500/30'
                      }`}
                    >
                      <div className="text-xs text-blue-400">Pendentes</div>
                      <div className="text-2xl font-bold text-blue-300">
                        {totalPending}
                      </div>
                      <div className="text-xs text-blue-500/70 mt-1">Clique para filtrar</div>
                    </button>
                    <button
                      onClick={() => setActiveStatsFilter(activeStatsFilter === 'sent' ? null : 'sent')}
                      className={`bg-emerald-500/10 rounded-lg border p-4 text-left transition-all hover:shadow-md glass-card ${
                        activeStatsFilter === 'sent' ? 'border-emerald-500 ring-2 ring-emerald-500' : 'border-emerald-500/30'
                      }`}
                    >
                      <div className="text-xs text-emerald-400">Enviados</div>
                      <div className="text-2xl font-bold text-emerald-300">
                        {totalSent}
                      </div>
                      <div className="text-xs text-emerald-500/70 mt-1">Clique para filtrar</div>
                    </button>
                    <button
                      onClick={() => setActiveStatsFilter(activeStatsFilter === 'blocked' ? null : 'blocked')}
                      className={`bg-amber-500/10 rounded-lg border p-4 text-left transition-all hover:shadow-md glass-card ${
                        activeStatsFilter === 'blocked' ? 'border-amber-500 ring-2 ring-amber-500' : 'border-amber-500/30'
                      }`}
                    >
                      <div className="text-xs text-amber-400">Bloqueados (não autorizados)</div>
                      <div className="text-2xl font-bold text-amber-300">
                        {totalBlocked}
                      </div>
                      <div className="text-xs text-amber-500/70 mt-1">Clique para filtrar</div>
                    </button>
                  </div>
                )}
                {!maintenanceLoading && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <button
                      onClick={() => setActiveStatsFilter(activeStatsFilter === 'pending' ? null : 'pending')}
                      className={`bg-gray-500/10 rounded-lg border p-4 text-left transition-all hover:shadow-md glass-card ${
                        activeStatsFilter === 'pending' ? 'border-gray-400 ring-2 ring-gray-400' : 'border-gray-400/30'
                      }`}
                    >
                      <div className="text-xs text-gray-400">Total criados (pendentes)</div>
                      <div className="text-2xl font-bold text-gray-300">
                        {filteredAllowedReminders.length}
                      </div>
                      <div className="text-xs text-gray-500/70 mt-1">Clique para filtrar</div>
                    </button>
                    <button
                      onClick={() => setActiveStatsFilter(activeStatsFilter === 'due' ? null : 'due')}
                      className={`bg-[#C1272D]/10 rounded-lg border p-4 text-left transition-all hover:shadow-md glass-card ${
                        activeStatsFilter === 'due' ? 'border-[#C1272D] ring-2 ring-[#C1272D]' : 'border-[#C1272D]/30'
                      }`}
                    >
                      <div className="text-xs text-[#C1272D]">Para envio agora</div>
                      <div className="text-2xl font-bold text-red-400">
                        {dueReminders.length}
                      </div>
                      <div className="text-xs text-[#C1272D]/70 mt-1">Clique para filtrar</div>
                    </button>
                    <button
                      onClick={() => setActiveStatsFilter(activeStatsFilter === 'scheduled' ? null : 'scheduled')}
                      className={`bg-emerald-500/10 rounded-lg border p-4 text-left transition-all hover:shadow-md glass-card ${
                        activeStatsFilter === 'scheduled' ? 'border-emerald-500 ring-2 ring-emerald-500' : 'border-emerald-500/30'
                      }`}
                    >
                      <div className="text-xs text-emerald-400">Agendados</div>
                      <div className="text-2xl font-bold text-emerald-300">
                        {upcomingReminders.length}
                      </div>
                      <div className="text-xs text-emerald-500/70 mt-1">Clique para filtrar</div>
                    </button>
                  </div>
                )}
                {activeStatsFilter && (
                  <div className="bg-blue-500/10 border border-blue-500/50 rounded-lg p-3 flex items-center justify-between glass-card">
                    <div className="flex items-center gap-2">
                      <Eye className="w-4 h-4 text-blue-400" />
                      <span className="text-sm text-blue-300 font-medium">
                        Filtro ativo: {
                          activeStatsFilter === 'all' ? 'Todos' :
                          activeStatsFilter === 'pending' ? 'Pendentes' :
                          activeStatsFilter === 'sent' ? 'Enviados' :
                          activeStatsFilter === 'blocked' ? 'Bloqueados' :
                          activeStatsFilter === 'due' ? 'Para envio agora' :
                          'Agendados'
                        }
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setActiveStatsFilter(null)}
                      className="text-blue-600 hover:text-blue-700 hover:bg-blue-100"
                    >
                      Limpar filtro
                    </Button>
                  </div>
                )}
                {!maintenanceLoading && filteredAllowedReminders.length === 0 && (
                  <p className="text-sm text-muted-foreground">Nenhum lembrete pendente encontrado.</p>
                )}
                {!maintenanceLoading && (
                  <div className="space-y-2">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                      <div>
                        <label className="text-xs text-muted-foreground">Período (início)</label>
                        <Input
                          type="date"
                          value={filterStartDate}
                          onChange={(e) => setFilterStartDate(e.target.value)}
                          className="bg-muted/50 border-border/50 text-foreground"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Período (fim)</label>
                        <Input
                          type="date"
                          value={filterEndDate}
                          onChange={(e) => setFilterEndDate(e.target.value)}
                          className="bg-muted/50 border-border/50 text-foreground"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Palavra-chave</label>
                        <Input
                          type="text"
                          value={filterKeyword}
                          onChange={(e) => setFilterKeyword(e.target.value)}
                          placeholder="Ex: óleo"
                          className="bg-muted/50 border-border/50 text-foreground"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Cliente (nome ou telefone)</label>
                        <Input
                          type="text"
                          value={filterClient}
                          onChange={(e) => setFilterClient(e.target.value)}
                          placeholder="Ex: João ou 9999"
                          className="bg-muted/50 border-border/50 text-foreground"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
                      <div>
                        <label className="text-xs text-muted-foreground">Reprocessar últimos dias</label>
                        <Input
                          type="number"
                          min={1}
                          value={backfillDays}
                          onChange={(e) => setBackfillDays(parseInt(e.target.value || '1', 10))}
                          className="bg-muted/50 border-border/50 text-foreground"
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          onClick={handleBackfillReminders}
                          disabled={backfillLoading}
                          className="bg-[#C1272D] hover:bg-red-700"
                        >
                          {backfillLoading ? 'Reprocessando...' : 'Reprocessar vendas'}
                        </Button>
                      </div>
                      <div className="lg:col-span-2 flex">
                        <Button
                          onClick={() => {
                            setFilterStartDate('');
                            setFilterEndDate('');
                            setFilterKeyword('');
                            setFilterClient('');
                          }}
                          variant="outline"
                        >
                          Limpar filtros
                        </Button>
                      </div>
                    </div>
                    <p className="text-xs text-gray-500">
                      Isso cria lembretes a partir de itens já vendidos dentro do período informado.
                    </p>
                  </div>
                )}
                {!maintenanceLoading && displayedReminders.length > 0 && (
                  <div className="space-y-6">
                    {/* Mostrar dados conforme o filtro ativo */}
                    {!activeStatsFilter || activeStatsFilter === 'pending' || activeStatsFilter === 'due' || activeStatsFilter === 'scheduled' ? (
                      <>
                        {/* Mostrar "Pendentes para envio" apenas se não estamos filtrando por "Enviados" ou "Bloqueados" */}
                        {activeStatsFilter !== 'sent' && activeStatsFilter !== 'blocked' && activeStatsFilter !== 'all' && (
                          <div>
                            <h3 className="text-sm font-semibold text-red-600 mb-3">
                              Pendentes para envio ({dueReminders.length})
                            </h3>
                            {dueReminders.length === 0 ? (
                              <p className="text-sm text-muted-foreground">Nenhum lembrete pendente para envio.</p>
                            ) : (
                              <div className="divide-y divide-border/50">
                                {dueReminders.map((reminder) => (
                                  <div key={reminder.id} className="py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                                    <div>
                                      <div className="font-semibold text-foreground">{reminder.order?.client_name ?? 'Cliente'}</div>
                                      <div className="text-sm text-muted-foreground">{reminder.order?.client_phone ?? reminder.client_phone ?? ''}</div>
                                      <div className="text-sm text-muted-foreground">
                                        Palavra-chave: <strong className="text-foreground">{reminder.keyword?.keyword ?? '—'}</strong>
                                      </div>
                                    </div>
                                    <div className="text-sm text-muted-foreground">
                                      <div>Serviço: {new Date(reminder.service_date).toLocaleDateString('pt-BR')}</div>
                                      <div className="text-[#C1272D]">Lembrete: {new Date(reminder.reminder_due_date).toLocaleDateString('pt-BR')}</div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Mostrar "Próximos agendados" apenas se não estamos filtrando por "Enviados" ou "Bloqueados" */}
                        {activeStatsFilter !== 'sent' && activeStatsFilter !== 'blocked' && activeStatsFilter !== 'all' && (
                          <div>
                            <div className="flex items-center justify-between mb-3">
                              <h3 className="text-sm font-semibold text-emerald-600">
                                Próximos agendados ({upcomingReminders.length})
                              </h3>
                              <button
                                onClick={() => setExpandUpcoming(!expandUpcoming)}
                                className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
                                title={expandUpcoming ? 'Minimizar' : 'Expandir'}
                              >
                                {expandUpcoming ? (
                                  <Eye className="w-4 h-4 text-gray-600" />
                                ) : (
                                  <EyeOff className="w-4 h-4 text-gray-600" />
                                )}
                              </button>
                            </div>
                            {upcomingReminders.length === 0 ? (
                              <p className="text-sm text-gray-600">Nenhum lembrete agendado.</p>
                            ) : expandUpcoming ? (
                              <div className="divide-y">
                                {upcomingReminders.map((reminder) => (
                                  <div key={reminder.id} className="py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                                    <div>
                                      <div className="font-semibold text-gray-900">{reminder.order?.client_name ?? 'Cliente'}</div>
                                      <div className="text-sm text-gray-600">{reminder.order?.client_phone ?? reminder.client_phone ?? ''}</div>
                                      <div className="text-sm text-gray-600">
                                        Palavra-chave: <strong>{reminder.keyword?.keyword ?? '—'}</strong>
                                      </div>
                                    </div>
                                    <div className="text-sm text-gray-600">
                                      <div>Serviço: {new Date(reminder.service_date).toLocaleDateString('pt-BR')}</div>
                                      <div className="text-emerald-600">Lembrete: {new Date(reminder.reminder_due_date).toLocaleDateString('pt-BR')}</div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        )}
                      </>
                    ) : (
                      /* Mostrar lista única quando filtro é "Enviados", "Bloqueados" ou "Todos" */
                      <div>
                        <h3 className="text-sm font-semibold text-foreground mb-3">
                          {activeStatsFilter === 'sent' ? 'Lembretes Enviados' :
                           activeStatsFilter === 'blocked' ? 'Lembretes Bloqueados' :
                           'Todos os Lembretes'} ({displayedReminders.length})
                        </h3>
                        {displayedReminders.length === 0 ? (
                          <p className="text-sm text-muted-foreground">Nenhum lembrete encontrado.</p>
                        ) : (
                          <div className="divide-y divide-border/50">
                            {displayedReminders.map((reminder) => (
                              <div key={reminder.id} className="py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                                <div>
                                  <div className="font-semibold text-foreground">{reminder.order?.client_name ?? 'Cliente'}</div>
                                  <div className="text-sm text-muted-foreground">{reminder.order?.client_phone ?? reminder.client_phone ?? ''}</div>
                                  <div className="text-sm text-muted-foreground">
                                    Palavra-chave: <strong className="text-foreground">{reminder.keyword?.keyword ?? '—'}</strong>
                                  </div>
                                </div>
                                <div className="text-sm text-muted-foreground">
                                  <div>Serviço: {new Date(reminder.service_date).toLocaleDateString('pt-BR')}</div>
                                  <div className={activeStatsFilter === 'sent' ? 'text-emerald-600' : 'text-amber-600'}>
                                    Lembrete: {new Date(reminder.reminder_due_date).toLocaleDateString('pt-BR')}
                                    {reminder.reminder_sent_at && ` (${new Date(reminder.reminder_sent_at).toLocaleDateString('pt-BR')})`}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="glass-card-elevated rounded-lg border border-border/50">
              <div className="p-6 border-b border-border/50">
                <div className="flex items-center gap-3 mb-2">
                  <Zap className="w-6 h-6 text-purple-600" />
                  <h2 className="text-2xl font-bold text-foreground">Palavras-chave de Manutenção</h2>
                </div>
                <p className="text-muted-foreground">Adicione, edite ou desative palavras-chave para lembretes automáticos</p>
              </div>
              <MaintenanceKeywordsManager />
            </div>
          </TabsContent>

        </Tabs>
      </div>

      {/* Confirm Dialog */}
      <AlertDialog open={confirmDialog.open} onOpenChange={(open) => setConfirmDialog({ ...confirmDialog, open })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar ação</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDialog.action === 'send'
                ? `Enviar mensagem de aniversário com 15% de desconto para ${confirmDialog.clientName}?`
                : `Expirar desconto de ${confirmDialog.clientName}?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex gap-3">
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmDialog.action === 'send') {
                  handleSendMessage(clients.find(c => c.id === confirmDialog.clientId)!);
                } else {
                  handleExpireDiscount(clients.find(c => c.id === confirmDialog.clientId)!);
                }
              }}
              className="bg-red-600 hover:bg-red-700"
            >
              Confirmar
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
