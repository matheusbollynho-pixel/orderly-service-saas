import { useState } from 'react';
import { ServiceOrder, OrderStatus, STATUS_LABELS } from '@/types/service-order';
import { StatusBadge } from './StatusBadge';
import { Checklist } from './Checklist';
import { SignaturePad } from './SignaturePad';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
  Loader2
} from 'lucide-react';
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
  onStatusChange: (status: OrderStatus) => void;
  onChecklistItemToggle: (id: string, completed: boolean) => void;
  onSignatureSave: (signature: string) => void;
  onDelete: () => void;
  isUpdating?: boolean;
}

export function OrderDetails({
  order,
  onBack,
  onStatusChange,
  onChecklistItemToggle,
  onSignatureSave,
  onDelete,
  isUpdating,
}: OrderDetailsProps) {
  const [showSignature, setShowSignature] = useState(false);

  const handleWhatsAppClick = () => {
    const completedItems = order.checklist_items
      ?.filter(item => item.completed)
      .map(item => `✅ ${item.label}`)
      .join('\n') || 'Nenhum item concluído';

    const pendingItems = order.checklist_items
      ?.filter(item => !item.completed)
      .map(item => `⬜ ${item.label}`)
      .join('\n') || '';

    const message = `
*📋 ORDEM DE SERVIÇO*
━━━━━━━━━━━━━━━━━━

*Cliente:* ${order.client_name}
*Equipamento:* ${order.equipment}
*Status:* ${STATUS_LABELS[order.status]}
*Data:* ${format(new Date(order.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}

*📍 Endereço:*
${order.client_address}

*🔧 Problema Relatado:*
${order.problem_description}

*✅ Serviços Realizados:*
${completedItems}
${pendingItems ? `\n*⏳ Pendente:*\n${pendingItems}` : ''}

━━━━━━━━━━━━━━━━━━
_Atendimento técnico profissional_
    `.trim();

    // Clean phone number
    const phone = order.client_phone.replace(/\D/g, '');
    const phoneWithCountry = phone.startsWith('55') ? phone : `55${phone}`;
    
    const encodedMessage = encodeURIComponent(message);
    const whatsappUrl = `https://api.whatsapp.com/send?phone=${phoneWithCountry}&text=${encodedMessage}`;
    
    window.open(whatsappUrl, '_blank');
  };

  const handleSignatureSave = (signature: string) => {
    onSignatureSave(signature);
    setShowSignature(false);
  };

  return (
    <div className="space-y-5 pb-24">
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

      {/* Status */}
      <Card className="card-elevated">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-foreground">Status</span>
              <StatusBadge status={order.status} />
            </div>
            <Select 
              value={order.status} 
              onValueChange={(value) => onStatusChange(value as OrderStatus)}
              disabled={isUpdating}
            >
              <SelectTrigger className="w-[160px] h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="aberta">Aberta</SelectItem>
                <SelectItem value="em_andamento">Em Andamento</SelectItem>
                <SelectItem value="concluida">Concluída</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Client Info */}
      <Card className="card-elevated">
        <CardContent className="p-4 space-y-3">
          <h3 className="font-medium text-foreground mb-3">Informações do Cliente</h3>
          
          <div className="flex items-start gap-3">
            <User className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-foreground">{order.client_name}</p>
            </div>
          </div>
          
          <div className="flex items-start gap-3">
            <Phone className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
            <a 
              href={`tel:${order.client_phone}`}
              className="text-sm text-primary hover:underline"
            >
              {order.client_phone}
            </a>
          </div>
          
          <div className="flex items-start gap-3">
            <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
            <p className="text-sm text-foreground">{order.client_address}</p>
          </div>
        </CardContent>
      </Card>

      {/* Equipment Info */}
      <Card className="card-elevated">
        <CardContent className="p-4 space-y-3">
          <h3 className="font-medium text-foreground mb-3">Detalhes do Serviço</h3>
          
          <div className="flex items-start gap-3">
            <Wrench className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Equipamento</p>
              <p className="text-sm text-foreground">{order.equipment}</p>
            </div>
          </div>
          
          <div className="flex items-start gap-3">
            <FileText className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Problema Relatado</p>
              <p className="text-sm text-foreground">{order.problem_description}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Checklist */}
      <Card className="card-elevated">
        <CardContent className="p-4">
          {order.checklist_items && (
            <Checklist
              items={order.checklist_items}
              onItemToggle={onChecklistItemToggle}
              disabled={order.status === 'concluida'}
            />
          )}
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
              onClick={() => setShowSignature(true)}
              className="w-full"
            >
              Coletar Assinatura
            </Button>
          )}
        </CardContent>
      </Card>

      {/* WhatsApp Button - Fixed at bottom */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-background border-t border-border">
        <Button 
          onClick={handleWhatsAppClick}
          className="w-full h-12 bg-[#25D366] hover:bg-[#20BD5A] text-white font-medium"
        >
          <MessageCircle className="h-5 w-5 mr-2" />
          Finalizar e Enviar via WhatsApp
        </Button>
      </div>
    </div>
  );
}
