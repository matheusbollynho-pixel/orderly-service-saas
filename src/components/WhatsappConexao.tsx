import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, Lock, QrCode, Smartphone } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';

type Resp = {
  ok: boolean;
  status?: 'sem_instancia' | 'desconectado' | 'conectando' | 'conectado';
  qrcode?: string;
  numero?: string;
  perfil?: string;
  error?: string;
};

async function chamar(acao: 'status' | 'conectar' | 'desconectar'): Promise<Resp> {
  const { data, error } = await supabase.functions.invoke('whatsapp-conexao', { body: { acao } });
  if (error) {
    // 4xx/5xx voltam como erro do invoke; o corpo tem a mensagem
    const corpo = await (error as { context?: Response }).context?.json?.().catch(() => null);
    if (corpo) return corpo as Resp;
    throw error;
  }
  return data as Resp;
}

/** Dono reconecta o WhatsApp da loja lendo um QR Code (instância cadastrada pelo suporte). */
export function WhatsappConexao({ bloqueadoPlano = false, onUpgrade }: { bloqueadoPlano?: boolean; onUpgrade?: () => void }) {
  const qc = useQueryClient();
  const [qr, setQr] = useState<string | undefined>();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['whatsapp-conexao'],
    queryFn: () => chamar('status'),
    // enquanto o QR está na tela, confere a cada 4s se já conectou
    refetchInterval: (q) => (qr && q.state.data?.status !== 'conectado' ? 4000 : false),
  });

  useEffect(() => {
    if (data?.status === 'conectado' && qr) {
      setQr(undefined);
      toast.success('WhatsApp conectado!');
    } else if (data?.qrcode && qr && data.qrcode !== qr) {
      setQr(data.qrcode); // QR expira e a UazAPI gera outro
    }
  }, [data, qr]);

  const conectar = useMutation({
    mutationFn: () => chamar('conectar'),
    onSuccess: (r) => {
      if (!r.ok) return toast.error(r.error ?? 'Não foi possível conectar');
      if (r.status === 'conectado') toast.success('WhatsApp já está conectado');
      else if (r.qrcode) setQr(r.qrcode);
      else toast.error('O QR Code não veio. Tente de novo em alguns segundos.');
      qc.invalidateQueries({ queryKey: ['whatsapp-conexao'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const desconectar = useMutation({
    mutationFn: () => chamar('desconectar'),
    onSuccess: () => {
      setQr(undefined);
      toast.success('WhatsApp desconectado');
      qc.invalidateQueries({ queryKey: ['whatsapp-conexao'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  let corpo: React.ReactNode;

  if (isLoading) {
    corpo = (
      <p className="text-sm text-neutral-400 flex items-center gap-2">
        <Loader2 size={14} className="animate-spin" /> Verificando WhatsApp…
      </p>
    );
  } else if (isError || (data && !data.ok)) {
    corpo = <p className="text-sm text-neutral-400">Não deu pra verificar o WhatsApp agora. Recarregue a página em instantes.</p>;
  } else if (data?.status === 'sem_instancia' && bloqueadoPlano) {
    // plano sem WhatsApp: vira convite de upgrade. Se o suporte já cadastrou uma
    // instância manualmente, cai nos ramos de baixo e o dono reconecta normal.
    corpo = (
      <div className="flex flex-col items-center text-center gap-3 py-2">
        <div className="bg-primary/10 p-3 rounded-full">
          <Lock className="h-5 w-5 text-primary" />
        </div>
        <div>
          <p className="text-sm font-semibold text-neutral-200">WhatsApp automático é do plano Profissional</p>
          <p className="text-xs text-neutral-500 mt-1 max-w-sm">
            Confirmação de agendamento, aviso de OS pronta, pesquisa de satisfação, aniversário e cobrança de fiado saindo sozinhos pelo número da sua oficina.
          </p>
        </div>
        <Button size="sm" onClick={onUpgrade}>Fazer upgrade</Button>
      </div>
    );
  } else if (data?.status === 'sem_instancia') {
    corpo = (
      <p className="text-sm text-neutral-400">
        O WhatsApp automático ainda não foi ativado pra sua loja. Fale com o suporte do SpeedSeek pra liberar.
      </p>
    );
  } else if (data?.status === 'conectado') {
    corpo = (
      <div className="space-y-3 text-sm">
        <p className="font-medium text-emerald-400">
          ✅ Conectado{data.numero ? ` — ${data.numero}` : ''}{data.perfil ? ` (${data.perfil})` : ''}
        </p>
        <p className="text-neutral-400 text-xs">Avisos, lembretes e mensagens automáticas saem por esse número.</p>
        <Button
          variant="outline"
          size="sm"
          disabled={desconectar.isPending}
          onClick={() => {
            if (confirm('Desconectar o WhatsApp? As mensagens automáticas param de sair até você conectar de novo.')) desconectar.mutate();
          }}
        >
          Desconectar
        </Button>
      </div>
    );
  } else if (qr) {
    corpo = (
      <div className="space-y-3 text-sm">
        <ol className="ml-5 list-decimal space-y-1 text-neutral-300">
          <li>No celular da loja, abra o WhatsApp.</li>
          <li>Toque em <b>⋮</b> (ou Configurações no iPhone) → <b>Aparelhos conectados</b> → <b>Conectar aparelho</b>.</li>
          <li>Aponte a câmera pra este código.</li>
        </ol>
        <img
          src={qr.startsWith('data:') ? qr : `data:image/png;base64,${qr}`}
          alt="QR Code do WhatsApp"
          className="mx-auto w-64 max-w-full rounded-md bg-white p-2"
        />
        <p className="text-center text-xs text-neutral-500">Aguardando leitura… o código se renova sozinho.</p>
        <Button variant="outline" size="sm" className="w-full" onClick={() => setQr(undefined)}>
          Cancelar
        </Button>
      </div>
    );
  } else {
    corpo = (
      <div className="space-y-3 text-sm">
        <p className="text-amber-400 font-medium">⚠️ WhatsApp desconectado — as mensagens automáticas não estão saindo.</p>
        <ul className="ml-4 list-disc space-y-1 text-xs text-neutral-400">
          <li>Pegue o <b>celular da loja</b> (o mesmo número de sempre).</li>
          <li>Abra esta tela no computador ou tablet pra escanear com o celular.</li>
          <li>Toque em <b>Conectar WhatsApp</b> e leia o QR Code.</li>
        </ul>
        <Button className="w-full flex items-center gap-2" onClick={() => conectar.mutate()} disabled={conectar.isPending}>
          {conectar.isPending ? <Loader2 size={16} className="animate-spin" /> : <QrCode size={16} />}
          {conectar.isPending ? 'Gerando QR Code…' : 'Conectar WhatsApp'}
        </Button>
      </div>
    );
  }

  return (
    <div className="border border-white/10 rounded-lg p-3 space-y-3 bg-black/20">
      <p className="text-xs text-neutral-400 font-semibold uppercase tracking-wide flex items-center gap-2">
        <Smartphone size={14} /> WhatsApp da loja (conexão)
      </p>
      {corpo}
    </div>
  );
}
