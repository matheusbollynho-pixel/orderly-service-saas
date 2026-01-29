import { useRef, useState, useEffect } from 'react';
import { ServiceOrder, OrderStatus, STATUS_LABELS, PaymentMethod } from '@/types/service-order';
import { StatusBadge } from './StatusBadge';
import { Checklist } from './Checklist';
import { SignaturePad } from './SignaturePad';
import { MaterialsNote } from './MaterialsNote';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  ArrowLeft, 
  User, 
  MapPin, 
  Phone, 
  Wrench, 
  FileText,
  MessageCircle,
  Trash2,
  Loader2,
  Printer,
  Download,
  UserCheck,
  Calendar,
  Eye,
  EyeOff
} from 'lucide-react';
import { useMechanics } from '@/hooks/useMechanics';
import { generateOrderPDFBase64, generateOrderPDF } from '@/lib/pdfGenerator';
import { sendWhatsAppDocument, sendWhatsAppText } from '@/lib/whatsappService';

import { formatDistanceToNow, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface OrderDetailsProps {
  order: ServiceOrder;
  onBack: () => void;
  onOpenMaterials?: () => void;
  onStatusChange: (status: OrderStatus) => void;
  onUpdateOrder?: (data: Partial<ServiceOrder> & { id: string }) => void;
  onChecklistItemToggle: (id: string, completed: boolean) => void;
  onChecklistItemRating?: (id: string, rating: number) => void;
  onChecklistItemObservations?: (id: string, observations: string) => void;
  onSignatureSave: (signature: string) => void;
  onDelete: () => void;
  onAddMaterial?: (material: any) => void;
  onRemoveMaterial?: (id: string) => void;
  onUpdateMaterial?: (id: string, field: string, value: string) => void;
  onAddPayment?: (payload: { order_id: string; amount: number; method: PaymentMethod; reference?: string | null; notes?: string | null }) => void;
  onDeletePayment?: (id: string) => void;
  isCreatingPayment?: boolean;
  isDeletingPayment?: boolean;
  isUpdating?: boolean;
  isAdmin?: boolean;
  canAccessPayments?: boolean;
}

export function OrderDetails({
  order,
  onBack,
  onOpenMaterials,
  onStatusChange,
  onUpdateOrder,
  onChecklistItemToggle,
  onChecklistItemRating,
  onChecklistItemObservations,
  onSignatureSave,
  onDelete,
  onAddMaterial,
  onRemoveMaterial,
  onUpdateMaterial,
  onAddPayment,
  onDeletePayment,
  isCreatingPayment = false,
  isDeletingPayment = false,
  isUpdating = false,
  isAdmin = false,
  canAccessPayments = true,
}: OrderDetailsProps) {
  const { mechanics } = useMechanics();
  const printRef = useRef<HTMLDivElement>(null);
  const [showSignature, setShowSignature] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(order.terms_accepted ?? false);
  const [activeTab, setActiveTab] = useState<'checklist' | 'materiais'>('checklist');
  const [isSendingPDF, setIsSendingPDF] = useState(false);
  const [isSendingText, setIsSendingText] = useState(false);

  // Sincronizar com dados da OS
  useEffect(() => {
    console.log('🔄 Sincronizando termsAccepted:', order.terms_accepted, 'para order:', order.id);
    setTermsAccepted(order.terms_accepted === true); // Garantir que é boolean true/false
  }, [order.id, order.terms_accepted]);

  // Função para atualizar termsAccepted e salvar no Supabase
  const handleTermsChange = (checked: boolean) => {
    console.log('✅ Termos alterados para:', checked);
    setTermsAccepted(checked);
    // Salvar os termos no banco de dados (se o campo existir)
    if (onUpdateOrder && order.id) {
      try {
        // Apenas tenta salvar se o campo terms_accepted existir no objeto order
        console.log('💾 Salvando termsAccepted no banco:', { id: order.id, terms_accepted: checked });
        onUpdateOrder({ 
          id: order.id, 
          terms_accepted: checked
        });
      } catch (e) {
        console.warn('❌ Não foi possível salvar terms_accepted:', e);
        // Continua mesmo se falhar
      }
    }
  };
  const [usarAutorizacao, setUsarAutorizacao] = useState<boolean>(() => {
    const retiradaInfo = order.problem_description?.match(/Retirada: (.+?)(?:\n|$)/)?.[1] || 'Cliente';
    return retiradaInfo !== 'Cliente';
  });
  const [retiradaNome, setRetiradaNome] = useState('');
  const [retiradaTelefone, setRetiradaTelefone] = useState('');
  const [retiradaCPF, setRetiradaCPF] = useState('');
  const [retiradaDocumento, setRetiradaDocumento] = useState('');
  
  // Função para formatar data para yyyy-MM-dd sem problemas de timezone
  const formatDateToInput = (dateStr: string | null) => {
    if (!dateStr) return '';
    try {
      // Se já está no formato yyyy-MM-dd, retorna direto
      if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
        return dateStr;
      }
      // Pega apenas a parte da data (antes do T ou espaço)
      const datePart = dateStr.split('T')[0].split(' ')[0];
      if (datePart.match(/^\d{4}-\d{2}-\d{2}$/)) {
        return datePart;
      }
      // Fallback: tenta converter normalmente
      const date = new Date(dateStr);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    } catch {
      return '';
    }
  };
  
  const [exitDate, setExitDate] = useState(formatDateToInput(order.exit_date));
  const [paymentForm, setPaymentForm] = useState<{ amount: string; method: PaymentMethod; notes: string }>(() => ({
    amount: '',
    method: 'dinheiro',
    notes: '',
  }));
  const [showFullClient, setShowFullClient] = useState(false);

  // Atualizar exitDate quando a ordem mudar
  useEffect(() => {
    setExitDate(formatDateToInput(order.exit_date));
  }, [order.id, order.exit_date]);

  const formatDateDisplay = (dateStr?: string | null) => {
    if (!dateStr) return '';
    try {
      return format(new Date(dateStr), 'dd/MM/yyyy', { locale: ptBR });
    } catch {
      return '';
    }
  };

  const totalOS = (order.materials || []).reduce((acc, m) => acc + ((m.valor || 0) * (parseFloat(m.quantidade) || 0)), 0);
  const totalPaid = (order.payments || []).reduce((acc, p) => acc + (p.amount || 0), 0);
  const pending = Math.max(totalOS - totalPaid, 0);
  const methodOptions: Array<{ value: PaymentMethod; label: string }> = [
    { value: 'dinheiro', label: 'DIN' },
    { value: 'pix', label: 'PIX' },
    { value: 'cartao', label: 'CAR' },
  ];

  const handleAddPayment = () => {
    if (!onAddPayment) return;
    const amount = parseFloat(paymentForm.amount || '');
    if (!amount || amount <= 0) return;
    onAddPayment({
      order_id: order.id,
      amount,
      method: paymentForm.method,
      notes: paymentForm.notes?.trim() || null,
    });
    setPaymentForm((prev) => ({ ...prev, amount: '' }));
  };

  const handleSendWhatsAppPDF = async () => {
    if (!order.signature_data) {
      alert('É necessário coletar a assinatura do cliente antes de enviar o PDF.');
      return;
    }
    const cleanPhone = order.client_phone?.replace(/\D/g, '') || '';
    if (cleanPhone.length < 10 || cleanPhone.length > 11) {
      alert('Telefone do cliente inválido para WhatsApp.');
      return;
    }

    try {
      setIsSendingPDF(true);
      const { fileName, base64 } = generateOrderPDFBase64(order);
      
      await sendWhatsAppDocument({
        phone: cleanPhone,
        base64,
        fileName,
        caption: `Olá, ${order.client_name}! Ótima notícia: sua moto está pronta. Segue o PDF com itens e serviços. Muito obrigado pela preferência!`,
      });

      alert('✅ PDF enviado com sucesso via WhatsApp!');
    } catch (error: any) {
      console.error('Erro ao enviar PDF:', error);
      alert(error.message || 'Erro ao enviar o PDF. Tente novamente.');
    } finally {
      setIsSendingPDF(false);
    }
  };

  const handleSignatureSave = (signature: string) => {
    if (!termsAccepted) {
      alert('Por favor, confirme que leu e concorda com os termos da Ordem de Serviço antes de assinar.');
      return;
    }
    onSignatureSave(signature);
    setShowSignature(false);
  };

  const handleSendWhatsAppTest = async () => {
    const cleanPhone = order.client_phone?.replace(/\D/g, '') || '';
    if (cleanPhone.length < 10 || cleanPhone.length > 11) {
      alert('Telefone do cliente inválido para WhatsApp.');
      return;
    }

    const customText = window.prompt(
      'Mensagem para enviar ao cliente (WhatsApp):',
      `Olá, ${order.client_name}! Sua moto está em serviço na Bandara Motos. OS #${order.id} ✅`
    );

    if (!customText) {
      return; // usuário cancelou
    }

    try {
      setIsSendingText(true);
      await sendWhatsAppText({
        phone: cleanPhone,
        text: customText,
      });
      
      alert('✅ Mensagem de teste enviada com sucesso!');
    } catch (error: any) {
      console.error('Erro ao enviar mensagem:', error);
      alert(error.message || 'Erro ao enviar mensagem. Tente novamente.');
    } finally {
      setIsSendingText(false);
    }
  };

  const handleDownloadPDF = () => {
    if (!order.signature_data) {
      alert('É necessário coletar a assinatura do cliente antes de gerar o PDF.');
      return;
    }
    try {
      generateOrderPDF(order);
    } catch (error: any) {
      console.error('Erro ao baixar PDF:', error);
      alert('Erro ao gerar PDF. Tente novamente.');
    }
  };

  return (
    <>
      <div className="pb-24">
        <div ref={printRef} className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={onBack}
            className="h-9 w-9"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h2 className="text-xl font-semibold text-foreground">{order.client_name}</h2>
            <p className="text-xs text-muted-foreground">
              Criada {formatDistanceToNow(new Date(order.created_at), { addSuffix: true, locale: ptBR })}
            </p>
          </div>
        </div>
        
        {isAdmin && (
          <div className="flex items-center gap-2">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={handleDownloadPDF}
              className="h-9 w-9 text-primary hover:text-primary"
              title="Baixar PDF da ordem de serviço"
            >
              <Download className="h-5 w-5" />
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9 text-destructive hover:text-destructive">
                  <Trash2 className="h-5 w-5" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Excluir ordem de serviço?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Esta ação não pode ser desfeita. A ordem de serviço será permanentemente excluída.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={onDelete} className="bg-destructive hover:bg-destructive/90">
                    Excluir
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
        </div>

      {/* Status + Mecânico */}
      <Card className="card-elevated">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-foreground whitespace-nowrap">Status</span>
            <div className="flex items-center gap-2">
              <StatusBadge status={order.status} />
              <Select 
                value={order.status} 
                onValueChange={(value) => {
                  if (value === 'concluida' && !order.signature_data) {
                    alert('É necessário coletar a assinatura do cliente antes de concluir a ordem de serviço.');
                    return;
                  }
                  onStatusChange(value as OrderStatus);
                }}
                disabled={isUpdating}
              >
                <SelectTrigger className="w-[140px] h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="aberta">Aberta</SelectItem>
                  <SelectItem value="em_andamento">Em Andamento</SelectItem>
                  <SelectItem value="concluida">Concluída</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-foreground whitespace-nowrap">Mecânico</span>
            <Select
              value={order.mechanic_id || 'none'}
              onValueChange={(value) => {
                const ev = new CustomEvent('order:updateMechanic', { detail: { id: order.id, mechanic_id: value === 'none' ? null : value } });
                window.dispatchEvent(ev);
              }}
            >
              <SelectTrigger className="w-[160px] h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem mecânico</SelectItem>
                {mechanics.filter(m => m.active).map(m => (
                  <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          {/* Data de Saída */}
          {order.entry_date && (
            <div className="flex flex-col gap-2 pt-2 border-t">
              <span className="text-sm font-medium text-foreground">📅 Data de Entrada</span>
              <span className="text-sm text-muted-foreground">{format(new Date(order.entry_date), 'dd/MM/yyyy', { locale: ptBR })}</span>
            </div>
          )}
          {order.status === 'concluida' && (
            <div className="flex flex-col gap-2 pt-2">
              <Label className="text-sm font-medium">📅 Data de Conclusão</Label>
              <Input
                type="date"
                value={exitDate}
                onChange={(e) => {
                  setExitDate(e.target.value);
                  // Converte a data para timestamp garantindo que fica no meio-dia (12:00) para evitar problemas de timezone
                  const dateStr = e.target.value; // yyyy-MM-dd
                  const [year, month, day] = dateStr.split('-').map(Number);
                  // Cria data no meio-dia UTC para evitar virar o dia anterior em outros fusos
                  const timestamp = new Date(year, month - 1, day, 12, 0, 0, 0).toISOString();
                  const ev = new CustomEvent('order:updateExitDate', { 
                    detail: { id: order.id, exit_date: timestamp } 
                  });
                  window.dispatchEvent(ev);
                }}
                className="h-8 text-sm"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Client Info */}
      <Card className="card-elevated">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium text-foreground">Informações do Cliente</h3>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setShowFullClient(v => !v)}
            >
              {showFullClient ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
          
          <div className="flex items-start gap-3">
            <User className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-foreground">{order.client_name}</p>
            </div>
          </div>

          {order.client_apelido && (
            <div className="flex items-start gap-3">
              <UserCheck className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
              <p className="text-sm text-foreground">Apelido: {order.client_apelido}</p>
            </div>
          )}

          {showFullClient && order.client_cpf && (
            <div className="flex items-start gap-3">
              <FileText className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
              <p className="text-sm text-foreground">CPF: {order.client_cpf}</p>
            </div>
          )}
          
          <div className="flex items-start gap-3">
            <Phone className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
            <a 
              href={`tel:${order.client_phone}`}
              className="text-sm text-primary hover:underline"
            >
              {order.client_phone}
            </a>
          </div>
          
          {showFullClient && (
            <div className="flex items-start gap-3">
              <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
              <p className="text-sm text-foreground">{order.client_address}</p>
            </div>
          )}

          {showFullClient && order.client_instagram && (
            <div className="flex items-start gap-3">
              <MessageCircle className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
              <p className="text-sm text-foreground">Instagram: {order.client_instagram}</p>
            </div>
          )}

          {showFullClient && order.client_birth_date && (
            <div className="flex items-start gap-3">
              <Calendar className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
              <p className="text-sm text-foreground">Nascimento: {formatDateDisplay(order.client_birth_date)}</p>
            </div>
          )}

          {showFullClient && order.equipment && (
            <div className="flex items-start gap-3">
              <Wrench className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
              <p className="text-sm text-foreground">Moto: {order.equipment}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Equipment Info */}
      <Card className="card-elevated">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium text-foreground">Detalhes do Serviço</h3>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (!order.signature_data) {
                  alert('É necessário coletar a assinatura do cliente antes de imprimir.');
                  return;
                }
                const retiradaInfo = order.problem_description?.match(/Retirada: (.+?)(?:\n|$)/)?.[1] || 'Cliente';
                const usar = usarAutorizacao && retiradaInfo !== 'Cliente';
                const printContent = `
                  <html>
                    <head>
                      <title>Detalhes do Serviço</title>
                      <style>
                        body { font-family: Arial, sans-serif; padding: 20px; }
                        h1 { color: #1e40af; border-bottom: 2px solid #1e40af; padding-bottom: 10px; }
                        .section { margin: 20px 0; }
                        .label { font-weight: bold; color: #666; font-size: 12px; }
                        .value { margin-top: 5px; font-size: 14px; }
                        .warn { background: #fee2e2; padding: 12px; border-radius: 8px; }
                      </style>
                    </head>
                    <body>
                      <h1>Detalhes do Serviço</h1>
                      <div class="section">
                        <div class="label">MOTO</div>
                        <div class="value">${order.equipment}</div>
                      </div>
                      <div class="section">
                        <div class="label">O que fazer na moto?</div>
                        <div class="value">${order.problem_description?.split('\n\nRetirada:')[0] || order.problem_description}</div>
                      </div>
                    </body>
                  </html>
                `;
                const printWindow = window.open('', '', 'width=800,height=600');
                if (printWindow) {
                  printWindow.document.write(printContent);
                  printWindow.document.close();
                  printWindow.focus();
                  printWindow.print();
                  printWindow.close();
                }
              }}
            >
              <Printer className="h-4 w-4 mr-2" />
              Imprimir
            </Button>
          </div>
          
          <div className="flex items-start gap-3">
            <Wrench className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">MOTO</p>
              <p className="text-sm text-foreground">{order.equipment}</p>
            </div>
          </div>
          
          <div className="flex items-start gap-3">
            <FileText className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">O que fazer na moto?</p>
              <p className="text-sm text-foreground">{order.problem_description?.split('\n\nRetirada:')[0] || order.problem_description}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs for Checklist */}
      <Card className="card-elevated">
        <CardContent className="p-0">
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'checklist' | 'materiais')} className="w-full">
            <TabsList className="w-full rounded-none border-b bg-transparent p-0">
              <TabsTrigger value="checklist" className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:bg-transparent">
                Checklist
              </TabsTrigger>
              <TabsTrigger value="materiais" className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:bg-transparent">
                Peças e Serviços
              </TabsTrigger>
            </TabsList>

            <TabsContent value="checklist" className="p-4">
              {order.checklist_items && (
                <Checklist
                  items={order.checklist_items}
                  onItemToggle={onChecklistItemToggle}
                  onRatingChange={onChecklistItemRating}
                  onObservationsChange={onChecklistItemObservations}
                  disabled={order.status === 'concluida'}
                />
              )}
            </TabsContent>

            <TabsContent value="materiais" className="p-4">
              <div className="text-center py-4">
                <Button onClick={onOpenMaterials} className="w-full">
                  Abrir Peças e Serviços
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Pagamentos */}
      {canAccessPayments !== false && (
        <Card className="card-elevated">
          <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="font-medium text-foreground">Pagamentos</h3>
              <p className="text-xs text-muted-foreground">Controle de recebimento e formas de pagamento</p>
            </div>
            <div className="text-right text-sm">
              <p>Total OS</p>
              <p className="font-semibold">R$ {totalOS.toFixed(2)}</p>
              <p className="mt-1 text-emerald-600">Pago: R$ {totalPaid.toFixed(2)}</p>
              <p className={`mt-1 font-semibold ${pending > 0 ? 'text-amber-600' : 'text-muted-foreground'}`}>Pendente: R$ {pending.toFixed(2)}</p>
            </div>
          </div>

          <div className="space-y-2">
            {(order.payments || []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum pagamento registrado.</p>
            ) : (
              <div className="space-y-2">
                {order.payments?.map((p) => (
                  <div key={p.id} className="flex items-center justify-between text-sm">
                    <div>
                      <p className="font-medium">R$ {Number(p.amount || 0).toFixed(2)} <span className="text-muted-foreground">• {methodOptions.find(m => m.value === p.method)?.label || p.method}</span></p>
                      {p.notes ? <p className="text-xs text-muted-foreground">Obs: {p.notes}</p> : null}
                    </div>
                    {onDeletePayment && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={() => onDeletePayment(p.id)}
                        disabled={isDeletingPayment}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {onAddPayment && (
            <div className="grid grid-cols-1 sm:grid-cols-6 gap-2 pt-2 border-t">
              <Input
                placeholder="Valor"
                value={paymentForm.amount}
                onChange={(e) => setPaymentForm((prev) => ({ ...prev, amount: e.target.value }))}
                className="h-9 sm:col-span-2"
                type="number"
                min="0"
              />
              <Select
                value={paymentForm.method}
                onValueChange={(v) => setPaymentForm((prev) => ({ ...prev, method: v as PaymentMethod }))}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Forma" />
                </SelectTrigger>
                <SelectContent>
                  {methodOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                placeholder="Obs. (opcional)"
                value={paymentForm.notes}
                onChange={(e) => setPaymentForm((prev) => ({ ...prev, notes: e.target.value }))}
                className="h-9 sm:col-span-2"
              />
              <Button className="h-9" onClick={handleAddPayment} disabled={isCreatingPayment || !paymentForm.amount}>
                Adicionar
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
      )}

      {/* Termos da Ordem de Serviço */}
      <Card className="card-elevated border-blue-200 bg-blue-50">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Checkbox
              id="terms-checkbox"
              checked={termsAccepted}
              onCheckedChange={handleTermsChange}
              className="mt-1"
            />
            <label htmlFor="terms-checkbox" className="text-sm text-blue-900 leading-relaxed cursor-pointer">
              <span className="font-semibold">Declaro que li e concordo com os termos da Ordem de Serviço</span>, incluindo o prazo de 30 dias para retirada da motocicleta e a taxa de estadia de R$ 6,00 por dia após esse prazo.
            </label>
          </div>
        </CardContent>
      </Card>

      {/* Signature */}
      <Card className="card-elevated">
        <CardContent className="p-4">
          {order.signature_data ? (
            <div className="space-y-3">
              <label className="text-sm font-medium text-foreground">
                Assinatura do Cliente
              </label>
              <div className="rounded-lg border border-border overflow-hidden bg-white">
                <img 
                  src={order.signature_data} 
                  alt="Assinatura do cliente" 
                  className="w-full h-32 object-contain"
                />
              </div>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setShowSignature(true)}
                className="w-full"
              >
                Nova Assinatura
              </Button>
            </div>
          ) : showSignature ? (
            <SignaturePad 
              onSave={handleSignatureSave}
              initialValue={order.signature_data}
            />
          ) : (
            <Button 
              variant="outline" 
              onClick={() => {
                if (!termsAccepted) {
                  alert('Por favor, confirme que leu e concorda com os termos da Ordem de Serviço antes de coletar a assinatura.');
                  return;
                }
                setShowSignature(true);
              }}
              disabled={!termsAccepted}
              className="w-full"
              title={!termsAccepted ? 'É necessário aceitar os termos antes de assinar' : ''}
            >
              Coletar Assinatura
            </Button>
          )}
        </CardContent>
      </Card>

      </div>

      </div>

      {/* Botão fixo para envio via WhatsApp */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-background border-t border-border">
        <div className="grid grid-cols-1 gap-2">
          <Button
            onClick={handleSendWhatsAppTest}
            disabled={isSendingText}
            variant="outline"
            className="w-full h-12 border-[#25D366] text-[#1f2937]"
          >
            {isSendingText ? (
              <Loader2 className="h-5 w-5 mr-2 animate-spin" />
            ) : (
              <MessageCircle className="h-5 w-5 mr-2" />
            )}
            Enviar mensagem
          </Button>

          <Button
            onClick={handleSendWhatsAppPDF}
            disabled={isSendingPDF}
            className="w-full h-12 bg-[#25D366] hover:bg-[#20BD5A] text-white font-medium"
          >
            {isSendingPDF ? (
              <Loader2 className="h-5 w-5 mr-2 animate-spin" />
            ) : (
              <FileText className="h-5 w-5 mr-2" />
            )}
            Enviar PDF via WhatsApp
          </Button>
        </div>
      </div>
    </>
  );
}
