export type OrderStatus = 'aberta' | 'em_andamento' | 'concluida' | 'concluida_entregue';

export type StatusOficina =
  | 'aguardando_inspecao'
  | 'em_servico'
  | 'aguardando_peca'
  | 'servico_concluido'
  | 'pronta_para_buscar';

export const STATUS_OFICINA_LABELS: Record<StatusOficina, string> = {
  aguardando_inspecao: 'Aguardando Inspeção',
  em_servico: 'Em Serviço',
  aguardando_peca: 'Aguardando Peça',
  servico_concluido: 'Serviço Concluído',
  pronta_para_buscar: 'Pronta p/ Buscar',
};

export const STATUS_OFICINA_OPTIONS_LIST: { value: StatusOficina; label: string }[] = [
  { value: 'aguardando_inspecao', label: '🔍 Aguardando Inspeção' },
  { value: 'em_servico', label: '🔧 Em Serviço' },
  { value: 'aguardando_peca', label: '📦 Aguardando Peça' },
  { value: 'servico_concluido', label: '✅ Serviço Concluído' },
  { value: 'pronta_para_buscar', label: '🏁 Pronta p/ Buscar' },
];

export const STATUS_OFICINA_COLORS: Record<StatusOficina, string> = {
  aguardando_inspecao: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  em_servico: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  aguardando_peca: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  servico_concluido: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  pronta_para_buscar: 'bg-green-500/20 text-green-400 border-green-500/30',
};

export interface ChecklistItem {
  id: string;
  order_id: string;
  label: string;
  completed: boolean;
  completed_at: string | null;
  created_at: string;
  item_type?: 'checkbox' | 'yesno' | 'rating' | 'textarea';
  rating?: number | null;
  observations?: string | null;
  posicao?: number | null; // ordem do checklist personalizado da loja
}

/** Item do modelo de checklist que a loja monta nos Ajustes. */
export interface ChecklistModeloItem {
  label: string;
  type: 'yesno' | 'rating' | 'textarea';
}

/** Ordena pela posição do checklist personalizado; sem posição, mantém a ordem recebida. */
export function ordenarChecklist<T extends { posicao?: number | null }>(items: T[] | undefined | null): T[] {
  const lista = [...(items || [])];
  if (!lista.some(i => i.posicao != null)) return lista;
  return lista.sort((a, b) => (a.posicao ?? 9999) - (b.posicao ?? 9999));
}

export interface Material {
  id: string;
  order_id: string;
  descricao: string;
  quantidade: string;
  valor: number;
  type?: CashFlowType; // entrada, saida ou retirada
  is_service?: boolean; // true = servico (entra em comissao), false = peca
  mechanic_id?: string | null; // mecanico responsavel pelo item
  payment_method?: PaymentMethod | null; // forma de pagamento do item (pix, dinheiro, cartao)
  paid_at?: string | null; // data quando foi pago
  product_id?: string | null; // produto do estoque vinculado (baixa automática)
  preco_tabela?: number | null; // preço normal quando saiu com preço de tipo de cliente (Lojista etc.)
  tipo_preco?: string | null; // nome do tipo que deu o preço
  created_at: string;
  updated_at: string;
}

export type PaymentMethod = 'dinheiro' | 'pix' | 'cartao' | 'fiado';

export interface Payment {
  id: string;
  order_id: string;
  amount: number;
  discount_amount?: number | null;
  method: PaymentMethod;
  reference?: string | null;
  notes?: string | null;
  finalized_by_staff_id?: string | null;
  created_at: string;
}

export interface ServiceOrder {
  id: string;
  client_id?: string | null;
  motorcycle_id?: string | null;
  atendimento_id?: string | null;
  client_name: string;
  client_cpf?: string;
  client_apelido?: string;
  client_instagram?: string;
  autoriza_instagram?: boolean;
  autoriza_lembretes?: boolean;
  client_phone: string;
  client_address: string;
  client_birth_date?: string; // YYYY-MM-DD
  equipment: string;
  problem_description: string;
  status: OrderStatus;
  signature_data: string | null;
  first_signature_data?: string | null;
  conclusion_date?: string | null;
  /** Aviso de "moto pronta" já resolvido (enviado ou dispensado). */
  aviso_retirada_enviado_em?: string | null;
  terms_accepted?: boolean; // Se aceitou os termos da OS
  delivery_terms_accepted?: boolean;
  delivery_signature_data?: string | null;
  first_delivery_signature_data?: string | null;
  entry_date?: string;
  exit_date?: string | null;
  previsao_entrega?: string | null; // DATE: 'YYYY-MM-DD'
  status_oficina?: StatusOficina | null;
  created_at: string;
  updated_at: string;
  mechanic_id?: string | null;
  checklist_items?: ChecklistItem[];
  materials?: Material[];
  payments?: Payment[];
}

export interface StaffMember {
  id: string;
  name: string;
  role: 'balconista' | 'dono' | 'outro';
  photo_url?: string | null;
  active: boolean;
  commission_rate: number;
  commission_on_parts: boolean;
  created_at: string;
  updated_at: string;
}

export interface SatisfactionRating {
  id: string;
  order_id: string | null;
  client_id?: string | null;
  atendimento_id?: string | null;
  mechanic_id?: string | null;
  atendimento_rating?: number | null;
  servico_rating?: number | null;
  tags: {
    atendimento: string[];
    servico: string[];
  };
  comment?: string | null;
  recommends?: boolean | null;
  status: 'pendente' | 'resolvido';
  responded_at?: string | null;
  public_token: string;
  sent_at: string;
  created_at: string;
  updated_at: string;
}

export interface BirthdayDiscount {
  id: string;
  service_order_id: string;
  discount_percentage: number;
  starts_at: string;
  expires_at: string;
  is_active: boolean;
  message_sent_at: string | null;
  reminder_sent_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Mechanic {
  id: string;
  name: string;
  commission_rate: number; // percent e.g., 10.00 — sobre SERVIÇOS
  commission_parts_rate?: number | null; // % sobre PEÇAS das OS dele (0 = sem comissão de peças)
  photo_url?: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export function getDefaultChecklistItems(vehicleType: string) {
  return vehicleType === 'carro'
    ? [
        { label: 'Chave do carro', type: 'yesno' as const },
        { label: 'Nível de combustível', type: 'rating' as const },
        { label: 'Lataria sem amassados/riscos', type: 'yesno' as const },
        { label: 'Vidros sem trincas', type: 'yesno' as const },
        { label: 'Faróis e lanternas funcionando', type: 'yesno' as const },
        { label: 'Pneus e rodas em boas condições', type: 'yesno' as const },
        { label: 'Painel sem alertas', type: 'yesno' as const },
        { label: 'Funcionamento do motor', type: 'yesno' as const },
        { label: 'Elétrica funcionando', type: 'yesno' as const },
        { label: 'Ar-condicionado funcionando', type: 'yesno' as const },
        { label: 'Nível de óleo adequado', type: 'yesno' as const },
        { label: 'Nível de água/radiador adequado', type: 'yesno' as const },
        { label: 'Fluido de freio adequado', type: 'yesno' as const },
        { label: 'Observações', type: 'textarea' as const },
      ]
    : [
        { label: 'Chave da moto', type: 'yesno' as const },
        { label: 'Funcionamento do motor', type: 'yesno' as const },
        { label: 'Elétrica', type: 'yesno' as const },
        { label: 'Nível de gasolina', type: 'rating' as const },
        { label: 'Observações', type: 'textarea' as const },
      ];
}

/** Chave de comparação: sem acento, maiúsculas, espaços únicos. */
export function chaveRotulo(label: string): string {
  const semAcento = String(label || '').normalize('NFD').replace(/\p{Diacritic}/gu, '');
  return semAcento.toUpperCase().replace(/\s+/g, ' ').trim();
}

// Nomes antigos do checklist padrão (gravados nas OS antigas, com maiúsculas
// misturadas) → nome padronizado. Itens criados pela loja aparecem como ela escreveu.
const ROTULOS_PADRAO: Record<string, string> = {
  'CHAVE DA MOTO': 'Chave da moto',
  'CHAVE DO CARRO': 'Chave do carro',
  'NIVEL DE GASOLINA': 'Nível de gasolina',
  'NIVEL DE COMBUSTIVEL': 'Nível de combustível',
  'FUNCIONAMENTO': 'Funcionamento do motor',
  'FUNCIONAMENTO DO MOTOR': 'Funcionamento do motor',
  'ELETRICA': 'Elétrica',
  'ELETRICA FUNCIONANDO': 'Elétrica funcionando',
  'LATARIA SEM AMASSADOS/RISCOS': 'Lataria sem amassados/riscos',
  'LATARIA (AMASSADOS/RISCOS)': 'Lataria (amassados/riscos)',
  'VIDROS SEM TRINCAS': 'Vidros sem trincas',
  'VIDROS (TRINCAS)': 'Vidros (trincas)',
  'FAROIS E LANTERNAS': 'Faróis e lanternas',
  'FAROIS E LANTERNAS FUNCIONANDO': 'Faróis e lanternas funcionando',
  'PNEUS E RODAS': 'Pneus e rodas',
  'PNEUS E RODAS EM BOAS CONDICOES': 'Pneus e rodas em boas condições',
  'LUZES DE ADVERTENCIA NO PAINEL': 'Luzes de advertência no painel',
  'PAINEL SEM ALERTAS': 'Painel sem alertas',
  'AR CONDICIONADO': 'Ar-condicionado',
  'AR CONDICIONADO FUNCIONANDO': 'Ar-condicionado funcionando',
  'NIVEL DE OLEO': 'Nível de óleo',
  'NIVEL DE OLEO ADEQUADO': 'Nível de óleo adequado',
  'NIVEL DE AGUA/RADIADOR': 'Nível de água/radiador',
  'NIVEL DE AGUA/RADIADOR ADEQUADO': 'Nível de água/radiador adequado',
  'FLUIDO DE FREIO': 'Fluido de freio',
  'FLUIDO DE FREIO ADEQUADO': 'Fluido de freio adequado',
  'OBSERVACOES': 'Observações',
};

/** Nome do item do checklist no padrão (só a primeira letra maiúscula). */
export function rotuloChecklist(label: string): string {
  return ROTULOS_PADRAO[chaveRotulo(label)] ?? label;
}

// Compatibilidade retroativa
export const DEFAULT_CHECKLIST_ITEMS = getDefaultChecklistItems(
  (import.meta.env.VITE_VEHICLE_LABEL || 'moto').toLowerCase().trim()
);

export const STATUS_LABELS: Record<OrderStatus, string> = {
  aberta: 'Aberta',
  em_andamento: 'Em Andamento',
  concluida: 'Concluída',
  concluida_entregue: 'Concluída e Entregue',
};

export type CashFlowType = 'entrada' | 'saida' | 'retirada';

export interface CashFlow {
  id: string;
  type: CashFlowType;
  amount: number;
  description: string;
  category?: string | null;
  payment_method?: PaymentMethod | null;
  order_id?: string | null;
  payment_id?: string | null;
  balcao_order_id?: string | null;
  inventory_movement_id?: string | null;
  encomenda_id?: string | null;
  /** Este lançamento é o estorno de outro (id do original). */
  estorno_de?: string | null;
  /** Preenchido quando o lançamento foi estornado. */
  estornado_em?: string | null;
  estorno_motivo?: string | null;
  date: string;
  notes?: string | null;
  created_at: string;
  created_by?: string | null;
}

export interface CashFlowSummary {
  date: string;
  total_entradas: number;
  total_saidas: number;
  total_retiradas: number;
  saldo: number;
  entradas: CashFlow[];
  saidas: CashFlow[];
  retiradas: CashFlow[];
}

export interface CashFlowPeriodSummary {
  start_date: string;
  end_date: string;
  total_entradas: number;
  total_saidas: number;
  total_retiradas: number;
  saldo: number;
  entradas: CashFlow[];
  saidas: CashFlow[];
  retiradas: CashFlow[];
}
