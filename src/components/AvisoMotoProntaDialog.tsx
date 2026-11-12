// Ao marcar a OS como Concluída: pergunta se avisa o cliente que a moto está pronta.
// "Avisar agora" manda pelo WhatsApp da loja (sem WhatsApp conectado, abre o WhatsApp Web com o texto).
// Qualquer escolha marca a OS como "aviso resolvido", então o aviso automático não manda de novo.
import { useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { toast } from 'sonner';
import {
  AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { sendWhatsAppText } from '@/services/whatsappService';
import type { ServiceOrder } from '@/types/service-order';
import { useVehicleLabel } from '@/hooks/useVehicleLabel';

const db = supabase as unknown as SupabaseClient;

/** Mesmo teste do servidor: vazio, curto, DDD começando com 0 ou dígito repetido = sem telefone. */
export function telefoneValido(raw: string | null | undefined): boolean {
  const d = (raw || '').replace(/\D/g, '');
  const n = d.length >= 12 ? d : d.length >= 10 ? `55${d}` : '';
  if (!n) return false;
  const local = n.startsWith('55') ? n.slice(2) : n;
  return !(local.startsWith('0') || /^(\d)\1+$/.test(local));
}

export function mensagemMotoPronta(order: Pick<ServiceOrder, 'client_name' | 'equipment'>, empresa: string, veiculo = 'moto') {
  const nome = order.client_name?.trim().split(' ')[0] || 'Cliente';
  const item = order.equipment?.trim() || `sua ${veiculo}`;
  return `Olá ${nome}! 🏍️\n\nPassando pra avisar que *${item}* está prontinha aqui na *${empresa}* esperando por você!\n\nPode passar quando puder, estaremos te esperando 😊`;
}

async function marcarAvisoResolvido(orderId: string) {
  const { error } = await db.from('service_orders')
    .update({ aviso_retirada_enviado_em: new Date().toISOString() })
    .eq('id', orderId);
  if (error) throw error;
}

export function AvisoMotoProntaDialog({ order, empresa, onFechar, onDesfazer }: {
  order: ServiceOrder;
  empresa: string;
  onFechar: () => void;
  /** Marcou Pronta sem querer: volta a etapa (não marca nada do aviso). */
  onDesfazer?: () => void;
}) {
  const { vehicle } = useVehicleLabel();
  const [texto, setTexto] = useState(() => mensagemMotoPronta(order, empresa || 'oficina', vehicle));
  const [enviando, setEnviando] = useState(false);
  const temTelefone = telefoneValido(order.client_phone);

  const naoAvisar = async () => {
    try { await marcarAvisoResolvido(order.id); } catch { /* sem marcação: o automático pode avisar depois */ }
    onFechar();
  };

  const avisar = async () => {
    setEnviando(true);
    try {
      const enviouDireto = await sendWhatsAppText({ phone: order.client_phone || '', text: texto });
      await marcarAvisoResolvido(order.id).catch(() => undefined);
      if (enviouDireto) toast.success('Cliente avisado que a moto está pronta.');
      onFechar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não consegui avisar o cliente.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <AlertDialog open>
      <AlertDialogContent className="max-h-[90vh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>Avisar o cliente que está pronta?</AlertDialogTitle>
          <AlertDialogDescription>
            {temTelefone
              ? `${order.client_name || 'Cliente'} recebe esta mensagem no WhatsApp. Pode editar antes de mandar.`
              : `${order.client_name || 'Este cliente'} não tem telefone válido cadastrado, então não dá para avisar pelo WhatsApp.`}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {temTelefone && (
          <Textarea rows={6} value={texto} onChange={(e) => setTexto(e.target.value)} disabled={enviando} />
        )}

        {onDesfazer && (
          <Button variant="ghost" className="h-11 text-muted-foreground" onClick={onDesfazer} disabled={enviando}>
            Desfazer (não está pronta)
          </Button>
        )}
        <AlertDialogFooter className="gap-2">
          {temTelefone ? (
            <>
              <Button variant="outline" onClick={naoAvisar} disabled={enviando}>Não avisar</Button>
              <Button onClick={avisar} disabled={enviando || !texto.trim()}>
                {enviando ? 'Enviando...' : 'Avisar agora'}
              </Button>
            </>
          ) : (
            <Button onClick={naoAvisar}>Ok</Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
