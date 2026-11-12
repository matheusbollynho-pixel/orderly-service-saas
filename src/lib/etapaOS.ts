// v2: etapa única da moto na oficina. O status da OS manda; o status_oficina só
// diferencia "Em serviço" de "Esperando peça". Toda troca grava os dois juntos.
// Não muda o banco: usa os mesmos valores de status / status_oficina de hoje.
import type { OrderStatus, StatusOficina } from '@/types/service-order';

/** OS criada pelo sistema de avaliação por QR (não é moto de verdade): fica fora das telas da oficina. */
export const QR_PLACEHOLDER = '__QR_WALKIN_PLACEHOLDER__';

export type Etapa = 'fila' | 'servico' | 'peca' | 'pronta' | 'entregue';

export const ETAPAS: Record<Etapa, { nome: string; cor: string; fundo: string }> = {
  fila:     { nome: 'Na fila',        cor: 'text-muted-foreground', fundo: 'border-border bg-muted/40' },
  servico:  { nome: 'Em serviço',     cor: 'text-blue-500',         fundo: 'border-blue-500/50 bg-blue-500/10' },
  peca:     { nome: 'Esperando peça', cor: 'text-amber-500',        fundo: 'border-amber-500/50 bg-amber-500/10' },
  pronta:   { nome: 'Pronta',         cor: 'text-green-500',        fundo: 'border-green-500/50 bg-green-500/10' },
  entregue: { nome: 'Entregue',       cor: 'text-muted-foreground', fundo: 'border-border bg-muted/20' },
};

interface OSEtapa { status: OrderStatus | string; status_oficina?: StatusOficina | string | null; problem_description?: string | null }

export function etapaDe(o: OSEtapa): Etapa {
  if (o.status === 'concluida_entregue') return 'entregue';
  if (o.status === 'concluida') return 'pronta';
  if (o.status_oficina === 'aguardando_peca') return 'peca';
  if (o.status === 'em_andamento') return 'servico';
  // OS "aberta" com o mecânico já trabalhando (dado antigo fora de sincronia) conta como Em serviço
  if (o.status_oficina === 'em_servico') return 'servico';
  return 'fila';
}

/** Hoje ao meio-dia (mesma regra do exit_date da tela da OS). */
function meioDiaDeHoje(agora: Date) {
  return new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), 12, 0, 0, 0).toISOString();
}

/** O que gravar para levar a OS até a etapa. Entregar tem fluxo próprio (assinatura + pagamento). */
export function patchPara(destino: Exclude<Etapa, 'entregue'>, agora = new Date()) {
  switch (destino) {
    case 'fila': return { status: 'aberta' as const, status_oficina: 'aguardando_inspecao' as const };
    case 'servico': return { status: 'em_andamento' as const, status_oficina: 'em_servico' as const };
    case 'peca': return { status: 'em_andamento' as const, status_oficina: 'aguardando_peca' as const };
    case 'pronta': return {
      status: 'concluida' as const,
      status_oficina: 'pronta_para_buscar' as const,
      conclusion_date: agora.toISOString(),
      exit_date: meioDiaDeHoje(agora),
    };
  }
}

/** Botões de 1 toque em cada etapa (o primeiro é o principal). */
export function acoesDa(etapa: Etapa): { destino: Exclude<Etapa, 'entregue'>; rotulo: string }[] {
  switch (etapa) {
    case 'fila': return [{ destino: 'servico', rotulo: 'Começar serviço' }];
    case 'servico': return [{ destino: 'pronta', rotulo: 'Pronta' }, { destino: 'peca', rotulo: 'Esperando peça' }];
    case 'peca': return [{ destino: 'servico', rotulo: 'Peça chegou' }];
    default: return [];
  }
}

/** Precisa de mecânico para sair da fila. */
export const precisaMecanico = (destino: Etapa, mechanicId?: string | null) => destino !== 'fila' && !mechanicId;

/** OS Express (cliente espera a moto): hoje marcada pelo texto da descrição. */
export const ehExpress = (o: Pick<OSEtapa, 'problem_description'>) =>
  (o.problem_description || '').toLowerCase().includes('cadastro express');

/** Decisão 2 do dono: só entrega quitada (ou indo para Fiado). */
export const podeEntregar = (falta: number, viraFiado = false) => falta <= 0.009 || viraFiado;

/** Decisão 3 do dono: quitar só marca Entregue se já estiver Pronta, ou se for Express. */
export const quitarMarcaEntregue = (o: OSEtapa) => etapaDe(o) === 'pronta' || ehExpress(o);
