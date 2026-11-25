// Faixa de aviso quando o certificado A1 vence em até 30 dias (ou já venceu). Some quando está tudo certo.
import { useQuery } from '@tanstack/react-query';
import { ShieldAlert } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useStore } from '@/contexts/StoreContext';
import { diasParaVencer } from '@/lib/fiscal';
import { textoValidade } from './CertificadoA1';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export function AvisoCertificado({ ambiente }: { ambiente: 'sandbox' | 'producao' }) {
  const { storeId } = useStore();
  const { data = [] } = useQuery({
    queryKey: ['fiscal-emissores', storeId, 'aviso', ambiente],
    enabled: !!storeId,
    queryFn: async () => {
      const { data } = await db.from('fiscal_emissores').select('papel, certificado_validade')
        .eq('store_id', storeId).eq('ambiente', ambiente).eq('ativo', true);
      return (data ?? []) as { papel: string; certificado_validade: string | null }[];
    },
  });
  const alertas = data.filter((e) => { const d = diasParaVencer(e.certificado_validade); return d != null && d <= 30; });
  if (!alertas.length) return null;
  return (
    <div className="flex items-start gap-2 rounded-xl border border-red-500/40 bg-red-500/10 p-3">
      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
      <div className="text-sm">
        {alertas.map((e) => (
          <p key={e.papel} className="font-semibold text-red-500">
            Certificado digital {e.papel === 'servicos' ? '(serviços)' : ''}: {textoValidade(e.certificado_validade).texto}
          </p>
        ))}
        <p className="text-[11px] text-muted-foreground">Compre a renovação com a sua certificadora e envie o novo em Configurações › Nota fiscal.</p>
      </div>
    </div>
  );
}
