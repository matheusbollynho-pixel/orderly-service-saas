import { useRef, useState, useEffect } from 'react';
import { ServiceOrder, OrderStatus, STATUS_LABELS, PaymentMethod, Material } from '@/types/service-order';
import { StatusBadge } from './StatusBadge';
import { Checklist } from './Checklist';
import { SignaturePad } from './SignaturePad';
import { MaterialsNote } from './MaterialsNote';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
  EyeOff,
  Edit2,
  Save,
  X
} from 'lucide-react';
import { useMechanics } from '@/hooks/useMechanics';
import { useClients } from '@/hooks/useClients';
import { useTeamMembers } from '@/hooks/useTeamMembers';
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
  onAddMaterial?: (material: Omit<Material, 'id' | 'created_at' | 'updated_at'>) => void;
  onRemoveMaterial?: (id: string) => void;
  onUpdateMaterial?: (id: string, field: string, value: string) => void;
  onAddPayment?: (payload: { order_id: string; amount: number; discount_amount?: number | null; method: PaymentMethod; reference?: string | null; notes?: string | null; finalized_by_staff_id?: string | null }) => void;
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
  const { members: teamMembers } = useTeamMembers();
  const { mechanics } = useMechanics();
  const { getClientById, getMotorcycleById, updateClientById, updateMotorcycleById } = useClients();
  const printRef = useRef<HTMLDivElement>(null);
  // Corrigido: declarar isExpress apenas uma vez, usando problem_description
  const isExpress = (order.problem_description || '').toLowerCase().includes('cadastro express');
  const [showSignature, setShowSignature] = useState(false);
  const [showDeliverySignature, setShowDeliverySignature] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(order.terms_accepted ?? false);
  const [deliveryTermsAccepted, setDeliveryTermsAccepted] = useState(order.delivery_terms_accepted ?? false);
  const [deliverySignatureData, setDeliverySignatureData] = useState(order.delivery_signature_data ?? null);
  const [deliveryPersonType, setDeliveryPersonType] = useState<'cliente' | 'outro'>(
    (order as any).delivery_person_type === 'outro' ? 'outro' : 'cliente'
  );
  const [deliveryPersonName, setDeliveryPersonName] = useState((order as any).delivery_person_name || '');
  const [deliveryPersonPhone, setDeliveryPersonPhone] = useState((order as any).delivery_person_phone || '');
  const [deliveryPersonCpf, setDeliveryPersonCpf] = useState((order as any).delivery_person_cpf || '');
  // Campo para persistir a primeira assinatura de entrega
  const [firstDeliverySignatureData, setFirstDeliverySignatureData] = useState(order.first_delivery_signature_data ?? order.delivery_signature_data ?? null);
  const [signatureData, setSignatureData] = useState(order.signature_data ?? null);
  // Campo para persistir a primeira assinatura
  const [firstSignatureData, setFirstSignatureData] = useState(order.first_signature_data ?? order.signature_data ?? null);
  // Aba inicial sempre 'checklist', exceto se for express
  const [activeTab, setActiveTab] = useState<'checklist' | 'materiais'>(
    isExpress ? 'materiais' : 'checklist'
  );
  const [isSendingPDF, setIsSendingPDF] = useState(false);
  const [isSendingText, setIsSendingText] = useState(false);
  const [isEditingServicesTodo, setIsEditingServicesTodo] = useState(false);
  const [editedServicesTodo, setEditedServicesTodo] = useState(order.problem_description || '');

  // Debug datas
  console.log('order.exit_date:', order.exit_date, 'order.status:', order.status);

  // Sincronizar com dados da OS
  useEffect(() => {
    console.log('🔄 Sincronizando dados da OS:', order.id);
    setSignatureData(order.signature_data ?? null);
    setDeliverySignatureData(order.delivery_signature_data ?? null);
    setTermsAccepted(order.terms_accepted ?? false);
    setEditedServicesTodo(order.problem_description || '');
    // Persistir a primeira assinatura se não existir
    if (!order.first_signature_data && order.signature_data) {
      setFirstSignatureData(order.signature_data);
    } else if (order.first_signature_data) {
      setFirstSignatureData(order.first_signature_data);
    }
    if (!order.first_delivery_signature_data && order.delivery_signature_data) {
      setFirstDeliverySignatureData(order.delivery_signature_data);
    } else if (order.first_delivery_signature_data) {
      setFirstDeliverySignatureData(order.first_delivery_signature_data);
    }
    // Removido: não puxar aba 'materiais' automaticamente
  }, [order.id, order.terms_accepted, order.signature_data, order.first_signature_data, order.delivery_signature_data, order.first_delivery_signature_data, order.problem_description]);

  // Função para atualizar termsAccepted e salvar no Supabase
  const handleTermsChange = (checked: boolean) => {
    console.log('✅ Termos alterados para:', checked);
    setTermsAccepted(checked);
    // Abrir automaticamente a janela de assinatura quando aceitar os termos
    if (checked) {
      setShowSignature(true);
    }
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

  // Função para atualizar deliveryTermsAccepted e salvar no Supabase
  const handleDeliveryTermsChange = (checked: boolean) => {
    console.log('✅ Termos de entrega alterados para:', checked);
    setDeliveryTermsAccepted(checked);
    if (checked) {
      setShowDeliverySignature(true);
    }
    if (onUpdateOrder && order.id) {
      try {
        onUpdateOrder({
          id: order.id,
          delivery_terms_accepted: checked,
        });
      } catch (e) {
        console.warn('❌ Não foi possível salvar delivery_terms_accepted:', e);
      }
    }
  };

  // Função para salvar assinatura de entrega
  const handleDeliverySignatureSave = (signature: string) => {
    console.log('✅ Assinatura de entrega coletada');
    setDeliverySignatureData(signature);
    setShowDeliverySignature(false);
    if (onUpdateOrder && order.id) {
      try {
        onUpdateOrder({
          id: order.id,
          delivery_signature_data: signature,
        });
      } catch (e) {
        console.warn('❌ Não foi possível salvar delivery_signature_data:', e);
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
  const [showExitDateEditor, setShowExitDateEditor] = useState(false);

  // Função para salvar a edição do campo "O que fazer"
  const handleSaveServicesTodo = () => {
    if (onUpdateOrder && order.id) {
      onUpdateOrder({
        id: order.id,
        problem_description: editedServicesTodo,
      });
      setIsEditingServicesTodo(false);
      alert('✅ Descrição do serviço atualizada com sucesso!');
    }
  };

  // Função para cancelar a edição
  const handleCancelEditServicesTodo = () => {
    setEditedServicesTodo(order.problem_description || '');
    setIsEditingServicesTodo(false);
  };
  const [paymentForm, setPaymentForm] = useState<{ amount: string; discount_amount: string; method: PaymentMethod; notes: string; finalized_by_staff_id: string }>(() => ({
    amount: '',
    discount_amount: '',
    method: 'dinheiro',
    notes: '',
    finalized_by_staff_id: '',
  }));
  const [showFullClient, setShowFullClient] = useState(false);
  const [autorizaInstagram, setAutorizaInstagram] = useState(!!order.autoriza_instagram);
  const [autorizaLembretes, setAutorizaLembretes] = useState(order.autoriza_lembretes !== false ? true : false);
  const stripExpressMarker = (text?: string | null) =>
    (text || '').replace(/serviço rápido \(cadastro express\)/i, '').replace(/cadastro express/gi, '').trim();
  const parseRetirada = (text?: string | null) => {
    const info = (text || '').match(/Retirada:\s*(.+?)(?:\n|$)/)?.[1] || 'Cliente';
    if (info === 'Cliente') {
      return { quemPega: 'cliente' as const, nome: '', telefone: '', cpf: '' };
    }
    const nome = info.match(/Nome:\s*([^|]+)/)?.[1]?.trim() || '';
    const telefone = info.match(/Tel:\s*([^|]+)/)?.[1]?.trim() || '';
    const cpf = info.match(/CPF:\s*([^|]+)/)?.[1]?.trim() || '';
    return { quemPega: 'outro' as const, nome, telefone, cpf };
  };
  const [expressDescription, setExpressDescription] = useState(stripExpressMarker(order.problem_description));
  const [expressPhone, setExpressPhone] = useState(order.client_phone || '');
  const [expressAddress, setExpressAddress] = useState(order.client_address || '');
  const [expressClientName, setExpressClientName] = useState(order.client_name || '');
  const [expressClientCpf, setExpressClientCpf] = useState(order.client_cpf || '');
  const [expressClientApelido, setExpressClientApelido] = useState(order.client_apelido || '');
  const [expressClientInstagram, setExpressClientInstagram] = useState(order.client_instagram || '');
  const [expressClientAutorizaInstagram, setExpressClientAutorizaInstagram] = useState(!!order.autoriza_instagram);
  const [expressClientAutorizaLembretes, setExpressClientAutorizaLembretes] = useState(order.autoriza_lembretes !== false ? true : false);
  const [expressClientBirthDate, setExpressClientBirthDate] = useState(formatDateToInput(order.client_birth_date || null));
  const [expressMotoPlaca, setExpressMotoPlaca] = useState('');
  const [expressMotoMarca, setExpressMotoMarca] = useState('');
  const [expressMotoModelo, setExpressMotoModelo] = useState('');
  const [expressMotoAno, setExpressMotoAno] = useState('');
  const [expressMotoCor, setExpressMotoCor] = useState('');
  const [showCompleteForm, setShowCompleteForm] = useState(false);
  const [expressFormInitialized, setExpressFormInitialized] = useState(false);
  const retiradaInicial = parseRetirada(order.problem_description);
  const [expressQuemPega, setExpressQuemPega] = useState<'cliente' | 'outro'>(retiradaInicial.quemPega);
  const [expressNomeRetirada, setExpressNomeRetirada] = useState(retiradaInicial.nome);
  const [expressTelefoneRetirada, setExpressTelefoneRetirada] = useState(retiradaInicial.telefone);
  const [expressCpfRetirada, setExpressCpfRetirada] = useState(retiradaInicial.cpf);
  const [expressEntryDate, setExpressEntryDate] = useState(formatDateToInput(order.entry_date));
  const [expressAtendimentoId, setExpressAtendimentoId] = useState(order.atendimento_id || '');
  const handleExpressAtendimentoChange = (value: string) => {
    setExpressAtendimentoId(value);
    if (onUpdateOrder) {
      onUpdateOrder({
        id: order.id,
        atendimento_id: value || null,
      });
    }
  };
  const toNoonISOString = (dateStr?: string) => {
    if (!dateStr) return null;
    const [year, month, day] = dateStr.split('-').map(Number);
    if (!year || !month || !day) return null;
    return new Date(year, month - 1, day, 12, 0, 0, 0).toISOString();
  };

  useEffect(() => {
    setExitDate(formatDateToInput(order.exit_date));
    setShowExitDateEditor(false);
    setAutorizaInstagram(!!order.autoriza_instagram);
    setAutorizaLembretes(order.autoriza_lembretes !== false ? true : false);
  }, [order.id, order.exit_date, order.autoriza_instagram, order.autoriza_lembretes]);

  useEffect(() => {
    if (isExpress && !showCompleteForm) {
      setActiveTab('materiais');
    }
  }, [isExpress, showCompleteForm]);

  useEffect(() => {
    setExpressDescription(stripExpressMarker(order.problem_description));
    setExpressPhone(order.client_phone || '');
    setExpressAddress(order.client_address || '');
    setExpressClientName(order.client_name || '');
    setExpressClientCpf(order.client_cpf || '');
    setExpressClientApelido(order.client_apelido || '');
    setExpressClientInstagram(order.client_instagram || '');
    setExpressClientAutorizaInstagram(!!order.autoriza_instagram);
    setExpressClientAutorizaLembretes(!!order.autoriza_lembretes);
    setExpressClientBirthDate(formatDateToInput(order.client_birth_date || null));
    const retirada = parseRetirada(order.problem_description);
    setExpressQuemPega(retirada.quemPega);
    setExpressNomeRetirada(retirada.nome);
    setExpressTelefoneRetirada(retirada.telefone);
    setExpressCpfRetirada(retirada.cpf);
    setExpressEntryDate(formatDateToInput(order.entry_date));
    setExpressAtendimentoId(order.atendimento_id || '');
    setExpressFormInitialized(false);
  }, [order.id, order.problem_description, order.client_phone, order.client_address, order.atendimento_id, order.autoriza_instagram, order.autoriza_lembretes, order.client_apelido, order.client_birth_date, order.client_cpf, order.client_instagram, order.client_name, order.entry_date]);

  useEffect(() => {
    const loadClientMoto = async () => {
      if (!isExpress) return;
      if (expressFormInitialized) return;
      if (order.client_id) {
        const client = await getClientById(order.client_id);
        if (client) {
          setExpressClientName(client.name || '');
          setExpressClientCpf(client.cpf || '');
          setExpressPhone(client.phone || '');
          setExpressClientApelido(client.apelido || '');
          setExpressClientInstagram(client.instagram || '');
          setExpressClientAutorizaInstagram(!!client.autoriza_instagram);
          setExpressClientAutorizaLembretes(!!client.autoriza_lembretes);
          setExpressClientBirthDate(formatDateToInput(client.birth_date || null));
          setExpressAddress(client.endereco || '');
        }
      }
      if (order.motorcycle_id) {
        const moto = await getMotorcycleById(order.motorcycle_id);
        if (moto) {
          setExpressMotoPlaca(moto.placa || '');
          setExpressMotoMarca(moto.marca || '');
          setExpressMotoModelo(moto.modelo || '');
          setExpressMotoAno(moto.ano ? String(moto.ano) : '');
          setExpressMotoCor(moto.cor || '');
        }
      }

      setExpressFormInitialized(true);
    };

    loadClientMoto();
  }, [isExpress, order.client_id, order.motorcycle_id, getClientById, getMotorcycleById, expressFormInitialized]);

  const toSafeDate = (value?: string | null) => {
    if (!value) return null;
    const normalized = value.includes('T') ? value : `${value}T00:00:00`;
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? null : date;
  };

  const formatDateDisplay = (dateStr?: string | null) => {
    const safeDate = toSafeDate(dateStr);
    if (!safeDate) return '';
    try {
      return format(safeDate, 'dd/MM/yyyy', { locale: ptBR });
    } catch {
      return '';
    }
  };

  const dispatchExitDateUpdate = (dateStr: string) => {
    const timestamp = toNoonISOString(dateStr);
    if (!timestamp) return;
    const ev = new CustomEvent('order:updateExitDate', {
      detail: { id: order.id, exit_date: timestamp }
    });
    window.dispatchEvent(ev);
  };

  const totalOS = (order.materials || []).reduce((acc, m) => acc + ((m.valor || 0) * (parseFloat(m.quantidade) || 0)), 0);
  const totalPaid = (order.payments || []).reduce((acc, p) => acc + (p.amount || 0), 0);
  const totalDiscount = (order.payments || []).reduce((acc, p) => acc + (p.discount_amount || 0), 0);
  const receivers = Array.from(
    new Set(
      (order.payments || [])
        .map((p) => p.finalized_by_staff_id)
        .filter((id): id is string => Boolean(id))
    )
  )
    .map((id) => teamMembers.find((m) => m.id === id)?.name || 'Colaborador removido')
    .join(', ');
  const totalSettled = totalPaid + totalDiscount;
  const pending = Math.max(totalOS - totalSettled, 0);
  const methodOptions: Array<{ value: PaymentMethod; label: string }> = [
    { value: 'dinheiro', label: 'DIN' },
    { value: 'pix', label: 'PIX' },
    { value: 'cartao', label: 'CAR' },
  ];

  const handleAddPayment = () => {
    if (!onAddPayment) return;
    if (!order.delivery_signature_data && !isExpress) {
      alert('É necessário coletar a assinatura do Termo de Entrega do Veículo antes de registrar o pagamento.');
      return;
    }
    const amount = parseFloat(paymentForm.amount || '');
    const discountAmount = parseFloat(paymentForm.discount_amount || '0') || 0;
    if (!amount || amount <= 0) return;
    if (discountAmount < 0) return;
    if (!paymentForm.finalized_by_staff_id) {
      alert('Selecione quem finalizou/recebeu o pagamento.');
      return;
    }
    onAddPayment({
      order_id: order.id,
      amount,
      discount_amount: discountAmount,
      method: paymentForm.method,
      notes: paymentForm.notes?.trim() || null,
      finalized_by_staff_id: paymentForm.finalized_by_staff_id || null,
    });
    setPaymentForm((prev) => ({ ...prev, amount: '', discount_amount: '' }));
  };

  const handleSendWhatsAppPDF = async () => {
      console.log('📋 problem_description:', order.problem_description);
    if (!order.signature_data && !isExpress) {
      alert('É necessário coletar a assinatura do cliente antes de enviar o PDF.');
      return;
    }
    
    try {
      setIsSendingPDF(true);

      const response = await fetch('http://localhost:5000/gerar-os', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...order,
          mechanic_name: mechanics.find(m => m.id === order.mechanic_id)?.name || '',
          created_by: teamMembers.find(m => m.id === order.atendimento_id)?.name || '',
          exit_date: order.exit_date || order.conclusion_date || order.updated_at || null,
          conclusion_date: order.conclusion_date || order.exit_date || order.updated_at || null,
          logo_path: 'bandara_logo_transparent.png',
          delivery_person_type: deliveryPersonType,
          delivery_person_name: deliveryPersonType === 'outro' ? deliveryPersonName : order.client_name,
          delivery_person_phone: deliveryPersonType === 'outro' ? deliveryPersonPhone : order.client_phone,
          delivery_person_cpf: deliveryPersonType === 'outro' ? deliveryPersonCpf : order.client_cpf,
        }),
      });

      if (!response.ok) throw new Error('Erro ao gerar PDF na API');

      const blob = await response.blob();
      const arrayBuffer = await blob.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      let binary = '';
      for (let i = 0; i < uint8Array.length; i++) {
        binary += String.fromCharCode(uint8Array[i]);
      }
      const base64 = btoa(binary);

      const cleanPhone = order.client_phone?.replace(/\D/g, '') || '';
      if (cleanPhone.length < 10 || cleanPhone.length > 11) {
        alert('Telefone do cliente inválido para WhatsApp.');
        return;
      }

      await sendWhatsAppDocument({
        phone: cleanPhone,
        base64,
        fileName: `ordem_servico_${order.id.slice(0, 8)}.pdf`,
        caption: `Olá, ${order.client_name}! Sua Ordem de Serviço está pronta. Segue em anexo. Obrigado pela preferência!`,
      });

      alert('✅ PDF enviado para WhatsApp com sucesso!');
    } catch (error: unknown) {
      console.error('Erro ao enviar WhatsApp:', error);
      alert(error instanceof Error ? error.message : 'Erro ao enviar PDF. Tente novamente.');
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
    setSignatureData(signature);
    // Salva assinatura no banco
    if (onUpdateOrder && order.id) {
      try {
        onUpdateOrder({
          id: order.id,
          signature_data: signature,
        });
      } catch (e) {
        console.warn('❌ Não foi possível salvar signature_data:', e);
      }
    }
    // Mudar para aba de Peças e Serviços após salvar assinatura
    setActiveTab('materiais');
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
    } catch (error: unknown) {
      console.error('Erro ao enviar mensagem:', error);
      if (error instanceof Error) {
        alert(error.message || 'Erro ao enviar mensagem. Tente novamente.');
      } else {
        alert('Erro ao enviar mensagem. Tente novamente.');
      }
    } finally {
      setIsSendingText(false);
    }
  };

  const handleDownloadPDF = async () => {
    if (!order.signature_data && !isExpress) {
      alert('É necessário coletar a assinatura do cliente antes de gerar o PDF.');
      return;
    }
    
    try {
      const payload = {
        ...order,
        mechanic_name: mechanics.find(m => m.id === order.mechanic_id)?.name || '',
        created_by: teamMembers.find(m => m.id === order.atendimento_id)?.name || '',
        exit_date: order.exit_date || order.conclusion_date || order.updated_at || null,
        conclusion_date: order.conclusion_date || order.exit_date || order.updated_at || null,
        logo_path: 'bandara_logo_transparent.png',
        delivery_person_type: deliveryPersonType,
        delivery_person_name: deliveryPersonType === 'outro' ? deliveryPersonName : order.client_name,
        delivery_person_phone: deliveryPersonType === 'outro' ? deliveryPersonPhone : order.client_phone,
        delivery_person_cpf: deliveryPersonType === 'outro' ? deliveryPersonCpf : order.client_cpf,
      };
      console.log('📋 Dados enviados para API:', JSON.stringify(payload, null, 2));
      const response = await fetch('http://localhost:5000/gerar-os', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error('Erro ao gerar PDF na API');

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ordem_servico_${order.id.slice(0, 8)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);

      alert('✅ PDF baixado com sucesso!');
    } catch (error: unknown) {
      console.error('Erro ao baixar PDF:', error);
      alert('Erro ao gerar PDF. Tente novamente.');
    }
  };

  const renderSignatureSection = () => (
    <div className="space-y-3 pt-4 border-t border-border/50 mt-4">
      <h3 className="font-semibold text-foreground text-base">📋 Inspeção do Veículo</h3>
      
      <div className="rounded-lg border border-border/50 p-3 bg-muted/20">
        <div className="flex items-start gap-3">
          <Checkbox
            id="terms-checkbox"
            checked={termsAccepted}
            onCheckedChange={handleTermsChange}
            className="mt-1"
            disabled={order.status === 'concluida_entregue'}
          />
          <label htmlFor="terms-checkbox" className="text-sm text-foreground leading-relaxed cursor-pointer">
            <span className="font-semibold">Declaro que o checklist de inspeção do veículo foi realizado e conferido no ato do atendimento, estando ciente das condições registradas e autorizando a execução dos serviços descritos nesta Ordem de Serviço.</span> Estou ciente do prazo de até 30 dias para retirada da motocicleta após a conclusão do serviço. Após esse período, será cobrada taxa de estadia no valor de R$ 6,00 por dia. O não comparecimento para retirada poderá caracterizar abandono do veículo, nos termos da legislação vigente.
          </label>
        </div>
      </div>

      <p className="text-xs text-muted-foreground text-center">
        Após 90 dias sem retirada e sem contato do proprietário, o veículo poderá ser considerado abandonado.
      </p>

      {/* Nunca exigir assinatura para OS Express */}
      {!isExpress && termsAccepted && (
        <>
          {showSignature && order.status !== 'concluida_entregue' ? (
            <SignaturePad
              onSave={handleSignatureSave}
              initialValue={signatureData || firstSignatureData}
            />
          ) : signatureData ? (
            <>
              <label className="text-sm font-medium text-foreground">Assinatura do Cliente</label>
              <div className="rounded-lg border border-border overflow-hidden bg-white">
                <img
                  src={signatureData || firstSignatureData}
                  alt="Assinatura do cliente"
                  className="w-full h-32 object-contain"
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowSignature(true)}
                className="w-full"
                disabled={order.status === 'concluida_entregue'}
              >
                Nova Assinatura
              </Button>
            </>
          ) : (
            <Button
              variant="outline"
              onClick={() => setShowSignature(true)}
              className="w-full"
              disabled={order.status === 'concluida_entregue'}
            >
              Coletar Assinatura
            </Button>
          )}
        </>
      )}
      {isExpress && (
        <p className="text-sm text-muted-foreground text-center">Cadastro Express não exige assinatura do cliente.</p>
      )}
    </div>
  );
  
const renderDeliverySection = () => {
  const matchTerceiro = order.problem_description?.match(
    /Retirada: Outra pessoa - Nome: (.+?) \| Tel: (.+?) \| CPF: (.+?)(?:\n|$)/
  );
  const terceiroCadastrado = matchTerceiro
    ? { nome: matchTerceiro[1], tel: matchTerceiro[2], cpf: matchTerceiro[3] }
    : null;

  const handleSaveDeliveryPerson = () => {
    if (deliveryPersonType === 'outro') {
      if (!deliveryPersonName.trim()) { alert('Informe o nome de quem vai retirar.'); return; }
      if (!deliveryPersonPhone.trim()) { alert('Informe o telefone de quem vai retirar.'); return; }
      if (!deliveryPersonCpf.trim()) { alert('Informe o CPF de quem vai retirar.'); return; }
    }
    if (onUpdateOrder) {
      onUpdateOrder({
        id: order.id,
        delivery_person_type: deliveryPersonType,
        delivery_person_name: deliveryPersonType === 'outro' ? deliveryPersonName.trim() : order.client_name,
        delivery_person_phone: deliveryPersonType === 'outro' ? deliveryPersonPhone.trim() : order.client_phone,
        delivery_person_cpf: deliveryPersonType === 'outro' ? deliveryPersonCpf.trim() : order.client_cpf,
      } as any);
    }
    alert('✅ Dados de retirada salvos!');
  };

  return (
    <div className="space-y-3 pt-4 border-t border-border/50 mt-4">
      <h3 className="font-semibold text-foreground text-base">📋 Termo de Entrega do Veículo</h3>

      <div className="rounded-lg border border-border/50 p-3 bg-muted/20 space-y-3">
        <p className="text-sm font-semibold text-foreground">👤 Quem está retirando o veículo?</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setDeliveryPersonType('cliente')}
            disabled={order.status === 'concluida_entregue'}
            className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
              deliveryPersonType === 'cliente'
                ? 'bg-[#C1272D] text-white'
                : 'bg-muted text-muted-foreground border border-border/50 hover:bg-muted/80'
            }`}
          >
            Dono
          </button>
          <button
            type="button"
            onClick={() => setDeliveryPersonType('outro')}
            disabled={order.status === 'concluida_entregue'}
            className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
              deliveryPersonType === 'outro'
                ? 'bg-[#C1272D] text-white'
                : 'bg-muted text-muted-foreground border border-border/50 hover:bg-muted/80'
            }`}
          >
            Outra pessoa
          </button>
        </div>

        {deliveryPersonType === 'outro' && (
          <div className="space-y-2">
            {terceiroCadastrado && (
              <div className="text-xs text-muted-foreground bg-muted/30 border border-border/30 rounded p-2 flex items-center justify-between">
                <span>{terceiroCadastrado.nome} | {terceiroCadastrado.tel} | {terceiroCadastrado.cpf}</span>
                <button
                  type="button"
                  className="text-xs text-[#C1272D] hover:underline ml-2 whitespace-nowrap"
                  onClick={() => {
                    setDeliveryPersonName(terceiroCadastrado.nome);
                    setDeliveryPersonPhone(terceiroCadastrado.tel);
                    setDeliveryPersonCpf(terceiroCadastrado.cpf);
                  }}
                  disabled={order.status === 'concluida_entregue'}
                >
                  Usar estes dados
                </button>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Nome *</Label>
                <Input
                  value={deliveryPersonName}
                  onChange={(e) => setDeliveryPersonName(e.target.value)}
                  placeholder="Nome completo"
                  className="h-8 text-sm"
                  disabled={order.status === 'concluida_entregue'}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Telefone *</Label>
                <Input
                  value={deliveryPersonPhone}
                  onChange={(e) => setDeliveryPersonPhone(e.target.value)}
                  placeholder="(xx) xxxxx-xxxx"
                  className="h-8 text-sm"
                  disabled={order.status === 'concluida_entregue'}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">CPF *</Label>
                <Input
                  value={deliveryPersonCpf}
                  onChange={(e) => setDeliveryPersonCpf(e.target.value)}
                  placeholder="000.000.000-00"
                  className="h-8 text-sm"
                  disabled={order.status === 'concluida_entregue'}
                />
              </div>
            </div>
          </div>
        )}

        <Button
          size="sm"
          onClick={handleSaveDeliveryPerson}
          disabled={order.status === 'concluida_entregue'}
          className="w-full bg-[#C1272D] hover:bg-[#a01f24] text-white"
        >
          Salvar quem retirou
        </Button>
      </div>

      <div className="rounded-lg border border-border/50 p-3 bg-muted/20">
        <div className="flex items-start gap-3">
          <Checkbox
            id="delivery-terms-checkbox"
            checked={deliveryTermsAccepted}
            onCheckedChange={handleDeliveryTermsChange}
            className="mt-1"
            disabled={order.status === 'concluida_entregue'}
          />
          <label htmlFor="delivery-terms-checkbox" className="text-sm text-foreground leading-relaxed cursor-pointer">
            <span className="font-semibold">Declaro que recebi nesta data a motocicleta referente a esta Ordem de Serviço, após a execução dos serviços descritos.</span> Confirmo que o veículo foi entregue, conferido e encontra-se em condições de uso, não constatando irregularidades aparentes no ato da entrega.
          </label>
        </div>
      </div>

      <label className="text-sm font-medium text-foreground">Assinatura do Cliente (Entrega)</label>
      {showDeliverySignature && order.status !== 'concluida_entregue' ? (
        <SignaturePad
          onSave={handleDeliverySignatureSave}
          initialValue={deliverySignatureData || firstDeliverySignatureData}
        />
      ) : deliverySignatureData ? (
        <>
          <div className="rounded-lg border border-border overflow-hidden bg-white">
            <img
              src={deliverySignatureData || firstDeliverySignatureData}
              alt="Assinatura de entrega do cliente"
              className="w-full h-32 object-contain"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowDeliverySignature(true)}
            className="w-full"
            disabled={order.status === 'concluida_entregue'}
          >
            Nova Assinatura de Entrega
          </Button>
        </>
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            if (!deliveryTermsAccepted) {
              alert('Por favor, confirme que leu e concorda com o termo de entrega do veículo antes de coletar a assinatura.');
              return;
            }
            setShowDeliverySignature(true);
          }}
          disabled={order.status === 'concluida_entregue'}
          className="w-full"
        >
          Coletar Assinatura de Entrega
        </Button>
      )}
    </div>
  );
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
          {/* ...existing code... */}
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-foreground whitespace-nowrap">Status</span>
            <div className="flex items-center gap-2">
              <StatusBadge status={order.status} />
              <Select 
                value={order.status}
                onValueChange={(value) => {
                  if (order.status === 'concluida_entregue') return; // Bloqueia alteração
                  // Permite selecionar 'concluida_entregue' só após assinatura de entrega
                  if (value === 'concluida_entregue' && !deliverySignatureData && !isExpress) {
                    alert('É necessário coletar a assinatura de entrega do veículo antes de marcar como Concluída e Pago.');
                    return;
                  }

                  if (value === 'concluida' && order.status !== 'concluida') {
                    const today = formatDateToInput(new Date().toISOString());
                    setExitDate(today);
                    dispatchExitDateUpdate(today);
                    setShowExitDateEditor(false);
                  }

                  if (value !== 'concluida') {
                    setShowExitDateEditor(false);
                  }

                  onStatusChange(value as OrderStatus);
                }}
                disabled={isUpdating || order.status === 'concluida_entregue'}
              >
                <SelectTrigger className="w-[140px] h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="aberta">Aberta</SelectItem>
                  <SelectItem value="em_andamento">Em Andamento</SelectItem>
                  <SelectItem value="concluida">Concluída</SelectItem>
                  <SelectItem value="concluida_entregue">Concluída e Entregue</SelectItem>
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
              disabled={order.status === 'concluida_entregue'}
            >
              <SelectTrigger className="w-[160px] h-8 text-sm" disabled={order.status === 'concluida_entregue'}>
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
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-foreground whitespace-nowrap">Criador O.S</span>
            <span className="text-sm">
              {(() => {
                const atendente = teamMembers.find(tm => tm.id === order.atendimento_id);
                if (!atendente) return 'Não definido';
                if (atendente.name === 'Matheus') {
                  return <span className="text-red-500">{atendente.name}</span>;
                }
                return atendente.name;
              })()}
            </span>
          </div>
          
          {/* Data de Saída */}
          {order.entry_date && (
            <div className="flex flex-col gap-2 pt-2 border-t">
              <span className="text-sm font-medium text-foreground">📅 Data de Entrada</span>
              <span className="text-sm text-muted-foreground">{formatDateDisplay(order.entry_date)}</span>
            </div>
          )}
          {(order.status === 'concluida' || order.status === 'concluida_entregue') && (
            <div className="flex flex-col gap-2 pt-2">
              <Label className="text-sm font-medium">📅 Data de Conclusão</Label>
              {showExitDateEditor ? (
                <div className="flex items-center gap-2">
                  <Input
                    type="date"
                    value={exitDate}
                    onChange={(e) => {
                      const dateStr = e.target.value;
                      setExitDate(dateStr);
                      dispatchExitDateUpdate(dateStr);
                    }}
                    className="h-8 text-sm"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowExitDateEditor(false)}
                  >
                    Fechar
                  </Button>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-muted-foreground">
                    {order.exit_date ? formatDateDisplay(order.exit_date) : 'Não definida'}
                  </span>
                </div>
              )}
            </div>
          )}

          {order.status === 'concluida_entregue' && (
            <div className="flex flex-col gap-2 pt-2">
              <Label className="text-sm font-medium">📅 Data de Entrega</Label>
              <span className="text-sm text-muted-foreground">
                {order.exit_date ? formatDateDisplay(order.exit_date) : 'Não definida'}
              </span>
              <span className="text-center text-xs text-neutral-400 tracking-wider mt-2">ID da OS: {order.id}</span>
            </div>
          )}
        </CardContent>
              {/* Rodapé com ID da OS removido para evitar duplicidade */}
      </Card>

      {/* ID da OS movido para dentro da caixa de datas - duplicidade removida */}

      {isExpress && (
        <Card className="card-elevated">
          <CardContent className="p-4 space-y-4">
            <div>
              <h3 className="font-medium text-foreground">Ordem de Serviço completa</h3>
              <p className="text-xs text-muted-foreground">Preencha os dados restantes e remova o selo Express.</p>
            </div>

            <Button
              type="button"
              variant="outline"
              onClick={() => setShowCompleteForm((prev) => !prev)}
            >
              {showCompleteForm ? 'Ocultar formulário' : 'Preencher dados da OS completa'}
            </Button>

            {showCompleteForm && (
              <>
            <div className="space-y-3">
              <h4 className="text-sm font-semibold">Cliente</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Nome</Label>
                  <Input value={expressClientName} onChange={(e) => setExpressClientName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>CPF</Label>
                  <Input value={expressClientCpf} onChange={(e) => setExpressClientCpf(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Telefone</Label>
                  <Input value={expressPhone} onChange={(e) => setExpressPhone(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Apelido</Label>
                  <Input value={expressClientApelido} onChange={(e) => setExpressClientApelido(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Instagram</Label>
                  <Input value={expressClientInstagram} onChange={(e) => setExpressClientInstagram(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Data de nascimento</Label>
                  <Input type="date" value={expressClientBirthDate} onChange={(e) => setExpressClientBirthDate(e.target.value)} className="bg-muted/50 border-border/50 text-foreground" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Endereço</Label>
                <Input value={expressAddress} onChange={(e) => setExpressAddress(e.target.value)} />
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="express-autoriza-instagram"
                  checked={expressClientAutorizaInstagram}
                  onCheckedChange={(checked) => setExpressClientAutorizaInstagram(checked)}
                />
                <Label htmlFor="express-autoriza-instagram" className="text-sm">
                  Autoriza Instagram
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="express-autoriza-lembretes"
                  checked={expressClientAutorizaLembretes}
                  onCheckedChange={(checked) => setExpressClientAutorizaLembretes(checked)}
                />
                <Label htmlFor="express-autoriza-lembretes" className="text-sm">
                  Autoriza Lembretes
                </Label>
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="text-sm font-semibold">Moto</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Placa</Label>
                  <Input value={expressMotoPlaca} onChange={(e) => setExpressMotoPlaca(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Marca</Label>
                  <Input value={expressMotoMarca} onChange={(e) => setExpressMotoMarca(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Modelo</Label>
                  <Input value={expressMotoModelo} onChange={(e) => setExpressMotoModelo(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Ano</Label>
                  <Input value={expressMotoAno} onChange={(e) => setExpressMotoAno(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Cor</Label>
                  <Input value={expressMotoCor} onChange={(e) => setExpressMotoCor(e.target.value)} />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Data de Entrada</Label>
              <Input
                type="date"
                value={expressEntryDate}
                onChange={(e) => setExpressEntryDate(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>O que fazer na moto?</Label>
              <Textarea
                value={expressDescription}
                onChange={(e) => setExpressDescription(e.target.value)}
                placeholder="Descreva o serviço"
                rows={4}
              />
            </div>

            <div className="space-y-2">
              <Label>Quem vai pegar a moto?</Label>
              <Select value={expressQuemPega} onValueChange={(v) => setExpressQuemPega(v as 'cliente' | 'outro')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cliente">Cliente</SelectItem>
                  <SelectItem value="outro">Outra pessoa</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {expressQuemPega === 'outro' && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label>Nome</Label>
                  <Input
                    value={expressNomeRetirada}
                    onChange={(e) => setExpressNomeRetirada(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Telefone</Label>
                  <Input
                    value={expressTelefoneRetirada}
                    onChange={(e) => setExpressTelefoneRetirada(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>CPF</Label>
                  <Input
                    value={expressCpfRetirada}
                    onChange={(e) => setExpressCpfRetirada(e.target.value)}
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Telefone</Label>
                <Input
                  value={expressPhone}
                  onChange={(e) => setExpressPhone(e.target.value)}
                  placeholder="(xx) xxxxx-xxxx"
                />
              </div>
              <div className="space-y-2">
                <Label>Endereço</Label>
                <Input
                  value={expressAddress}
                  onChange={(e) => setExpressAddress(e.target.value)}
                  placeholder="Rua, número, bairro"
                />
              </div>
            </div>

            <Button
              type="button"
              onClick={() => {
                if (!onUpdateOrder) return;
                const cleanCpf = (value: string) => value.replace(/\D/g, '');
                const cleanPhone = (value: string) => value.replace(/\D/g, '');
                const cleanPlate = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);
                const retiradaInfo = expressQuemPega === 'cliente'
                  ? 'Cliente'
                  : `Outra pessoa - Nome: ${expressNomeRetirada || 'Não informado'} | Tel: ${expressTelefoneRetirada || 'Não informado'} | CPF: ${expressCpfRetirada || 'Não informado'}`;
                const nextDescription = `${expressDescription.trim() || 'Sem descrição'}\n\nRetirada: ${retiradaInfo}`;
                const equipmentParts = [expressMotoMarca, expressMotoModelo, expressMotoAno, expressMotoCor].filter(Boolean).join(' ').trim();
                const equipment = expressMotoPlaca ? `${equipmentParts} (${cleanPlate(expressMotoPlaca)})`.trim() : equipmentParts;

                if (order.client_id) {
                  updateClientById(order.client_id, {
                    name: expressClientName.trim(),
                    cpf: cleanCpf(expressClientCpf),
                    phone: cleanPhone(expressPhone),
                    apelido: expressClientApelido.trim() || null,
                    instagram: expressClientInstagram.trim() || null,
                    autoriza_instagram: !!expressClientAutorizaInstagram,
                    autoriza_lembretes: !!expressClientAutorizaLembretes,
                    birth_date: expressClientBirthDate || null,
                    endereco: expressAddress.trim() || null,
                  });
                }

                if (order.motorcycle_id) {
                  updateMotorcycleById(order.motorcycle_id, {
                    placa: cleanPlate(expressMotoPlaca),
                    marca: expressMotoMarca.trim(),
                    modelo: expressMotoModelo.trim(),
                    ano: expressMotoAno ? parseInt(expressMotoAno, 10) : null,
                    cor: expressMotoCor.trim() || null,
                  });
                }

                onUpdateOrder({
                  id: order.id,
                  atendimento_id: expressAtendimentoId || null,
                  problem_description: nextDescription,
                  client_name: expressClientName.trim(),
                  client_cpf: cleanCpf(expressClientCpf),
                  client_phone: cleanPhone(expressPhone),
                  client_address: expressAddress.trim(),
                  client_apelido: expressClientApelido.trim() || '',
                  client_instagram: expressClientInstagram.trim() || '',
                  autoriza_instagram: !!expressClientAutorizaInstagram,
                  autoriza_lembretes: !!expressClientAutorizaLembretes,
                  client_birth_date: expressClientBirthDate || null,
                  equipment: equipment || order.equipment,
                  entry_date: toNoonISOString(expressEntryDate),
                });
              }}
            >
              Salvar e remover Express
            </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Client Info */}
      <Card className="card-elevated">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium text-foreground">Informações do Cliente</h3>
            {/* Botão de alternância para visualizar detalhes do cliente */}
            <Button
              type="button"
              variant="ghost"
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

          <div className="border-t pt-3 space-y-2">
            <div className="flex items-center gap-2">
              <Checkbox
                id="cliente-autoriza-instagram"
                checked={autorizaInstagram}
                onCheckedChange={(checked) => {
                  if (!order.client_id) return;
                  const novoValor = checked === true;
                  setAutorizaInstagram(novoValor);
                  updateClientById(order.client_id, { autoriza_instagram: novoValor });
                  // Notificar o pai para atualizar o order
                  if (onUpdateOrder) {
                    onUpdateOrder({ id: order.id, autoriza_instagram: novoValor });
                  }
                }}
              />
              <Label htmlFor="cliente-autoriza-instagram" className="text-sm font-normal cursor-pointer">
                Autoriza Instagram
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="cliente-autoriza-lembretes"
                checked={autorizaLembretes}
                onCheckedChange={(checked) => {
                  if (!order.client_id) return;
                  const novoValor = checked === true;
                  setAutorizaLembretes(novoValor);
                  updateClientById(order.client_id, { autoriza_lembretes: novoValor });
                  // Notificar o pai para atualizar o order
                  if (onUpdateOrder) {
                    onUpdateOrder({ id: order.id, autoriza_lembretes: novoValor });
                  }
                }}
              />
              <Label htmlFor="cliente-autoriza-lembretes" className="text-sm font-normal cursor-pointer">
                Autoriza Lembretes de Manutenção
              </Label>
            </div>
          </div>
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
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-muted-foreground">O que fazer na moto?</p>
                {!isEditingServicesTodo ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2"
                    onClick={() => setIsEditingServicesTodo(true)}
                    disabled={order.status === 'concluida_entregue'}
                  >
                    <Edit2 className="h-3.5 w-3.5 mr-1" />
                    Editar
                  </Button>
                ) : (
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-green-600 hover:text-green-700"
                      onClick={handleSaveServicesTodo}
                      disabled={isUpdating || order.status === 'concluida_entregue'}
                    >
                      {isUpdating ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                      ) : (
                        <Save className="h-3.5 w-3.5 mr-1" />
                      )}
                      Salvar
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2"
                      onClick={handleCancelEditServicesTodo}
                    >
                      <X className="h-3.5 w-3.5 mr-1" />
                      Cancelar
                    </Button>
                  </div>
                )}
              </div>
              {isEditingServicesTodo ? (
                <Textarea
                  value={editedServicesTodo}
                  onChange={(e) => setEditedServicesTodo(e.target.value)}
                  placeholder="Descreva o que fazer na moto"
                  rows={4}
                  className="mt-2"
                />
              ) : (
                <p className="text-sm text-foreground">{order.problem_description?.split('\n\nRetirada:')[0] || order.problem_description}</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs for Checklist */}
      <Card className="card-elevated">
        <CardContent className="p-0">
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'checklist' | 'materiais')} className="w-full">
            <TabsList className="w-full rounded-none border-b bg-transparent p-0">
              {!isExpress || showCompleteForm ? (
                <TabsTrigger value="checklist" className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:bg-transparent">
                  Checklist
                </TabsTrigger>
              ) : null}
              <TabsTrigger
                value="materiais"
                className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:bg-transparent"
                disabled={!signatureData}
                style={!signatureData ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
                title={!signatureData ? 'Só libera após assinatura de inspeção do veículo' : ''}
              >
                Peças e Serviços
              </TabsTrigger>
            </TabsList>

            {!isExpress || showCompleteForm ? (
              <TabsContent value="checklist" className="p-4">
                {order.checklist_items && (
                  <Checklist
                    items={order.checklist_items}
                    onItemToggle={onChecklistItemToggle}
                    onRatingChange={onChecklistItemRating}
                    onObservationsChange={onChecklistItemObservations}
                    disabled={order.status === 'concluida_entregue'}
                    orderId={order.id}
                  />
                )}
                {!isExpress && renderSignatureSection()}
              </TabsContent>
            ) : null}

            <TabsContent value="materiais" className="p-4">
              {!signatureData && (
                <div className="text-center py-4">
                  <Button className="w-full" disabled>
                    Só libera após assinatura de inspeção do veículo
                  </Button>
                </div>
              )}
              <MaterialsNote
                materiais={order.materials || []}
                mecanicos={mechanics}
                onAddMaterial={onAddMaterial}
                onRemoveMaterial={onRemoveMaterial}
                onUpdateMaterial={onUpdateMaterial}
                disabled={order.status === 'concluida_entregue'}
                loadingAdd={isUpdating}
                loadingUpdate={isUpdating}
                loadingDelete={isUpdating}
              />
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
              <p className="mt-1 text-emerald-500">Recebido: R$ {totalPaid.toFixed(2)}</p>
              <p className="mt-1 text-xs text-muted-foreground">Recebido por: {receivers || 'Não informado'}</p>
              <p className="mt-1 text-[#C1272D]">Desconto: R$ {totalDiscount.toFixed(2)}</p>
              <p className={`mt-1 font-semibold ${pending > 0 ? 'text-[#C1272D]' : 'text-muted-foreground'}`}>Pendente: R$ {pending.toFixed(2)}</p>
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
                      <p className="text-xs text-muted-foreground">Recebido por: {p.finalized_by_staff_id ? (teamMembers.find(m => m.id === p.finalized_by_staff_id)?.name || 'Colaborador removido') : 'Não informado'}</p>
                      {(p.discount_amount || 0) > 0 ? <p className="text-xs text-[#C1272D]">Desconto: R$ {Number(p.discount_amount || 0).toFixed(2)}</p> : null}
                      {p.notes ? <p className="text-xs text-muted-foreground">Obs: {p.notes}</p> : null}
                    </div>
                    {onDeletePayment && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={() => onDeletePayment(p.id)}
                        disabled={isDeletingPayment || order.status === 'concluida_entregue'}
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
            <div className="space-y-3 pt-2 border-t border-border/30">
              {/* Quem vai finalizar o pagamento */}
              <div className="p-3 glass-card-elevated border border-border/50 rounded-lg">
                <Label className="text-sm font-semibold text-foreground">💰 Quem vai finalizar o pagamento?</Label>
                <Select value={paymentForm.finalized_by_staff_id || ''} onValueChange={(v) => setPaymentForm((prev) => ({ ...prev, finalized_by_staff_id: v }))} disabled={order.status === 'concluida_entregue'}>
                  <SelectTrigger className="h-9 mt-2 bg-muted/50 border-border/50" disabled={order.status === 'concluida_entregue'}>
                    <SelectValue placeholder="Selecione o responsável" />
                  </SelectTrigger>
                  <SelectContent>
                    {teamMembers.map((member) => (
                      <SelectItem key={member.id} value={member.id}>
                        {member.name} - {member.role === 'balconista' ? 'Balconista' : 'Outro'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Formulário de pagamento */}
              <div className="grid grid-cols-1 sm:grid-cols-7 gap-2">
                <Input
                  placeholder="Valor"
                  value={paymentForm.amount}
                  onChange={(e) => setPaymentForm((prev) => ({ ...prev, amount: e.target.value }))}
                  className="h-9 sm:col-span-2"
                  type="number"
                  min="0"
                  step="0.01"
                  disabled={order.status === 'concluida_entregue'}
                />
                <Input
                  placeholder="Desconto (R$)"
                  value={paymentForm.discount_amount}
                  onChange={(e) => setPaymentForm((prev) => ({ ...prev, discount_amount: e.target.value }))}
                  className="h-9"
                  type="number"
                  min="0"
                  step="0.01"
                  disabled={order.status === 'concluida_entregue'}
                />
                <Select
                  value={paymentForm.method}
                  onValueChange={(v) => setPaymentForm((prev) => ({ ...prev, method: v as PaymentMethod }))}
                  disabled={order.status === 'concluida_entregue'}
                >
                  <SelectTrigger className="h-9" disabled={order.status === 'concluida_entregue'}>
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
                  disabled={order.status === 'concluida_entregue'}
                />
                <Button className="h-9" onClick={handleAddPayment} disabled={isCreatingPayment || !paymentForm.amount || order.status === 'concluida_entregue'}>
                  Adicionar
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      )}

      {/* Termo de Entrega do Veículo */}
      {canAccessPayments && !isExpress && (
        <Card className="card-elevated">
          <CardContent className="p-4">
            {renderDeliverySection()}
          </CardContent>
        </Card>
      )}
      {/* Termos incorporados à seção de assinatura */}

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
