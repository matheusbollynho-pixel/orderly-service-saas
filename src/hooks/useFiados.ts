import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { sendWhatsAppText } from '@/lib/whatsappService';
import { useStore } from '@/contexts/StoreContext';

export interface FiadoItem {
  desc: string;
  qty: number;
  value: number;
  inventory_product_id?: string;
}

export interface FiadoPayment {
  id: string;
  fiado_id: string;
  amount: number;
  method: string;
  notes?: string;
  received_by?: string;
  paid_at: string;
}

export interface FiadoMessage {
  id: string;
  fiado_id: string;
  level: number;
  message: string;
  sent_at: string;
  status: string;
}

export interface Fiado {
  id: string;
  origin_type: 'os' | 'balcao' | 'manual';
  origin_id?: string;
  client_name: string;
  client_phone?: string;
  client_cpf?: string;
  client_id?: string;
  items: FiadoItem[];
  original_amount: number;
  amount_paid: number;
  interest_accrued: number;
  due_date: string;
  interest_rate_monthly: number;
  status: 'pendente' | 'parcial' | 'pago' | 'juridico';
  last_reminder_level: number;
  last_reminder_at?: string;
  next_reminder_at?: string;
  asaas_payment_id?: string;
  asaas_payment_url?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  fiado_payments?: FiadoPayment[];
  fiado_messages?: FiadoMessage[];
}

export type CreateFiadoInput = {
  origin_type: 'os' | 'balcao' | 'manual';
  origin_id?: string;
  client_name: string;
  client_phone?: string;
  client_cpf?: string;
  client_id?: string;
  items: FiadoItem[];
  original_amount: number;
  due_date: string;
  interest_rate_monthly?: number;
  notes?: string;
};

export function useFiados() {
  const [fiados, setFiados] = useState<Fiado[]>([]);
  const [loading, setLoading] = useState(true);
  const { storeId } = useStore();

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('fiados')
      .select('*, fiado_payments(*), fiado_messages(*)')
      .order('created_at', { ascending: false });
    setFiados((data as Fiado[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Recarrega quando o usuário volta para a aba/página
  useEffect(() => {
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [load]);

  const createFiado = async (input: CreateFiadoInput) => {
    if (!storeId) { toast.error('Aguarde o sistema carregar e tente novamente.'); return null; }
    const { data, error } = await supabase.from('fiados').insert([{
      ...input,
      store_id: storeId,
      items: input.items,
      interest_rate_monthly: input.interest_rate_monthly ?? 2.0,
    }]).select('*, fiado_payments(*), fiado_messages(*)').single();
    if (error) { toast.error('Erro ao criar fiado'); return null; }

    // OS vai para concluída e entregue imediatamente — moto já foi entregue ao cliente
    if (input.origin_type === 'os' && input.origin_id) {
      await supabase.from('service_orders').update({
        status: 'concluida_entregue',
        exit_date: new Date().toISOString(),
      }).eq('id', input.origin_id);
    }

    setFiados(prev => [data as Fiado, ...prev]);
    toast.success('Fiado registrado!');
    return data as Fiado;
  };

  const addPayment = async (fiado_id: string, amount: number, method: string, received_by: string, notes?: string) => {
    const { error: pe } = await supabase.from('fiado_payments').insert([{
      store_id: storeId!,
      fiado_id, amount, method, notes, received_by,
    }]);
    if (pe) { toast.error('Erro ao registrar pagamento'); return false; }

    const { data: fiado } = await supabase.from('fiados').select('amount_paid, original_amount, interest_accrued, client_name, origin_type, origin_id').eq('id', fiado_id).single();
    if (!fiado) return false;

    const newAmountPaid = (fiado.amount_paid || 0) + amount;
    const totalOwed = (fiado.original_amount || 0) + (fiado.interest_accrued || 0);
    const newStatus = newAmountPaid >= totalOwed ? 'pago' : newAmountPaid > 0 ? 'parcial' : 'pendente';

    await supabase.from('fiados').update({ amount_paid: newAmountPaid, status: newStatus, updated_at: new Date().toISOString() }).eq('id', fiado_id);

    // Quando origem é OS: registra em payments (trigger cria cash_flow automaticamente)
    // Quando origem é balcão/manual: insere no cash_flow direto
    if (fiado.origin_type === 'os' && fiado.origin_id) {
      // Registra o valor parcial ou total pago na OS (trigger cria cash_flow)
      await supabase.from('payments').insert({
        store_id: storeId!,
        order_id: fiado.origin_id,
        amount,
        discount_amount: 0,
        method,
        notes: notes || `Fiado recebido - ${fiado.client_name || 'Cliente'}`,
      });
      // Só marca como concluída e entregue quando o fiado estiver totalmente quitado
      if (newStatus === 'pago') {
        await supabase.from('service_orders')
          .update({ status: 'concluida_entregue', exit_date: new Date().toISOString() })
          .eq('id', fiado.origin_id)
          .neq('status', 'concluida_entregue');
      }
    } else {
      // Balcão ou manual: finaliza balcão se quitado e lança no caixa
      if (newStatus === 'pago' && fiado.origin_type === 'balcao' && fiado.origin_id) {
        await supabase.from('balcao_orders').update({ status: 'finalizada' }).eq('id', fiado.origin_id);
      }
      await supabase.from('cash_flow').insert([{
        store_id: storeId!,
        type: 'devolucao',
        description: `Fiado recebido - ${fiado.client_name || 'Cliente'}`,
        amount,
        payment_method: method,
        date: new Date().toISOString().split('T')[0],
        notes: notes || null,
      }]);
    }

    toast.success('Pagamento registrado!');
    await load();
    return true;
  };

  const updateStatus = async (fiado_id: string, status: Fiado['status']) => {
    await supabase.from('fiados').update({ status, updated_at: new Date().toISOString() }).eq('id', fiado_id);
    await load();
  };

  const deleteFiado = async (fiado_id: string) => {
    const fiado = fiados.find(f => f.id === fiado_id);
    if (fiado) {
      if (fiado.origin_type === 'balcao' && fiado.origin_id) {
        // Fiado de balcão: restaura estoque via inventory_movements
        const { data: movements } = await supabase
          .from('inventory_movements')
          .select('id, product_id, quantity, unit_price')
          .eq('balcao_order_id', fiado.origin_id)
          .in('type', ['saida_balcao', 'saida_venda']);

        console.log('🔄 Restaurando estoque fiado balcão:', { origin_id: fiado.origin_id, movements });
        for (const mov of (movements ?? [])) {
          const { error: movErr } = await supabase.from('inventory_movements').insert({
            store_id: storeId!,
            product_id: mov.product_id,
            type: 'devolucao',
            quantity: mov.quantity,
            unit_price: mov.unit_price ?? 0,
            notes: `Devolução - fiado excluído (${fiado.client_name})`,
          });
          if (movErr) console.error('❌ Erro ao restaurar estoque:', movErr);
        }
      } else {
        // Fiado de OS: lógica original por inventory_product_id nos itens
        const itemsWithProduct = (fiado.items || []).filter(i => i.inventory_product_id);
        for (const item of itemsWithProduct) {
          const { data: prod } = await supabase
            .from('inventory_products')
            .select('stock_current')
            .eq('id', item.inventory_product_id!)
            .single();
          if (prod) {
            const newStock = (prod.stock_current || 0) + item.qty;
            await supabase.from('inventory_products').update({ stock_current: newStock, updated_at: new Date().toISOString() }).eq('id', item.inventory_product_id!);
            await supabase.from('inventory_movements').insert([{
              store_id: storeId!,
              product_id: item.inventory_product_id!,
              type: 'devolucao',
              quantity: item.qty,
              notes: `Devolução - fiado excluído (${fiado.client_name})`,
            }]);
          }
        }
      }
    }

    const { error } = await supabase.from('fiados').delete().eq('id', fiado_id);
    if (error) { toast.error('Erro ao excluir'); return; }
    setFiados(prev => prev.filter(f => f.id !== fiado_id));
    toast.success('Fiado removido');
  };

  const sendReminder = async (fiado: Fiado, level: number) => {
    const name = fiado.client_name.split(' ')[0];
    const totalOwed = Math.max(fiado.original_amount + fiado.interest_accrued - fiado.amount_paid, 0).toFixed(2);
    const { data: settings } = await supabase.from('store_settings').select('company_name').limit(1).maybeSingle();
    const store = settings?.company_name || 'Bandara Motos';

    const messages: Record<number, string> = {
      1: `Olá ${name}! 😊 Passando para lembrar que você tem um valor pendente de *R$ ${totalOwed}* com a *${store}*. Qualquer dúvida estamos à disposição!`,
      2: `Olá ${name}, tudo bem?\n\nIdentificamos que seu débito de *R$ ${totalOwed}* com a *${store}* ainda está em aberto.\n\nPedimos que regularize o quanto antes para evitar maiores inconvenientes. Qualquer dúvida entre em contato!`,
      3: `Prezado(a) *${fiado.client_name}*,\n\nSeu débito de *R$ ${totalOwed}* com a *${store}* está em atraso.\n\n⚠️ Informamos que o valor está sujeito a acréscimo de juros mensais. Caso não haja regularização em breve, o caso poderá ser encaminhado para cobrança extrajudicial.\n\nPor favor, entre em contato para regularizar sua situação.`,
      4: `*NOTIFICAÇÃO EXTRAJUDICIAL*\n\nPrezado(a) ${fiado.client_name},\n\nV.Sa. encontra-se em débito com a *${store}* no valor de *R$ ${totalOwed}*, vencido em ${fiado.due_date}.\n\nCaso não ocorra o pagamento em *48 horas*, seu nome será encaminhado ao *SERASA/SPC* e o crédito será remetido ao setor jurídico para propositura de ação de cobrança, com acréscimo de honorários advocatícios.\n\nRegularize sua situação imediatamente.`,
    };

    const message = messages[level] || messages[1];

    await supabase.from('fiado_messages').insert([{ store_id: storeId!, fiado_id: fiado.id, level, message, status: 'sent' }]);
    await supabase.from('fiados').update({ last_reminder_level: level, last_reminder_at: new Date().toISOString() }).eq('id', fiado.id);

    if (fiado.client_phone) {
      await sendWhatsAppText({ phone: fiado.client_phone, text: message }).catch(() => null);
    }

    // IA agenda próximo envio automático
    supabase.functions.invoke('fiado-ia-agenda', { body: { fiado_id: fiado.id } }).catch(() => null);

    toast.success(`Mensagem nível ${level} enviada! IA vai agendar a próxima.`);
    await load();
  };

  const createAsaasCharge = async (fiado_id: string, billing_type: 'PIX' | 'BOLETO') => {
    const { data, error } = await supabase.functions.invoke('fiado-asaas-cobranca', {
      body: { fiado_id, billing_type },
    });

    if (error) {
      let msg = 'Erro ao gerar cobrança';
      try { const e = await (error as { context: Response }).context.json(); msg = e.error || msg; } catch { /* noop */ }
      toast.error(msg);
      return null;
    }

    if (!data?.ok) {
      toast.error(data?.error || 'Erro ao gerar cobrança');
      return null;
    }

    toast.success(`Cobrança ${billing_type} gerada!`);
    await load();
    return data as { invoice_url: string; bank_slip_url?: string; value: number; due_date: string; charge_id: string };
  };

  return { fiados, loading, createFiado, addPayment, updateStatus, deleteFiado, sendReminder, createAsaasCharge, reload: load };
}
