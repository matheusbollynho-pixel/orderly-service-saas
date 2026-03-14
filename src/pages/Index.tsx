import { useState, useEffect } from 'react';
import { useServiceOrders } from '@/hooks/useServiceOrders';
import { useMechanics } from '@/hooks/useMechanics';
import { useAuth } from '@/hooks/useAuth';
import { useClients } from '@/hooks/useClients';
import { ServiceOrder, OrderStatus, PaymentMethod } from '@/types/service-order';
import { DashboardStats } from '@/components/DashboardStats';
import { OrderCard } from '@/components/OrderCard';
import { OrderForm } from '@/components/OrderForm';
import { ThemeToggle } from '@/components/ThemeToggle';
import { OrderDetails } from '@/components/OrderDetails';
import { MaterialsPage } from './MaterialsPage';
import { ReportsPage } from './ReportsPage';
import { MechanicsPage } from './MechanicsPage';
import AfterSalesPage from './AfterSalesPage';
import { CashFlowPage } from './CashFlowPage';
import { ExpressCadastroPage } from './ExpressCadastroPage';
import { supabase } from '@/integrations/supabase/client';
import SatisfactionDashboardPage from './SatisfactionDashboardPage';
import { BottomNav } from '@/components/BottomNav';
import { EmptyState } from '@/components/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Wrench, Search } from 'lucide-react';
import { toast } from 'sonner';
import { getMaintenanceKeywords, findKeywordInText, createMaintenanceReminder, rescheduleMaintenanceReminder } from '@/services/maintenanceReminderService';

type View = 'dashboard' | 'new' | 'express' | 'orders' | 'details' | 'materials' | 'reports' | 'mechanics' | 'pos-venda' | 'fluxo-caixa' | 'satisfacao';

export default function Index() {
  const { isAdmin, canAccessCashFlow, canAccessReports } = useAuth();
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [selectedOrder, setSelectedOrder] = useState<ServiceOrder | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<OrderStatus | null>(null);

  // Redirecionar se usuário restrito tentar acessar caixa ou relatórios
  useEffect(() => {
    if (!canAccessCashFlow && currentView === 'fluxo-caixa') {
      setCurrentView('dashboard');
      toast.error('Você não tem acesso ao Fluxo de Caixa');
    }
    if (!canAccessReports && currentView === 'reports') {
      setCurrentView('dashboard');
      toast.error('Você não tem acesso aos Relatórios');
    }
  }, [currentView, canAccessCashFlow, canAccessReports]);

  // Limpar filtro quando sair da view de orders
  useEffect(() => {
    if (currentView !== 'orders') {
      setStatusFilter(null);
    }
  }, [currentView]);
  
  const {
    orders,
    isLoading,
    createOrder,
    updateOrder,
    updateChecklistItem,
    deleteOrder,
    createMaterial,
    updateMaterial,
    deleteMaterial,
    createPayment,
    deletePayment,
    isCreatingPayment,
    isDeletingPayment,
    isCreating,
    isUpdating,
    isCreatingMaterial,
    isUpdatingMaterial,
    isDeletingMaterial,
  } = useServiceOrders();

  const { mechanics } = useMechanics();
  const { upsertClient, upsertMotorcycle, getClientById } = useClients();

  // Mantém a OS selecionada sincronizada com o cache atualizado (PC/celular)
  useEffect(() => {
    if (!selectedOrder?.id) return;
    const updated = orders.find((o) => o.id === selectedOrder.id);
    if (updated) {
      setSelectedOrder((prev) => (prev?.id === updated.id ? updated : prev));
    }
  }, [orders, selectedOrder?.id]);

  const handleCreateOrder = async (formData: Record<string, unknown>) => {
    try {
      console.log('📝 FormData recebido:', formData);

      const toNoonISOString = (dateStr?: string | null) => {
        if (!dateStr) return null;
        const [year, month, day] = dateStr.split('-').map(Number);
        if (!year || !month || !day) return null;
        return new Date(year, month - 1, day, 12, 0, 0, 0).toISOString();
      };
      
      // Validar dados obrigatórios
      if (!formData?.client?.name) {
        console.error('❌ Nome do cliente vazio');
        toast.error('Nome do cliente é obrigatório');
        return;
      }
      if (!formData?.motos?.length) {
        console.error('❌ Nenhuma moto adicionada');
        toast.error('Adicione pelo menos uma moto');
        return;
      }
      if (!formData?.client?.cpf) {
        console.error('❌ CPF do cliente vazio');
        toast.error('CPF do cliente é obrigatório');
        return;
      }

      // 1️⃣ SALVAR CLIENTE
      const clientData = {
        name: formData.client.name,
        cpf: formData.client.cpf.replace(/\D/g, ''), // Remove formatação
        phone: formData.client.phone?.replace(/\D/g, '') || null,
        apelido: formData.client.apelido || null,
        instagram: formData.client.instagram || null,
        autoriza_instagram: !!formData.client.autoriza_instagram,
        autoriza_lembretes: formData.client.autoriza_lembretes !== false,
        endereco: `${formData.client.address || ''}${formData.client.numero ? ', ' + formData.client.numero : ''}`.trim() || null,
        birth_date: formData.client.birth_date || null,
      };

      console.log('💾 Salvando cliente:', clientData);
      const savedClient = await upsertClient(clientData);
      
      if (!savedClient) {
        toast.error('Erro ao salvar cliente');
        return;
      }
      
      console.log('✅ Cliente salvo:', savedClient);

      // 2️⃣ SALVAR MOTOS
      let primaryMotorcycleId: string | null = null;
      for (const moto of formData.motos) {
        if (moto.placa) {
          // Extrair marca do campo model (primeira palavra) ou usar a própria string se não tiver espaço
          const modelParts = moto.model?.trim().split(' ') || [];
          const marca = modelParts[0] || 'Não informado';
          const modelo = modelParts.slice(1).join(' ') || moto.moto_info || 'Não informado';
          
          const motoData = {
            client_id: savedClient.id,
            placa: moto.placa.toUpperCase().replace(/[^A-Z0-9]/g, ''),
            marca: marca,
            modelo: modelo,
            ano: moto.year ? parseInt(moto.year) : null,
            cor: moto.color || null,
          };
          
          console.log('🏍️ Salvando moto:', motoData);
          const savedMoto = await upsertMotorcycle(motoData);
          
          if (savedMoto) {
            console.log('✅ Moto salva:', savedMoto);
            if (!primaryMotorcycleId) {
              primaryMotorcycleId = savedMoto.id;
            }
          }
        }
      }

      const equipmentArray = formData.motos
        .map((m: Record<string, unknown>) => {
          const base = (m?.equipment || '').trim() || m?.placa || '';
          const rawKm = String(m?.km || '').trim();
          const kmFormatted = rawKm
            ? /km/i.test(rawKm)
              ? rawKm
              : `${rawKm} km`
            : '';

          const withKm = [base, kmFormatted].filter(Boolean).join(' ');
          return withKm ? `${withKm} (${m.placa})` : m.placa;
        })
        .join(', ');
      
      // Montar informação de retirada
      let retiradaInfo = '';
      if (formData.servicos.quem_pega === 'cliente') {
        retiradaInfo = 'Cliente';
      } else {
        const nome = formData.servicos.nome_retirada || 'Não informado';
        const telefone = formData.servicos.telefone_retirada || 'Não informado';
        const cpf = formData.servicos.cpf_retirada || 'Não informado';
        retiradaInfo = `Outra pessoa - Nome: ${nome} | Tel: ${telefone} | CPF: ${cpf}`;
      }
      
      const problemDescription = `${formData.servicos.o_que_fazer || 'Sem descrição'}

Retirada: ${retiradaInfo}`;

      // 3️⃣ CRIAR ORDEM DE SERVIÇO
      const fullAddress = `${formData.client.address || ''}${formData.client.numero ? ', ' + formData.client.numero : ''}`.trim();
      
      const orderData = {
        client_id: savedClient.id, // Vincular com o cliente salvo
        motorcycle_id: primaryMotorcycleId,
        atendimento_id: formData.servicos.atendimento_id || null,
        client_name: formData.client.name,
        client_cpf: formData.client.cpf || '',
        client_apelido: formData.client.apelido || '',
        client_instagram: formData.client.instagram || '',
        autoriza_instagram: !!formData.client.autoriza_instagram,
        client_phone: formData.client.phone || '',
        client_address: fullAddress || '',
        client_birth_date: formData.client.birth_date || null,
        entry_date: toNoonISOString(formData.servicos.entry_date),
        equipment: equipmentArray,
        problem_description: problemDescription,
      };

      console.log('📤 Enviando orderData:', orderData);
      
      createOrder(orderData, {
        onSuccess: async (newOrder: { id: string; entry_date?: string }) => {
          console.log('✅ OS criada com sucesso:', newOrder);
          
          // Check for maintenance keywords and create reminders
          try {
            const keywords = await getMaintenanceKeywords();
            const detectedKeyword = findKeywordInText(
              formData.servicos.o_que_fazer || '',
              keywords
            );
            
            if (detectedKeyword && savedClient?.id && savedClient?.autoriza_lembretes !== false) {
              console.log('🔔 Palavra-chave detectada:', detectedKeyword.keyword);
              const reminder = await createMaintenanceReminder(
                newOrder.id,
                savedClient.id,
                formData.client.phone || '',
                detectedKeyword.id,
                new Date(newOrder.entry_date || new Date())
              );
              
              if (reminder) {
                console.log('✅ Lembrete criado:', reminder);
                toast.success(`Lembrete automático criado para "${detectedKeyword.keyword}" em ${detectedKeyword.reminder_days} dias! 🔔`);
              }
            }
          } catch (reminderError) {
            console.error('⚠️ Erro ao criar lembrete:', reminderError);
            // Don't fail the entire order creation
          }
          
          toast.success('Cliente, motos e OS salvos com sucesso! 🎉');
          // Redirecionar para a OS criada
          setSelectedOrder(newOrder);
          setCurrentView('details');
        },
        onError: (error: Error | unknown) => {
          console.error('❌ Erro na mutation:', error);
          toast.error('Erro ao criar ordem de serviço');
        }
      });
    } catch (error) {
      console.error('❌ Erro na transformação:', error);
    }
  };

  const handleOrderClick = (order: ServiceOrder) => {
    setSelectedOrder(order);
    setCurrentView('details');
  };

  const handleBackFromDetails = () => {
    setSelectedOrder(null);
    setCurrentView('orders');
  };

  const handleOpenMaterials = () => {
    setCurrentView('materials');
  };

  const handleBackFromMaterials = () => {
    setCurrentView('details');
  };

  const handleStatusChange = (status: OrderStatus) => {
    if (selectedOrder) {
      const updatePayload: any = { id: selectedOrder.id, status };
      if (status === 'concluida' || status === 'concluida_entregue') {
        updatePayload.conclusion_date = new Date().toISOString();
      }
      updateOrder(updatePayload);
      setSelectedOrder(prev => prev ? { ...prev, status, conclusion_date: updatePayload.conclusion_date ?? prev.conclusion_date } : null);
    }
  };

  // Listener para atualização de mecânico/data emitida pelo OrderDetails
  useEffect(() => {
    const handleUpdateMechanic = (e: Event) => {
      const customEvent = e as CustomEvent;
      const { id, mechanic_id } = customEvent.detail || {};
      if (!id) return;

      updateOrder({ id, mechanic_id });
      setSelectedOrder(prev => prev && prev.id === id ? { ...prev, mechanic_id } as ServiceOrder : prev);
    };

    const handleUpdateExitDate = (e: Event) => {
      const customEvent = e as CustomEvent;
      const { id, exit_date } = customEvent.detail || {};
      if (!id) return;

      updateOrder({ id, exit_date });
      setSelectedOrder(prev => prev && prev.id === id ? { ...prev, exit_date } as ServiceOrder : prev);
    };

    window.addEventListener('order:updateMechanic', handleUpdateMechanic as EventListener);
    window.addEventListener('order:updateExitDate', handleUpdateExitDate as EventListener);

    return () => {
      window.removeEventListener('order:updateMechanic', handleUpdateMechanic as EventListener);
      window.removeEventListener('order:updateExitDate', handleUpdateExitDate as EventListener);
    };
  }, [updateOrder]);

  const handleChecklistToggle = (id: string, completed: boolean) => {
    updateChecklistItem({ id, completed });
    setSelectedOrder(prev => {
      if (!prev) return null;
      return {
        ...prev,
        checklist_items: prev.checklist_items?.map(item =>
          item.id === id ? { ...item, completed } : item
        ),
      };
    });
  };
  
  const handleChecklistRating = (id: string, rating: number) => {
    // Update the checklist item with rating (sem marcar como completed)
    updateChecklistItem({ id, rating });
    setSelectedOrder(prev => {
      if (!prev) return null;
      return {
        ...prev,
        checklist_items: prev.checklist_items?.map(item =>
          item.id === id ? { ...item, rating } : item
        ) ?? [],
      };
    });
  };

  const handleChecklistObservations = (id: string, observations: string) => {
    updateChecklistItem({ id, observations });
    setSelectedOrder(prev => {
      if (!prev) return null;
      return {
        ...prev,
        checklist_items: prev.checklist_items?.map(item =>
          item.id === id ? { ...item, observations } : item
        ),
      };
    });
  };

  const handleSignatureSave = (signature: string) => {
    if (selectedOrder) {
      updateOrder({ id: selectedOrder.id, signature_data: signature });
      setSelectedOrder(prev => prev ? { ...prev, signature_data: signature } : null);
    }
  };

  const handleDeleteOrder = () => {
    if (selectedOrder) {
      deleteOrder(selectedOrder.id);
      setSelectedOrder(null);
      setCurrentView('orders');
    }
  };

  const handleAddMaterial = (material: Record<string, unknown>) => {
    if (!selectedOrder) return;
    // Envia direto ao servidor; atualiza UI apenas com retorno real (sem temporários)
    createMaterial(
      { ...material, order_id: selectedOrder.id },
      {
        onSuccess: async (saved: Record<string, unknown>) => {
          setSelectedOrder(prev => {
            if (!prev) return null;
            const current = prev.materials || [];
            return { ...prev, materials: [...current, saved] } as ServiceOrder;
          });

          // Criar ou reprogramar lembrete baseado na descrição do item (Peças e Serviços)
          try {
            const keywords = await getMaintenanceKeywords();
            const detectedKeyword = findKeywordInText(
              saved?.descricao || material?.descricao || '',
              keywords
            );

            if (detectedKeyword && selectedOrder?.client_id) {
              const client = await getClientById(selectedOrder.client_id);
              if (client?.autoriza_lembretes === false) return;

              const serviceDate = new Date(saved?.created_at || selectedOrder?.entry_date || new Date());
              
              // Automatically cancel old pending reminder and create new one
              const result = await rescheduleMaintenanceReminder(
                selectedOrder.id,
                selectedOrder.client_id,
                selectedOrder.client_phone || '',
                detectedKeyword.id,
                serviceDate
              );

              if (result.created) {
                const message = result.cancelled > 0 
                  ? `✅ Lembrete anterior cancelado. Novo agendado para "${detectedKeyword.keyword}" em ${detectedKeyword.reminder_days} dias! 🔔`
                  : `✅ Lembrete criado para "${detectedKeyword.keyword}" em ${detectedKeyword.reminder_days} dias! 🔔`;
                toast.success(message);
              }
            }
          } catch (reminderError) {
            console.error('⚠️ Erro ao criar/reprogramar lembrete (Peças e Serviços):', reminderError);
          }
        },
        onError: (error: Error | unknown) => {
          toast.error(`Erro ao adicionar material: ${error?.message || 'Erro desconhecido'}`);
        }
      }
    );
  };

  const handleRemoveMaterial = (id: string) => {
    // Server-first: só remove da UI após sucesso no servidor
    deleteMaterial(id, {
      onSuccess: () => {
        setSelectedOrder(prev => {
          if (!prev) return null;
          return {
            ...prev,
            materials: (prev.materials || []).filter(m => m.id !== id),
          } as ServiceOrder;
        });
      },
      onError: (error: Error | unknown) => {
        toast.error(`Erro ao remover material: ${error?.message || 'Erro desconhecido'}`);
      }
    });
  };

  const handleUpdateMaterial = (id: string, field: string, value: string) => {
    const updates: Record<string, unknown> = {};
    if (field === 'valor') {
      updates[field] = parseFloat(value) || 0;
    } else {
      updates[field] = value;
    }

    // Server-first: atualiza UI somente após sucesso no servidor
    updateMaterial(
      { id, ...updates },
      {
        onSuccess: (saved: Record<string, unknown>) => {
          setSelectedOrder(prev => {
            if (!prev) return null;
            return {
              ...prev,
              materials: (prev.materials || []).map(m => (m.id === id ? { ...m, ...saved } : m)),
            } as ServiceOrder;
          });
        },
        onError: (error: Error | unknown) => {
          toast.error(`Erro ao atualizar material: ${error?.message || 'Erro desconhecido'}`);
        }
      }
    );
  };

  const handleAddPayment = (payload: { order_id: string; amount: number; discount_amount?: number | null; method: PaymentMethod; notes?: string | null; finalized_by_staff_id?: string | null }) => {
    createPayment(payload, {
      onSuccess: (saved: Record<string, unknown>) => {
        setSelectedOrder(prev => {
          if (!prev) return null;
          const current = prev.payments || [];
          const updatedPayments = [...current, saved];
          // Calcular total pago e desconto
          const totalOS = prev.materials?.reduce((acc, m) => acc + ((m.valor || 0) * (parseFloat(m.quantidade) || 0)), 0) || 0;
          const totalPaid = updatedPayments.reduce((acc, p) => acc + (p.amount || 0), 0);
          const totalDiscount = updatedPayments.reduce((acc, p) => acc + (p.discount_amount || 0), 0);
          const totalSettled = totalPaid + totalDiscount;
          // Se quitado, atualizar status para concluida_entregue
          if (totalOS > 0 && totalSettled >= totalOS && prev.status !== 'concluida_entregue') {
            const now = new Date().toISOString();
            updateOrder({
              id: prev.id,
              status: 'concluida_entregue',
              exit_date: now,
              conclusion_date: now,
            });
            return { ...prev, payments: updatedPayments, status: 'concluida_entregue', exit_date: now, conclusion_date: now } as ServiceOrder;
          }
          return { ...prev, payments: updatedPayments } as ServiceOrder;
        });
      },
      onError: (error: Error | unknown) => {
        toast.error(`Erro ao adicionar pagamento: ${error?.message || 'Erro desconhecido'}`);
      }
    });
  };

  const handleDeletePayment = (id: string) => {
    deletePayment(id, {
      onSuccess: () => {
        setSelectedOrder(prev => {
          if (!prev) return null;
          return { ...prev, payments: (prev.payments || []).filter(p => p.id !== id) } as ServiceOrder;
        });
      },
      onError: (error: Error | unknown) => {
        toast.error(`Erro ao remover pagamento: ${error?.message || 'Erro desconhecido'}`);
      }
    });
  };

  const navView = currentView === 'details' || currentView === 'materials' ? 'orders' : currentView as string;

  // Filtrar ordens por busca
  const filteredOrders = searchQuery.trim()
    ? orders.filter((order) => {
        const query = searchQuery.toLowerCase();
        return (
          order.client_name.toLowerCase().includes(query) ||
          order.client_phone.toLowerCase().includes(query) ||
          order.equipment.toLowerCase().includes(query) ||
          order.id.toLowerCase().includes(query)
        );
      })
    : orders;

  // Filtrar por status se selecionado
  const displayedOrders = statusFilter
    ? filteredOrders.filter(order => order.status === statusFilter)
    : filteredOrders;

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header com Logo */}
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border shadow-md">
        <div className="container max-w-lg md:max-w-3xl lg:max-w-6xl mx-auto px-4 py-2">
          <div className="flex items-center justify-between">
            <div className="flex-1"></div>
            <div className="flex items-center justify-center flex-1">
              <img src="/bandara-logo.png" alt="SpeedSeek OS" className="h-32 w-auto" />
            </div>
            <div className="flex-1 flex justify-end">
              <ThemeToggle />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container max-w-lg md:max-w-3xl lg:max-w-6xl mx-auto px-4 py-5">
        {currentView === 'dashboard' && (
          <div className="space-y-5 animate-fade-in">
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-foreground">Dashboard</h2>
              </div>
              {isLoading ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[...Array(4)].map((_, i) => (
                    <Skeleton key={i} className="h-24 rounded-xl" />
                  ))}
                </div>
              ) : (
                <DashboardStats 
                  orders={orders} 
                  onStatusClick={(status) => {
                    setStatusFilter(status || null);
                    setCurrentView('orders');
                  }}
                  activeFilter={statusFilter}
                />
              )}
            </div>

            {orders.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-3">Recentes</h3>
                <div className="space-y-3">
                  {orders.slice(0, 3).map((order) => (
                    <OrderCard
                      key={order.id}
                      order={order}
                      onClick={() => handleOrderClick(order)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {currentView === 'reports' && (
          <ReportsPage />
        )}

        {currentView === 'mechanics' && (
          <MechanicsPage />
        )}

        {currentView === 'pos-venda' && (
          <AfterSalesPage />
        )}

        {currentView === 'fluxo-caixa' && (
          <CashFlowPage />
        )}

        {currentView === 'satisfacao' && (
          <SatisfactionDashboardPage />
        )}

        {currentView === 'new' && (
          <OrderForm
            onSubmit={handleCreateOrder}
            onCancel={() => setCurrentView('dashboard')}
            isSubmitting={isCreating}
          />
        )}

        {currentView === 'express' && (
          <ExpressCadastroPage 
            onBack={() => setCurrentView('dashboard')} 
            onOrderCreated={async (orderId) => {
              // Buscar a OS criada e redirecionar para detalhes
              let createdOrder = orders.find(o => o.id === orderId);
              if (!createdOrder) {
                // Buscar diretamente no Supabase
                const { data, error } = await supabase
                  .from('service_orders')
                  .select('*')
                  .eq('id', orderId)
                  .single();
                if (error) {
                  toast.error('Erro ao buscar OS criada');
                  setCurrentView('dashboard');
                  return;
                }
                createdOrder = data;
              }
              if (createdOrder) {
                setSelectedOrder(createdOrder);
                setCurrentView('details');
                toast.success('OS criada com sucesso!');
              } else {
                setCurrentView('dashboard');
              }
            }}
          />
        )}

        {currentView === 'orders' && (
          <div className="space-y-4 animate-fade-in">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">
                {statusFilter ? `${statusFilter === 'aberta' ? '🟢 Abertas' : statusFilter === 'em_andamento' ? '🔵 Em Andamento' : '✅ Concluídas'}` : 'Todas as OS'}
              </h2>
              {statusFilter && (
                <button
                  onClick={() => setStatusFilter(null)}
                  className="text-xs font-medium text-blue-600 hover:text-blue-700 underline"
                >
                  Limpar filtro
                </button>
              )}
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Buscar por nome, telefone, placa ou ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-11"
              />
            </div>
            
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-32 rounded-xl" />
                ))}
              </div>
            ) : orders.length === 0 ? (
              <EmptyState onCreateNew={() => setCurrentView('new')} />
            ) : displayedOrders.length === 0 ? (
              <div className="text-center py-12">
                <Search className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-50" />
                <p className="text-muted-foreground">
                  {statusFilter ? `Nenhuma OS ${statusFilter === 'aberta' ? 'aberta' : statusFilter === 'em_andamento' ? 'em andamento' : 'concluída'}` : `Nenhuma OS encontrada com "${searchQuery}"`}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {displayedOrders.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    onClick={() => handleOrderClick(order)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {currentView === 'details' && selectedOrder && (
          <OrderDetails
            order={selectedOrder}
            onBack={handleBackFromDetails}
            onOpenMaterials={handleOpenMaterials}
            onStatusChange={handleStatusChange}
            onUpdateOrder={updateOrder}
            onChecklistItemToggle={handleChecklistToggle}
            onChecklistItemRating={handleChecklistRating}
            onChecklistItemObservations={handleChecklistObservations}
            onSignatureSave={handleSignatureSave}
            onDelete={handleDeleteOrder}
            onAddMaterial={handleAddMaterial}
            onRemoveMaterial={handleRemoveMaterial}
            onUpdateMaterial={handleUpdateMaterial}
            onAddPayment={handleAddPayment}
            onDeletePayment={handleDeletePayment}
            isCreatingPayment={isCreatingPayment}
            isDeletingPayment={isDeletingPayment}
            isUpdating={isUpdating}
            isAdmin={isAdmin}
            canAccessPayments={canAccessReports}
          />
        )}

        {currentView === 'materials' && selectedOrder && isAdmin && (
          <MaterialsPage
            order={selectedOrder}
            mecanicos={mechanics}
            onBack={handleBackFromMaterials}
            onAddMaterial={handleAddMaterial}
            onRemoveMaterial={handleRemoveMaterial}
            onUpdateMaterial={handleUpdateMaterial}
            isUpdating={isUpdating}
            disabledAll={isCreatingMaterial || isUpdatingMaterial || isDeletingMaterial}
            isCreatingMaterial={isCreatingMaterial}
            isUpdatingMaterial={isUpdatingMaterial}
            isDeletingMaterial={isDeletingMaterial}
          />
        )}
      </main>

      {/* Bottom Navigation */}
      {currentView !== 'details' && currentView !== 'materials' && (
        <BottomNav
          activeView={navView}
          onViewChange={(view) => setCurrentView(view)}
          isAdmin={isAdmin}
        />
      )}
    </div>
  );
}
