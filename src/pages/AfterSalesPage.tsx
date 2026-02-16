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
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Heart, Gift, Bell, Clock, CheckCircle, Zap } from 'lucide-react';
import { MaintenanceKeywordsManager } from '@/components/MaintenanceKeywordsManager';

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
  const [clients, setClients] = useState<ClientDiscount[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingId, setSendingId] = useState<string | null>(null);
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
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      // Get upcoming birthdays (incluindo hoje)
      const upcoming = await getUpcomingBirthdays();
      
      // Get active discounts
      const discounts = await getActiveBirthdayDiscounts();

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
    <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-50 p-4 pb-20">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <Heart className="w-8 h-8 text-red-600" />
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Pós-Venda</h1>
              <p className="text-gray-600">Gestão de campanhas e manutenção preventiva</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="aniversario" className="mb-8">
          <TabsList className="grid w-full grid-cols-2 bg-white">
            <TabsTrigger value="aniversario" className="gap-2">
              <Gift size={18} />
              Aniversário
            </TabsTrigger>
            <TabsTrigger value="manutencao" className="gap-2">
              <Zap size={18} />
              Manutenção
            </TabsTrigger>
          </TabsList>

          {/* ABA: ANIVERSÁRIO */}
          <TabsContent value="aniversario" className="space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Aniversários próximos</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-red-600">
                {clients.filter(c => getDaysUntilBirthday(c.birth_date) !== null && getDaysUntilBirthday(c.birth_date)! <= 7).length}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Descontos ativos</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600">
                {clients.filter(c => c.discount?.is_active).length}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Clientes cadastrados</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-blue-600">
                {clients.length}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Clients List */}
        <div className="space-y-4">
          {clients.length === 0 ? (
            <Card>
              <CardContent className="pt-6 text-center">
                <Gift className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                <p className="text-gray-500">Nenhum cliente com data de nascimento cadastrada</p>
              </CardContent>
            </Card>
          ) : (
            clients.map(client => {
              const daysUntil = getDaysUntilBirthday(client.birth_date);
              const isUpcoming = daysUntil !== null && daysUntil <= 7;
              const daysUntilExpire = client.discount ? getDaysUntilExpire(client.discount.expires_at) : 0;

              return (
                <Card
                  key={client.id}
                  className={`${
                    client.discount?.is_active
                      ? 'border-green-300 bg-green-50'
                      : isUpcoming
                      ? 'border-yellow-300 bg-yellow-50'
                      : 'border-gray-200'
                  }`}
                >
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="font-semibold text-lg text-gray-900">{client.name}</h3>
                        <p className="text-sm text-gray-600">{client.phone}</p>
                        {client.birth_date && (
                          <p className="text-sm text-gray-500">
                            📅 {new Date(client.birth_date + 'T00:00:00').toLocaleDateString('pt-BR', {
                              month: 'long',
                              day: 'numeric',
                            })}
                          </p>
                        )}
                      </div>

                      <div className="flex gap-2">
                        {client.discount?.is_active && (
                          <Badge className="bg-green-600">15% OFF</Badge>
                        )}
                        {isUpcoming && !client.discount && (
                          <Badge className="bg-yellow-600">Próximo aniversário</Badge>
                        )}
                      </div>
                    </div>

                    {/* Discount Status */}
                    {client.discount?.is_active && (
                      <div className="mb-4 p-3 bg-green-100 rounded-lg border border-green-300">
                        <div className="flex items-center gap-2 mb-2">
                          <CheckCircle className="w-4 h-4 text-green-600" />
                          <span className="text-sm font-medium text-green-700">Desconto Ativo</span>
                        </div>
                        <p className="text-xs text-green-600">
                          Válido até {new Date(client.discount.expires_at).toLocaleDateString('pt-BR')}
                          ({daysUntilExpire} dias)
                        </p>
                        {client.discount.message_sent_at && (
                          <p className="text-xs text-green-600 mt-1">
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
                          className="bg-red-600 hover:bg-red-700"
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
            <div className="bg-white rounded-lg border border-gray-200">
              <div className="p-6 border-b border-gray-200">
                <div className="flex items-center gap-3 mb-2">
                  <Zap className="w-6 h-6 text-purple-600" />
                  <h2 className="text-2xl font-bold text-gray-900">Palavras-chave de Manutenção</h2>
                </div>
                <p className="text-gray-600">Adicione, edite ou desative palavras-chave para lembretes automáticos</p>
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
