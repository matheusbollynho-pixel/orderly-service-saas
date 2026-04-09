import { useState, useRef, useEffect } from 'react';
import { useBalcao, type BalcaoOrder, type BalcaoItem, type PaymentEntry } from '@/hooks/useBalcao';
import { useInventory, type InventoryProduct } from '@/hooks/useInventory';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, Plus, Trash2, CheckCircle, XCircle, Package, Printer, Send, FileText, Link, Copy, CheckCheck, Loader2, HandCoins } from 'lucide-react';
import { toast } from 'sonner';
import { sendWhatsAppText, sendWhatsAppDocument } from '@/lib/whatsappService';
import { supabase } from '@/integrations/supabase/client';
import { useStoreSettings } from '@/hooks/useStoreSettings';
import { useStore } from '@/contexts/StoreContext';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import LOGO_BASE64 from '@/assets/logo';

interface Props {
  order: BalcaoOrder;
  isAdmin: boolean;
  onBack: () => void;
}

const PAYMENT_LABELS: Record<string, string> = {
  dinheiro: 'Dinheiro',
  pix: 'PIX',
  cartao_credito: 'Cartão Crédito',
  cartao_debito: 'Cartão Débito',
  transferencia: 'Transferência',
};

const STATUS_COLORS: Record<string, string> = {
  aberta: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  finalizada: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  cancelada: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  fiado: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
};

const STATUS_LABELS: Record<string, string> = {
  aberta: 'Aberta',
  finalizada: 'Finalizada',
  cancelada: 'Cancelada',
  fiado: 'Fiado',
};

export function BalcaoNotaDetail({ order, isAdmin, onBack }: Props) {
  const { updateOrder, addItem, updateItem, removeItem, finalizeOrder, cancelOrder, isFinalizing, isCancelling } = useBalcao();
  const { products } = useInventory();
  const { members: teamMembers } = useTeamMembers();
  const { settings: storeSettings } = useStoreSettings();
  const { storeId } = useStore();

  const items: BalcaoItem[] = order.balcao_items ?? [];
  const isEditable = order.status === 'aberta';
  const canAct = isEditable && !!order.atendente_id;

  // Remove acentos de vogais mas mantém ç
  const stripAccents = (text: string) =>
    text.normalize('NFD').replace(/[\u0300-\u036f]/g, c => c === '\u0327' ? c : '').normalize('NFC');

  // ── campos do novo item ──────────────────────────────────────
  const [newDesc, setNewDesc] = useState('');
  const [newQty, setNewQty] = useState('1');
  const [newPrice, setNewPrice] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<InventoryProduct | null>(null);
  const [suggestions, setSuggestions] = useState<InventoryProduct[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelNotes, setCancelNotes] = useState('');

  const [editClientName, setEditClientName] = useState(order.client_name ?? '');
  const [editClientCpf, setEditClientCpf] = useState(order.client_cpf ?? '');
  const [editClientPhone, setEditClientPhone] = useState(order.client_phone ?? '');
  const [editClientAddress, setEditClientAddress] = useState(order.client_address ?? '');
  const [discountPct, setDiscountPct] = useState(String(order.discount_pct || ''));
  const [discountVal, setDiscountVal] = useState(
    order.discount_pct > 0
      ? String((order.subtotal * order.discount_pct / 100).toFixed(2))
      : ''
  );
  const initPayments = (): PaymentEntry[] => {
    if (Array.isArray(order.payment_methods) && order.payment_methods.length > 0)
      return order.payment_methods;
    return [{ method: order.payment_method ?? 'dinheiro', amount: 0 }];
  };
  const [paymentEntries, setPaymentEntries] = useState<PaymentEntry[]>(initPayments);
  const [isSendingWpp, setIsSendingWpp] = useState(false);
  const [isSendingOrc, setIsSendingOrc] = useState(false);

  // ── Asaas ──────────────────────────────────────────────────────
  const [asaasOpen, setAsaasOpen] = useState(false);
  const [asaasLoading, setAsaasLoading] = useState(false);
  const [asaasResult, setAsaasResult] = useState<null | { invoice_url?: string; bank_slip_url?: string; value?: number }>(null);
  const [asaasCopied, setAsaasCopied] = useState(false);
  const [asaasInstallments, setAsaasInstallments] = useState(1);
  const [asaasAmount, setAsaasAmount] = useState<string>('');

  // ── Fiado ──────────────────────────────────────────────────────
  const [showFiadoDialog, setShowFiadoDialog] = useState(false);
  const [fiadoDueDate, setFiadoDueDate] = useState('');
  const [fiadoNotes, setFiadoNotes] = useState('');
  const [fiadoInterestRate, setFiadoInterestRate] = useState('2');
  const [fiadoLoading, setFiadoLoading] = useState(false);

  const activeProducts = products.filter(p => p.active !== false);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node))
        setShowSuggestions(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Cálculos ──────────────────────────────────────────────────
  const subtotal = items.reduce((s, i) => s + i.unit_price * i.quantity, 0);
  const discPct = parseFloat(discountPct) || 0;
  const discountAmount = subtotal * (discPct / 100);
  const total = subtotal - discountAmount;

  // ── Salvar totais no servidor ─────────────────────────────────
  // overrideSub permite passar o subtotal já calculado antes da query ser invalidada
  const saveTotals = async (pct: number, overrideSub?: number) => {
    const sub = overrideSub ?? items.reduce((s, i) => s + i.unit_price * i.quantity, 0);
    const disc = sub * (pct / 100);
    await updateOrder({
      id: order.id,
      discount_pct: pct,
      subtotal: sub,
      discount_amount: disc,
      total: sub - disc,
    });
  };

  const handleBlurDiscount = () => saveTotals(discPct);

  const handleChangePct = (val: string) => {
    setDiscountPct(val);
    const pct = parseFloat(val) || 0;
    setDiscountVal(pct > 0 && subtotal > 0 ? (subtotal * pct / 100).toFixed(2) : '');
  };

  const handleChangeVal = (val: string) => {
    setDiscountVal(val);
    const v = parseFloat(val) || 0;
    const pct = subtotal > 0 ? (v / subtotal) * 100 : 0;
    setDiscountPct(pct > 0 ? pct.toFixed(4) : '');
  };

  const handleBlurDiscountVal = () => saveTotals(discPct);

  const handleBlurClient = async () => {
    await updateOrder({
      id: order.id,
      client_name: editClientName || null,
      client_cpf: editClientCpf || null,
      client_phone: editClientPhone || null,
      client_address: editClientAddress || null,
    });
  };

  const savePayments = async (entries: PaymentEntry[]) => {
    setPaymentEntries(entries);
    await updateOrder({
      id: order.id,
      payment_method: entries[0]?.method ?? 'dinheiro',
      payment_methods: entries,
    });
  };

  const handleAddPayment = () => savePayments([...paymentEntries, { method: 'dinheiro', amount: 0 }]);

  const handleRemovePayment = (idx: number) => {
    if (paymentEntries.length === 1) return;
    savePayments(paymentEntries.filter((_, i) => i !== idx));
  };

  const handlePaymentMethodChange = (idx: number, method: string) => {
    const updated = paymentEntries.map((e, i) => i === idx ? { ...e, method } : e);
    savePayments(updated);
  };

  const handlePaymentAmountChange = (idx: number, val: string) => {
    const amount = parseFloat(val.replace(',', '.')) || 0;
    const updated = paymentEntries.map((e, i) => i === idx ? { ...e, amount } : e);
    savePayments(updated);
  };

  // ── Asaas ──────────────────────────────────────────────────────
  const handleCobrarAsaas = async (billingType: string) => {
    if (total <= 0) return;
    const chargeAmount = asaasAmount !== '' ? parseFloat(asaasAmount.replace(',', '.')) : total;
    if (!chargeAmount || chargeAmount <= 0) { toast.error('Informe um valor válido'); return; }
    setAsaasLoading(true);
    setAsaasResult(null);
    const { data, error } = await supabase.functions.invoke('asaas-cobranca', {
      body: {
        order_id: order.id,
        billing_type: billingType,
        installment_count: asaasInstallments,
        amount: chargeAmount,
        client_name: editClientName || undefined,
        client_phone: editClientPhone || undefined,
        client_cpf: editClientCpf || undefined,
      },
    });
    setAsaasLoading(false);
    if (data?.error || error) {
      const body = await (error as any)?.context?.json?.().catch(() => null);
      const errMsg = data?.error || body?.error || error?.message || 'Erro ao gerar cobrança';
      toast.error(errMsg);
      return;
    }
    setAsaasResult(data);
  };

  const handleCobrarAsaasCopy = () => {
    const url = asaasResult?.invoice_url || asaasResult?.bank_slip_url || '';
    if (!url) return;
    navigator.clipboard.writeText(url);
    setAsaasCopied(true);
    setTimeout(() => setAsaasCopied(false), 2000);
  };

  const handleCobrarAsaasWhatsApp = () => {
    const url = asaasResult?.invoice_url || asaasResult?.bank_slip_url || '';
    if (!url || !editClientPhone) return;
    const msg = `Olá${editClientName ? ' ' + editClientName.split(' ')[0] : ''}! 👋\n\nSegue o link para pagamento da nota *#${order.id.slice(0, 8)}* — *${storeSettings?.company_name || 'Loja'}*:\n\n${url}\n\nQualquer dúvida é só chamar. 😊`;
    sendWhatsAppText({ phone: editClientPhone, text: msg });
  };

  // ── Fiado ──────────────────────────────────────────────────────
  const handleRegistrarFiado = async () => {
    if (!fiadoDueDate) { toast.error('Informe a data de vencimento'); return; }
    setFiadoLoading(true);
    // Check for duplicate
    const { data: existing } = await supabase
      .from('fiados')
      .select('id')
      .eq('origin_type', 'balcao')
      .eq('origin_id', order.id)
      .limit(1);
    if (existing && existing.length > 0) {
      toast.error('Esta nota já foi registrada como fiado');
      setFiadoLoading(false);
      setShowFiadoDialog(false);
      return;
    }
    const fiadoItems = items.map(i => ({
      desc: i.description || '',
      qty: i.quantity || 1,
      value: i.unit_price || 0,
    })).filter(i => i.desc);
    const amountAlreadyPaid = paymentEntries.reduce((s, e) => s + e.amount, 0);
    const pending = Math.max(total - amountAlreadyPaid, 0);
    const { error } = await supabase.from('fiados').insert([{
      store_id: storeId!,
      origin_type: 'balcao',
      origin_id: order.id,
      client_name: editClientName || order.client_name || 'Cliente',
      client_phone: editClientPhone || null,
      client_cpf: editClientCpf || null,
      items: fiadoItems,
      original_amount: pending > 0 ? pending : total,
      amount_paid: 0,
      interest_accrued: 0,
      due_date: fiadoDueDate,
      interest_rate_monthly: parseFloat(fiadoInterestRate) || 2,
      notes: fiadoNotes || null,
      status: 'pendente',
    }]);
    setFiadoLoading(false);
    if (error) { toast.error('Erro ao registrar fiado'); return; }

    // Deduz estoque dos itens tipo 'estoque'
    for (const item of items) {
      if (item.type === 'estoque' && item.product_id) {
        const { error: movErr } = await supabase.from('inventory_movements').insert({
          store_id: storeId!,
          product_id: item.product_id,
          type: 'saida_balcao',
          quantity: item.quantity,
          unit_price: item.unit_price,
          notes: `Fiado Balcão #${order.id.slice(0, 8)}${order.client_name ? ` - ${order.client_name}` : ''}`,
          balcao_order_id: order.id,
        });
        if (movErr) {
          console.error('Erro ao deduzir estoque (fiado):', movErr);
          toast.error(`Erro ao deduzir estoque: ${movErr.message}`);
        }
      }
    }

    // Marca a nota de balcão como 'fiado' e invalida o cache
    await updateOrder({ id: order.id, status: 'fiado' as const });

    setShowFiadoDialog(false);
    setFiadoDueDate('');
    setFiadoNotes('');
    setFiadoInterestRate('2');
    toast.success('Fiado registrado! Nota marcada como Fiado.');
  };

  // ── Autocomplete ──────────────────────────────────────────────
  const handleDescChange = (val: string) => {
    setNewDesc(val);
    setSelectedProduct(null);
    const q = val.trim().toLowerCase();
    const found = q.length === 0
      ? activeProducts.slice(0, 8)
      : activeProducts.filter(p =>
          p.name.toLowerCase().includes(q) || (p.code && p.code.toLowerCase().includes(q))
        ).slice(0, 8);
    setSuggestions(found);
    setShowSuggestions(true);
  };

  const handleDescFocus = () => {
    if (!selectedProduct) {
      const q = newDesc.trim().toLowerCase();
      const found = q.length === 0
        ? activeProducts.slice(0, 8)
        : activeProducts.filter(p =>
            p.name.toLowerCase().includes(q) || (p.code && p.code.toLowerCase().includes(q))
          ).slice(0, 8);
      setSuggestions(found);
      setShowSuggestions(true);
    }
  };

  const handleSelectProduct = (p: InventoryProduct) => {
    setSelectedProduct(p);
    setNewDesc(stripAccents(p.name));
    if (p.sale_price > 0) setNewPrice(String(p.sale_price));
    setShowSuggestions(false);
  };

  // ── Adicionar item ────────────────────────────────────────────
  const handleAddItem = async () => {
    if (!newDesc.trim()) { toast.error('Informe a descrição'); return; }
    const qty = parseFloat(newQty) || 1;
    const price = parseFloat(newPrice) || 0;

    let effectivePrice = price;
    if (selectedProduct) {
      const alreadyInCart = items.find(i => i.product_id === selectedProduct.id);
      const qtdNoCarrinho = alreadyInCart ? alreadyInCart.quantity : 0;
      if (qty + qtdNoCarrinho > selectedProduct.stock_current) {
        toast.error(`Estoque insuficiente (disponível: ${selectedProduct.stock_current - qtdNoCarrinho} ${selectedProduct.unit})`);
        return;
      }
      effectivePrice = price || (selectedProduct.sale_price ?? selectedProduct.cost_price ?? 0);
      await addItem({
        order_id: order.id,
        type: 'estoque',
        product_id: selectedProduct.id,
        description: stripAccents(selectedProduct.name),
        quantity: qty,
        unit_price: effectivePrice,
        total_price: effectivePrice * qty,
      });
    } else {
      await addItem({
        order_id: order.id,
        type: 'avulso',
        product_id: null,
        description: newDesc.trim(),
        quantity: qty,
        unit_price: price,
        total_price: price * qty,
      });
    }

    setNewDesc('');
    setNewQty('1');
    setNewPrice('');
    setSelectedProduct(null);
    // Calcula subtotal incluindo o item recém adicionado (items ainda não foi atualizado)
    const newSub = items.reduce((s, i) => s + i.unit_price * i.quantity, 0) + effectivePrice * qty;
    await saveTotals(discPct, newSub);
  };

  const handleUpdateItem = async (itemId: string, field: 'quantity' | 'unit_price' | 'description', val: string) => {
    const item = items.find(i => i.id === itemId);
    if (!item) return;
    if (field === 'quantity') {
      const qty = parseFloat(val) || 0;
      if (qty <= 0) {
        await removeItem(itemId);
        const sub = items.filter(i => i.id !== itemId).reduce((s, i) => s + i.unit_price * i.quantity, 0);
        await saveTotals(discPct, sub);
        return;
      }
      if (item.type === 'estoque' && item.product_id) {
        const prod = products.find(p => p.id === item.product_id);
        if (prod && qty > prod.stock_current) { toast.error(`Estoque máximo: ${prod.stock_current} ${prod.unit}`); return; }
      }
      await updateItem({ id: itemId, quantity: qty });
      const sub = items.reduce((s, i) => s + (i.id === itemId ? qty : i.quantity) * i.unit_price, 0);
      await saveTotals(discPct, sub);
    } else if (field === 'unit_price') {
      const newPrice = parseFloat(val) || 0;
      await updateItem({ id: itemId, unit_price: newPrice });
      const sub = items.reduce((s, i) => s + i.quantity * (i.id === itemId ? newPrice : i.unit_price), 0);
      await saveTotals(discPct, sub);
    } else {
      await updateItem({ id: itemId, description: val });
    }
  };

  const handleRemoveItem = async (itemId: string) => {
    await removeItem(itemId);
    const sub = items.filter(i => i.id !== itemId).reduce((s, i) => s + i.unit_price * i.quantity, 0);
    await saveTotals(discPct, sub);
  };

  // ── Finalizar ─────────────────────────────────────────────────
  const handleFinalizar = async () => {
    if (items.length === 0) { toast.error('Adicione ao menos um item'); return; }
    if (!order.atendente_id) { toast.error('Selecione o atendente antes de finalizar'); return; }
    if (paymentEntries.length > 1) {
      const pago = paymentEntries.reduce((s, e) => s + e.amount, 0);
      const restante = total - pago;
      if (Math.abs(restante) >= 0.01) {
        toast.error(restante > 0
          ? `Faltam R$ ${restante.toFixed(2)} para fechar o pagamento`
          : `Pagamento excede o total em R$ ${Math.abs(restante).toFixed(2)}`);
        return;
      }
    }
    if (!window.confirm(`Finalizar nota de R$ ${total.toFixed(2)}? Esta ação lançará no caixa e dará baixa no estoque.`)) return;
    await saveTotals(discPct);
    await finalizeOrder(order.id);
  };

  // ── Cancelar ──────────────────────────────────────────────────
  const handleCancelar = () => {
    setCancelReason('');
    setCancelNotes('');
    setShowCancelDialog(true);
  };

  const handleConfirmCancel = async () => {
    if (!cancelReason) { toast.error('Selecione o motivo do cancelamento'); return; }
    setShowCancelDialog(false);
    await cancelOrder({ orderId: order.id, cancelReason, cancelNotes });
    onBack();
  };

  // ── HTML base para PDF ────────────────────────────────────────
  const buildPdfHtml = (titulo: string, extra: string = '', logoSrc?: string) => {
    const logoUrl = logoSrc ?? LOGO_BASE64;
    const isBandara = (import.meta.env.VITE_LOGO_PATH || '/bandara-logo.png').includes('bandara');
    const logoHeight = isBandara ? '120px' : '70px';
    const numeroNota = String(order.numero ?? '').padStart(4, '0');
    const nomeCliente = editClientName || order.client_name || '';
    const dataHoje = new Date().toLocaleDateString('pt-BR');

    const itemsHtml = items.map((i, idx) => `
      <tr style="background:${idx % 2 === 0 ? '#fff' : '#f9f9f9'}">
        <td style="padding:7px 10px;border-bottom:1px solid #e5e5e5;">${i.description}</td>
        <td style="padding:7px 10px;text-align:center;border-bottom:1px solid #e5e5e5;">${i.quantity}</td>
        <td style="padding:7px 10px;text-align:right;border-bottom:1px solid #e5e5e5;">R$ ${i.unit_price.toFixed(2)}</td>
        <td style="padding:7px 10px;text-align:right;border-bottom:1px solid #e5e5e5;font-weight:600;">R$ ${(i.unit_price * i.quantity).toFixed(2)}</td>
      </tr>`).join('');

    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${titulo} #${numeroNota}</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      body{font-family:Arial,sans-serif;font-size:13px;color:#222;background:#fff}
      .page{max-width:780px;margin:0 auto;padding:32px}
      /* Cabeçalho */
      .header{display:flex;align-items:center;justify-content:space-between;background:#1a1a1a;color:#fff;padding:20px 24px;border-radius:4px 4px 0 0}
      .header img{height:${logoHeight};object-fit:contain}
      .header-title{text-align:center;flex:1}
      .header-title h1{font-size:22px;font-weight:800;letter-spacing:2px;color:#fff}
      .header-title p{font-size:11px;color:#aaa;margin-top:2px}
      .header-box{text-align:right;min-width:140px}
      .header-box .num{font-size:24px;font-weight:800;color:#C1272D}
      .header-box .lbl{font-size:10px;color:#aaa;text-transform:uppercase}
      .header-box .date{font-size:11px;color:#ccc;margin-top:4px}
      /* Linha vermelha */
      .redline{height:4px;background:#C1272D;margin-bottom:16px}
      /* Seção */
      .section-title{background:#1a1a1a;color:#fff;padding:6px 12px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:0}
      .section-body{border:1px solid #ddd;border-top:none;padding:12px;margin-bottom:14px}
      .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 24px}
      .info-row{font-size:12px;padding:3px 0;border-bottom:1px solid #f0f0f0}
      .info-row span{color:#888;margin-right:6px}
      /* Tabela */
      table{width:100%;border-collapse:collapse;font-size:12px}
      thead tr{background:#1a1a1a;color:#fff}
      thead th{padding:8px 10px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.5px}
      thead th:nth-child(2){text-align:center}
      thead th:nth-child(3),thead th:nth-child(4){text-align:right}
      /* Totais */
      .totais{display:flex;justify-content:flex-end;margin-top:4px}
      .totais-box{width:280px;border:1px solid #ddd;border-radius:4px;overflow:hidden}
      .totais-row{display:flex;justify-content:space-between;padding:7px 14px;font-size:13px;border-bottom:1px solid #eee}
      .totais-row.total{background:#C1272D;color:#fff;font-size:16px;font-weight:800;border:none}
      .totais-row.desconto span:last-child{color:#2a9d2a;font-weight:600}
      /* Footer */
      .footer{margin-top:24px;border-top:2px solid #C1272D;padding-top:10px;text-align:center;font-size:11px;color:#888}
      @media print{.page{padding:16px}}
    </style></head><body><div class="page">
      <div class="header">
        <img src="${logoUrl}" alt="Logo" onerror="this.style.display='none'">
        <div class="header-title">
          <h1>${titulo}</h1>
          <p style="font-size:13px;font-weight:700;color:#fff;margin-top:4px">${storeSettings?.company_name || 'Minha Oficina'}</p>
          ${storeSettings?.store_owner || storeSettings?.store_cnpj ? `<p style="font-size:10px;color:#aaa;margin-top:2px">${[storeSettings?.store_owner, storeSettings?.store_cnpj ? 'CNPJ: ' + storeSettings.store_cnpj : ''].filter(Boolean).join(' · ')}</p>` : ''}
          ${storeSettings?.store_address ? `<p style="font-size:10px;color:#aaa">${storeSettings.store_address}</p>` : ''}
        </div>
        <div class="header-box">
          <div class="lbl">Nº</div>
          <div class="num">#${numeroNota}</div>
          <div class="date">${dataHoje}</div>
        </div>
      </div>
      <div class="redline"></div>

      ${nomeCliente || editClientCpf || editClientPhone || editClientAddress ? `
      <div class="section-title">Dados do Cliente</div>
      <div class="section-body">
        <div class="info-grid">
          ${nomeCliente ? `<div class="info-row"><span>Nome:</span><strong>${nomeCliente}</strong></div>` : ''}
          ${editClientCpf ? `<div class="info-row"><span>CPF:</span>${editClientCpf}</div>` : ''}
          ${editClientPhone ? `<div class="info-row"><span>Telefone:</span>${editClientPhone}</div>` : ''}
          ${editClientAddress ? `<div class="info-row"><span>Endereço:</span>${editClientAddress}</div>` : ''}
        </div>
      </div>` : ''}

      <div class="section-title">Produtos / Serviços</div>
      <div style="border:1px solid #ddd;border-top:none;margin-bottom:14px">
        <table>
          <thead><tr><th>Descrição</th><th style="text-align:center">Qtd</th><th style="text-align:right">Valor Unit.</th><th style="text-align:right">Total</th></tr></thead>
          <tbody>${itemsHtml}</tbody>
        </table>
      </div>

      <div class="totais">
        <div class="totais-box">
          ${discPct > 0 ? `
          <div class="totais-row"><span>Subtotal:</span><span>R$ ${subtotal.toFixed(2)}</span></div>
          <div class="totais-row desconto"><span>Desconto (${discPct}%):</span><span>- R$ ${discountAmount.toFixed(2)}</span></div>
          ` : ''}
          <div class="totais-row total"><span>TOTAL:</span><span>R$ ${total.toFixed(2)}</span></div>
        </div>
      </div>

      ${extra}

      <div class="footer">
        ${[storeSettings?.company_name, storeSettings?.store_cnpj ? 'CNPJ: ' + storeSettings.store_cnpj : '', storeSettings?.store_phone, storeSettings?.store_instagram].filter(Boolean).join(' · ')}<br>
        ${storeSettings?.store_address || ''}
      </div>
    </div></body></html>`;
  };

  // ── Busca logo em base64 (usa logo local via env var) ─────────
  const fetchLogoBase64 = async (): Promise<string> => {
    const url = `${window.location.origin}${import.meta.env.VITE_LOGO_PATH || '/bandara-logo.png'}`;
    return new Promise<string>((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          canvas.getContext('2d')!.drawImage(img, 0, 0);
          resolve(canvas.toDataURL('image/png'));
        } catch {
          resolve(LOGO_BASE64);
        }
      };
      img.onerror = () => resolve(LOGO_BASE64);
      img.src = url;
    });
  };

  // ── Helper: imprime via iframe com srcdoc (com CSS preservado) ─
  const printViaIframe = (html: string) => {
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;width:800px;height:0;border:none;left:-9999px;top:0;visibility:hidden';
    document.body.appendChild(iframe);
    iframe.onload = () => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => document.body.removeChild(iframe), 2000);
    };
    iframe.srcdoc = html;
  };

  // ── Helper: gera HTML das formas de pagamento ─────────────────
  const buildPaymentHtml = () => {
    const entries = Array.isArray(order.payment_methods) && order.payment_methods.length > 0
      ? order.payment_methods
      : [{ method: order.payment_method ?? 'dinheiro', amount: order.total }];
    if (entries.length === 1) {
      const label = PAYMENT_LABELS[entries[0].method] ?? entries[0].method;
      return `<div style="margin-top:16px;font-size:12px;color:#555;padding:10px 14px;border:1px solid #ddd;border-radius:4px">
        <strong>Forma de Pagamento:</strong> ${label}
      </div>`;
    }
    const rows = entries.map(e =>
      `<tr><td style="padding:4px 8px">${PAYMENT_LABELS[e.method] ?? e.method}</td><td style="padding:4px 8px;text-align:right">R$ ${e.amount.toFixed(2)}</td></tr>`
    ).join('');
    return `<div style="margin-top:16px;font-size:12px;color:#555;padding:10px 14px;border:1px solid #ddd;border-radius:4px">
      <strong>Formas de Pagamento:</strong>
      <table style="width:100%;margin-top:6px;border-collapse:collapse">${rows}</table>
    </div>`;
  };

  // ── Imprimir (Nota de Venda) ───────────────────────────────────
  const handlePrint = async () => {
    const logo = await fetchLogoBase64();
    printViaIframe(buildPdfHtml('NOTA DE VENDA', buildPaymentHtml(), logo));
  };

  // ── Helper: gera PDF base64 a partir do HTML ─────────────────
  const generatePdfBase64 = async (html: string): Promise<string> => {
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    const bodyContent = bodyMatch ? bodyMatch[1] : html;
    const styleMatch = html.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
    const cssText = styleMatch ? styleMatch[1] : '';

    // Injeta CSS temporariamente no documento
    const tmpStyle = document.createElement('style');
    tmpStyle.textContent = cssText;
    document.head.appendChild(tmpStyle);

    const container = document.createElement('div');
    container.style.cssText = 'position:fixed;left:-9999px;top:0;width:800px;background:#fff;z-index:-1';
    container.innerHTML = bodyContent;
    document.body.appendChild(container);

    try {
      const canvas = await html2canvas(container, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
      const imgData = canvas.toDataURL('image/jpeg', 0.85);
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pdfW = pdf.internal.pageSize.getWidth();
      const pdfH = (canvas.height * pdfW) / canvas.width;
      pdf.addImage(imgData, 'JPEG', 0, 0, pdfW, pdfH);
      return pdf.output('datauristring');
    } finally {
      document.body.removeChild(container);
      document.head.removeChild(tmpStyle);
    }
  };

  // ── Enviar WhatsApp (Nota de Venda como PDF) ─────────────────
  const handleSendWhatsApp = async () => {
    const phone = editClientPhone || order.client_phone;
    if (!phone) { toast.error('Informe o telefone do cliente para enviar'); return; }

    try {
      setIsSendingWpp(true);
      toast.info('Gerando PDF...');
      const logo = await fetchLogoBase64();
      const base64 = await generatePdfBase64(buildPdfHtml('NOTA DE VENDA', buildPaymentHtml(), logo));
      const numeroNota = String(order.numero ?? '').padStart(4, '0');
      const nomeCliente = editClientName || order.client_name;
      const caption = nomeCliente
        ? `Olá, *${nomeCliente}*! Segue sua Nota de Venda #${numeroNota} 🏍️`
        : `Nota de Venda #${numeroNota} — ${storeSettings?.company_name || 'Minha Oficina'} 🏍️`;
      await sendWhatsAppDocument({ phone, base64, fileName: `nota-balcao-${numeroNota}.pdf`, caption });
      toast.success('Nota enviada no WhatsApp!');
    } catch (e: unknown) {
      toast.error(`Erro ao enviar: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setIsSendingWpp(false);
    }
  };

  // ── Orçamento PDF ─────────────────────────────────────────────
  const handleOrcamentoPdf = async () => {
    const logo = await fetchLogoBase64();
    const extra = `<div style="margin-top:16px;padding:10px 14px;border:1px solid #ddd;border-radius:4px;font-size:11px;color:#888">
      ⏳ Este orçamento tem validade de <strong>7 dias</strong> a partir da data de emissão.
    </div>`;
    printViaIframe(buildPdfHtml('ORÇAMENTO', extra, logo));
  };

  // ── Orçamento WhatsApp (PDF) ──────────────────────────────────
  const handleOrcamentoWhatsApp = async () => {
    const phone = editClientPhone || order.client_phone;
    if (!phone) { toast.error('Informe o telefone do cliente para enviar'); return; }

    try {
      setIsSendingOrc(true);
      toast.info('Gerando PDF do orçamento...');
      const logo = await fetchLogoBase64();
      const extra = `<div style="margin-top:16px;padding:10px 14px;border:1px solid #ddd;border-radius:4px;font-size:11px;color:#888">
        ⏳ Este orçamento tem validade de <strong>7 dias</strong> a partir da data de emissão.
      </div>`;
      const base64 = await generatePdfBase64(buildPdfHtml('ORÇAMENTO', extra, logo));
      const numeroNota = String(order.numero ?? '').padStart(4, '0');
      const nomeCliente = editClientName || order.client_name;
      const caption = nomeCliente
        ? `Olá, *${nomeCliente}*! Segue seu Orçamento #${numeroNota} — válido por 7 dias 🏍️`
        : `Orçamento #${numeroNota} — ${storeSettings?.company_name || 'Minha Oficina'} 🏍️`;
      await sendWhatsAppDocument({ phone, base64, fileName: `orcamento-${numeroNota}.pdf`, caption });
      toast.success('Orçamento enviado no WhatsApp!');
    } catch (e: unknown) {
      toast.error(`Erro ao enviar: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setIsSendingOrc(false);
    }
  };

  return (
    <div className="animate-fade-in max-w-2xl mx-auto">
      {/* ── Header ── */}
      <div className="flex items-center gap-3 mb-4">
        <button type="button" title="Voltar" onClick={onBack} className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold">Nota #{String(order.numero ?? '').padStart(4, '0')}</h2>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[order.status]}`}>
              {STATUS_LABELS[order.status] ?? order.status}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            {new Date(order.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(editClientPhone || order.client_phone) && (
            <button
              type="button"
              onClick={handleSendWhatsApp}
              disabled={isSendingWpp}
              className="flex items-center gap-1.5 text-sm text-green-600 hover:text-green-700 dark:text-green-500 dark:hover:text-green-400 transition-colors px-2 py-1 rounded border border-green-300 dark:border-green-700 disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              {isSendingWpp ? 'Enviando...' : 'WhatsApp'}
            </button>
          )}
          <button type="button" onClick={handlePrint} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded border">
            <Printer className="h-4 w-4" />
            Imprimir
          </button>
        </div>
      </div>

      <div className="border-2 border-border rounded-xl overflow-hidden shadow-sm bg-card">

        {/* ── Cabeçalho da nota ── */}
        <div className="bg-muted/50 border-b-2 border-border px-5 py-3 space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs text-muted-foreground uppercase font-semibold tracking-wide">Nota de Balcão</p>
              <p className="text-lg font-bold">#{String(order.numero ?? '').padStart(4, '0')}</p>
              <p className="text-xs text-muted-foreground">{new Date(order.created_at).toLocaleDateString('pt-BR')}</p>
            </div>
            <div className="flex-1 max-w-xs">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Cliente</label>
              <Input
                placeholder="Nome do cliente (opcional)"
                value={editClientName}
                onChange={e => setEditClientName(e.target.value)}
                onBlur={handleBlurClient}
                disabled={!isEditable}
                className="mt-1 h-8 text-sm bg-background"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Atendente</label>
              <Select
                value={order.atendente_id ?? 'none'}
                onValueChange={v => updateOrder({ id: order.id, atendente_id: v === 'none' ? null : v })}
                disabled={!isEditable}
              >
                <SelectTrigger className="mt-1 h-8 text-sm bg-background">
                  <SelectValue placeholder="Quem atendeu?" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Não definido</SelectItem>
                  {teamMembers.filter(m => m.active).map(m => (
                    <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">CPF</label>
              <Input
                placeholder="000.000.000-00 (opcional)"
                value={editClientCpf}
                onChange={e => setEditClientCpf(e.target.value)}
                onBlur={handleBlurClient}
                disabled={!isEditable}
                className="mt-1 h-8 text-sm bg-background"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Telefone</label>
              <Input
                placeholder="(00) 00000-0000 (opcional)"
                value={editClientPhone}
                onChange={e => setEditClientPhone(e.target.value)}
                onBlur={handleBlurClient}
                disabled={!isEditable}
                className="mt-1 h-8 text-sm bg-background"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Endereço</label>
              <Input
                placeholder="Endereço (opcional)"
                value={editClientAddress}
                onChange={e => setEditClientAddress(e.target.value)}
                onBlur={handleBlurClient}
                disabled={!isEditable}
                className="mt-1 h-8 text-sm bg-background"
              />
            </div>
          </div>
        </div>

        {/* ── Cabeçalho tabela ── */}
        <div className="grid grid-cols-[1fr_72px_108px_96px_32px] border-b border-border bg-muted/30">
          <div className="px-4 py-2 text-xs font-bold uppercase text-muted-foreground">Produto / Descrição</div>
          <div className="px-2 py-2 text-xs font-bold uppercase text-muted-foreground text-center">Qtd</div>
          <div className="px-2 py-2 text-xs font-bold uppercase text-muted-foreground text-right">Preço Unit.</div>
          <div className="px-2 py-2 text-xs font-bold uppercase text-muted-foreground text-right">Total</div>
          <div />
        </div>

        {/* ── Linhas ── */}
        <div className="divide-y divide-border">
          {items.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              {isEditable ? 'Use o campo abaixo para adicionar itens' : 'Nenhum item'}
            </div>
          )}

          {items.map(item => (
            <div key={item.id} className="grid grid-cols-[1fr_72px_108px_96px_32px] items-center hover:bg-muted/20">
              <div className="px-4 py-2">
                {item.type === 'avulso' && isEditable ? (
                  <Textarea
                    value={item.description}
                    onChange={e => handleUpdateItem(item.id, 'description', e.target.value)}
                    spellCheck
                    lang="pt-BR"
                    rows={1}
                    className="h-7 min-h-0 py-1 text-sm border-dashed resize-none"
                  />
                ) : (
                  <div>
                    <p className="text-sm font-medium leading-tight">{item.description}</p>
                    {item.type === 'estoque' && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-blue-500">
                        <Package className="h-2.5 w-2.5" /> estoque
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className="px-2 py-2">
                {isEditable ? (
                  <Input
                    type="number"
                    value={item.quantity}
                    onChange={e => handleUpdateItem(item.id, 'quantity', e.target.value)}
                    className="h-7 text-center text-sm px-1"
                    min={0.01}
                    step={0.01}
                  />
                ) : (
                  <span className="text-sm text-center block">{item.quantity}</span>
                )}
              </div>

              <div className="px-2 py-2">
                {isEditable ? (
                  <div className="relative">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">R$</span>
                    <Input
                      type="number"
                      value={item.unit_price}
                      onChange={e => handleUpdateItem(item.id, 'unit_price', e.target.value)}
                      className="h-7 pl-7 text-right text-sm"
                      min={0}
                      step={0.01}
                    />
                  </div>
                ) : (
                  <span className="text-sm text-right block">R$ {item.unit_price.toFixed(2)}</span>
                )}
              </div>

              <div className="px-2 py-2 text-right">
                <span className="text-sm font-semibold">R$ {(item.unit_price * item.quantity).toFixed(2)}</span>
              </div>

              <div className="flex items-center justify-center py-2">
                {canAct && (
                  <button type="button" title="Remover" onClick={() => handleRemoveItem(item.id)}
                    className="text-muted-foreground hover:text-destructive transition-colors">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          ))}

          {/* ── Adicionar item (só quando aberta) ── */}
          {isEditable && (
            <div className="px-4 py-3 bg-muted/10">
              <div className="grid grid-cols-[1fr_72px_108px_auto] gap-2 items-end" ref={suggestionsRef}>
                <div className="relative">
                  <label className="text-xs text-muted-foreground mb-1 block">Produto ou descrição</label>
                  <Textarea
                    placeholder="Buscar no estoque ou texto livre..."
                    value={newDesc}
                    onChange={e => handleDescChange(e.target.value)}
                    onFocus={handleDescFocus}
                    onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleAddItem()}
                    autoComplete="off"
                    spellCheck
                    lang="pt-BR"
                    rows={1}
                    className={`min-h-0 py-1.5 resize-none ${selectedProduct ? 'border-blue-400 bg-blue-50/30 dark:bg-blue-950/20' : ''}`}
                  />
                  {selectedProduct && (
                    <span className="absolute right-2 top-8 text-[10px] text-blue-500 font-medium">✓ estoque</span>
                  )}
                  {showSuggestions && (
                    <div className="absolute left-0 right-0 top-full mt-1 z-50 border rounded-lg shadow-lg bg-popover divide-y max-h-48 overflow-y-auto">
                      {suggestions.length === 0 ? (
                        <p className="px-3 py-2 text-xs text-muted-foreground">Nenhum produto — será adicionado como avulso</p>
                      ) : suggestions.map(p => (
                        <button type="button" key={p.id}
                          onMouseDown={e => { e.preventDefault(); handleSelectProduct(p); }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs hover:bg-muted transition-colors">
                          <Package className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <span className="font-medium block truncate">{p.name}</span>
                            <span className="text-muted-foreground">
                              {p.code && `${p.code} · `}Estoque: {p.stock_current} {p.unit} · R$ {(p.sale_price ?? 0).toFixed(2)}
                            </span>
                          </div>
                          {p.stock_current <= 0 && <span className="text-red-500 text-[10px]">Zerado</span>}
                          {p.stock_current > 0 && p.stock_current <= p.stock_minimum && <span className="text-orange-500 text-[10px]">Baixo</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Qtd</label>
                  <Input type="number" value={newQty} onChange={e => setNewQty(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAddItem()}
                    className="h-9 text-center text-sm px-1" min={0.01} step={0.01} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Preço unit.</label>
                  <div className="relative">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">R$</span>
                    <Input type="number" placeholder="0,00" value={newPrice} onChange={e => setNewPrice(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleAddItem()}
                      className="h-9 pl-7 text-right text-sm" min={0} step={0.01} />
                  </div>
                </div>
                <div className="pt-5">
                  <Button type="button" variant="outline" onClick={handleAddItem} disabled={!canAct} className="h-9 px-4 gap-1.5">
                    <Plus className="h-4 w-4" /> Add
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Totais ── */}
        <div className="border-t-2 border-border bg-muted/20">
          <div className="flex items-center justify-between px-5 py-2 border-b border-border/50">
            <span className="text-sm text-muted-foreground">Subtotal</span>
            <span className="text-sm font-medium">R$ {subtotal.toFixed(2)}</span>
          </div>

          <div className="flex items-center justify-between px-5 py-2 border-b border-border/50 gap-4">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-muted-foreground">Desconto</span>
              {isEditable ? (
                <>
                  <div className="relative w-20">
                    <Input type="number" placeholder="0" value={discountPct}
                      onChange={e => handleChangePct(e.target.value)}
                      onBlur={handleBlurDiscount}
                      className="h-7 pr-5 text-sm text-right" min={0} max={100} />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">%</span>
                  </div>
                  <div className="relative w-24">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">R$</span>
                    <Input type="number" placeholder="0,00" value={discountVal}
                      onChange={e => handleChangeVal(e.target.value)}
                      onBlur={handleBlurDiscountVal}
                      className="h-7 pl-7 text-sm text-right" min={0} />
                  </div>
                </>
              ) : (
                <span className="text-sm">{order.discount_pct}%</span>
              )}
            </div>
            <span className="text-sm font-medium text-green-600">
              {discPct > 0 ? `- R$ ${discountAmount.toFixed(2)}` : '—'}
            </span>
          </div>

          <div className="flex items-center justify-between px-5 py-3">
            <span className="text-base font-bold uppercase tracking-wide">Total</span>
            <span className="text-xl font-bold text-primary">R$ {total.toFixed(2)}</span>
          </div>
        </div>

        {/* ── Pagamento e ações ── */}
        <div className="border-t-2 border-border px-5 py-4 space-y-3">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Formas de Pagamento
              </label>
              {canAct && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddPayment}
                  className="h-7 px-2 text-xs gap-1"
                >
                  <Plus className="h-3 w-3" /> Adicionar forma
                </Button>
              )}
            </div>
            <div className="space-y-2">
              {paymentEntries.map((entry, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <Select
                    value={entry.method}
                    onValueChange={v => handlePaymentMethodChange(idx, v)}
                    disabled={!canAct}
                  >
                    <SelectTrigger className="h-9 flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="dinheiro">Dinheiro</SelectItem>
                      <SelectItem value="pix">PIX</SelectItem>
                      <SelectItem value="cartao_credito">Cartão Crédito</SelectItem>
                      <SelectItem value="cartao_debito">Cartão Débito</SelectItem>
                      <SelectItem value="transferencia">Transferência</SelectItem>
                    </SelectContent>
                  </Select>
                  {paymentEntries.length > 1 && (
                    <Input
                      type="text"
                      inputMode="decimal"
                      placeholder="R$ 0,00"
                      value={entry.amount > 0 ? String(entry.amount) : ''}
                      onChange={e => handlePaymentAmountChange(idx, e.target.value)}
                      disabled={!canAct}
                      className="h-9 w-28 text-right"
                    />
                  )}
                  {canAct && paymentEntries.length > 1 && (
                    <button
                      type="button"
                      title="Remover forma de pagamento"
                      onClick={() => handleRemovePayment(idx)}
                      className="text-destructive hover:text-destructive/80"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {paymentEntries.length > 1 && (() => {
              const pago = paymentEntries.reduce((s, e) => s + e.amount, 0);
              const restante = total - pago;
              return (
                <p className={`text-xs mt-1 ${Math.abs(restante) < 0.01 ? 'text-green-600' : 'text-orange-500'}`}>
                  {Math.abs(restante) < 0.01
                    ? '✓ Valor conferido'
                    : restante > 0
                      ? `Faltam R$ ${restante.toFixed(2)}`
                      : `Excede R$ ${Math.abs(restante).toFixed(2)}`}
                </p>
              );
            })()}
          </div>

          {/* ── Asaas ── */}
          {order.status !== 'cancelada' && total > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setAsaasOpen(o => !o)}
                className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 w-full text-left"
              >
                <span>Cobrar via Asaas</span>
                <span className="ml-1 text-xs">{asaasOpen ? '▲' : '▼'}</span>
              </button>
              {asaasOpen && (
              <div>
              {!editClientCpf && (
                <p className="text-xs text-amber-600 mb-2">⚠ CPF do cliente necessário para PIX/Boleto. Preencha o campo CPF acima.</p>
              )}
              {!asaasResult ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-muted-foreground whitespace-nowrap">Valor (R$)</label>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      placeholder={total.toFixed(2)}
                      value={asaasAmount}
                      onChange={e => setAsaasAmount(e.target.value)}
                      className="flex-1 h-9 rounded-md border border-input bg-background px-3 text-sm"
                    />
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={asaasLoading || !canAct}
                      onClick={() => handleCobrarAsaas('PIX')}
                      className="flex-1 h-9 text-sm gap-1.5"
                    >
                      {asaasLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link className="h-4 w-4" />}
                      PIX
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={asaasLoading || !canAct}
                      onClick={() => handleCobrarAsaas('BOLETO')}
                      className="flex-1 h-9 text-sm gap-1.5"
                    >
                      {asaasLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link className="h-4 w-4" />}
                      Boleto
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={asaasLoading || !canAct}
                      onClick={() => handleCobrarAsaas('UNDEFINED')}
                      className="flex-1 h-9 text-sm gap-1.5"
                    >
                      {asaasLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link className="h-4 w-4" />}
                      PIX+Boleto
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      title="Parcelas do cartão de crédito"
                      value={asaasInstallments}
                      onChange={e => setAsaasInstallments(Number(e.target.value))}
                      className="flex-1 h-9 rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value={1}>Crédito à vista</option>
                      {[2,3,4,5,6,7,8,9,10,11,12].filter(n => (total / n) >= 5).map(n => (
                        <option key={n} value={n}>{n}x de R$ {(total / n).toFixed(2)}</option>
                      ))}
                    </select>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={asaasLoading || !canAct}
                      onClick={() => handleCobrarAsaas('CREDIT_CARD')}
                      className="h-9 text-sm gap-1.5"
                    >
                      {asaasLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link className="h-4 w-4" />}
                      Cartão
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-green-600 font-medium">
                    ✓ Cobrança gerada — R$ {asaasResult.value?.toFixed(2)}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleCobrarAsaasCopy}
                      className="flex-1 h-9 text-sm gap-1.5"
                    >
                      {asaasCopied ? <CheckCheck className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                      {asaasCopied ? 'Copiado!' : 'Copiar link'}
                    </Button>
                    {editClientPhone && (
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleCobrarAsaasWhatsApp}
                        className="flex-1 h-9 text-sm gap-1.5 bg-green-600 hover:bg-green-700 text-white"
                      >
                        <Send className="h-4 w-4" />
                        WhatsApp
                      </Button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setAsaasResult(null)}
                    className="text-xs text-muted-foreground hover:underline"
                  >
                    Nova cobrança
                  </button>
                </div>
              )}
              </div>
              )}
            </div>
          )}

          {/* ── Registrar como Fiado ── */}
          {order.status !== 'cancelada' && total > 0 && (
            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full h-9 gap-1.5 text-sm border-amber-400 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-950/30"
                disabled={!canAct}
                onClick={() => setShowFiadoDialog(true)}
              >
                <HandCoins className="h-4 w-4" />
                Registrar como Fiado
              </Button>
            </div>
          )}

          {/* ── Orçamento ── */}
          {items.length > 0 && order.status !== 'cancelada' && (
            <div>
              <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Orçamento</p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleOrcamentoPdf}
                  className="flex-1 h-9 gap-1.5 text-sm"
                >
                  <FileText className="h-4 w-4" />
                  Baixar PDF
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleOrcamentoWhatsApp}
                  disabled={isSendingOrc}
                  className="flex-1 h-9 gap-1.5 text-sm text-green-600 border-green-300 hover:bg-green-50 dark:text-green-400 dark:border-green-700 dark:hover:bg-green-950/30"
                >
                  <Send className="h-4 w-4" />
                  {isSendingOrc ? 'Enviando...' : 'WhatsApp'}
                </Button>
              </div>
            </div>
          )}

          {isAdmin && order.status !== 'cancelada' && (
            <div className="flex gap-2">
              {order.status === 'aberta' && (
                <Button type="button" onClick={handleFinalizar}
                  disabled={isFinalizing || items.length === 0 || !canAct}
                  title={!order.atendente_id ? 'Selecione o atendente antes de finalizar' : undefined}
                  className="flex-1 h-10 font-semibold gap-2">
                  <CheckCircle className="h-4 w-4" />
                  {isFinalizing ? 'Finalizando...' : `Finalizar · R$ ${total.toFixed(2)}`}
                </Button>
              )}
              <Button type="button" variant="destructive" onClick={handleCancelar}
                disabled={isCancelling}
                className={order.status === 'aberta' ? 'h-10 px-4' : 'flex-1 h-10'}>
                <XCircle className="h-4 w-4 mr-1.5" />
                {isCancelling ? 'Cancelando...' : 'Cancelar Nota'}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Dialog de motivo de cancelamento */}
      <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base text-destructive">
              <XCircle className="h-5 w-5" />
              Cancelar Nota #{order.numero}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-1">
            <p className="text-sm text-muted-foreground">
              {order.status === 'finalizada'
                ? 'O estoque será revertido e o lançamento no caixa removido.'
                : 'Esta ação não pode ser desfeita.'}
            </p>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Motivo do cancelamento *</p>
              {[
                { value: 'erro_lancamento', label: 'Erro de lançamento', desc: 'Nota aberta por engano' },
                { value: 'preco',           label: 'Preço',              desc: 'Cliente não aprovou o valor' },
                { value: 'insatisfacao',    label: 'Insatisfação',       desc: 'Cliente não ficou satisfeito' },
                { value: 'produto_indisponivel', label: 'Produto indisponível', desc: 'Item fora de estoque' },
                { value: 'outro',           label: 'Outro motivo',       desc: '' },
              ].map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setCancelReason(opt.value)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg border text-sm transition-colors ${
                    cancelReason === opt.value
                      ? 'border-destructive bg-destructive/10 text-destructive'
                      : 'border-border bg-muted/20 hover:border-destructive/50'
                  }`}
                >
                  <span className="font-semibold">{opt.label}</span>
                  {opt.desc && <span className="text-muted-foreground ml-2 text-xs">— {opt.desc}</span>}
                </button>
              ))}
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Observação (opcional)</p>
              <Textarea
                placeholder="Detalhe o motivo se necessário..."
                value={cancelNotes}
                onChange={e => setCancelNotes(e.target.value)}
                rows={2}
                className="text-sm resize-none"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowCancelDialog(false)} className="flex-1">
              Voltar
            </Button>
            <Button variant="destructive" onClick={handleConfirmCancel} disabled={!cancelReason || isCancelling} className="flex-1">
              {isCancelling ? 'Cancelando...' : 'Confirmar Cancelamento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Fiado Dialog ── */}
      <Dialog open={showFiadoDialog} onOpenChange={open => !open && setShowFiadoDialog(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Registrar como Fiado</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Cliente: <strong>{editClientName || order.client_name || 'Cliente'}</strong>
              {' · '}Total: <strong>R$ {total.toFixed(2)}</strong>
            </p>
            <div>
              <label className="text-sm font-medium">Data de Vencimento *</label>
              <input
                type="date"
                title="Data de vencimento do fiado"
                placeholder="dd/mm/aaaa"
                value={fiadoDueDate}
                onChange={e => setFiadoDueDate(e.target.value)}
                className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Juros/mês (%)</label>
              <input
                type="number"
                title="Taxa de juros mensal"
                placeholder="2"
                step="0.1"
                min="0"
                value={fiadoInterestRate}
                onChange={e => setFiadoInterestRate(e.target.value)}
                className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Observações</label>
              <Textarea
                placeholder="Opcional"
                value={fiadoNotes}
                onChange={e => setFiadoNotes(e.target.value)}
                className="mt-1 resize-none"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowFiadoDialog(false)}>Cancelar</Button>
            <Button onClick={handleRegistrarFiado} disabled={fiadoLoading}>
              {fiadoLoading ? 'Salvando...' : 'Registrar Fiado'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
