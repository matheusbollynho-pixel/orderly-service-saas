// v2: porta única de navegação. Cada tela diz qual permissão de colaborador e qual
// recurso do plano exige. Menu, abas, atalhos e a busca "Onde está?" passam por aqui,
// então nenhum botão novo fura o bloqueio de plano.
import type { MemberPermissions } from '@/hooks/useAuth';

export type View =
  | 'dashboard' | 'new' | 'express' | 'orders' | 'details' | 'materials' | 'reports' | 'mechanics'
  | 'pos-venda' | 'fluxo-caixa' | 'satisfacao' | 'estoque' | 'balcao' | 'quadro' | 'agenda'
  | 'boletos' | 'fiados' | 'cotacao' | 'encomendas' | 'mais' | 'receber';

export type Area = 'inicio' | 'oficina' | 'balcao' | 'caixa' | 'mais';

type Perm = keyof MemberPermissions;

interface Tela {
  nome: string;           // como aparece em abas e listas
  area: Area;
  perm?: Perm;            // permissão do colaborador (sem = todos)
  recurso?: string;       // id do recurso no plano (usePlanFeatures)
  busca?: string;         // outras palavras que o cliente usa
}

export const TELAS: Record<View, Tela> = {
  dashboard:     { nome: 'Início', area: 'inicio' },
  receber:       { nome: 'A receber', area: 'inicio', busca: 'receber pagamento saldo devendo pendente' },
  orders:        { nome: 'Ordens', area: 'oficina', perm: 'orders', recurso: 'orders', busca: 'os ordem de servico lista placa' },
  quadro:        { nome: 'Quadro', area: 'oficina', perm: 'quadro', recurso: 'quadro', busca: 'oficina etapas mecanico' },
  agenda:        { nome: 'Agenda', area: 'oficina', perm: 'agenda', recurso: 'agenda', busca: 'agendamento horario marcar' },
  new:           { nome: 'Nova OS', area: 'oficina', perm: 'nova_os', recurso: 'new', busca: 'abrir os nova ordem cadastro completo' },
  express:       { nome: 'Express', area: 'oficina', perm: 'express', recurso: 'express', busca: 'abrir os rapida' },
  details:       { nome: 'OS', area: 'oficina' },
  materials:     { nome: 'Peças da OS', area: 'oficina' },
  balcao:        { nome: 'Vendas', area: 'balcao', perm: 'balcao', recurso: 'balcao', busca: 'balcao nota vender venda peca' },
  encomendas:    { nome: 'Encomendas', area: 'balcao', perm: 'estoque', recurso: 'encomendas', busca: 'pedido cliente peca encomendar' },
  'fluxo-caixa': { nome: 'Hoje', area: 'caixa', perm: 'caixa', recurso: 'fluxo-caixa', busca: 'caixa fluxo entrada saida retirada estorno' },
  fiados:        { nome: 'Fiado', area: 'caixa', perm: 'fiados', recurso: 'fiados', busca: 'fiado devendo cobranca' },
  boletos:       { nome: 'Contas a pagar', area: 'caixa', perm: 'boletos', recurso: 'boletos', busca: 'boleto conta pagar fornecedor vencimento' },
  estoque:       { nome: 'Estoque', area: 'mais', perm: 'estoque', recurso: 'estoque', busca: 'produto peca estoque minimo' },
  cotacao:       { nome: 'Faltas e cotação', area: 'mais', perm: 'estoque', recurso: 'cotacao', busca: 'cotacao representante falta preco pedido' },
  reports:       { nome: 'Relatórios', area: 'mais', perm: 'relatorios', recurso: 'reports', busca: 'relatorio comissao pagamentos vendas' },
  'pos-venda':   { nome: 'Lembretes e aniversários', area: 'mais', perm: 'pos_venda', recurso: 'pos-venda', busca: 'pos venda lembrete manutencao aniversario palavras chave' },
  satisfacao:    { nome: 'Avaliações', area: 'mais', perm: 'satisfacao', recurso: 'satisfacao', busca: 'satisfacao nps avaliacao nota' },
  mechanics:     { nome: 'Equipe', area: 'mais', perm: 'equipe', recurso: 'mechanics', busca: 'mecanico atendente comissao funcionario' },
  mais:          { nome: 'Mais', area: 'mais' },
};

/** Abas que aparecem no topo de cada área (na ordem). */
export const ABAS: Partial<Record<Area, View[]>> = {
  oficina: ['orders', 'quadro', 'agenda'],
  balcao: ['balcao', 'encomendas'],
  caixa: ['fluxo-caixa', 'fiados', 'boletos'],
};

export type Acesso = 'ok' | 'plano' | 'sem_permissao';

export function acesso(view: View, permissions: MemberPermissions, canAccess: (recurso: string) => boolean): Acesso {
  const t = TELAS[view];
  if (t.perm && !permissions[t.perm]) return 'sem_permissao';
  if (t.recurso && !canAccess(t.recurso)) return 'plano';
  return 'ok';
}

/** Primeira tela liberada (ou bloqueada só por plano) de uma área. */
export function telaDaArea(area: Area, permissions: MemberPermissions, canAccess: (r: string) => boolean): View | null {
  if (area === 'inicio') return 'dashboard';
  if (area === 'mais') return 'mais';
  const lista = ABAS[area] ?? [];
  return lista.find((v) => acesso(v, permissions, canAccess) === 'ok')
    ?? lista.find((v) => acesso(v, permissions, canAccess) === 'plano')
    ?? null;
}

/** A área aparece no menu se tiver ao menos uma tela que o colaborador pode ver. */
export function areaVisivel(area: Area, permissions: MemberPermissions, canAccess: (r: string) => boolean): boolean {
  return telaDaArea(area, permissions, canAccess) !== null;
}

// ---- preferências do aparelho (não dependem de login: a loja usa um login só)

const CHAVE_TELA_INICIAL = 'v2-tela-inicial';
const CHAVE_MENU = 'v2-menu';

export type TelaInicial = 'dashboard' | 'orders' | 'quadro';

export function lerTelaInicial(permissions: MemberPermissions): View {
  const salva = localStorage.getItem(CHAVE_TELA_INICIAL) as TelaInicial | null;
  if (salva === 'orders' || salva === 'quadro' || salva === 'dashboard') return salva;
  // Colaborador só de oficina (sem caixa nem balcão) cai direto nas Ordens
  if (!permissions.caixa && !permissions.balcao && permissions.orders) return 'orders';
  return 'dashboard';
}
export function salvarTelaInicial(t: TelaInicial) { localStorage.setItem(CHAVE_TELA_INICIAL, t); }

export function usarMenuNovo(): boolean { return localStorage.getItem(CHAVE_MENU) !== 'antigo'; }
export function salvarMenu(novo: boolean) { localStorage.setItem(CHAVE_MENU, novo ? 'novo' : 'antigo'); }

// Busca "Onde está?": mesma normalização do resto do sistema (sem acento, minúsculo).
export { normalizeSearch as semAcento } from '@/lib/textSearch';
