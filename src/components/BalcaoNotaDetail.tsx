import { useState, useRef, useEffect } from 'react';
import { useBalcao, type BalcaoOrder, type BalcaoItem } from '@/hooks/useBalcao';
import { useInventory, type InventoryProduct } from '@/hooks/useInventory';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Plus, Trash2, CheckCircle, XCircle, Package, Printer, Send, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { sendWhatsAppText } from '@/lib/whatsappService';

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
};

export function BalcaoNotaDetail({ order, isAdmin, onBack }: Props) {
  const { updateOrder, addItem, updateItem, removeItem, finalizeOrder, cancelOrder, isFinalizing, isCancelling } = useBalcao();
  const { products } = useInventory();

  const items: BalcaoItem[] = order.balcao_items ?? [];
  const isEditable = order.status === 'aberta';

  // ── campos do novo item ──────────────────────────────────────
  const [newDesc, setNewDesc] = useState('');
  const [newQty, setNewQty] = useState('1');
  const [newPrice, setNewPrice] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<InventoryProduct | null>(null);
  const [suggestions, setSuggestions] = useState<InventoryProduct[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestionsRef = useRef<HTMLDivElement>(null);

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
  const [paymentMethod, setPaymentMethod] = useState(order.payment_method ?? 'dinheiro');
  const [isSendingWpp, setIsSendingWpp] = useState(false);
  const [isSendingOrc, setIsSendingOrc] = useState(false);

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
  const saveTotals = async (pct: number) => {
    const sub = items.reduce((s, i) => s + i.unit_price * i.quantity, 0);
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

  const handlePaymentChange = async (val: string) => {
    setPaymentMethod(val);
    await updateOrder({ id: order.id, payment_method: val });
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
    setNewDesc(p.name);
    if (p.sale_price > 0) setNewPrice(String(p.sale_price));
    setShowSuggestions(false);
  };

  // ── Adicionar item ────────────────────────────────────────────
  const handleAddItem = async () => {
    if (!newDesc.trim()) { toast.error('Informe a descrição'); return; }
    const qty = parseFloat(newQty) || 1;
    const price = parseFloat(newPrice) || 0;

    if (selectedProduct) {
      const alreadyInCart = items.find(i => i.product_id === selectedProduct.id);
      const qtdNoCarrinho = alreadyInCart ? alreadyInCart.quantity : 0;
      if (qty + qtdNoCarrinho > selectedProduct.stock_current) {
        toast.error(`Estoque insuficiente (disponível: ${selectedProduct.stock_current - qtdNoCarrinho} ${selectedProduct.unit})`);
        return;
      }
      await addItem({
        order_id: order.id,
        type: 'estoque',
        product_id: selectedProduct.id,
        description: selectedProduct.name,
        quantity: qty,
        unit_price: price || (selectedProduct.sale_price ?? selectedProduct.cost_price ?? 0),
        total_price: (price || (selectedProduct.sale_price ?? 0)) * qty,
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
    await saveTotals(discPct);
  };

  const handleUpdateItem = async (itemId: string, field: 'quantity' | 'unit_price' | 'description', val: string) => {
    const item = items.find(i => i.id === itemId);
    if (!item) return;
    if (field === 'quantity') {
      const qty = parseFloat(val) || 0;
      if (qty <= 0) { await removeItem(itemId); await saveTotals(discPct); return; }
      if (item.type === 'estoque' && item.product_id) {
        const prod = products.find(p => p.id === item.product_id);
        if (prod && qty > prod.stock_current) { toast.error(`Estoque máximo: ${prod.stock_current} ${prod.unit}`); return; }
      }
      await updateItem({ id: itemId, quantity: qty });
    } else if (field === 'unit_price') {
      await updateItem({ id: itemId, unit_price: parseFloat(val) || 0 });
    } else {
      await updateItem({ id: itemId, description: val });
    }
    await saveTotals(discPct);
  };

  const handleRemoveItem = async (itemId: string) => {
    await removeItem(itemId);
    await saveTotals(discPct);
  };

  // ── Finalizar ─────────────────────────────────────────────────
  const handleFinalizar = async () => {
    if (items.length === 0) { toast.error('Adicione ao menos um item'); return; }
    if (!window.confirm(`Finalizar nota de R$ ${total.toFixed(2)}? Esta ação lançará no caixa e dará baixa no estoque.`)) return;
    await saveTotals(discPct);
    await finalizeOrder(order.id);
  };

  // ── Cancelar ──────────────────────────────────────────────────
  const handleCancelar = async () => {
    const msg = order.status === 'finalizada'
      ? 'Cancelar nota? O estoque será revertido e o lançamento no caixa removido.'
      : 'Cancelar nota? Esta ação não pode ser desfeita.';
    if (!window.confirm(msg)) return;
    await cancelOrder(order.id);
    onBack();
  };

  // ── Imprimir ──────────────────────────────────────────────────
  const handlePrint = () => {
    const win = window.open('', '_blank', 'width=400,height=600');
    if (!win) return;
    const itemsHtml = items.map(i => `
      <tr>
        <td style="padding:4px 8px;border-bottom:1px solid #eee;">${i.description}${i.type === 'estoque' ? ' <small style="color:#666">(est.)</small>' : ''}</td>
        <td style="padding:4px 8px;text-align:center;border-bottom:1px solid #eee;">${i.quantity}</td>
        <td style="padding:4px 8px;text-align:right;border-bottom:1px solid #eee;">R$ ${i.unit_price.toFixed(2)}</td>
        <td style="padding:4px 8px;text-align:right;border-bottom:1px solid #eee;">R$ ${(i.unit_price * i.quantity).toFixed(2)}</td>
      </tr>`).join('');
    win.document.write(`<!DOCTYPE html><html><head><title>Nota de Balcão</title>
      <style>body{font-family:monospace;font-size:13px;margin:20px}h2{margin:0;font-size:16px}table{width:100%;border-collapse:collapse}th{text-align:left;padding:4px 8px;border-bottom:2px solid #000}td{vertical-align:top}.total{font-size:16px;font-weight:bold}</style>
      </head><body>
      <h2>NOTA DE BALCÃO #${String(order.numero ?? '').padStart(4, '0')}</h2>
      <p style="margin:4px 0">Data: ${new Date().toLocaleDateString('pt-BR')}</p>
      ${order.client_name ? `<p style="margin:4px 0">Cliente: ${order.client_name}</p>` : ''}
      ${editClientCpf ? `<p style="margin:4px 0">CPF: ${editClientCpf}</p>` : ''}
      ${editClientPhone ? `<p style="margin:4px 0">Telefone: ${editClientPhone}</p>` : ''}
      ${editClientAddress ? `<p style="margin:4px 0">Endereço: ${editClientAddress}</p>` : ''}
      <hr/>
      <table><thead><tr><th>Produto</th><th>Qtd</th><th>Unit.</th><th>Total</th></tr></thead>
      <tbody>${itemsHtml}</tbody></table>
      <hr/>
      ${discPct > 0 ? `<p>Subtotal: R$ ${subtotal.toFixed(2)}</p><p>Desconto (${discPct}%): - R$ ${discountAmount.toFixed(2)}</p>` : ''}
      <p class="total">TOTAL: R$ ${total.toFixed(2)}</p>
      <p>Pagamento: ${PAYMENT_LABELS[order.payment_method ?? 'dinheiro'] ?? order.payment_method}</p>
      </body></html>`);
    win.document.close();
    win.focus();
    win.print();
  };

  // ── Enviar WhatsApp ───────────────────────────────────────────
  const handleSendWhatsApp = async () => {
    const phone = editClientPhone || order.client_phone;
    if (!phone) { toast.error('Informe o telefone do cliente para enviar'); return; }

    const numeroNota = String(order.numero ?? '').padStart(4, '0');
    const linhasItens = items
      .map(i => `  • ${i.description}: ${i.quantity} x R$ ${i.unit_price.toFixed(2)} = R$ ${(i.unit_price * i.quantity).toFixed(2)}`)
      .join('\n');

    const nomeCliente = editClientName || order.client_name;
    const saudacao = nomeCliente ? `Olá, *${nomeCliente}*! 👋\n\n` : '';

    const descontoLinha = discPct > 0
      ? `\n💸 Desconto (${discPct}%): -R$ ${discountAmount.toFixed(2)}`
      : '';

    const text =
      `${saudacao}Segue o resumo da sua *Nota de Balcão #${numeroNota}*:\n\n` +
      `📋 *Itens:*\n${linhasItens}\n` +
      `\n🧾 Subtotal: R$ ${subtotal.toFixed(2)}${descontoLinha}` +
      `\n✅ *TOTAL: R$ ${total.toFixed(2)}*` +
      `\n💳 Pagamento: ${PAYMENT_LABELS[paymentMethod] ?? paymentMethod}` +
      `\n\nObrigado pela preferência! 🏍️`;

    try {
      setIsSendingWpp(true);
      await sendWhatsAppText({ phone, text });
      toast.success('Nota enviada no WhatsApp!');
    } catch (e: unknown) {
      toast.error(`Erro ao enviar: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setIsSendingWpp(false);
    }
  };

  // ── Orçamento PDF ─────────────────────────────────────────────
  const handleOrcamentoPdf = () => {
    const win = window.open('', '_blank', 'width=500,height=700');
    if (!win) return;
    const numeroNota = String(order.numero ?? '').padStart(4, '0');
    const nomeCliente = editClientName || order.client_name;
    const itemsHtml = items.map(i => `
      <tr>
        <td style="padding:5px 8px;border-bottom:1px solid #eee;">${i.description}</td>
        <td style="padding:5px 8px;text-align:center;border-bottom:1px solid #eee;">${i.quantity}</td>
        <td style="padding:5px 8px;text-align:right;border-bottom:1px solid #eee;">R$ ${i.unit_price.toFixed(2)}</td>
        <td style="padding:5px 8px;text-align:right;border-bottom:1px solid #eee;">R$ ${(i.unit_price * i.quantity).toFixed(2)}</td>
      </tr>`).join('');
    win.document.write(`<!DOCTYPE html><html><head><title>Orçamento #${numeroNota}</title>
      <style>
        body{font-family:Arial,sans-serif;font-size:13px;margin:30px;color:#222}
        h1{margin:0 0 4px;font-size:22px;letter-spacing:1px;color:#1a1a1a}
        .sub{color:#666;font-size:12px;margin:2px 0}
        table{width:100%;border-collapse:collapse;margin-top:12px}
        th{text-align:left;padding:6px 8px;border-bottom:2px solid #333;font-size:11px;text-transform:uppercase}
        td{vertical-align:top}
        .totais{margin-top:12px;text-align:right}
        .totais p{margin:4px 0;font-size:13px}
        .total-final{font-size:17px;font-weight:bold;margin-top:8px}
        .validity{margin-top:20px;font-size:11px;color:#888;border-top:1px solid #ddd;padding-top:8px}
      </style>
      </head><body>
      <h1>ORÇAMENTO</h1>
      <p class="sub">#${numeroNota} · ${new Date().toLocaleDateString('pt-BR')}</p>
      ${nomeCliente ? `<p class="sub">Cliente: <strong>${nomeCliente}</strong></p>` : ''}
      ${editClientCpf ? `<p class="sub">CPF: ${editClientCpf}</p>` : ''}
      ${editClientPhone ? `<p class="sub">Telefone: ${editClientPhone}</p>` : ''}
      ${editClientAddress ? `<p class="sub">Endereço: ${editClientAddress}</p>` : ''}
      <table>
        <thead><tr><th>Produto / Serviço</th><th>Qtd</th><th>Unit.</th><th>Total</th></tr></thead>
        <tbody>${itemsHtml}</tbody>
      </table>
      <div class="totais">
        ${discPct > 0
          ? `<p>Subtotal: R$ ${subtotal.toFixed(2)}</p><p>Desconto (${discPct}%): <span style="color:green">- R$ ${discountAmount.toFixed(2)}</span></p>`
          : ''}
        <p class="total-final">TOTAL: R$ ${total.toFixed(2)}</p>
      </div>
      <p class="validity">Este orçamento tem validade de 7 dias a partir da data de emissão.</p>
      </body></html>`);
    win.document.close();
    win.focus();
    win.print();
  };

  // ── Orçamento WhatsApp ────────────────────────────────────────
  const handleOrcamentoWhatsApp = async () => {
    const phone = editClientPhone || order.client_phone;
    if (!phone) { toast.error('Informe o telefone do cliente para enviar'); return; }

    const numeroNota = String(order.numero ?? '').padStart(4, '0');
    const nomeCliente = editClientName || order.client_name;
    const saudacao = nomeCliente ? `Olá, *${nomeCliente}*! 👋\n\n` : '';

    const linhasItens = items
      .map(i => `  • ${i.description}: ${i.quantity} x R$ ${i.unit_price.toFixed(2)} = R$ ${(i.unit_price * i.quantity).toFixed(2)}`)
      .join('\n');

    const descontoLinha = discPct > 0
      ? `\n💸 Desconto (${discPct}%): -R$ ${discountAmount.toFixed(2)}`
      : '';

    const text =
      `${saudacao}Segue o seu *Orçamento #${numeroNota}*:\n\n` +
      `📋 *Itens:*\n${linhasItens}\n` +
      `\n🧾 Subtotal: R$ ${subtotal.toFixed(2)}${descontoLinha}` +
      `\n✅ *TOTAL: R$ ${total.toFixed(2)}*\n` +
      `\n⏳ Validade: 7 dias\n` +
      `\nQualquer dúvida, estamos à disposição! 🏍️`;

    try {
      setIsSendingOrc(true);
      await sendWhatsAppText({ phone, text });
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
              {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
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
                  <Input
                    value={item.description}
                    onChange={e => handleUpdateItem(item.id, 'description', e.target.value)}
                    className="h-7 text-sm border-dashed"
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
                {isEditable && (
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
                  <Input
                    placeholder="Buscar no estoque ou texto livre..."
                    value={newDesc}
                    onChange={e => handleDescChange(e.target.value)}
                    onFocus={handleDescFocus}
                    onKeyDown={e => e.key === 'Enter' && handleAddItem()}
                    autoComplete="off"
                    className={selectedProduct ? 'border-blue-400 bg-blue-50/30 dark:bg-blue-950/20' : ''}
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
                  <Button type="button" variant="outline" onClick={handleAddItem} className="h-9 px-4 gap-1.5">
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
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">
              Forma de Pagamento
            </label>
            <Select value={paymentMethod} onValueChange={handlePaymentChange} disabled={!isEditable}>
              <SelectTrigger className="h-10">
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
          </div>

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
                <Button type="button" onClick={handleFinalizar} disabled={isFinalizing || items.length === 0}
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
    </div>
  );
}
